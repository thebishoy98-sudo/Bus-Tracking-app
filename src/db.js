import Database from 'better-sqlite3';
import { config } from './config.js';

// ── Schema ───────────────────────────────────────────────────
// All migrations are additive (CREATE TABLE IF NOT EXISTS) so existing
// appointment rows in `messages` are preserved across upgrades.
function migrate(db) {
  db.exec(`
    -- Legacy appointment messages (Gmail-era). Kept for history/migration.
    CREATE TABLE IF NOT EXISTS messages (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      gmail_id                TEXT UNIQUE NOT NULL,
      from_number             TEXT,
      from_name               TEXT,
      body                    TEXT,
      received_at             TEXT,
      status                  TEXT NOT NULL DEFAULT 'pending',
      extracted               TEXT,
      clarification_question  TEXT,
      clarification_answer    TEXT,
      clarification_rounds    INTEGER NOT NULL DEFAULT 0,
      calendar_event_id       TEXT,
      calendar_link           TEXT,
      error                   TEXT,
      created_at              TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- One row per Google Voice conversation thread.
    CREATE TABLE IF NOT EXISTS conversations (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      gv_conversation_id   TEXT UNIQUE,
      phone_number         TEXT,
      display_name         TEXT,
      is_owner             INTEGER NOT NULL DEFAULT 0,
      last_message_at      TEXT,
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone_number);

    -- Inbound (and observed outbound) messages, deduped by fingerprint.
    CREATE TABLE IF NOT EXISTS inbound_messages (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id   INTEGER REFERENCES conversations(id),
      fingerprint       TEXT UNIQUE NOT NULL,
      direction         TEXT NOT NULL DEFAULT 'inbound',
      sender_number     TEXT,
      body              TEXT,
      sent_at           TEXT,
      has_attachments   INTEGER NOT NULL DEFAULT 0,
      status            TEXT NOT NULL DEFAULT 'new',
      extracted         TEXT,
      error             TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Downloaded attachments (currently images) tied to a message.
    CREATE TABLE IF NOT EXISTS attachments (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id     INTEGER REFERENCES inbound_messages(id),
      kind           TEXT NOT NULL DEFAULT 'image',
      mime           TEXT,
      byte_size      INTEGER,
      file_path      TEXT,
      sha256         TEXT,
      status         TEXT NOT NULL DEFAULT 'stored',
      reject_reason  TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Durable outbound queue with idempotency keys.
    CREATE TABLE IF NOT EXISTS outbox (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      idempotency_key   TEXT UNIQUE NOT NULL,
      recipient_number  TEXT NOT NULL,
      kind              TEXT NOT NULL DEFAULT 'text',
      body              TEXT,
      attachment_path   TEXT,
      status            TEXT NOT NULL DEFAULT 'queued',
      attempts          INTEGER NOT NULL DEFAULT 0,
      next_attempt_at   TEXT,
      claimed_at        TEXT,
      sent_at           TEXT,
      last_error        TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Owner decisions the system is waiting on (pricing approvals, clarifications).
    CREATE TABLE IF NOT EXISTS pending_owner_actions (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      kind                 TEXT NOT NULL,
      conversation_id      INTEGER REFERENCES conversations(id),
      customer_message_id  INTEGER REFERENCES inbound_messages(id),
      status               TEXT NOT NULL DEFAULT 'pending',
      payload              TEXT,
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      resolved_at          TEXT
    );

    -- Editable price book; rows are time-bounded via effective dates.
    CREATE TABLE IF NOT EXISTS price_book (
      id                   INTEGER PRIMARY KEY AUTOINCREMENT,
      service              TEXT NOT NULL,
      labor_low            REAL,
      labor_high           REAL,
      parts_low            REAL,
      parts_high           REAL,
      vehicle_adjustments  TEXT,
      fees                 REAL,
      notes                TEXT,
      effective_from       TEXT,
      effective_to         TEXT,
      created_at           TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Key/value automation health (browser state, last scan, errors, retention).
    CREATE TABLE IF NOT EXISTS automation_health (
      key         TEXT PRIMARY KEY,
      value       TEXT,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// ── Store factory ────────────────────────────────────────────
function makeStore(db) {
  const stmts = {
    // legacy messages
    msgExists: db.prepare('SELECT 1 FROM messages WHERE gmail_id = ?'),
    msgInsert: db.prepare(`
      INSERT INTO messages (gmail_id, from_number, from_name, body, received_at, status)
      VALUES (@gmail_id, @from_number, @from_name, @body, @received_at, 'pending')
    `),
    msgById: db.prepare('SELECT * FROM messages WHERE id = ?'),
    msgPending: db.prepare(`SELECT * FROM messages WHERE status = 'pending' ORDER BY received_at ASC`),
    msgRecent: db.prepare('SELECT * FROM messages ORDER BY received_at DESC LIMIT ?'),
    msgCounts: db.prepare('SELECT status, COUNT(*) AS n FROM messages GROUP BY status'),
    msgOldestAwaiting: db.prepare(`
      SELECT * FROM messages WHERE status = 'awaiting_clarification'
      ORDER BY received_at ASC LIMIT 1
    `),
    msgCountAwaiting: db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE status = 'awaiting_clarification'`),
    msgUpdate: db.prepare(`
      UPDATE messages SET
        status = COALESCE(@status, status),
        extracted = COALESCE(@extracted, extracted),
        clarification_question = COALESCE(@clarification_question, clarification_question),
        clarification_answer = COALESCE(@clarification_answer, clarification_answer),
        clarification_rounds = COALESCE(@clarification_rounds, clarification_rounds),
        calendar_event_id = COALESCE(@calendar_event_id, calendar_event_id),
        calendar_link = COALESCE(@calendar_link, calendar_link),
        error = @error,
        updated_at = datetime('now')
      WHERE id = @id
    `),

    // conversations
    convByGv: db.prepare('SELECT * FROM conversations WHERE gv_conversation_id = ?'),
    convByPhone: db.prepare('SELECT * FROM conversations WHERE phone_number = ? ORDER BY id DESC LIMIT 1'),
    convById: db.prepare('SELECT * FROM conversations WHERE id = ?'),
    convInsert: db.prepare(`
      INSERT INTO conversations (gv_conversation_id, phone_number, display_name, is_owner)
      VALUES (@gv_conversation_id, @phone_number, @display_name, @is_owner)
    `),
    convUpdate: db.prepare(`
      UPDATE conversations SET
        phone_number = COALESCE(@phone_number, phone_number),
        display_name = COALESCE(@display_name, display_name),
        is_owner = COALESCE(@is_owner, is_owner),
        updated_at = datetime('now')
      WHERE id = @id
    `),
    convTouch: db.prepare(`UPDATE conversations SET last_message_at = ?, updated_at = datetime('now') WHERE id = ?`),

    // inbound messages
    inFingerprint: db.prepare('SELECT id FROM inbound_messages WHERE fingerprint = ?'),
    inInsert: db.prepare(`
      INSERT INTO inbound_messages
        (conversation_id, fingerprint, direction, sender_number, body, sent_at, has_attachments)
      VALUES
        (@conversation_id, @fingerprint, @direction, @sender_number, @body, @sent_at, @has_attachments)
      ON CONFLICT(fingerprint) DO NOTHING
    `),
    inById: db.prepare('SELECT * FROM inbound_messages WHERE id = ?'),
    inNew: db.prepare(`SELECT * FROM inbound_messages WHERE status = 'new' ORDER BY sent_at ASC, id ASC`),
    inByConversation: db.prepare('SELECT * FROM inbound_messages WHERE conversation_id = ? ORDER BY sent_at ASC, id ASC'),
    inUpdate: db.prepare(`
      UPDATE inbound_messages SET
        status = COALESCE(@status, status),
        extracted = COALESCE(@extracted, extracted),
        error = @error,
        updated_at = datetime('now')
      WHERE id = @id
    `),

    // attachments
    attInsert: db.prepare(`
      INSERT INTO attachments (message_id, kind, mime, byte_size, file_path, sha256, status, reject_reason)
      VALUES (@message_id, @kind, @mime, @byte_size, @file_path, @sha256, @status, @reject_reason)
    `),
    attForMessage: db.prepare('SELECT * FROM attachments WHERE message_id = ? ORDER BY id ASC'),
    attById: db.prepare('SELECT * FROM attachments WHERE id = ?'),
    attAll: db.prepare('SELECT * FROM attachments ORDER BY id ASC'),
    attStored: db.prepare(`SELECT * FROM attachments WHERE status = 'stored' ORDER BY id ASC`),
    attDelete: db.prepare('DELETE FROM attachments WHERE id = ?'),

    // outbox
    outEnqueue: db.prepare(`
      INSERT INTO outbox (idempotency_key, recipient_number, kind, body, attachment_path, next_attempt_at)
      VALUES (@idempotency_key, @recipient_number, @kind, @body, @attachment_path, @next_attempt_at)
      ON CONFLICT(idempotency_key) DO NOTHING
    `),
    outByKey: db.prepare('SELECT * FROM outbox WHERE idempotency_key = ?'),
    outById: db.prepare('SELECT * FROM outbox WHERE id = ?'),
    outNextClaimable: db.prepare(`
      SELECT * FROM outbox
      WHERE status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= @now)
      ORDER BY id ASC LIMIT 1
    `),
    outClaim: db.prepare(`UPDATE outbox SET status = 'sending', claimed_at = @now, updated_at = datetime('now') WHERE id = @id`),
    outSent: db.prepare(`UPDATE outbox SET status = 'sent', sent_at = @now, updated_at = datetime('now') WHERE id = @id`),
    outFail: db.prepare(`
      UPDATE outbox SET
        status = @status,
        attempts = attempts + 1,
        last_error = @last_error,
        next_attempt_at = @next_attempt_at,
        claimed_at = NULL,
        updated_at = datetime('now')
      WHERE id = @id
    `),
    outCounts: db.prepare('SELECT status, COUNT(*) AS n FROM outbox GROUP BY status'),
    outFailed: db.prepare(`SELECT * FROM outbox WHERE status IN ('failed','suspended') ORDER BY updated_at DESC`),
    outResetSuspended: db.prepare(`UPDATE outbox SET status = 'queued', next_attempt_at = NULL, updated_at = datetime('now') WHERE status = 'suspended'`),
    outRequeue: db.prepare(`UPDATE outbox SET status = 'queued', next_attempt_at = NULL, updated_at = datetime('now') WHERE id = ?`),

    // pending owner actions
    actInsert: db.prepare(`
      INSERT INTO pending_owner_actions (kind, conversation_id, customer_message_id, payload)
      VALUES (@kind, @conversation_id, @customer_message_id, @payload)
    `),
    actPending: db.prepare(`SELECT * FROM pending_owner_actions WHERE status = 'pending' ORDER BY id ASC LIMIT 1`),
    actPendingByKind: db.prepare(`SELECT * FROM pending_owner_actions WHERE status = 'pending' AND kind = ? ORDER BY id ASC LIMIT 1`),
    actCountPending: db.prepare(`SELECT COUNT(*) AS n FROM pending_owner_actions WHERE status = 'pending'`),
    actById: db.prepare('SELECT * FROM pending_owner_actions WHERE id = ?'),
    actResolve: db.prepare(`UPDATE pending_owner_actions SET status = ?, resolved_at = datetime('now') WHERE id = ?`),
    actAllPending: db.prepare(`SELECT * FROM pending_owner_actions WHERE status = 'pending' ORDER BY id ASC`),

    // price book
    priceInsert: db.prepare(`
      INSERT INTO price_book
        (service, labor_low, labor_high, parts_low, parts_high, vehicle_adjustments, fees, notes, effective_from, effective_to)
      VALUES
        (@service, @labor_low, @labor_high, @parts_low, @parts_high, @vehicle_adjustments, @fees, @notes, @effective_from, @effective_to)
    `),
    priceById: db.prepare('SELECT * FROM price_book WHERE id = ?'),
    priceAll: db.prepare('SELECT * FROM price_book ORDER BY service ASC, effective_from DESC'),
    priceEffective: db.prepare(`
      SELECT * FROM price_book
      WHERE (effective_from IS NULL OR effective_from <= @on)
        AND (effective_to IS NULL OR effective_to > @on)
      ORDER BY service ASC, effective_from DESC
    `),
    priceUpdate: db.prepare(`
      UPDATE price_book SET
        service = COALESCE(@service, service),
        labor_low = COALESCE(@labor_low, labor_low),
        labor_high = COALESCE(@labor_high, labor_high),
        parts_low = COALESCE(@parts_low, parts_low),
        parts_high = COALESCE(@parts_high, parts_high),
        vehicle_adjustments = COALESCE(@vehicle_adjustments, vehicle_adjustments),
        fees = COALESCE(@fees, fees),
        notes = COALESCE(@notes, notes),
        effective_from = COALESCE(@effective_from, effective_from),
        effective_to = COALESCE(@effective_to, effective_to),
        updated_at = datetime('now')
      WHERE id = @id
    `),
    priceDelete: db.prepare('DELETE FROM price_book WHERE id = ?'),

    // health
    healthSet: db.prepare(`
      INSERT INTO automation_health (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
    `),
    healthGet: db.prepare('SELECT value FROM automation_health WHERE key = ?'),
    healthAll: db.prepare('SELECT key, value FROM automation_health'),
  };

  return {
    // ── legacy messages ──
    hasMessage: (gmailId) => !!stmts.msgExists.get(gmailId),
    insertMessage: (row) => stmts.msgInsert.run(row),
    getMessage: (id) => stmts.msgById.get(id),
    getPending: () => stmts.msgPending.all(),
    getRecent: (limit = 50) => stmts.msgRecent.all(limit),
    getCounts: () => {
      const out = { pending: 0, scheduled: 0, awaiting_clarification: 0, failed: 0, ignored: 0 };
      for (const { status, n } of stmts.msgCounts.all()) out[status] = n;
      return out;
    },
    getOldestAwaiting: () => stmts.msgOldestAwaiting.get(),
    hasOutstandingClarification: () => stmts.msgCountAwaiting.get().n > 0,
    updateMessage: (id, fields = {}) => stmts.msgUpdate.run({
      id, status: null, extracted: null, clarification_question: null,
      clarification_answer: null, clarification_rounds: null, calendar_event_id: null,
      calendar_link: null, error: null, ...fields,
    }),

    // ── conversations ──
    upsertConversation: ({ gv_conversation_id = null, phone_number = null, display_name = null, is_owner = 0 }) => {
      const existing = gv_conversation_id
        ? stmts.convByGv.get(gv_conversation_id)
        : (phone_number ? stmts.convByPhone.get(phone_number) : null);
      if (existing) {
        stmts.convUpdate.run({ id: existing.id, phone_number, display_name, is_owner });
        return existing.id;
      }
      const info = stmts.convInsert.run({ gv_conversation_id, phone_number, display_name, is_owner });
      return info.lastInsertRowid;
    },
    getConversation: (gvId) => stmts.convByGv.get(gvId),
    getConversationByPhone: (phone) => stmts.convByPhone.get(phone),
    getConversationById: (id) => stmts.convById.get(id),
    touchConversation: (id, lastMessageAt) => stmts.convTouch.run(lastMessageAt, id),

    // ── inbound messages ──
    hasFingerprint: (fp) => !!stmts.inFingerprint.get(fp),
    insertInboundMessage: (row) => {
      const info = stmts.inInsert.run({
        conversation_id: row.conversation_id ?? null,
        fingerprint: row.fingerprint,
        direction: row.direction ?? 'inbound',
        sender_number: row.sender_number ?? null,
        body: row.body ?? null,
        sent_at: row.sent_at ?? null,
        has_attachments: row.has_attachments ? 1 : 0,
      });
      if (info.changes > 0) return { inserted: true, id: info.lastInsertRowid };
      const existing = stmts.inFingerprint.get(row.fingerprint);
      return { inserted: false, id: existing ? existing.id : null };
    },
    getInboundById: (id) => stmts.inById.get(id),
    getNewInbound: () => stmts.inNew.all(),
    getInboundForConversation: (convId) => stmts.inByConversation.all(convId),
    updateInboundMessage: (id, fields = {}) => stmts.inUpdate.run({
      id, status: null, extracted: null, error: null, ...fields,
    }),

    // ── attachments ──
    insertAttachment: (row) => stmts.attInsert.run({
      message_id: row.message_id,
      kind: row.kind ?? 'image',
      mime: row.mime ?? null,
      byte_size: row.byte_size ?? null,
      file_path: row.file_path ?? null,
      sha256: row.sha256 ?? null,
      status: row.status ?? 'stored',
      reject_reason: row.reject_reason ?? null,
    }).lastInsertRowid,
    getAttachmentsForMessage: (messageId) => stmts.attForMessage.all(messageId),
    getAttachmentById: (id) => stmts.attById.get(id),
    getAllAttachments: () => stmts.attAll.all(),
    getStoredAttachments: () => stmts.attStored.all(),
    deleteAttachment: (id) => stmts.attDelete.run(id),

    // ── outbox ──
    enqueueOutbox: (row) => {
      const info = stmts.outEnqueue.run({
        idempotency_key: row.idempotency_key,
        recipient_number: row.recipient_number,
        kind: row.kind ?? 'text',
        body: row.body ?? null,
        attachment_path: row.attachment_path ?? null,
        next_attempt_at: row.next_attempt_at ?? null,
      });
      if (info.changes > 0) return { inserted: true, id: info.lastInsertRowid };
      const existing = stmts.outByKey.get(row.idempotency_key);
      return { inserted: false, id: existing ? existing.id : null };
    },
    claimNextOutbox: (now) => {
      const row = stmts.outNextClaimable.get({ now });
      if (!row) return null;
      stmts.outClaim.run({ id: row.id, now });
      return stmts.outById.get(row.id);
    },
    markOutboxSent: (id, now) => stmts.outSent.run({ id, now }),
    markOutboxFailed: (id, error, nextAttemptAt = null, status = 'queued') =>
      stmts.outFail.run({ id, last_error: error ?? null, next_attempt_at: nextAttemptAt, status }),
    getOutboxById: (id) => stmts.outById.get(id),
    getOutboxByKey: (key) => stmts.outByKey.get(key),
    getOutboxCounts: () => {
      const out = {};
      for (const { status, n } of stmts.outCounts.all()) out[status] = n;
      return out;
    },
    getFailedOutbox: () => stmts.outFailed.all(),
    requeueOutbox: (id) => stmts.outRequeue.run(id),
    resumeSuspendedOutbox: () => stmts.outResetSuspended.run().changes,

    // ── pending owner actions ──
    createOwnerAction: (row) => stmts.actInsert.run({
      kind: row.kind,
      conversation_id: row.conversation_id ?? null,
      customer_message_id: row.customer_message_id ?? null,
      payload: row.payload ?? null,
    }).lastInsertRowid,
    getPendingOwnerAction: (kind = null) =>
      (kind ? stmts.actPendingByKind.get(kind) : stmts.actPending.get()),
    getAllPendingOwnerActions: () => stmts.actAllPending.all(),
    hasPendingOwnerAction: () => stmts.actCountPending.get().n > 0,
    getOwnerActionById: (id) => stmts.actById.get(id),
    resolveOwnerAction: (id, status) => stmts.actResolve.run(status, id),

    // ── price book ──
    insertPriceEntry: (row) => stmts.priceInsert.run({
      service: row.service,
      labor_low: row.labor_low ?? null,
      labor_high: row.labor_high ?? null,
      parts_low: row.parts_low ?? null,
      parts_high: row.parts_high ?? null,
      vehicle_adjustments: row.vehicle_adjustments ?? null,
      fees: row.fees ?? null,
      notes: row.notes ?? null,
      effective_from: row.effective_from ?? null,
      effective_to: row.effective_to ?? null,
    }).lastInsertRowid,
    getPriceEntryById: (id) => stmts.priceById.get(id),
    getAllPriceEntries: () => stmts.priceAll.all(),
    getEffectivePriceEntries: (onDate) => stmts.priceEffective.all({ on: onDate }),
    updatePriceEntry: (id, fields = {}) => stmts.priceUpdate.run({
      id, service: null, labor_low: null, labor_high: null, parts_low: null, parts_high: null,
      vehicle_adjustments: null, fees: null, notes: null, effective_from: null, effective_to: null,
      ...fields,
    }),
    deletePriceEntry: (id) => stmts.priceDelete.run(id),

    // ── health ──
    setHealth: (key, value) => stmts.healthSet.run(key, value == null ? null : String(value)),
    getHealth: (key) => {
      const row = stmts.healthGet.get(key);
      return row ? row.value : null;
    },
    getAllHealth: () => {
      const out = {};
      for (const { key, value } of stmts.healthAll.all()) out[key] = value;
      return out;
    },
    setHealthMany: (obj) => {
      const tx = db.transaction((entries) => {
        for (const [k, v] of entries) stmts.healthSet.run(k, v == null ? null : String(v));
      });
      tx(Object.entries(obj));
    },
    // Structured view of automation health for the dashboard.
    healthSnapshot: () => {
      const h = {};
      for (const { key, value } of stmts.healthAll.all()) h[key] = value;
      return {
        browserState: h.browser_state || 'unknown',
        lastStateAt: h.last_state_at || null,
        lastScanAt: h.last_scan_at || null,
        lastScanOk: h.last_scan_ok === '1',
        lastError: h.last_error || '',
        lastScreenshot: h.last_screenshot || '',
        lastRetentionAt: h.last_retention_at || null,
        lastRetentionResult: h.last_retention_result || '',
      };
    },
  };
}

// Open a database at the given path, apply migrations, and return { db, store }.
export function openDatabase(dbPath = config.dbPath) {
  const db = new Database(dbPath);
  if (dbPath !== ':memory:') db.pragma('journal_mode = WAL');
  migrate(db);
  return { db, store: makeStore(db) };
}

const main = openDatabase();
export const store = main.store;
export default main.db;

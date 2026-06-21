import Database from 'better-sqlite3';
import { config } from './config.js';

const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    gmail_id                TEXT UNIQUE NOT NULL,
    from_number             TEXT,
    from_name               TEXT,
    body                    TEXT,
    received_at             TEXT,
    status                  TEXT NOT NULL DEFAULT 'pending',
    extracted               TEXT,          -- JSON from Claude
    clarification_question  TEXT,
    clarification_answer    TEXT,
    clarification_rounds    INTEGER NOT NULL DEFAULT 0,
    calendar_event_id       TEXT,
    calendar_link           TEXT,
    error                   TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Status values:
//   pending                - ingested, not yet processed
//   scheduled              - appointment created on the calendar
//   awaiting_clarification - we texted the owner and are waiting for a reply
//   failed                 - could not schedule (gave up)
//   ignored                - not an appointment request

const stmts = {
  exists: db.prepare('SELECT 1 FROM messages WHERE gmail_id = ?'),
  insert: db.prepare(`
    INSERT INTO messages (gmail_id, from_number, from_name, body, received_at, status)
    VALUES (@gmail_id, @from_number, @from_name, @body, @received_at, 'pending')
  `),
  byId: db.prepare('SELECT * FROM messages WHERE id = ?'),
  pending: db.prepare(`SELECT * FROM messages WHERE status = 'pending' ORDER BY received_at ASC`),
  oldestAwaiting: db.prepare(`
    SELECT * FROM messages WHERE status = 'awaiting_clarification'
    ORDER BY received_at ASC LIMIT 1
  `),
  countAwaiting: db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE status = 'awaiting_clarification'`),
  recent: db.prepare('SELECT * FROM messages ORDER BY received_at DESC LIMIT ?'),
  counts: db.prepare('SELECT status, COUNT(*) AS n FROM messages GROUP BY status'),
  update: db.prepare(`
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
};

export const store = {
  hasMessage: (gmailId) => !!stmts.exists.get(gmailId),
  insertMessage: (row) => stmts.insert.run(row),
  getMessage: (id) => stmts.byId.get(id),
  getPending: () => stmts.pending.all(),
  getOldestAwaiting: () => stmts.oldestAwaiting.get(),
  hasOutstandingClarification: () => stmts.countAwaiting.get().n > 0,
  getRecent: (limit = 50) => stmts.recent.all(limit),
  getCounts: () => {
    const out = { pending: 0, scheduled: 0, awaiting_clarification: 0, failed: 0, ignored: 0 };
    for (const { status, n } of stmts.counts.all()) out[status] = n;
    return out;
  },
  // Pass only the fields you want to change; everything else stays as-is.
  updateMessage: (id, fields = {}) => stmts.update.run({
    id,
    status: null,
    extracted: null,
    clarification_question: null,
    clarification_answer: null,
    clarification_rounds: null,
    calendar_event_id: null,
    calendar_link: null,
    error: null,
    ...fields,
  }),
};

export default db;

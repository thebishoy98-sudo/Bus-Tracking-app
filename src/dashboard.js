import path from 'node:path';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const STATUS = {
  scheduled:      { label: 'Booked', cls: 'ok' },
  awaiting_owner: { label: 'Needs reply', cls: 'wait' },
  processed:      { label: 'Processed', cls: 'queue' },
  new:            { label: 'In queue', cls: 'queue' },
  failed:         { label: 'Failed', cls: 'fail' },
  ignored:        { label: 'Not a booking', cls: 'muted' },
};

// ── Price-book input validation (used by the server's CRUD routes) ──
const MONEY_FIELDS = ['labor_low', 'labor_high', 'parts_low', 'parts_high', 'fees'];

export function validatePriceEntry(input = {}) {
  const errors = [];
  const value = {};

  const service = String(input.service ?? '').trim();
  if (!service) errors.push('service is required');
  value.service = service;

  for (const field of MONEY_FIELDS) {
    const raw = input[field];
    if (raw === undefined || raw === '' || raw === null) { value[field] = null; continue; }
    const n = Number(raw);
    if (!Number.isFinite(n)) errors.push(`${field} must be a number`);
    else if (n < 0) errors.push(`${field} cannot be negative`);
    else value[field] = n;
  }

  const dateOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  for (const field of ['effective_from', 'effective_to']) {
    const raw = String(input[field] ?? '').trim();
    if (!raw) { value[field] = null; continue; }
    if (!dateOk(raw)) errors.push(`${field} must be a YYYY-MM-DD date`);
    else value[field] = raw;
  }

  value.vehicle_adjustments = input.vehicle_adjustments || null;
  value.notes = input.notes || null;

  return { ok: errors.length === 0, errors, value };
}

// ── Rendering ──
function healthCard(health, observation) {
  const ok = health.lastScanOk;
  return `
    <section class="panel">
      <h2>Automation status</h2>
      <div class="grid">
        <div><span class="k">Browser</span><span class="v ${health.browserState === 'ready' ? 'good' : 'bad'}">${esc(health.browserState)}</span></div>
        <div><span class="k">Last scan</span><span class="v">${esc(health.lastScanAt || '—')} ${ok ? '✓' : '✗'}</span></div>
        <div><span class="k">Mode</span><span class="v ${observation ? 'warn' : 'good'}">${observation ? 'OBSERVATION (not sending)' : 'SENDING ENABLED'}</span></div>
        ${health.lastError ? `<div><span class="k">Last error</span><span class="v bad">${esc(health.lastError)}</span></div>` : ''}
      </div>
      <form method="post" action="/observation" class="inline">
        <input type="hidden" name="mode" value="${observation ? 'off' : 'on'}">
        <button type="submit">${observation ? 'Enable sending' : 'Switch to observation'}</button>
      </form>
      <form method="post" action="/run" class="inline"><button type="submit">Scan now</button></form>
    </section>`;
}

function approvalsCard(pending) {
  const items = (pending || []).filter((a) => a.kind === 'pricing_approval');
  if (!items.length) return '';
  return `
    <section class="panel accent">
      <h2>Pending price approvals <span class="count">${items.length}</span></h2>
      ${items.map((a) => {
    let p = {}; try { p = JSON.parse(a.payload) || {}; } catch { /* ignore */ }
    return `<div class="ask"><b>${esc(p.service || 'service')}</b> — ${p.low == null ? 'no price' : `$${esc(p.low)}–$${esc(p.high)}`} (confidence ${esc(p.confidence || '?')}). Reply on your owner line: APPROVE / EDIT / NOQUOTE.</div>`;
  }).join('')}
    </section>`;
}

function failedSendsCard(failed) {
  if (!failed || !failed.length) return '';
  return `
    <section class="panel">
      <h2>Failed / suspended sends <span class="count">${failed.length}</span></h2>
      <table><thead><tr><th>To</th><th>Status</th><th>Error</th><th></th></tr></thead><tbody>
      ${failed.map((f) => `<tr>
        <td class="mono">${esc(f.recipient_number)}</td>
        <td><span class="chip fail">${esc(f.status)}</span></td>
        <td class="msg">${esc(f.last_error || '')}</td>
        <td><form method="post" action="/outbox/${esc(f.id)}/retry"><button type="submit">Retry</button></form></td>
      </tr>`).join('')}
      </tbody></table>
    </section>`;
}

function thumbs(attachments) {
  return (attachments || [])
    .filter((a) => a.status === 'stored' && a.file_path)
    .map((a) => `<a href="/media/${esc(path.basename(a.file_path))}" target="_blank" rel="noopener"><img class="thumb" src="/media/${esc(path.basename(a.file_path))}" alt="attachment"></a>`)
    .join('');
}

function messagesCard(messages) {
  if (!messages || !messages.length) {
    return `<section class="panel"><h2>Recent messages</h2><div class="empty">No messages yet.</div></section>`;
  }
  const rows = messages.map((m) => {
    const s = STATUS[m.status] || STATUS.new;
    return `<tr>
      <td class="mono time">${esc(m.sent_at || '')}</td>
      <td class="who">${esc(m.display_name || m.sender_number || 'Unknown')}</td>
      <td class="msg">${esc((m.body || '').slice(0, 160))}</td>
      <td>${thumbs(m.attachments)}</td>
      <td><span class="chip ${s.cls}">${s.label}</span></td>
    </tr>`;
  }).join('');
  return `
    <section class="panel">
      <h2>Recent messages</h2>
      <table><thead><tr><th>When</th><th>From</th><th>Message</th><th>Images</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </section>`;
}

function priceBookCard(priceBook) {
  const rows = (priceBook || []).map((p) => `<tr>
    <td>${esc(p.service)}</td>
    <td class="mono">${esc(p.labor_low)}–${esc(p.labor_high)}</td>
    <td class="mono">${esc(p.parts_low)}–${esc(p.parts_high)}</td>
    <td class="mono">${esc(p.fees)}</td>
    <td class="mono">${esc(p.effective_from || '—')}→${esc(p.effective_to || 'now')}</td>
    <td><form method="post" action="/price/${esc(p.id)}/delete" onsubmit="return confirm('Delete this entry?')"><button type="submit">Delete</button></form></td>
  </tr>`).join('');
  return `
    <section class="panel">
      <h2>Price book</h2>
      <table><thead><tr><th>Service</th><th>Labor</th><th>Parts</th><th>Fees</th><th>Effective</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="empty">No price-book entries yet.</td></tr>'}</tbody></table>
      <form method="post" action="/price" class="pricefrm">
        <input name="service" placeholder="service" required>
        <input name="labor_low" placeholder="labor low" inputmode="decimal">
        <input name="labor_high" placeholder="labor high" inputmode="decimal">
        <input name="parts_low" placeholder="parts low" inputmode="decimal">
        <input name="parts_high" placeholder="parts high" inputmode="decimal">
        <input name="fees" placeholder="fees" inputmode="decimal">
        <input name="effective_from" placeholder="YYYY-MM-DD">
        <button type="submit">Add entry</button>
      </form>
    </section>`;
}

export function renderDashboard(data = {}) {
  const {
    shopName = 'Shop', timezone = '', observation = true,
    health = {}, pendingApprovals = [], failedSends = [], messages = [], priceBook = [],
  } = data;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(shopName)} — Service Desk</title>
<style>
  :root{--bg:#15171a;--panel:#1e2125;--line:#2c3036;--ink:#ECEAE4;--dim:#8b9099;--accent:#F2C200;--ok:#54c08a;--fail:#e36a6a;--blue:#6aa3e3;}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.5}
  .mono{font-family:ui-monospace,Menlo,monospace}
  header{border-bottom:1px solid var(--line);padding:18px 24px}
  h1{margin:0;font-size:22px} .sub{color:var(--dim);font-size:13px}
  main{padding:22px;max-width:1100px;margin:0 auto}
  .panel{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:16px 18px;margin-bottom:18px}
  .panel.accent{border-color:var(--accent);box-shadow:inset 3px 0 0 var(--accent)}
  h2{font-size:15px;text-transform:uppercase;letter-spacing:.05em;margin:0 0 12px}
  .count{background:var(--accent);color:#0e0f11;border-radius:999px;font-size:12px;padding:1px 9px}
  .grid{display:flex;gap:22px;flex-wrap:wrap;margin-bottom:12px}
  .grid .k{display:block;color:var(--dim);font-size:11px;text-transform:uppercase}
  .grid .v{font-weight:600} .good{color:var(--ok)} .bad{color:var(--fail)} .warn{color:var(--accent)}
  button{font-size:13px;background:transparent;color:var(--ink);border:1px solid var(--line);padding:8px 14px;border-radius:4px;cursor:pointer}
  button:hover{border-color:var(--accent);color:var(--accent)}
  form.inline{display:inline-block;margin-right:8px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;color:var(--dim);font-size:11px;text-transform:uppercase;padding:0 10px 8px;border-bottom:1px solid var(--line)}
  td{padding:10px;border-bottom:1px solid var(--line);vertical-align:top}
  .who{font-weight:600;white-space:nowrap} .msg{color:var(--dim);max-width:320px} .time{color:var(--dim);white-space:nowrap;font-size:12px}
  .chip{font-size:11px;padding:3px 9px;border-radius:999px;border:1px solid var(--line)}
  .chip.ok{color:var(--ok)} .chip.wait{color:var(--accent)} .chip.queue{color:var(--blue)} .chip.fail{color:var(--fail)} .chip.muted{color:var(--dim)}
  .thumb{height:42px;width:42px;object-fit:cover;border-radius:4px;border:1px solid var(--line);margin-right:4px}
  .ask{border-top:1px solid var(--line);padding:8px 0} .ask:first-of-type{border-top:none}
  .empty{color:var(--dim);text-align:center;padding:20px}
  .pricefrm{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px}
  .pricefrm input{background:#15171a;border:1px solid var(--line);color:var(--ink);padding:7px 9px;border-radius:4px}
</style></head>
<body>
  <header><h1>${esc(shopName)} · Service Desk</h1><div class="sub">Google Voice automation · timezone ${esc(timezone)}</div></header>
  <main>
    ${healthCard(health, observation)}
    ${approvalsCard(pendingApprovals)}
    ${failedSendsCard(failedSends)}
    ${messagesCard(messages)}
    ${priceBookCard(priceBook)}
  </main>
</body></html>`;
}

export default { renderDashboard, validatePriceEntry };

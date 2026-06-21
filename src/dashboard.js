import { config } from './config.js';
import { formatLocal } from './time.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const STATUS = {
  scheduled:              { label: 'Booked',       cls: 'ok' },
  awaiting_clarification: { label: 'Needs reply',  cls: 'wait' },
  pending:                { label: 'In queue',     cls: 'queue' },
  failed:                 { label: 'Failed',       cls: 'fail' },
  ignored:                { label: 'Not a booking', cls: 'muted' },
};

function whenLabel(m) {
  try {
    const ex = m.extracted ? JSON.parse(m.extracted) : null;
    if (ex?.start_local) return formatLocal(ex.start_local);
    if (m.status === 'awaiting_clarification') return '—';
  } catch { /* ignore */ }
  return '';
}

function serviceLabel(m) {
  try {
    const ex = m.extracted ? JSON.parse(m.extracted) : null;
    return ex?.service || '';
  } catch { return ''; }
}

function row(m) {
  const s = STATUS[m.status] || STATUS.pending;
  const who = m.from_name || m.from_number || 'Unknown';
  const when = whenLabel(m);
  const svc = serviceLabel(m);
  const link = m.calendar_link
    ? `<a class="cal" href="${esc(m.calendar_link)}" target="_blank" rel="noopener">open ↗</a>` : '';
  return `
    <tr>
      <td class="mono time">${esc(new Date(m.received_at).toLocaleString())}</td>
      <td class="who">${esc(who)}</td>
      <td>${esc(svc) || '<span class="dim">—</span>'}</td>
      <td class="mono">${esc(when) || '<span class="dim">—</span>'}</td>
      <td><span class="chip ${s.cls}">${s.label}</span></td>
      <td class="msg">${esc(m.body || '').slice(0, 120)}</td>
      <td>${link}</td>
    </tr>`;
}

function clarificationCard(m) {
  return `
    <div class="ask">
      <div class="ask-q">${esc(m.clarification_question || '')}</div>
      <div class="ask-meta">
        <span>from <b>${esc(m.from_name || m.from_number || 'unknown')}</b></span>
        <span class="dim">“${esc((m.body || '').slice(0, 100))}”</span>
      </div>
    </div>`;
}

export function renderDashboard(counts, messages) {
  const awaiting = messages.filter((m) => m.status === 'awaiting_clarification');

  const askBlock = awaiting.length ? `
    <section class="panel accent">
      <h2>Waiting on you <span class="count">${awaiting.length}</span></h2>
      <p class="hint">Reply to the message on your owner line (${esc(config.ownerNumber)}) with the date &amp; time.</p>
      ${awaiting.map(clarificationCard).join('')}
    </section>` : '';

  const stat = (label, n, cls = '') =>
    `<div class="stat ${cls}"><span class="n mono">${n}</span><span class="l">${label}</span></div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="30">
<title>${esc(config.shopName)} — Service Desk</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
  :root{
    --bg:#15171a; --panel:#1e2125; --line:#2c3036; --ink:#ECEAE4;
    --dim:#8b9099; --accent:#F2C200; --ok:#54c08a; --fail:#e36a6a; --blue:#6aa3e3;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    line-height:1.5;}
  .mono{font-family:"IBM Plex Mono",ui-monospace,Menlo,monospace}
  header{border-bottom:1px solid var(--line);padding:22px 26px;display:flex;
    align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;
    background:linear-gradient(180deg,#1b1e22,#15171a);}
  .brand{display:flex;align-items:center;gap:14px}
  .tag{font-family:"Oswald",sans-serif;font-weight:700;letter-spacing:.14em;
    text-transform:uppercase;font-size:13px;color:#0e0f11;background:var(--accent);
    padding:4px 9px;border-radius:3px;}
  h1{font-family:"Oswald",sans-serif;font-weight:600;letter-spacing:.02em;
    font-size:26px;margin:0;text-transform:uppercase}
  .sub{color:var(--dim);font-size:13px;margin-top:2px}
  form.scan{margin:0}
  button{font-family:"Oswald",sans-serif;letter-spacing:.1em;text-transform:uppercase;
    font-weight:600;font-size:13px;background:transparent;color:var(--ink);
    border:1px solid var(--line);padding:10px 16px;border-radius:4px;cursor:pointer}
  button:hover{border-color:var(--accent);color:var(--accent)}
  main{padding:26px;max-width:1100px;margin:0 auto}
  .stats{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:22px}
  .stat{background:var(--panel);border:1px solid var(--line);border-radius:6px;
    padding:14px 18px;min-width:104px;display:flex;flex-direction:column;gap:2px}
  .stat .n{font-size:26px;font-weight:600}
  .stat .l{color:var(--dim);font-size:12px;text-transform:uppercase;letter-spacing:.08em}
  .stat.ok .n{color:var(--ok)} .stat.wait .n{color:var(--accent)} .stat.fail .n{color:var(--fail)}
  .panel{background:var(--panel);border:1px solid var(--line);border-radius:8px;
    padding:18px 20px;margin-bottom:22px}
  .panel.accent{border-color:var(--accent);box-shadow:inset 3px 0 0 var(--accent)}
  .panel h2{font-family:"Oswald",sans-serif;font-weight:600;letter-spacing:.04em;
    text-transform:uppercase;font-size:16px;margin:0 0 4px;display:flex;align-items:center;gap:10px}
  .count{background:var(--accent);color:#0e0f11;border-radius:999px;font-size:12px;
    padding:1px 9px;font-family:"IBM Plex Mono",monospace}
  .hint{color:var(--dim);font-size:13px;margin:0 0 12px}
  .ask{border-top:1px solid var(--line);padding:12px 0}
  .ask:first-of-type{border-top:none}
  .ask-q{font-size:15px}
  .ask-meta{display:flex;gap:12px;flex-wrap:wrap;color:var(--dim);font-size:13px;margin-top:4px}
  table{width:100%;border-collapse:collapse;font-size:13.5px}
  th{font-family:"Oswald",sans-serif;text-transform:uppercase;letter-spacing:.08em;
    font-size:11.5px;color:var(--dim);text-align:left;font-weight:600;
    padding:0 12px 10px;border-bottom:1px solid var(--line)}
  td{padding:12px;border-bottom:1px solid var(--line);vertical-align:top}
  .time{color:var(--dim);white-space:nowrap;font-size:12px}
  .who{font-weight:600;white-space:nowrap}
  .msg{color:var(--dim);max-width:260px}
  .dim{color:var(--dim)}
  a.cal{color:var(--blue);text-decoration:none;white-space:nowrap}
  a.cal:hover{text-decoration:underline}
  .chip{font-family:"Oswald",sans-serif;text-transform:uppercase;letter-spacing:.06em;
    font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;white-space:nowrap;
    border:1px solid var(--line)}
  .chip.ok{color:var(--ok);border-color:#2e5a45}
  .chip.wait{color:var(--accent);border-color:#6a5a12;background:#241f0a}
  .chip.queue{color:var(--blue);border-color:#2c4a6a}
  .chip.fail{color:var(--fail);border-color:#6a2e2e}
  .chip.muted{color:var(--dim)}
  .empty{color:var(--dim);padding:30px 12px;text-align:center}
  footer{color:var(--dim);font-size:12px;text-align:center;padding:8px 0 30px}
</style>
</head>
<body>
  <header>
    <div class="brand">
      <span class="tag">Bay&nbsp;1</span>
      <div>
        <h1>${esc(config.shopName)} · Service Desk</h1>
        <div class="sub">Texts in → appointments out. Auto-booked by Claude; you only hear from it when it's unsure.</div>
      </div>
    </div>
    <form class="scan" method="post" action="/run"><button type="submit">Scan now</button></form>
  </header>
  <main>
    <div class="stats">
      ${stat('Booked', counts.scheduled, 'ok')}
      ${stat('Needs reply', counts.awaiting_clarification, 'wait')}
      ${stat('In queue', counts.pending)}
      ${stat('Failed', counts.failed, 'fail')}
      ${stat('Not bookings', counts.ignored)}
    </div>

    ${askBlock}

    <section class="panel">
      <h2>Recent messages</h2>
      ${messages.length ? `
      <table>
        <thead><tr>
          <th>Received</th><th>From</th><th>Service</th><th>When</th><th>Status</th><th>Message</th><th></th>
        </tr></thead>
        <tbody>${messages.map(row).join('')}</tbody>
      </table>` : `<div class="empty">No messages yet. Text your Google Voice number to test it.</div>`}
    </section>
  </main>
  <footer>Auto-refreshes every 30s · timezone ${esc(config.timezone)}</footer>
</body>
</html>`;
}

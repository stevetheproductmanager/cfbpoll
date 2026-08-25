// Email delivery — provider-agnostic.
// Uses Nodemailer + SMTP if both the package is installed AND SMTP_* env vars are set.
// Otherwise it logs the email (so the whole feature works end-to-end with no provider,
// and starts actually sending the moment you `npm i nodemailer` and set SMTP_* in .env).

let _transport = null;
let _transportTried = false;

async function getTransport() {
  if (_transportTried) return _transport;
  _transportTried = true;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return (_transport = null);
  try {
    const nodemailer = (await import('nodemailer')).default;
    _transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  } catch {
    _transport = null; // nodemailer not installed yet
  }
  return _transport;
}

// In-memory log (most recent 200) so the admin can see what went out.
const emailLog = [];
export function getEmailLog() { return emailLog.slice(-200); }

export async function sendEmail({ to, subject, html, text }) {
  const from = process.env.EMAIL_FROM || 'Poll Position <noreply@pollposition.app>';
  const transport = await getTransport();
  let method = 'logged', ok = true, error = null;
  try {
    if (transport) {
      await transport.sendMail({ from, to, subject, html, text: text || stripHtml(html) });
      method = 'smtp';
    } else {
      console.log(`[email:logged] To:${to} | ${subject}`);
    }
  } catch (e) {
    ok = false; error = String(e?.message || e); method = 'error';
  }
  emailLog.push({ time: new Date(), to, subject, method, ok, error });
  return { ok, method, error };
}

function stripHtml(html = '') {
  return html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/* ---------------- Templates ---------------- */

const shell = (inner) => `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#0e1428;color:#e4e8f7;border-radius:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.08)">
  <div style="padding:20px 24px;background:linear-gradient(135deg,#4d8eff22,#6c5ce722);border-bottom:1px solid rgba(255,255,255,0.08)">
    <span style="font-size:20px;font-weight:800">🏈 Poll Position</span>
  </div>
  <div style="padding:24px">${inner}</div>
  <div style="padding:16px 24px;border-top:1px solid rgba(255,255,255,0.08);color:#6b7599;font-size:11px">
    Poll Position — the people's college football poll.
  </div>
</div>`;

const btn = (label, url) =>
  `<a href="${url}" style="display:inline-block;background:#4d8eff;color:#fff;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:10px;margin-top:8px">${label}</a>`;

export function deadlineReminderEmail({ name, week, deadline, appUrl }) {
  const due = deadline ? new Date(deadline).toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'soon';
  return {
    subject: `⏰ Your Week ${week} ballot is due ${deadline ? 'soon' : ''}`.trim(),
    html: shell(`
      <h2 style="margin:0 0 8px;font-size:20px">Don't miss the deadline, ${name?.split(' ')[0] || 'voter'}!</h2>
      <p style="color:#b0b8d4;line-height:1.6;margin:0 0 16px">
        Voting for <strong>Week ${week}</strong> closes <strong style="color:#f87171">${due}</strong> and we don't have your ballot yet.
        Lock in your Top 25 before time runs out.
      </p>
      ${btn('Submit My Ballot', `${appUrl}/ballot`)}
    `),
  };
}

export function weeklyRecapEmail({ name, week, top10, biggestRiser, yourAccuracy, appUrl }) {
  const rows = (top10 || []).map((t, i) =>
    `<tr>
       <td style="padding:6px 8px;color:#7db4ff;font-weight:800;width:28px">${i + 1}</td>
       <td style="padding:6px 8px;font-weight:600">${t.team}</td>
       <td style="padding:6px 8px;color:#6b7599;text-align:right">${t.points} pts</td>
     </tr>`).join('');
  return {
    subject: `📊 Week ${week} recap — how the poll shook out`,
    html: shell(`
      <h2 style="margin:0 0 8px;font-size:20px">Week ${week} is in the books</h2>
      <p style="color:#b0b8d4;line-height:1.6;margin:0 0 12px">Here's where the community landed${name ? `, ${name.split(' ')[0]}` : ''}.</p>
      <table style="width:100%;border-collapse:collapse;background:#0b1024;border-radius:10px;overflow:hidden;margin-bottom:16px">${rows}</table>
      ${biggestRiser ? `<p style="color:#34d399;margin:0 0 8px">▲ Biggest riser: <strong>${biggestRiser.team}</strong> (+${biggestRiser.movement})</p>` : ''}
      ${yourAccuracy != null ? `<p style="color:#b0b8d4;margin:0 0 16px">Your ballot agreed with the consensus <strong>${yourAccuracy}%</strong> of the time.</p>` : ''}
      ${btn('See Full Rankings', `${appUrl}/rankings`)}
    `),
  };
}

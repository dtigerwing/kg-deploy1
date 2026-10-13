// Gmail 로 알림 메일 보내기 (Google 계정 '앱 비밀번호' 사용)
// .env: GMAIL_USER (보내는 Gmail 주소), GMAIL_APP_PASSWORD (16자리 앱 비밀번호), NOTIFY_EMAIL (받을 주소, 없으면 GMAIL_USER)
import nodemailer from 'nodemailer';

const USER = process.env.GMAIL_USER || '';
const PASS = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
export const NOTIFY_TO = process.env.NOTIFY_EMAIL || USER;
export const mailReady = Boolean(USER && PASS && NOTIFY_TO);

let transport;
const getTransport = () => (transport ||= nodemailer.createTransport({ service: 'gmail', auth: { user: USER, pass: PASS } }));

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function sendMail({ subject, rows, intro }) {
  if (!mailReady) return { skipped: true };
  const table = rows
    .map(([k, v]) => `<tr><th align="left" style="padding:6px 12px 6px 0;color:#6b5f8a;white-space:nowrap;vertical-align:top">${esc(k)}</th><td style="padding:6px 0;white-space:pre-wrap">${esc(v)}</td></tr>`)
    .join('');
  const html = `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#3a2e5c">
<p>${esc(intro)}</p><table cellspacing="0" style="border-collapse:collapse">${table}</table>
<p style="color:#999;font-size:12px">KIGLE 챗봇 자동 알림 · 관리자 페이지에서 답변과 규칙을 고칠 수 있어요.</p></div>`;
  const textBody = `${intro}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}`;
  await getTransport().sendMail({ from: `"KIGLE 챗봇" <${USER}>`, to: NOTIFY_TO, subject, html, text: textBody });
  return { sent: true };
}

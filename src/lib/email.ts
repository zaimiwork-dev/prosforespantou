// Email sender — wraps Resend.
//
// All app emails go through here. When RESEND_API_KEY is unset (local dev,
// preview deploys, CI), we fall back to console.log so subscribe/alert flows
// still work end-to-end without crashing — the URL just gets logged.
//
// Required env: RESEND_API_KEY  (sk_live_... — get one at https://resend.com)
// Optional env:
//   EMAIL_FROM   — sender address. Default 'Prosfores Pantou <onboarding@resend.dev>'.
//                  Resend's `onboarding@resend.dev` works without domain verification
//                  but only delivers to the Resend account holder's email — use a
//                  verified domain like 'alerts@prosforespantou.gr' for real users.
//   EMAIL_REPLY_TO — defaults unset.
//
// All templates render simple HTML + plain text fallback. No marketing tracking
// pixels, no third-party loaders — keep the email lightweight and private.

import { Resend } from 'resend';
import * as Sentry from '@sentry/nextjs';

const FROM = process.env.EMAIL_FROM || 'Prosfores Pantou <onboarding@resend.dev>';
const REPLY_TO = process.env.EMAIL_REPLY_TO;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://prosforespantou.gr';

let _resend: Resend | null = null;
function client(): Resend | null {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

async function send({ to, subject, html, text }: SendArgs): Promise<{ ok: boolean; id?: string; error?: string }> {
  const c = client();
  if (!c) {
    // Dev fallback — keep the flow working without the SDK.
    console.log(`[EMAIL fallback — RESEND_API_KEY not set] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return { ok: false, error: 'no-api-key' };
  }
  try {
    const r = await c.emails.send({
      from: FROM,
      to,
      subject,
      html,
      text,
      ...(REPLY_TO ? { replyTo: REPLY_TO } : {}),
    });
    if (r.error) {
      Sentry.captureMessage(`Resend error: ${r.error.message}`, 'warning');
      return { ok: false, error: r.error.message };
    }
    return { ok: true, id: r.data?.id };
  } catch (error: any) {
    Sentry.captureException(error);
    return { ok: false, error: error?.message || 'unknown' };
  }
}

// Shared HTML chrome — light header, light footer, light branding.
function wrap(bodyHtml: string, footerHtml: string): string {
  return `<!doctype html>
<html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Prosfores Pantou</title></head>
<body style="margin:0;padding:0;background:#f3f5f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1e24">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f3f5f8">
    <tr><td align="center" style="padding:24px 12px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.04)">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #ececf0">
          <div style="font-size:18px;font-weight:900;letter-spacing:-0.4px;color:#009de0">Προσφορές Παντού</div>
        </td></tr>
        <tr><td style="padding:24px 28px;font-size:15px;line-height:1.55">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:14px 28px;background:#f9fafc;border-top:1px solid #ececf0;font-size:11px;color:#6c757d;line-height:1.5">
          ${footerHtml}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

// ── Templates ────────────────────────────────────────────────────────────────

export async function sendConfirmationEmail(to: string, confirmToken: string, unsubToken: string) {
  const confirmUrl = `${BASE_URL}/subscribe/confirm?token=${encodeURIComponent(confirmToken)}`;
  const unsubUrl = `${BASE_URL}/subscribe/unsubscribe?token=${encodeURIComponent(unsubToken)}`;

  const text = `Καλώς ήρθες στο Prosfores Pantou!

Πάτησε τον παρακάτω σύνδεσμο για να επιβεβαιώσεις την εγγραφή σου:

${confirmUrl}

Αν δεν έκανες εσύ την εγγραφή, αγνόησε αυτό το email.

Για αποεγγραφή: ${unsubUrl}`;

  const body = `
    <p style="margin:0 0 16px">Καλώς ήρθες! 👋</p>
    <p style="margin:0 0 20px">Πάτησε το παρακάτω κουμπί για να επιβεβαιώσεις την εγγραφή σου στις ενημερώσεις προσφορών.</p>
    <p style="margin:0 0 24px;text-align:center">
      <a href="${confirmUrl}" style="display:inline-block;padding:13px 28px;background:#009de0;color:#fff;text-decoration:none;border-radius:10px;font-weight:800;font-size:15px">
        Επιβεβαίωση εγγραφής
      </a>
    </p>
    <p style="margin:0;font-size:13px;color:#6c757d">Αν το κουμπί δεν λειτουργεί, αντίγραψε αυτόν τον σύνδεσμο στον browser σου:<br><a href="${confirmUrl}" style="color:#009de0;word-break:break-all">${confirmUrl}</a></p>
  `;
  const footer = `Αν δεν έκανες εσύ την εγγραφή, αγνόησε αυτό το email. Δεν θα ξανασταλεί.<br>
    <a href="${unsubUrl}" style="color:#6c757d">Αποεγγραφή</a>`;

  return await send({
    to,
    subject: 'Επιβεβαίωσε την εγγραφή σου στο Προσφορές Παντού',
    html: wrap(body, footer),
    text,
  });
}

interface AlertMatch {
  email: string;
  unsubToken: string;
  keyword: string;
  productName: string;
  supermarketName: string;
  discountedPrice: number;
  originalPrice: number | null;
  discountPercent: number | null;
  offerUrl: string;
}

export async function sendAlertEmail(m: AlertMatch) {
  const priceLine = m.originalPrice && m.originalPrice > m.discountedPrice
    ? `${m.discountedPrice.toFixed(2)}€ (από ${m.originalPrice.toFixed(2)}€${m.discountPercent ? `, -${m.discountPercent}%` : ''})`
    : `${m.discountedPrice.toFixed(2)}€`;

  const text = `Βρέθηκε προσφορά για "${m.keyword}":

${m.productName}
${m.supermarketName} — ${priceLine}

Δες την προσφορά: ${m.offerUrl}

Για διαχείριση ή απενεργοποίηση ειδοποιήσεων: ${BASE_URL}/alerts?token=${encodeURIComponent(m.unsubToken)}`;

  const body = `
    <p style="margin:0 0 6px;font-size:13px;color:#6c757d">Βρέθηκε προσφορά για:</p>
    <p style="margin:0 0 18px;font-size:18px;font-weight:800">${escapeHtml(m.keyword)}</p>
    <div style="border:1px solid #ececf0;border-radius:12px;padding:16px;margin:0 0 20px">
      <div style="font-size:11px;font-weight:800;color:#009de0;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px">${escapeHtml(m.supermarketName)}</div>
      <div style="font-size:15px;font-weight:700;margin-bottom:10px">${escapeHtml(m.productName)}</div>
      <div style="font-size:24px;font-weight:900;color:#1c1e24">${m.discountedPrice.toFixed(2)}€</div>
      ${m.originalPrice && m.originalPrice > m.discountedPrice ? `
        <div style="font-size:13px;color:#8b929c"><span style="text-decoration:line-through">${m.originalPrice.toFixed(2)}€</span>${m.discountPercent ? ` <strong style="color:#ff3b30">−${m.discountPercent}%</strong>` : ''}</div>
      ` : ''}
    </div>
    <p style="margin:0 0 20px;text-align:center">
      <a href="${m.offerUrl}" style="display:inline-block;padding:12px 26px;background:#009de0;color:#fff;text-decoration:none;border-radius:10px;font-weight:800;font-size:14px">
        Δες την προσφορά
      </a>
    </p>
  `;
  const footer = `Έλαβες αυτή την ειδοποίηση γιατί παρακολουθείς τη λέξη «${escapeHtml(m.keyword)}».<br>
    <a href="${BASE_URL}/alerts?token=${encodeURIComponent(m.unsubToken)}" style="color:#6c757d">Διαχείριση ειδοποιήσεων</a>`;

  return await send({
    to: m.email,
    subject: `Νέα προσφορά: ${m.productName}`,
    html: wrap(body, footer),
    text,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

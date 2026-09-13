export interface ReminderEmailInput {
  documentName: string;
  workspaceName: string;
  expiryDate: Date;
  daysUntilExpiry: number;
  documentUrl: string;
  remindersUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function whenLabel(days: number): string {
  if (days < 0) return `expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`;
  if (days === 0) return 'expires today';
  if (days === 1) return 'expires tomorrow';
  if (days % 30 === 0 && days >= 60) return `expires in ${days / 30} months`;
  if (days === 30) return 'expires in 1 month';
  return `expires in ${days} days`;
}

export function buildReminderEmail(input: ReminderEmailInput): RenderedEmail {
  const when = whenLabel(input.daysUntilExpiry);
  const expiry = formatDate(input.expiryDate);
  const name = escapeHtml(input.documentName);
  const workspace = escapeHtml(input.workspaceName);
  const urgent = input.daysUntilExpiry <= 7;

  const subject = `Reminder: "${input.documentName}" ${when}`;

  const text = [
    `Your document "${input.documentName}" ${when} (${expiry}).`,
    '',
    `Workspace: ${input.workspaceName}`,
    `Open document: ${input.documentUrl}`,
    `All reminders: ${input.remindersUrl}`,
    '',
    'You are receiving this because reminders are enabled for this document in DockyDoc.',
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f6f8;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr><td style="background:${urgent ? '#b91c1c' : '#1d4ed8'};padding:18px 28px;color:#ffffff;font-size:14px;font-weight:600;letter-spacing:.02em;">
            DockyDoc · ${urgent ? 'Urgent expiry reminder' : 'Expiry reminder'}
          </td></tr>
          <tr><td style="padding:28px;">
            <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">${workspace}</p>
            <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:700;">${name}</h1>
            <p style="margin:0 0 20px;font-size:16px;">This document <strong>${escapeHtml(when)}</strong> — on <strong>${expiry}</strong>.</p>
            <a href="${input.documentUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px;">Open document</a>
            <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">Renewed it already? Open the document and update its expiry date to stop further reminders.</p>
          </td></tr>
          <tr><td style="padding:16px 28px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
            You are receiving this because reminders are enabled for this document.
            <a href="${input.remindersUrl}" style="color:#6b7280;">Manage reminders</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

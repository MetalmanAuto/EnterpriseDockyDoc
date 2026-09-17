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

function layout(heading: string, intro: string, title: string, lines: string[], cta: { label: string; url: string }, footer: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f6f8;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr><td style="background:#0f766e;padding:18px 28px;color:#ffffff;font-size:14px;font-weight:600;letter-spacing:.02em;">
            DockyDoc · ${heading}
          </td></tr>
          <tr><td style="padding:28px;">
            <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">${intro}</p>
            <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:700;">${title}</h1>
            ${lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;">${l}</p>`).join('\n            ')}
            <a href="${cta.url}" style="display:inline-block;margin-top:8px;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px;">${cta.label}</a>
          </td></tr>
          <tr><td style="padding:16px 28px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
            ${footer}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

// ---- external: a link sent to someone outside the workspace ---------------- //

export interface ExternalShareEmailInput {
  documentName: string;
  sharedByName: string;
  shareUrl: string;
  expiresAt: Date | null;
  hasPassword: boolean;
  allowDownload: boolean;
  message?: string;
}

/**
 * The link is the credential, so the email says what it opens and for how
 * long. When the link is password-protected the email never carries the
 * password; the sender passes that on another way.
 */
export function buildExternalShareEmail(input: ExternalShareEmailInput): RenderedEmail {
  const doc = escapeHtml(input.documentName);
  const by = escapeHtml(input.sharedByName);
  const subject = `${input.sharedByName} shared "${input.documentName}" with you`;

  const notes: string[] = [];
  if (input.expiresAt) notes.push(`The link stops working on ${formatDate(input.expiresAt)}.`);
  if (input.hasPassword) notes.push(`It is protected by a password. ${input.sharedByName} will give you that separately; it is not in this email.`);
  notes.push(input.allowDownload ? 'You can view and download the file.' : 'You can view the file online. Downloading is switched off.');

  const text = [
    `${input.sharedByName} shared "${input.documentName}" with you on DockyDoc.`,
    '',
    ...(input.message ? [`"${input.message}"`, ''] : []),
    `Open it: ${input.shareUrl}`,
    '',
    ...notes,
    '',
    'DockyDoc tracks document expiry dates and reminds people before they lapse.',
  ].join('\n');

  const lines = [
    ...(input.message ? [`<em>${escapeHtml(input.message)}</em>`] : []),
    ...notes.map(escapeHtml),
  ];
  const html = layout(
    'A document was shared with you',
    `${by} shared`,
    doc,
    lines,
    { label: 'Open document', url: input.shareUrl },
    'DockyDoc tracks document expiry dates and reminds people before they lapse. If you were not expecting this, ignore it; the link cannot be used to reach anything else.',
  );
  return { subject, html, text };
}

// ---- internal: a colleague in the same workspace ------------------------- //

export interface InternalShareEmailInput {
  documentName: string;
  sharedByName: string;
  workspaceName: string;
  documentUrl: string;
  permission: 'VIEW' | 'DOWNLOAD';
}

export function buildInternalShareEmail(input: InternalShareEmailInput): RenderedEmail {
  const doc = escapeHtml(input.documentName);
  const by = escapeHtml(input.sharedByName);
  const subject = `${input.sharedByName} shared "${input.documentName}" with you`;
  const what = input.permission === 'DOWNLOAD' ? 'view and download' : 'view';

  const text = [
    `${input.sharedByName} shared "${input.documentName}" with you in the ${input.workspaceName} workspace on DockyDoc.`,
    `You can ${what} it.`,
    '',
    `Open it: ${input.documentUrl}`,
  ].join('\n');

  const html = layout(
    'A colleague shared a document',
    `${by} shared, in ${escapeHtml(input.workspaceName)}`,
    doc,
    [`You can ${what} it. Sign in with your DockyDoc account to open it.`],
    { label: 'Open document', url: input.documentUrl },
    'You are receiving this because you are a member of the workspace this document is in.',
  );
  return { subject, html, text };
}

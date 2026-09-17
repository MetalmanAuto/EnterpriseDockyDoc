import type { WorkspaceUserRole } from '@prisma/client';

export interface InvitationEmailInput {
  workspaceName: string;
  invitedByName: string;
  role: WorkspaceUserRole;
  joinUrl: string;
  expiresAt: Date;
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

/** What the role lets them do, in the words someone outside the team would use. */
const ROLE_LABEL: Record<WorkspaceUserRole, string> = {
  OWNER: 'owner — full control, including billing and deleting the workspace',
  ADMIN: 'admin — manage documents, members and settings',
  EDITOR: 'editor — upload, edit and share documents',
  VIEWER: 'viewer — read and download documents',
};

export function buildInvitationEmail(input: InvitationEmailInput): RenderedEmail {
  const workspace = escapeHtml(input.workspaceName);
  const invitedBy = escapeHtml(input.invitedByName);
  const role = escapeHtml(ROLE_LABEL[input.role]);
  const expires = formatDate(input.expiresAt);

  const subject = `${input.invitedByName} invited you to ${input.workspaceName} on DockyDoc`;

  const text = [
    `${input.invitedByName} has invited you to join "${input.workspaceName}" on DockyDoc.`,
    '',
    `Your role: ${ROLE_LABEL[input.role]}`,
    `This invitation expires on ${expires}.`,
    '',
    `Accept it here: ${input.joinUrl}`,
    '',
    'DockyDoc tracks document expiry dates and reminds you before they lapse.',
    'If you were not expecting this invitation, you can ignore this email.',
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f6f8;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr><td style="background:#0f766e;padding:18px 28px;color:#ffffff;font-size:14px;font-weight:600;letter-spacing:.02em;">
            DockyDoc · Workspace invitation
          </td></tr>
          <tr><td style="padding:28px;">
            <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">${invitedBy} invited you</p>
            <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:700;">${workspace}</h1>
            <p style="margin:0 0 20px;font-size:16px;">You have been added as <strong>${role}</strong>.</p>
            <a href="${input.joinUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px;">Accept invitation</a>
            <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">This invitation expires on ${expires}. Sign in with this email address to accept it.</p>
          </td></tr>
          <tr><td style="padding:16px 28px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
            DockyDoc tracks document expiry dates and reminds you before they lapse.
            If you were not expecting this invitation, ignore this email.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

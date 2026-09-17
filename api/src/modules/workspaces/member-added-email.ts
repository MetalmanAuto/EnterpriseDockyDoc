import type { WorkspaceUserRole } from '@prisma/client';

export interface MemberAddedEmailInput {
  workspaceName: string;
  addedByName: string;
  role: WorkspaceUserRole;
  /** Where to sign in. The person may not have an account yet; the login page handles both. */
  loginUrl: string;
  /** True when DockyDoc created their account just now, so the email should say how to get in. */
  isNewAccount: boolean;
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

const ROLE_LABEL: Record<WorkspaceUserRole, string> = {
  OWNER: 'owner — full control, including billing and deleting the workspace',
  ADMIN: 'admin — manage documents, members and settings',
  EDITOR: 'editor — upload, edit and share documents',
  VIEWER: 'viewer — read and download documents',
};

/**
 * Sent when an admin adds someone directly, with no invitation to accept.
 * Unlike the invitation email there is nothing to click through: they are
 * already a member, so the email tells them where to sign in and with what.
 */
export function buildMemberAddedEmail(input: MemberAddedEmailInput): RenderedEmail {
  const workspace = escapeHtml(input.workspaceName);
  const addedBy = escapeHtml(input.addedByName);
  const role = escapeHtml(ROLE_LABEL[input.role]);

  const subject = `${input.addedByName} added you to ${input.workspaceName} on DockyDoc`;

  const howToGetIn = input.isNewAccount
    ? 'Sign in with this email address. There is no password to set: you get a one-time code by email or SMS.'
    : 'Sign in as usual and the workspace is in your list.';

  const text = [
    `${input.addedByName} has added you to "${input.workspaceName}" on DockyDoc.`,
    '',
    `Your role: ${ROLE_LABEL[input.role]}`,
    howToGetIn,
    '',
    `Sign in: ${input.loginUrl}`,
    '',
    'DockyDoc tracks document expiry dates and reminds you before they lapse.',
    'If you were not expecting this, reply to whoever added you.',
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f6f8;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr><td style="background:#0f766e;padding:18px 28px;color:#ffffff;font-size:14px;font-weight:600;letter-spacing:.02em;">
            DockyDoc · You have been added to a workspace
          </td></tr>
          <tr><td style="padding:28px;">
            <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">${addedBy} added you</p>
            <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;font-weight:700;">${workspace}</h1>
            <p style="margin:0 0 20px;font-size:16px;">Your role is <strong>${role}</strong>.</p>
            <a href="${input.loginUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:8px;">Open DockyDoc</a>
            <p style="margin:24px 0 0;font-size:13px;color:#6b7280;">${escapeHtml(howToGetIn)}</p>
          </td></tr>
          <tr><td style="padding:16px 28px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">
            DockyDoc tracks document expiry dates and reminds you before they lapse.
            If you were not expecting this, reply to whoever added you.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

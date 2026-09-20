/**
 * Platform admins are the people who run DockyDoc itself, as opposed to
 * workspace owners. They are named in PLATFORM_ADMIN_EMAILS, a comma-separated
 * list, so no code change is needed to add one. With the variable unset,
 * nobody is a platform admin and the admin routes answer 403.
 */
export function platformAdminEmails(): Set<string> {
  return new Set(
    (process.env.PLATFORM_ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPlatformAdmin(email: string | null | undefined): boolean {
  return !!email && platformAdminEmails().has(email.trim().toLowerCase());
}

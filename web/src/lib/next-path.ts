/**
 * Read a `?next=` redirect target from a page's searchParams.
 *
 * Only a path on this site is allowed. Anything else, including a full URL and
 * a protocol-relative "//evil.com" that a browser treats as another origin, is
 * discarded in favour of the fallback, so the parameter cannot be used to send
 * someone off-site after they sign in.
 */
export function safeNextPath(
  next: string | string[] | undefined,
  fallback = '/dashboard',
): string {
  const value = Array.isArray(next) ? next[0] : next;
  if (!value) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
}

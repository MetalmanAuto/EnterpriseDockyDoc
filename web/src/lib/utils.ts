import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Utility for composing Tailwind class names safely.
 * Uses clsx for conditional logic + tailwind-merge to resolve conflicts.
 *
 * Usage:
 *   cn('px-4 py-2', isActive && 'bg-brand-600', className)
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ------------------------------------------------------------------ //
// People — names and initials
// ------------------------------------------------------------------ //

interface NamedPerson {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

/**
 * A person's display name, tolerating the half-filled records real sign-ups
 * produce. Clerk only asks for what the instance is configured to ask for, so
 * a user can arrive with a first name and no last name, or with neither.
 * Never returns "undefined" or a stray space.
 */
export function fullName(person: NamedPerson | null | undefined): string {
  if (!person) return '';
  const parts = [person.firstName, person.lastName]
    .map((p) => (p ?? '').trim())
    .filter(Boolean);
  if (parts.length > 0) return parts.join(' ');
  // Fall back to the part of the email before the @, which is always there
  const local = (person.email ?? '').split('@')[0]?.trim();
  return local || 'Unnamed user';
}

/**
 * One or two letters for an avatar. Falls back through last name, then the
 * email, so a user with no name still gets a real letter rather than "?".
 */
export function initialsOf(person: NamedPerson | null | undefined): string {
  if (!person) return '?';
  const first = (person.firstName ?? '').trim();
  const last = (person.lastName ?? '').trim();
  if (first && last) return (first[0] + last[0]).toUpperCase();

  const single = first || last || (person.email ?? '').trim();
  if (!single) return '?';
  // Two letters reads better than one on a round avatar
  return single.slice(0, 2).toUpperCase();
}

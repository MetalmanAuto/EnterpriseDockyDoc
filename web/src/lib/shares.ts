/**
 * Document sharing API helpers.
 */
import { apiFetch } from './api';
import type {
  DocumentShares,
  ExternalShare,
  InternalShare,
  PublicShareInfo,
  SharePermission,
  VerifyShareResponse,
} from '@/types';

const API_URL = ''; // Relative → Next.js /api/v1/* proxy → no CORS

// ------------------------------------------------------------------ //
// Authenticated (workspace member) endpoints
// ------------------------------------------------------------------ //

export function fetchDocumentShares(documentId: string): Promise<DocumentShares> {
  return apiFetch<DocumentShares>(`/api/v1/documents/${documentId}/shares`);
}

export function createInternalShare(
  documentId: string,
  userIds: string[],
  permission: SharePermission,
): Promise<InternalShare[]> {
  return apiFetch<InternalShare[]>(`/api/v1/documents/${documentId}/share/internal`, {
    method: 'POST',
    body: JSON.stringify({ userIds, permission }),
  });
}

export function createExternalShare(
  documentId: string,
  params: { expiresAt?: string; password?: string; allowDownload: boolean; recipients?: string[]; message?: string },
): Promise<ExternalShare> {
  return apiFetch<ExternalShare>(`/api/v1/documents/${documentId}/share/external`, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

export function revokeShare(shareId: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/v1/shares/${shareId}/revoke`, {
    method: 'POST',
  });
}

// ------------------------------------------------------------------ //
// Public (unauthenticated) endpoints
// ------------------------------------------------------------------ //

/** Fetch share info without auth headers (public endpoint). */
export async function fetchPublicShareInfo(token: string): Promise<PublicShareInfo> {
  const res = await fetch(`${API_URL}/api/v1/public/shares/${token}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? res.statusText);
  }
  return res.json();
}

/** Verify password and get access grant. */
export async function verifySharePassword(
  token: string,
  password: string,
): Promise<VerifyShareResponse> {
  const res = await fetch(`${API_URL}/api/v1/public/shares/${token}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.message ?? res.statusText);
  }
  return res.json();
}

/**
 * Build the public download URL for a share.
 * For password-protected shares, include the access grant as a query param.
 */
export function buildDownloadUrl(token: string, grant?: string): string {
  const base = `${API_URL}/api/v1/public/shares/${token}/download`;
  return grant ? `${base}?grant=${encodeURIComponent(grant)}` : base;
}

/**
 * Build the shareable link that recipients open in their browser.
 * Points to the /share/[token] page in the web app.
 */
export function buildSharePageUrl(token: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/share/${token}`;
  }
  return `/share/${token}`;
}

'use client';

import { useEffect, useRef, useState } from 'react';

const API_URL = ''; // Relative → Next.js /api/v1/* proxy → no CORS
const DEV_EMAIL = process.env.NEXT_PUBLIC_DEV_USER_EMAIL ?? 'alice@acmecorp.com';
const IS_CLERK_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/** Mirror of getClerkToken() in api.ts — avoids importing that module here. */
async function getClerkToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  if (!IS_CLERK_CONFIGURED) return null;
  try {
    type ClerkGlobal = {
      loaded?: boolean;
      session?: { getToken: () => Promise<string | null> } | null;
    };
    // Wait up to 5s for the Clerk SDK to finish loading
    let attempts = 0;
    while (attempts < 50) {
      const clerk = (window as typeof window & { Clerk?: ClerkGlobal }).Clerk;
      if (clerk?.loaded) break;
      await new Promise((r) => setTimeout(r, 100));
      attempts++;
    }
    const clerk = (window as typeof window & { Clerk?: ClerkGlobal }).Clerk;
    return (await clerk?.session?.getToken()) ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolve the effective MIME type for preview rendering.
 * Priority: blob.type > Content-Type header > mimeHint > filename extension.
 * Falls back to extension so a PDF uploaded with mimeType=application/octet-stream
 * still renders correctly.
 */
function resolveMime(blobType: string, headerType: string | null, hint: string | undefined, fileName: string): string {
  const candidates = [blobType, headerType ?? '', hint ?? ''];
  for (const c of candidates) {
    const t = c.split(';')[0].trim().toLowerCase();
    if (t && t !== 'application/octet-stream') return t;
  }
  // Extension fallback
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const extMap: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
  };
  return extMap[ext] ?? (hint ?? blobType ?? '');
}

interface Props {
  documentId: string;
  versionNumber: number;
  fileName: string;
  mimeHint?: string;
}

export default function DocumentPreviewCard({ documentId, versionNumber, fileName, mimeHint }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mime, setMime] = useState<string>(mimeHint ?? '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const prevUrl = useRef<string | null>(null);

  useEffect(() => {
    if (prevUrl.current) {
      URL.revokeObjectURL(prevUrl.current);
      prevUrl.current = null;
    }
    setBlobUrl(null);
    setError(null);
    setLoading(true);

    let cancelled = false;

    (async () => {
      try {
        const headers = new Headers();
        const token = await getClerkToken();
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        } else if (!IS_CLERK_CONFIGURED) {
          headers.set('x-dev-user-email', DEV_EMAIL);
        }

        const res = await fetch(
          `${API_URL}/api/v1/documents/${documentId}/versions/${versionNumber}/download`,
          { headers },
        );

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const blob = await res.blob();
        if (cancelled) return;

        const url = URL.createObjectURL(blob);
        const effectiveMime = resolveMime(
          blob.type,
          res.headers.get('content-type'),
          mimeHint,
          fileName,
        );

        setBlobUrl(url);
        setMime(effectiveMime);
        prevUrl.current = url;
      } catch (err) {
        if (!cancelled) setError((err as Error).message ?? 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (prevUrl.current) {
        URL.revokeObjectURL(prevUrl.current);
        prevUrl.current = null;
      }
    };
  }, [documentId, versionNumber, fileName, mimeHint]);

  const isPdf = mime.includes('pdf');
  const isImage = mime.startsWith('image/');

  return (
    <div className="h-[520px] bg-surface-high flex items-center justify-center relative overflow-hidden rounded-b-none">
      {loading && (
        <div className="flex flex-col items-center gap-2 text-ink-3">
          <svg className="animate-spin w-7 h-7" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Loading preview…</span>
        </div>
      )}

      {!loading && error && (
        <div className="text-center px-8">
          <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <p className="text-sm font-medium text-ink-2 mb-1">Preview unavailable</p>
          <p className="text-xs text-ink-3">{error}</p>
        </div>
      )}

      {!loading && !error && blobUrl && isPdf && (
        <iframe
          src={blobUrl}
          className="w-full h-full border-0"
          title={`${fileName} — v${versionNumber} preview`}
        />
      )}

      {!loading && !error && blobUrl && isImage && (
        <img
          src={blobUrl}
          alt={`${fileName} — v${versionNumber} preview`}
          className="max-w-full max-h-full object-contain p-4"
        />
      )}

      {!loading && !error && blobUrl && !isPdf && !isImage && (
        <div className="text-center px-8">
          <div className="w-16 h-20 bg-surface rounded-lg border-2 border-dashed border-stroke flex items-center justify-center mx-auto mb-3">
            <span className="font-mono text-xs font-bold text-ink-3 uppercase">
              {mime.split('/')[1]?.slice(0, 4) || fileName.split('.').pop()?.toUpperCase() || 'FILE'}
            </span>
          </div>
          <p className="text-sm font-medium text-ink-2 mb-1">No preview available</p>
          <p className="text-xs text-ink-3">{mime || 'Binary file'} — download to view</p>
        </div>
      )}
    </div>
  );
}

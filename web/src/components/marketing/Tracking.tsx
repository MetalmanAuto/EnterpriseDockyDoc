'use client';

import { useEffect } from 'react';
import { readConsent } from './ConsentBanner';

/**
 * Advertising measurement, loaded only after "Accept all" and only when an
 * id is configured. Also remembers where a visitor came from (utm_* or the
 * referrer) so sign-ups can be counted per ad.
 *
 * Ids come from NEXT_PUBLIC_META_PIXEL_ID, NEXT_PUBLIC_LINKEDIN_PARTNER_ID
 * and NEXT_PUBLIC_GOOGLE_ADS_ID; with none set this does nothing but the
 * source cookie.
 */
export default function Tracking() {
  useEffect(() => {
    rememberSource();
    const boot = () => {
      if (readConsent() !== 'all') return;
      loadMeta(process.env.NEXT_PUBLIC_META_PIXEL_ID);
      loadLinkedIn(process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID);
      loadGoogle(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID);
    };
    boot();
    window.addEventListener('dd-consent', boot);
    return () => window.removeEventListener('dd-consent', boot);
  }, []);
  return null;
}

const SOURCE_COOKIE = 'dd_source';

function rememberSource() {
  try {
    if (document.cookie.includes(`${SOURCE_COOKIE}=`)) return;
    const q = new URLSearchParams(window.location.search);
    const parts: string[] = [];
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
      const v = q.get(k);
      if (v) parts.push(`${k.slice(4)}=${v.slice(0, 60)}`);
    }
    if (parts.length === 0 && document.referrer) {
      try {
        const host = new URL(document.referrer).hostname;
        if (host && !host.endsWith('dockydoc.app')) parts.push(`ref=${host}`);
      } catch {
        /* ignore */
      }
    }
    if (parts.length === 0) return;
    const value = encodeURIComponent(parts.join('&')).slice(0, 400);
    document.cookie = `${SOURCE_COOKIE}=${value}; Max-Age=${60 * 60 * 24 * 90}; Path=/; SameSite=Lax; Secure`;
  } catch {
    /* ignore */
  }
}

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
    _linkedin_partner_id?: string;
    _linkedin_data_partner_ids?: string[];
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const loaded = new Set<string>();

function script(src: string, id: string) {
  if (loaded.has(id)) return;
  loaded.add(id);
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function loadMeta(id?: string) {
  if (!id || loaded.has('meta')) return;
  window.fbq = window.fbq || function (...args: unknown[]) {
    (window.fbq as unknown as { queue: unknown[] }).queue = (window.fbq as unknown as { queue?: unknown[] }).queue || [];
    (window.fbq as unknown as { queue: unknown[] }).queue.push(args);
  };
  script('https://connect.facebook.net/en_US/fbevents.js', 'meta');
  window.fbq('init', id);
  window.fbq('track', 'PageView');
}

function loadLinkedIn(id?: string) {
  if (!id || loaded.has('linkedin')) return;
  window._linkedin_partner_id = id;
  window._linkedin_data_partner_ids = window._linkedin_data_partner_ids || [];
  window._linkedin_data_partner_ids.push(id);
  script('https://snap.licdn.com/li.lms-analytics/insight.min.js', 'linkedin');
}

function loadGoogle(id?: string) {
  if (!id || loaded.has('google')) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function (...args: unknown[]) {
    window.dataLayer!.push(args);
  };
  script(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`, 'google');
  window.gtag('js', new Date());
  window.gtag('config', id);
}

/** Call after a sign-up completes so each platform can count it. */
export function trackSignup() {
  try {
    if (readConsent() !== 'all') return;
    window.fbq?.('track', 'CompleteRegistration');
    window.gtag?.('event', 'sign_up');
  } catch {
    /* ignore */
  }
}

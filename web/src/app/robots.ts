import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/', '/pricing', '/security', '/terms', '/privacy', '/refunds', '/acceptable-use'], disallow: ['/api/', '/dashboard', '/documents', '/settings', '/admin', '/share/', '/s/', '/join/'] }],
    sitemap: 'https://dockydoc.app/sitemap.xml',
  };
}

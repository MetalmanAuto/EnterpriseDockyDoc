import { Injectable } from '@nestjs/common';
import { DocumentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { assertWorkspaceMembership } from '../../common/helpers/workspace-access.helper';
import type { DevUserPayload } from '../../common/guards/dev-auth.guard';
import type { SearchQueryDto, SearchResultDto } from './dto/search.dto';

// Prisma include shape for search results
const SEARCH_INCLUDE = {
  folder: { select: { id: true, name: true } },
  owner: { select: { id: true, firstName: true, lastName: true, email: true } },
  tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
  searchContent: { select: { extractedText: true } },
  _count: { select: { versions: true } },
} as const;

/** Split a query into the words that must each match somewhere. */
function termsOf(q: string): string[] {
  const seen = new Set<string>();
  for (const raw of q.toLowerCase().split(/\s+/)) {
    const t = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (t) seen.add(t);
  }
  return [...seen];
}

/**
 * Build a short text snippet around the first match of any term in `text`,
 * preferring the longest term so the snippet lands on the most specific word.
 * Returns undefined if nothing matches.
 */
function buildSnippet(
  text: string | null | undefined,
  terms: string[],
  contextChars = 120,
): string | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();
  let idx = -1;
  let hit = '';
  for (const t of [...terms].sort((a, b) => b.length - a.length)) {
    const i = lower.indexOf(t);
    if (i !== -1) { idx = i; hit = t; break; }
  }
  if (idx === -1) return undefined;

  const start = Math.max(0, idx - Math.floor(contextChars / 2));
  const end = Math.min(text.length, idx + hit.length + Math.ceil(contextChars / 2));
  const raw = text.slice(start, end).replace(/\s+/g, ' ').trim();

  return (start > 0 ? '…' : '') + raw + (end < text.length ? '…' : '');
}

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(
    query: SearchQueryDto,
    user: DevUserPayload,
  ): Promise<SearchResultDto[]> {
    assertWorkspaceMembership(user, query.workspaceId);

    const q = query.q.trim();
    // Every word must match, but each may match a different field: "nishant
    // jairath gst" finds a document called "GST certificate" whose holder is
    // Nishant Jairath. One word, one substring, as before.
    const terms = termsOf(q);
    if (terms.length === 0) return [];
    const fieldsFor = (t: string) => [
      { name: { contains: t, mode: 'insensitive' as const } },
      { description: { contains: t, mode: 'insensitive' as const } },
      { fileName: { contains: t, mode: 'insensitive' as const } },
      { tags: { some: { tag: { name: { contains: t, mode: 'insensitive' as const } } } } },
      { metadata: { some: { value: { contains: t, mode: 'insensitive' as const } } } },
      { metadata: { some: { key: { contains: t, mode: 'insensitive' as const } } } },
      { searchContent: { extractedText: { contains: t, mode: 'insensitive' as const } } },
    ];

    const docs = await this.prisma.document.findMany({
      where: {
        workspaceId: query.workspaceId,
        status: query.status ?? { not: DocumentStatus.DELETED },
        ...(query.folderId && { folderId: query.folderId }),
        AND: terms.map((t) => ({ OR: fieldsFor(t) })),
      },
      include: { ...SEARCH_INCLUDE, metadata: { select: { key: true, value: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    // Rank: a word in the name or a tag outranks one in the extracted text,
    // and the document matching the most words in its own fields comes first.
    const score = (doc: (typeof docs)[number]) => {
      let s = 0;
      const name = `${doc.name} ${doc.fileName}`.toLowerCase();
      const tags = doc.tags.map((t) => t.tag.name.toLowerCase()).join(' ');
      const meta = doc.metadata.map((m) => `${m.key} ${m.value}`.toLowerCase()).join(' ');
      for (const t of terms) {
        if (name.includes(t)) s += 4;
        else if (tags.includes(t)) s += 3;
        else if (meta.includes(t)) s += 2;
        else s += 1;
      }
      return s;
    };
    docs.sort((a, b) => score(b) - score(a) || b.updatedAt.getTime() - a.updatedAt.getTime());

    return docs.map((doc) => {
      const snippet = buildSnippet(doc.searchContent?.extractedText, terms);

      return {
        id: doc.id,
        workspaceId: doc.workspaceId,
        name: doc.name,
        description: doc.description,
        fileName: doc.fileName,
        fileType: doc.fileType,
        status: doc.status,
        currentVersionNumber: doc.currentVersionNumber,
        folder: doc.folder,
        owner: doc.owner,
        tags: doc.tags.map((t) => t.tag),
        versionCount: doc._count.versions,
        snippet,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    });
  }
}

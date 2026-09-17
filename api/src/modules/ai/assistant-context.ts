/**
 * What the assistant gets to see about a workspace before it answers.
 *
 * Every document becomes a "card": name, labels, folder, the dates the app
 * tracks, the fields the AI extracted earlier, and (for the documents that
 * look relevant to the question) a slice of the scanned text. The dates come
 * with days-left already worked out, so the model quotes them instead of
 * doing calendar arithmetic.
 */

export interface DocumentCard {
  id: string;
  name: string;
  fileName: string;
  description: string | null;
  folder: string | null;
  labels: string[];
  documentType: string | null;
  issuer: string | null;
  summary: string | null;
  references: Record<string, string>;
  issueDate: string | null;
  expiryDate: string | null;
  renewalDueDate: string | null;
  /** Where the expiry came from: the document record, or only the AI's suggestion. */
  expirySource: 'recorded' | 'ai-suggested' | null;
  aiRead: boolean;
  text: string;
  updatedAt: Date;
}

export interface CardSource {
  id: string;
  name: string;
  fileName: string;
  description: string | null;
  expiryDate: Date | null;
  renewalDueDate: Date | null;
  updatedAt: Date;
  folder: { name: string } | null;
  tags: { tag: { name: string } }[];
  metadata: { key: string; value: string }[];
  searchContent: { extractedText: string } | null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function isoDay(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === 'string') return ISO_DATE.test(d) ? d.slice(0, 10) : null;
  return d.toISOString().slice(0, 10);
}

export function toCard(doc: CardSource): DocumentCard {
  const meta = new Map(doc.metadata.map((m) => [m.key, m.value]));
  const get = (k: string): string | null => {
    const v = meta.get(k)?.trim();
    return v ? v : null;
  };
  const references: Record<string, string> = {};
  for (const [label, key] of [
    ['contractNumber', 'ai:contractNumber'],
    ['policyNumber', 'ai:policyNumber'],
    ['certificateNumber', 'ai:certificateNumber'],
    ['referenceNumber', 'ai:referenceNumber'],
    ['counterparty', 'ai:counterparty'],
  ] as const) {
    const v = get(key);
    if (v) references[label] = v;
  }

  const recordedExpiry = isoDay(doc.expiryDate);
  const suggestedExpiry = isoDay(get('ai:expiryDate'));
  const expiryDate = recordedExpiry ?? suggestedExpiry;

  return {
    id: doc.id,
    name: doc.name,
    fileName: doc.fileName,
    description: doc.description,
    folder: doc.folder?.name ?? null,
    labels: doc.tags.map((t) => t.tag.name),
    documentType: get('ai:documentType'),
    issuer: get('ai:issuer'),
    summary: get('ai:summary'),
    references,
    issueDate: isoDay(get('ai:issueDate')),
    expiryDate,
    renewalDueDate: isoDay(doc.renewalDueDate) ?? isoDay(get('ai:renewalDueDate')),
    expirySource: recordedExpiry ? 'recorded' : suggestedExpiry ? 'ai-suggested' : null,
    aiRead: !!get('ai:extractedAt'),
    text: doc.searchContent?.extractedText?.trim() ?? '',
    updatedAt: doc.updatedAt,
  };
}

// ---- ranking: which documents does the question seem to be about? -------- //

const STOP = new Set([
  'my', 'me', 'the', 'a', 'an', 'of', 'is', 'are', 'was', 'when', 'what', 'which', 'where', 'who', 'how', 'does', 'do',
  'did', 'will', 'i', 'it', 'its', 'in', 'on', 'for', 'to', 'and', 'or', 'please', 'tell', 'show', 'find', 'give',
  'document', 'documents', 'file', 'files', 'expire', 'expiring', 'expires', 'expiry', 'date', 'due', 'renew', 'renewal',
]);

export function words(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** Word overlap between the question and each card; the fields people name score higher than body text. */
export function rank(question: string, cards: DocumentCard[]): { card: DocumentCard; score: number }[] {
  const q = words(question);
  if (q.length === 0) return cards.map((card) => ({ card, score: 0 }));
  return cards
    .map((card) => {
      const strong = new Set(
        words(
          [card.name, card.fileName, card.description ?? '', card.folder ?? '', ...card.labels, card.documentType ?? '', card.issuer ?? '', card.summary ?? '', ...Object.values(card.references)].join(' '),
        ),
      );
      const body = card.text ? card.text.toLowerCase() : '';
      let score = 0;
      for (const w of q) {
        if (strong.has(w)) score += 3;
        else if (body && body.includes(w)) score += 1;
      }
      return { card, score };
    })
    .sort((a, b) => b.score - a.score || b.card.updatedAt.getTime() - a.card.updatedAt.getTime());
}

// ---- rendering ------------------------------------------------------------ //

const DAY = 86_400_000;

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY);
}

function dateWithCountdown(iso: string, todayIso: string): string {
  const days = daysBetween(todayIso, iso);
  if (days === 0) return `${iso} (today)`;
  if (days < 0) return `${iso} (${-days} days ago, already passed)`;
  return `${iso} (in ${days} days)`;
}

/** One compact line per document, used for everything that is not a top match. */
export function shortLine(card: DocumentCard, todayIso: string): string {
  const parts = [`id=${card.id}`, `name=${JSON.stringify(card.name)}`];
  if (card.documentType) parts.push(`type=${card.documentType}`);
  if (card.issuer) parts.push(`issuer=${JSON.stringify(card.issuer)}`);
  if (card.labels.length) parts.push(`labels=${JSON.stringify(card.labels)}`);
  if (card.folder) parts.push(`folder=${JSON.stringify(card.folder)}`);
  if (card.expiryDate) parts.push(`expires=${dateWithCountdown(card.expiryDate, todayIso)}${card.expirySource === 'ai-suggested' ? ' [AI suggestion, not yet confirmed]' : ''}`);
  else parts.push('expires=not recorded');
  if (card.renewalDueDate) parts.push(`renewalDue=${dateWithCountdown(card.renewalDueDate, todayIso)}`);
  if (!card.aiRead && !card.text) parts.push('note=not yet read by AI');
  return `- ${parts.join(' | ')}`;
}

/** Everything known about one document, for the handful the question is about. */
export function fullCard(card: DocumentCard, todayIso: string, textLimit: number): string {
  const lines = [
    `### ${card.name}`,
    `id: ${card.id}`,
    `file: ${card.fileName}`,
  ];
  if (card.documentType) lines.push(`type: ${card.documentType}`);
  if (card.issuer) lines.push(`issuer: ${card.issuer}`);
  if (card.labels.length) lines.push(`labels: ${card.labels.join(', ')}`);
  if (card.folder) lines.push(`folder: ${card.folder}`);
  if (card.description) lines.push(`description: ${card.description}`);
  for (const [k, v] of Object.entries(card.references)) lines.push(`${k}: ${v}`);
  if (card.issueDate) lines.push(`issued: ${card.issueDate}`);
  lines.push(
    card.expiryDate
      ? `expires: ${dateWithCountdown(card.expiryDate, todayIso)}${card.expirySource === 'ai-suggested' ? ' (found by AI, not yet confirmed by the owner)' : ''}`
      : 'expires: no expiry date recorded',
  );
  if (card.renewalDueDate) lines.push(`renewal due: ${dateWithCountdown(card.renewalDueDate, todayIso)}`);
  if (card.summary) lines.push(`summary: ${card.summary}`);
  if (card.text) {
    const clipped = card.text.length > textLimit;
    lines.push(`scanned text${clipped ? ` (first ${textLimit} characters)` : ''}:`);
    lines.push(card.text.slice(0, textLimit));
  } else {
    lines.push(card.aiRead ? 'scanned text: none (the file had no readable text)' : 'scanned text: none (AI has not read this document yet)');
  }
  return lines.join('\n');
}

// ---- no-API-key answer ---------------------------------------------------- //

/**
 * With no AI key configured, still answer date questions from the records:
 * list the best-matching documents and what the app knows about them.
 */
export function plainAnswer(question: string, cards: DocumentCard[], todayIso: string): { answer: string; relevantIds: string[] } {
  const matches = rank(question, cards).filter((r) => r.score > 0).slice(0, 5);
  if (matches.length === 0) {
    return {
      answer: cards.length === 0
        ? 'There are no documents in this workspace yet.'
        : 'No document in this workspace matches that question. Try naming the document the way it appears in your list.',
      relevantIds: [],
    };
  }
  const lines = matches.map(({ card }) => {
    const bits = [card.name];
    if (card.expiryDate) bits.push(`expires ${dateWithCountdown(card.expiryDate, todayIso)}`);
    else bits.push('no expiry date recorded');
    if (card.renewalDueDate) bits.push(`renewal due ${dateWithCountdown(card.renewalDueDate, todayIso)}`);
    return `${bits.join(', ')}.`;
  });
  return {
    answer: `AI answers are switched off on this server, so here is what the records say.\n${lines.join('\n')}`,
    relevantIds: matches.map((m) => m.card.id),
  };
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

/** A document as the resolver sees it: enough to tell "passport" from "visa". */
export interface Candidate {
  id: string;
  name: string;
  fileName: string;
  labels: string[];
  description: string | null;
  metadata: { key: string; value: string }[];
  /** First few hundred characters of extracted text, when indexed. */
  excerpt: string | null;
  workspaceName: string;
}

export interface ResolvedAsk {
  ask: string;
  bestId: string | null;
  confidence: number;
  alternativeIds: string[];
}

export interface Resolution {
  asks: ResolvedAsk[];
  mode: 'ai' | 'lexical';
}

const Resolved = z.object({
  asks: z
    .array(
      z.object({
        ask: z.string().describe('One document the person asked for, in a few words'),
        bestId: z.string().nullable().describe('The id of the single best candidate, or null if none fits'),
        confidence: z.number().min(0).max(1).describe('How sure you are that bestId is what they meant'),
        alternativeIds: z.array(z.string()).describe('Other candidates that could plausibly be it, best first, up to 3'),
      }),
    )
    .describe('One entry per distinct document asked for, in the order asked'),
});

const SYSTEM = `You match a person's request to documents they have stored.

The request may name more than one document ("my passport and UK visa" is two asks).
Split it into one ask per document. For each ask pick the single candidate that
best fits, using the candidate's name, file name, labels, description, metadata
and excerpt. A passport is not a visa; a UK visa is not a US visa; an expired
version and a current version are different documents, prefer the current one
unless asked otherwise.

Confidence: 0.9 or more when only one candidate fits; around 0.6 when one fits
best but another could be meant; below 0.5 when you are guessing. Set bestId to
null when nothing fits at all. Never invent an id.`;

/**
 * Turns "provide me my passport and UK visa" into the documents meant.
 * Uses Claude when an API key is configured, and a plain word-overlap score
 * otherwise, so the feature works on a fresh install too.
 */
@Injectable()
export class ResolverService {
  private readonly logger = new Logger(ResolverService.name);
  private readonly client: Anthropic | null;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
  }

  async resolve(query: string, candidates: Candidate[]): Promise<Resolution> {
    if (candidates.length === 0) {
      return { asks: splitAsks(query).map((ask) => ({ ask, bestId: null, confidence: 0, alternativeIds: [] })), mode: this.client ? 'ai' : 'lexical' };
    }
    if (!this.client) return { asks: lexical(query, candidates), mode: 'lexical' };

    try {
      const response = await this.client.messages.parse({
        model: 'claude-opus-5',
        max_tokens: 4096,
        // Ranking a few dozen names is not deep reasoning; low effort keeps it quick.
        output_config: { effort: 'low', format: zodOutputFormat(Resolved) },
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: `Request: ${JSON.stringify(query)}\n\nCandidates:\n${candidates.map(describe).join('\n')}`,
          },
        ],
      });

      if (response.stop_reason === 'refusal' || !response.parsed_output) {
        this.logger.warn(`Resolver got no structured answer (stop_reason=${response.stop_reason}); using lexical match`);
        return { asks: lexical(query, candidates), mode: 'lexical' };
      }

      const known = new Set(candidates.map((c) => c.id));
      const asks = response.parsed_output.asks.map((a) => ({
        ask: a.ask,
        bestId: a.bestId && known.has(a.bestId) ? a.bestId : null,
        confidence: a.bestId && known.has(a.bestId) ? a.confidence : 0,
        alternativeIds: a.alternativeIds.filter((id) => known.has(id) && id !== a.bestId).slice(0, 3),
      }));
      return { asks: asks.length ? asks : lexical(query, candidates), mode: 'ai' };
    } catch (err) {
      // The API being down must not make "get my passport" fail outright.
      this.logger.error(`Resolver call failed: ${err instanceof Error ? err.message : String(err)}`);
      return { asks: lexical(query, candidates), mode: 'lexical' };
    }
  }
}

function describe(c: Candidate): string {
  const parts = [
    `id=${c.id}`,
    `name=${JSON.stringify(c.name)}`,
    `file=${JSON.stringify(c.fileName)}`,
    `workspace=${JSON.stringify(c.workspaceName)}`,
  ];
  if (c.labels.length) parts.push(`labels=${JSON.stringify(c.labels)}`);
  if (c.description) parts.push(`description=${JSON.stringify(c.description.slice(0, 200))}`);
  if (c.metadata.length) parts.push(`metadata=${JSON.stringify(Object.fromEntries(c.metadata.map((m) => [m.key, m.value])))}`);
  if (c.excerpt) parts.push(`excerpt=${JSON.stringify(c.excerpt.slice(0, 300))}`);
  return `- ${parts.join(' ')}`;
}

// ---- lexical fallback ---------------------------------------------------- //

const STOP = new Set(['my', 'me', 'the', 'a', 'an', 'of', 'please', 'provide', 'send', 'get', 'give', 'fetch', 'share', 'with', 'for', 'to', 'i', 'want', 'need', 'copy', 'document', 'documents', 'file', 'files']);

function words(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && !STOP.has(w));
}

/** "passport and UK visa" → ["passport", "UK visa"]. */
export function splitAsks(query: string): string[] {
  return query
    .split(/\s*(?:,|;|&|\band\b|\bplus\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function lexical(query: string, candidates: Candidate[]): ResolvedAsk[] {
  return splitAsks(query).map((ask) => {
    const askWords = words(ask);
    const scored = candidates
      .map((c) => {
        const hay = new Set(words([c.name, c.fileName, ...c.labels, c.description ?? '', ...c.metadata.map((m) => `${m.key} ${m.value}`)].join(' ')));
        const hits = askWords.filter((w) => hay.has(w)).length;
        return { c, score: askWords.length ? hits / askWords.length : 0 };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
    const [best, ...rest] = scored;
    const tie = rest.length && rest[0].score === best?.score;
    return {
      ask,
      bestId: best?.c.id ?? null,
      // A tie between candidates means we cannot really tell; say so.
      confidence: best ? (tie ? Math.min(best.score, 0.5) : best.score) : 0,
      alternativeIds: rest.slice(0, 3).map((s) => s.c.id),
    };
  });
}

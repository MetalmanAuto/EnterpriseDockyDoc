'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/context/UserContext';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import {
  aiFieldLabel,
  applyAiFields,
  askAi,
  confidenceLabel,
  fetchAiOverview,
  fetchOcrStatus,
  runAiBatch,
  type AiOcrStatus,
  type AiPendingSuggestion,
  type AiSearchAnswer,
  type AiWorkspaceOverview,
} from '@/lib/ai';

// How often to re-check the overview while extractions are running.
const POLL_MS = 5000;
// Documents per batch run. The backend caps this at 25.
const BATCH_SIZE = 10;

const EXAMPLE_QUESTIONS = [
  'Which contracts expire this quarter?',
  'Do any of our insurance policies have an auto-renewal clause?',
  'Which supplier agreements mention a penalty for late delivery?',
  'What is the notice period in our longest-running lease?',
];

interface Conversation {
  question: string;
  answer: AiSearchAnswer | null;
  error: string | null;
}

export default function AssistantPage() {
  const { activeWorkspace, isLoading: userLoading } = useUser();
  const toast = useToast();

  const [overview, setOverview] = useState<AiWorkspaceOverview | null>(null);
  const [ocr, setOcr] = useState<AiOcrStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [conversation, setConversation] = useState<Conversation[]>([]);

  const [batching, setBatching] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const workspaceId = activeWorkspace?.workspaceId ?? null;
  const canRunAi = activeWorkspace ? activeWorkspace.role !== 'VIEWER' : false;

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const loadOverview = useCallback(
    async (showSpinner: boolean) => {
      if (!workspaceId) return;
      if (showSpinner) setLoading(true);
      try {
        const data = await fetchAiOverview(workspaceId);
        setOverview(data);
        setLoadError(null);
        if (data.running === 0) stopPolling();
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Could not load AI status.');
        stopPolling();
      } finally {
        if (showSpinner) setLoading(false);
      }
    },
    [workspaceId, stopPolling],
  );

  // Initial load + reload when the workspace changes
  useEffect(() => {
    if (!workspaceId) return;
    setConversation([]);
    void loadOverview(true);
    fetchOcrStatus().then(setOcr).catch(() => setOcr(null));
    return stopPolling;
  }, [workspaceId, loadOverview, stopPolling]);

  // Keep refreshing while the backend is still working through a batch
  useEffect(() => {
    if (!overview || overview.running === 0 || pollRef.current !== null) return;
    pollRef.current = setInterval(() => void loadOverview(false), POLL_MS);
    return stopPolling;
  }, [overview, loadOverview, stopPolling]);

  async function handleAsk(text?: string) {
    const q = (text ?? question).trim();
    if (!q || !workspaceId || asking) return;
    setAsking(true);
    setQuestion('');
    setConversation((prev) => [{ question: q, answer: null, error: null }, ...prev]);
    try {
      const answer = await askAi(workspaceId, q);
      setConversation((prev) =>
        prev.map((c, i) => (i === 0 ? { ...c, answer } : c)),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'The assistant could not answer that.';
      setConversation((prev) => prev.map((c, i) => (i === 0 ? { ...c, error: message } : c)));
    } finally {
      setAsking(false);
    }
  }

  async function handleBatch(includeFailed: boolean) {
    if (!workspaceId || batching) return;
    setBatching(true);
    try {
      const result = await runAiBatch(workspaceId, { limit: BATCH_SIZE, includeFailed });
      if (result.queued === 0) {
        toast.info('Nothing left to analyse.');
      } else {
        toast.success(
          `Analysing ${result.queued} document${result.queued === 1 ? '' : 's'}. This page updates as each one finishes.`,
        );
        await loadOverview(false);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not start the analysis.');
    } finally {
      setBatching(false);
    }
  }

  async function handleApply(suggestion: AiPendingSuggestion) {
    if (applyingId) return;
    setApplyingId(suggestion.documentId);
    try {
      const result = await applyAiFields(suggestion.documentId, suggestion.fields);
      if (result.applied.length === 0) {
        toast.error('Nothing could be applied to that document.');
      } else {
        toast.success(
          `Applied ${result.applied.map(aiFieldLabel).join(', ').toLowerCase()} to ${suggestion.documentName}.`,
        );
      }
      await loadOverview(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not apply the suggestion.');
    } finally {
      setApplyingId(null);
    }
  }

  if (userLoading) return <AssistantSkeleton />;

  if (!activeWorkspace) {
    return (
      <div className="py-24 text-center">
        <h1 className="page-title">Assistant</h1>
        <p className="page-subtitle">Pick a workspace to use the document assistant.</p>
      </div>
    );
  }

  const analysed = overview?.analyzed ?? 0;
  const total = overview?.totalDocuments ?? 0;
  const coverage = total > 0 ? Math.round((analysed / total) * 100) : 0;
  const aiOff = overview !== null && !overview.enabled;

  return (
    <div className="max-w-5xl space-y-6">

      {/* ── Header ───────────────────────────────────────────────── */}
      <div>
        <h1 className="page-title">Assistant</h1>
        <p className="page-subtitle">
          {activeWorkspace.workspaceName} &middot; ask questions about your documents and let AI fill in the details it finds.
        </p>
      </div>

      {aiOff && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-semibold text-amber-900">AI is switched off</p>
          <p className="mt-1 text-xs text-amber-800 leading-relaxed">
            No AI provider key is configured on the server, so nothing here can run.
            Set <code className="font-mono">ANTHROPIC_API_KEY</code> (or <code className="font-mono">OPENAI_API_KEY</code>)
            in the API service environment and restart it.
          </p>
        </div>
      )}

      {!aiOff && overview !== null && !overview.ocrAvailable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <p className="text-sm font-semibold text-amber-900">Scanned documents cannot be read</p>
          <p className="mt-1 text-xs text-amber-800 leading-relaxed">
            {ocr?.recommendation ??
              'No OCR provider is configured, so scans and photos will come back empty. Text-based PDFs still work.'}
          </p>
        </div>
      )}

      {/* ── Ask box ──────────────────────────────────────────────── */}
      <section className="card-base p-5">
        <h2 className="text-sm font-bold text-ink">Ask your documents</h2>
        <p className="mt-1 text-xs text-ink-3">
          Answers come from the text inside your uploaded files, not from the web.
        </p>

        <div className="mt-4 flex items-center gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAsk(); }}
            placeholder="e.g. Which contracts expire this quarter?"
            disabled={asking || aiOff}
            className="flex-1 h-10 rounded-lg border border-stroke bg-surface px-3 text-sm text-ink placeholder:text-ink-3"
          />
          <button
            type="button"
            onClick={() => void handleAsk()}
            disabled={asking || aiOff || !question.trim()}
            className="btn-primary"
          >
            {asking ? 'Thinking…' : 'Ask'}
          </button>
        </div>

        {conversation.length === 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => void handleAsk(q)}
                disabled={asking || aiOff}
                className="rounded-full border border-stroke bg-surface-high px-3 py-1.5 text-xs text-ink-2 hover:text-ink hover:border-brand-300 disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        {conversation.length > 0 && (
          <div className="mt-5 space-y-4">
            {conversation.map((c, i) => (
              <div key={`${i}-${c.question}`} className="rounded-lg border border-stroke-soft bg-surface-high p-4">
                <p className="text-xs font-semibold text-ink-2">{c.question}</p>
                {c.error ? (
                  <p className="mt-2 text-xs text-red-600">{c.error}</p>
                ) : c.answer === null ? (
                  <p className="mt-2 text-xs text-ink-3">Reading your documents…</p>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-ink leading-relaxed whitespace-pre-wrap">{c.answer.answer}</p>
                    {c.answer.relevantDocuments.length > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="label-mono">From</span>
                        {c.answer.relevantDocuments.map((d) => (
                          <Link
                            key={d.id}
                            href={`/documents/${d.id}`}
                            className="rounded-md border border-stroke bg-surface px-2 py-1 text-[11px] text-ink-2 hover:text-brand-600 hover:border-brand-300 max-w-[220px] truncate"
                          >
                            {d.name}
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Coverage ─────────────────────────────────────────────── */}
      <section className="card-base p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-ink">Reading coverage</h2>
            <p className="mt-1 text-xs text-ink-3">
              {loading
                ? 'Checking…'
                : total === 0
                  ? 'No documents in this workspace yet.'
                  : `${analysed} of ${total} documents have been read by AI.`}
            </p>
          </div>
          {canRunAi && !aiOff && (overview?.notAnalyzed ?? 0) > 0 && (
            <button type="button" onClick={() => void handleBatch(false)} disabled={batching} className="btn-primary">
              {batching
                ? 'Starting…'
                : `Analyse ${Math.min(overview?.notAnalyzed ?? 0, BATCH_SIZE)} more`}
            </button>
          )}
        </div>

        {loadError && <p className="mt-3 text-xs text-red-600">{loadError}</p>}

        <div className="mt-4 h-2 w-full rounded-full bg-surface-high overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-500 transition-[width] duration-500"
            style={{ width: `${coverage}%` }}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <CoverageStat label="Read" value={analysed} />
          <CoverageStat label="Not read" value={overview?.notAnalyzed ?? 0} />
          <CoverageStat label="In progress" value={overview?.running ?? 0} pulse={(overview?.running ?? 0) > 0} />
          <CoverageStat label="Failed" value={overview?.failed ?? 0} tone={(overview?.failed ?? 0) > 0 ? 'red' : 'plain'} />
        </div>

        {canRunAi && !aiOff && (overview?.failed ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => void handleBatch(true)}
            disabled={batching}
            className="mt-3 text-xs font-semibold text-brand-600 hover:underline disabled:opacity-50"
          >
            Retry the {overview?.failed} that failed
          </button>
        )}

        {(overview?.running ?? 0) > 0 && (
          <p className="mt-3 text-xs text-ink-3">
            Reading {overview?.running} document{overview?.running === 1 ? '' : 's'} now. This updates on its own.
          </p>
        )}
      </section>

      {/* ── Suggestions waiting ──────────────────────────────────── */}
      <section className="card-base">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-stroke-soft">
          <h2 className="text-sm font-bold text-ink">Suggestions waiting for you</h2>
          {(overview?.pendingSuggestionCount ?? 0) > (overview?.pendingSuggestions.length ?? 0) && (
            <span className="text-xs text-ink-3">
              showing {overview?.pendingSuggestions.length} of {overview?.pendingSuggestionCount}
            </span>
          )}
        </div>

        {(overview?.pendingSuggestions.length ?? 0) === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-3">
            {analysed === 0
              ? 'Nothing yet. Analyse some documents and the AI will suggest expiry dates, tags and folders here.'
              : 'Nothing waiting. Every suggestion has been applied or dismissed.'}
          </p>
        ) : (
          <div className="divide-y divide-stroke-soft">
            {overview?.pendingSuggestions.map((s) => (
              <div key={s.documentId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <div className="flex-1 min-w-[12rem]">
                  <Link
                    href={`/documents/${s.documentId}`}
                    className="text-sm font-medium text-ink hover:text-brand-600 truncate block"
                  >
                    {s.documentName}
                  </Link>
                  <p className="mt-0.5 text-xs text-ink-3">
                    {s.fields.map(aiFieldLabel).join(', ')}
                    {s.expiryDate && s.fields.includes('expiryDate') && ` · expires ${s.expiryDate}`}
                  </p>
                </div>
                <span className="text-[10px] font-semibold text-ink-3 whitespace-nowrap">
                  {confidenceLabel(s.confidence)} confidence
                </span>
                {canRunAi && (
                  <button
                    type="button"
                    onClick={() => void handleApply(s)}
                    disabled={applyingId !== null}
                    className="btn-ghost px-3 py-1.5 text-xs"
                  >
                    {applyingId === s.documentId ? 'Applying…' : 'Apply'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Risk flags ───────────────────────────────────────────── */}
      <section className="card-base">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-stroke-soft">
          <h2 className="text-sm font-bold text-ink">Risk flags</h2>
          {(overview?.riskFlagCount ?? 0) > (overview?.riskFlags.length ?? 0) && (
            <span className="text-xs text-ink-3">
              showing {overview?.riskFlags.length} of {overview?.riskFlagCount}
            </span>
          )}
        </div>

        {(overview?.riskFlags.length ?? 0) === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-3">
            No risk flags found in the documents read so far.
          </p>
        ) : (
          <div className="divide-y divide-stroke-soft">
            {overview?.riskFlags.map((r) => (
              <div key={r.documentId} className="px-5 py-3">
                <Link
                  href={`/documents/${r.documentId}`}
                  className="text-sm font-medium text-ink hover:text-brand-600 truncate block"
                >
                  {r.documentName}
                </Link>
                <ul className="mt-1.5 space-y-1">
                  {r.flags.map((flag, i) => (
                    <li key={i} className="flex gap-2 text-xs text-ink-2">
                      <span aria-hidden className="mt-1.5 w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                      <span>{flag}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ //
// Pieces
// ------------------------------------------------------------------ //

function CoverageStat({
  label,
  value,
  tone = 'plain',
  pulse = false,
}: {
  label: string;
  value: number;
  tone?: 'plain' | 'red';
  pulse?: boolean;
}) {
  return (
    <div className="rounded-lg border border-stroke bg-surface-high px-3.5 py-3">
      <p className="label-mono">{label}</p>
      <p
        className={cn(
          'mt-1.5 text-2xl font-extrabold leading-none tabular-nums',
          tone === 'red' ? 'text-red-600' : 'text-ink',
          pulse && 'animate-pulse',
        )}
      >
        {value}
      </p>
    </div>
  );
}

function AssistantSkeleton() {
  return (
    <div className="max-w-5xl space-y-6 animate-pulse">
      <div>
        <div className="h-6 w-40 rounded bg-surface-high" />
        <div className="mt-2 h-3 w-72 rounded bg-surface-high" />
      </div>
      <div className="card-base h-48" />
      <div className="card-base h-40" />
      <div className="card-base h-40" />
    </div>
  );
}

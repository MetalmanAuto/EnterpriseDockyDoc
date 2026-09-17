import { apiFetch } from './api';

export interface ApiKey {
  id: string;
  name: string;
  /** First characters of the key, to tell keys apart in a list. */
  prefix: string;
  canWrite: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/** Returned once, at creation. The `key` is never available again. */
export interface CreatedApiKey extends ApiKey {
  key: string;
}

export function fetchApiKeys(): Promise<ApiKey[]> {
  return apiFetch<ApiKey[]>('/api/v1/api-keys');
}

export function createApiKey(input: { name: string; canWrite: boolean }): Promise<CreatedApiKey> {
  return apiFetch<CreatedApiKey>('/api/v1/api-keys', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function revokeApiKey(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/api-keys/${id}`, { method: 'DELETE' });
}

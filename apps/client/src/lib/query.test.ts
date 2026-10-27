import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

import {
  clientQueryKeys,
  createClientQueryClient,
  fetchApiQuery,
  fetchQueryWithCache,
  queryFreshness,
} from './query';

afterEach(() => vi.restoreAllMocks());

describe('client query foundation', () => {
  it('scopes stable keys without exposing an authorization token', () => {
    const key = clientQueryKeys.resource('session-2', 'sessions', 'page-1');

    expect(key).toEqual(['client', 'session-2', 'sessions', 'page-1']);
    expect(JSON.stringify(key)).not.toContain('Bearer');
    expect(queryFreshness.operational).toBeGreaterThanOrEqual(30_000);
    expect(queryFreshness.operational).toBeLessThanOrEqual(60_000);
    expect(queryFreshness.profile).toBe(300_000);
  });

  it('deduplicates concurrent reads and forwards AbortSignal', async () => {
    let resolveResponse!: (value: Response) => void;
    const response = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(response);
    const queryClient = createClientQueryClient();
    const queryKey = clientQueryKeys.resource('session-1', 'me');
    const queryFn = (context: Parameters<typeof fetchApiQuery>[1]) =>
      fetchApiQuery<{ data: { userId: string } }>({ path: '/api/v1/me', token: 'token' }, context);

    const first = queryClient.fetchQuery({ queryKey, queryFn });
    const second = queryClient.fetchQuery({ queryKey, queryFn });
    resolveResponse(new Response(JSON.stringify({ data: { userId: 'u-1' } }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }));

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('keeps cached read data when a background refresh fails', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryKey = clientQueryKeys.resource('session-1', 'community');
    queryClient.setQueryData(queryKey, { data: { name: 'Pilot' } });
    await queryClient.invalidateQueries({ queryKey });

    const result = await fetchQueryWithCache(queryClient, {
      queryKey,
      queryFn: async () => { throw new Error('offline'); },
      staleTime: queryFreshness.profile,
    });

    expect(result).toEqual({ data: { data: { name: 'Pilot' } }, usedStaleFallback: true });
  });

  it('serves a warm screen from fresh cache without a second request', async () => {
    const queryClient = createClientQueryClient();
    const queryKey = clientQueryKeys.resource('session-1', 'profile');
    const queryFn = vi.fn(async () => ({ data: { displayName: 'Марина' } }));

    const cold = await fetchQueryWithCache(queryClient, {
      queryKey,
      queryFn,
      staleTime: queryFreshness.profile,
    });
    const warm = await fetchQueryWithCache(queryClient, {
      queryKey,
      queryFn,
      staleTime: queryFreshness.profile,
    });

    expect(cold.data).toEqual(warm.data);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('reconnects after an offline stale fallback and replaces cached data', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const queryKey = clientQueryKeys.resource('session-1', 'sessions');
    queryClient.setQueryData(queryKey, { data: ['cached'] });
    await queryClient.invalidateQueries({ queryKey });

    const offline = await fetchQueryWithCache(queryClient, {
      queryKey,
      queryFn: async () => { throw new Error('offline'); },
      staleTime: queryFreshness.operational,
    });
    const online = await fetchQueryWithCache(queryClient, {
      queryKey,
      queryFn: async () => ({ data: ['fresh'] }),
      staleTime: queryFreshness.operational,
    });

    expect(offline.usedStaleFallback).toBe(true);
    expect(online).toEqual({ data: { data: ['fresh'] }, usedStaleFallback: false });
  });

  it('does not retry mutations implicitly', () => {
    const queryClient = createClientQueryClient();
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false);
  });
});

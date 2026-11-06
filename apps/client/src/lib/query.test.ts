import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

import { getLocalSessionScope, localTokenForSession, rotateLocalToken, setLocalToken } from './api';
import {
  clientQueryKeys,
  createClientQueryClient,
  fetchApiQuery,
  fetchQueryWithCache,
  readChatQuery,
  settleSecondaryQuery,
  staleDataWarning,
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
    expect(staleDataWarning).toContain('действия не ставятся в очередь');
  });

  it('contains a secondary endpoint failure without rejecting the primary screen', async () => {
    await expect(settleSecondaryQuery(Promise.reject(new Error('secondary unavailable'))))
      .resolves.toEqual({ data: null, failed: true });
    await expect(settleSecondaryQuery(Promise.resolve({ data: ['primary remains'] })))
      .resolves.toEqual({ data: { data: ['primary remains'] }, failed: false });
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

describe('viewer-scoped chat reads', () => {
  const chatId = 'shared-chat';
  const path = '/api/v1/chats/shared-chat/challenge';
  const json = (data: unknown) => new Response(JSON.stringify(data));

  it('loads B in the same chat and rejects A’s late response, even with A’s cache populated', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let resolveA!: (response: Response) => void;
    const delayedA = new Promise<Response>((resolve) => { resolveA = resolve; });
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ viewerRole: 'INITIATOR' }))
      .mockReturnValueOnce(delayedA)
      .mockResolvedValueOnce(json({ viewerRole: 'RECIPIENT' }));

    setLocalToken('fake-account-a', false);
    const scopeA = getLocalSessionScope();
    await expect(readChatQuery(queryClient, scopeA, chatId, 'challenge', path))
      .resolves.toEqual({ viewerRole: 'INITIATOR' });
    const pendingA = readChatQuery(queryClient, scopeA, chatId, 'challenge', path);
    const rejectedA = expect(pendingA).rejects.toThrow('Аккаунт изменился');

    setLocalToken('fake-account-b', false);
    const scopeB = getLocalSessionScope();
    await expect(readChatQuery(queryClient, scopeB, chatId, 'challenge', path))
      .resolves.toEqual({ viewerRole: 'RECIPIENT' });
    resolveA(json({ viewerRole: 'INITIATOR', late: true }));
    await rejectedA;

    expect(fetchSpy.mock.calls.map(([, options]) =>
      new Headers(options?.headers).get('Authorization'),
    )).toEqual(['Bearer fake-account-a', 'Bearer fake-account-a', 'Bearer fake-account-b']);
    expect(queryClient.getQueryData(clientQueryKeys.resource(scopeB, 'chat', chatId, 'challenge')))
      .toEqual({ viewerRole: 'RECIPIENT' });
    expect(queryClient.getQueryData(clientQueryKeys.resource(scopeA, 'chat', chatId, 'challenge')))
      .toEqual({ viewerRole: 'INITIATOR' });
    expect(JSON.stringify(queryClient.getQueryCache().getAll().map((entry) => entry.queryKey)))
      .not.toContain('fake-account');
    expect(() => localTokenForSession(scopeA)).toThrow('Аккаунт изменился');
    expect(rotateLocalToken(scopeA, 'old-refresh')).toBe(false);
    expect(rotateLocalToken(scopeB, 'current-refresh')).toBe(true);
    expect(getLocalSessionScope()).toBe(scopeB);
    expect(localTokenForSession(scopeB)).toBe('current-refresh');
  });

  it('fetches current messages and training options on reopen and rejects a denied cached chat read', async () => {
    setLocalToken('fake-current-viewer', false);
    const scope = getLocalSessionScope();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ data: [] }))
      .mockResolvedValueOnce(json({ booking: null }))
      .mockResolvedValueOnce(json({ data: ['new message'] }))
      .mockResolvedValueOnce(json({ booking: 'selected by partner' }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'PERMISSION_DENIED' }), { status: 403 }));
    const messages = () => readChatQuery(queryClient, scope, chatId, 'messages', path.replace('challenge', 'messages'));
    const training = () => readChatQuery(queryClient, scope, chatId, 'training-options', path.replace('challenge', 'training-options'));

    await expect(messages()).resolves.toEqual({ data: [] });
    await expect(training()).resolves.toEqual({ booking: null });
    await expect(messages()).resolves.toEqual({ data: ['new message'] });
    await expect(training()).resolves.toEqual({ booking: 'selected by partner' });
    await expect(messages()).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(5);
    expect(fetchSpy.mock.calls.every(([, options]) => options?.method === undefined)).toBe(true);
  });
});

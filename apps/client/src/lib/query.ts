import {
  QueryClient,
  type QueryKey,
  type QueryFunctionContext,
} from '@tanstack/react-query';

import { apiErrorMessage, requireApiUrl } from './api';

export const queryFreshness = {
  operational: 45_000,
  profile: 5 * 60_000,
  reference: Number.POSITIVE_INFINITY,
} as const;

export const queryGarbageCollectionTime = 30 * 60_000;
export const staleDataWarning =
  'Нет связи с сервером. Показаны последние доступные данные; действия не ставятся в очередь.';
export const partialDataWarning =
  'Основные данные загружены. Некоторые разделы временно недоступны — обновите экран позже.';

export const clientQueryKeys = {
  all: ['client'] as const,
  session: (scope: string) => ['client', scope] as const,
  resource: (scope: string, resource: string, ...parameters: readonly unknown[]) =>
    ['client', scope, resource, ...parameters] as const,
};

export function createClientQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: queryGarbageCollectionTime,
        refetchOnReconnect: true,
        refetchOnWindowFocus: false,
        retry: 1,
        staleTime: queryFreshness.operational,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

interface ApiQueryOptions {
  readonly path: string;
  readonly token: string;
  readonly allowNotFound?: boolean;
  readonly emptyStatuses?: readonly number[];
}

export async function fetchApiQuery<T>(
  options: ApiQueryOptions,
  context: Pick<QueryFunctionContext<QueryKey>, 'signal'>,
): Promise<T | null> {
  const response = await fetch(`${requireApiUrl()}${options.path}`, {
    headers: { Authorization: `Bearer ${options.token}` },
    signal: context.signal,
  });
  if ((options.allowNotFound && response.status === 404)
    || options.emptyStatuses?.includes(response.status)) return null;
  if (!response.ok) throw new Error(await apiErrorMessage(response));
  return (await response.json()) as T;
}

interface CachedQueryOptions<T> {
  readonly queryKey: QueryKey;
  readonly queryFn: (context: QueryFunctionContext<QueryKey>) => Promise<T>;
  readonly staleTime: number;
}

export interface CachedQueryResult<T> {
  readonly data: T;
  readonly usedStaleFallback: boolean;
}

export interface SecondaryQueryResult<T> {
  readonly data: T | null;
  readonly failed: boolean;
}

export async function settleSecondaryQuery<T>(task: Promise<T | null>): Promise<SecondaryQueryResult<T>> {
  try {
    return { data: await task, failed: false };
  } catch {
    return { data: null, failed: true };
  }
}

/**
 * Keeps the last successful projection visible when a refresh cannot reach the API.
 * This is read-only resilience: commands are never queued or replayed here.
 */
export async function fetchQueryWithCache<T>(
  queryClient: QueryClient,
  options: CachedQueryOptions<T>,
): Promise<CachedQueryResult<T>> {
  const cached = queryClient.getQueryData<T>(options.queryKey);
  try {
    const data = await queryClient.fetchQuery(options);
    return { data, usedStaleFallback: false };
  } catch (error) {
    if (cached !== undefined) return { data: cached, usedStaleFallback: true };
    throw error;
  }
}

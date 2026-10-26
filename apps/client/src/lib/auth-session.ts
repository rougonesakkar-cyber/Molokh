import type {
  AuthSessionResponse,
  AuthSessionTokens,
  RequestAuthOtpResponse,
  VerifyAuthOtpResponse,
} from '@molokh/contracts';
import { Platform } from 'react-native';

import { apiErrorMessage, apiUrl } from './api';

const nativeRefreshTokenKey = 'molokh.auth.refresh-token';

function clientKind(): 'WEB' | 'NATIVE' {
  return Platform.OS === 'web' ? 'WEB' : 'NATIVE';
}

function operationKey(prefix: string): string {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

async function readNativeRefreshToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const secureStore = await import('expo-secure-store');
  return secureStore.getItemAsync(nativeRefreshTokenKey);
}

async function writeNativeRefreshToken(token: string | null): Promise<void> {
  if (Platform.OS === 'web') return;
  const secureStore = await import('expo-secure-store');
  if (token) await secureStore.setItemAsync(nativeRefreshTokenKey, token);
  else await secureStore.deleteItemAsync(nativeRefreshTokenKey);
}

export async function requestAuthOtp(phoneE164: string): Promise<RequestAuthOtpResponse> {
  const localDevelopment = __DEV__;
  const response = await fetch(`${apiUrl}/api/v1/auth/otp/request`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json',
      'Idempotency-Key': operationKey('auth-otp-request') },
    body: JSON.stringify({ phoneE164,
      transport: localDevelopment ? 'LOCAL_DEVELOPMENT' : 'SMS_OPT_IN',
      smsOptIn: !localDevelopment }),
  });
  if (!response.ok) throw new Error(await apiErrorMessage(response));
  return response.json() as Promise<RequestAuthOtpResponse>;
}

export async function verifyAuthOtp(input: {
  readonly challengeId: string;
  readonly challengeVersion: number;
  readonly code: string;
  readonly deviceLabel: string;
}): Promise<AuthSessionTokens> {
  const response = await fetch(`${apiUrl}/api/v1/auth/otp/verify`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json',
      'Idempotency-Key': operationKey('auth-otp-verify') },
    body: JSON.stringify({ ...input, clientKind: clientKind() }),
  });
  if (!response.ok) throw new Error(await apiErrorMessage(response));
  const result = await response.json() as VerifyAuthOtpResponse;
  if (result.data.outcome !== 'VERIFIED' || result.data.session === null) {
    throw new Error(result.data.outcome === 'INVALID_CODE'
      ? 'Неверный код. Проверьте шесть цифр и попробуйте снова.'
      : 'Код больше недействителен. Запросите новый код.');
  }
  await writeNativeRefreshToken(result.data.session.refreshToken);
  return result.data.session;
}

export async function refreshManagedAuthSession(): Promise<AuthSessionTokens | null> {
  const kind = clientKind();
  const refreshToken = kind === 'NATIVE' ? await readNativeRefreshToken() : null;
  if (kind === 'NATIVE' && !refreshToken) return null;
  const response = await fetch(`${apiUrl}/api/v1/auth/refresh`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json',
      'Idempotency-Key': operationKey('auth-refresh') },
    body: JSON.stringify({ clientKind: kind,
      ...(refreshToken ? { refreshToken } : {}) }),
  });
  if (response.status === 401) {
    await writeNativeRefreshToken(null);
    return null;
  }
  if (!response.ok) throw new Error(await apiErrorMessage(response));
  const result = await response.json() as AuthSessionResponse;
  await writeNativeRefreshToken(result.data.refreshToken);
  return result.data;
}

export async function logoutManagedAuthSession(accessToken: string): Promise<void> {
  const response = await fetch(`${apiUrl}/api/v1/auth/logout`, {
    method: 'POST', credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}`,
      'Idempotency-Key': operationKey('auth-logout') },
  });
  await writeNativeRefreshToken(null);
  if (!response.ok && response.status !== 401) throw new Error(await apiErrorMessage(response));
}

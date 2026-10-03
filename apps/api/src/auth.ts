import { createHash, timingSafeEqual } from 'node:crypto';

import type { AuthAccessMode } from '@molokh/core';

export interface AuthenticatedUser {
  readonly userId: string;
  readonly accessMode: AuthAccessMode;
  readonly familyId?: string;
  readonly familyVersion?: number;
}

export type AuthAccessRequirement = 'FULL' | 'SERVICE_RESPONSE';

export interface AuthAdapter {
  authenticate(
    authorization: string | undefined,
    requirement?: AuthAccessRequirement,
  ): Promise<AuthenticatedUser | null>;
}

function bearerToken(authorization: string | undefined): string | null {
  const prefix = 'Bearer ';
  if (!authorization?.startsWith(prefix)) return null;
  const token = authorization.slice(prefix.length);
  return token.length > 0 ? token : null;
}

export function hashBearerToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export class StaticBearerAuthAdapter implements AuthAdapter {
  constructor(
    private readonly token: string,
    private readonly userId: string,
  ) {
    if (token.length < 16) throw new RangeError('Local bearer token must have at least 16 characters');
  }

  async authenticate(authorization: string | undefined): Promise<AuthenticatedUser | null> {
    const token = bearerToken(authorization);
    if (!token) return null;
    const supplied = Buffer.from(token);
    const expected = Buffer.from(this.token);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return null;
    }
    return { userId: this.userId, accessMode: 'FULL' };
  }
}

export interface StaticBearerIdentity {
  readonly token: string;
  readonly userId: string;
}

export class StaticBearerAuthRegistryAdapter implements AuthAdapter {
  private readonly identities: readonly StaticBearerIdentity[];

  constructor(identities: readonly StaticBearerIdentity[]) {
    if (identities.length === 0) throw new RangeError('At least one local identity is required');
    if (new Set(identities.map((identity) => identity.token)).size !== identities.length) {
      throw new RangeError('Local bearer tokens must be unique');
    }
    for (const identity of identities) {
      if (identity.token.length < 16) {
        throw new RangeError('Local bearer token must have at least 16 characters');
      }
      if (!identity.userId.trim()) throw new RangeError('Local user identity is required');
    }
    this.identities = identities.map((identity) => ({ ...identity }));
  }

  async authenticate(authorization: string | undefined): Promise<AuthenticatedUser | null> {
    const token = bearerToken(authorization);
    if (!token) return null;
    const supplied = Buffer.from(token);
    for (const identity of this.identities) {
      const expected = Buffer.from(identity.token);
      if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) {
        return { userId: identity.userId, accessMode: 'FULL' };
      }
    }
    return null;
  }
}

export interface DatabaseAuthProjection {
  readonly userId: string;
  readonly familyId: string;
  readonly familyVersion: number;
  readonly accessMode: AuthAccessMode;
}

export class DatabaseBearerAuthAdapter implements AuthAdapter {
  constructor(
    private readonly authenticateHash: (tokenHash: string) =>
      Promise<DatabaseAuthProjection | null>,
  ) {}

  async authenticate(
    authorization: string | undefined,
    requirement: AuthAccessRequirement = 'FULL',
  ): Promise<AuthenticatedUser | null> {
    const token = bearerToken(authorization);
    if (!token) return null;
    const projection = await this.authenticateHash(hashBearerToken(token));
    if (!projection) return null;
    if (projection.accessMode === 'SERVICE_RESPONSE_ONLY' && requirement === 'FULL') return null;
    return { userId: projection.userId, accessMode: projection.accessMode,
      familyId: projection.familyId, familyVersion: projection.familyVersion };
  }
}

export class CompositeAuthAdapter implements AuthAdapter {
  constructor(private readonly adapters: readonly AuthAdapter[]) {
    if (adapters.length === 0) throw new RangeError('At least one auth adapter is required');
  }

  async authenticate(
    authorization: string | undefined,
    requirement: AuthAccessRequirement = 'FULL',
  ): Promise<AuthenticatedUser | null> {
    for (const adapter of this.adapters) {
      const authenticated = await adapter.authenticate(authorization, requirement);
      if (authenticated) return authenticated;
    }
    return null;
  }
}

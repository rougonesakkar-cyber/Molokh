import { timingSafeEqual } from 'node:crypto';

export interface AuthenticatedUser {
  readonly userId: string;
}

export interface AuthAdapter {
  authenticate(authorization: string | undefined): Promise<AuthenticatedUser | null>;
}

export class StaticBearerAuthAdapter implements AuthAdapter {
  constructor(
    private readonly token: string,
    private readonly userId: string,
  ) {
    if (token.length < 16) throw new RangeError('Local bearer token must have at least 16 characters');
  }

  async authenticate(authorization: string | undefined): Promise<AuthenticatedUser | null> {
    const prefix = 'Bearer ';
    if (!authorization?.startsWith(prefix)) return null;
    const supplied = Buffer.from(authorization.slice(prefix.length));
    const expected = Buffer.from(this.token);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return null;
    }
    return { userId: this.userId };
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
    const prefix = 'Bearer ';
    if (!authorization?.startsWith(prefix)) return null;
    const supplied = Buffer.from(authorization.slice(prefix.length));
    for (const identity of this.identities) {
      const expected = Buffer.from(identity.token);
      if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) {
        return { userId: identity.userId };
      }
    }
    return null;
  }
}

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

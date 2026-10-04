const localDatabaseUrl = 'postgres://molokh:local-only-password@localhost:5432/molokh';
const localAuthSessionSecret = 'molokh-local-auth-session-secret-v1-change-in-production';
const localYouthConsentSecret = 'molokh-local-youth-consent-token-secret-v1';
const localCommunityId = '0199a1b2-1234-7000-8000-000000000502';
const localCompetitionId = '0199a1b2-1234-7000-8000-000000000901';
const localPublicWebUrl = 'http://localhost:8081';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ApiRuntimeConfig {
  readonly production: boolean;
  readonly databaseUrl: string;
  readonly authSessionSecret: string;
  readonly youthConsentTokenSecret: string;
  readonly pilotCommunityId: string;
  readonly pilotCompetitionId: string;
  readonly publicWebUrl: string;
  readonly allowedOrigins: readonly string[];
  readonly localFixturesEnabled: boolean;
  readonly trustProxy: boolean;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required in production`);
  return value;
}

function secret(env: NodeJS.ProcessEnv, key: string, fallback: string, production: boolean): string {
  const value = production ? required(env, key) : env[key]?.trim() || fallback;
  if (value.length < 32) throw new Error(`${key} must contain at least 32 characters`);
  return value;
}

function uuid(env: NodeJS.ProcessEnv, key: string, fallback: string, production: boolean): string {
  const value = production ? required(env, key) : env[key]?.trim() || fallback;
  if (!uuidPattern.test(value)) throw new Error(`${key} must be a UUID`);
  return value;
}

function origin(value: string, key: string, production: boolean): string {
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error(`${key} must be an absolute web origin`); }
  if (!['http:', 'https:'].includes(parsed.protocol)
    || parsed.username || parsed.password || parsed.search || parsed.hash
    || (parsed.pathname !== '/' && parsed.pathname !== '')) {
    throw new Error(`${key} must be an absolute web origin`);
  }
  if (production && parsed.protocol !== 'https:') {
    throw new Error(`${key} must use HTTPS in production`);
  }
  return parsed.origin;
}

export function readApiRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): ApiRuntimeConfig {
  const production = env.NODE_ENV === 'production';
  const publicWebUrl = origin(
    production ? required(env, 'PUBLIC_WEB_URL') : env.PUBLIC_WEB_URL?.trim() || localPublicWebUrl,
    'PUBLIC_WEB_URL', production,
  );
  const originInput = production
    ? required(env, 'CORS_ALLOWED_ORIGINS')
    : env.CORS_ALLOWED_ORIGINS?.trim() || `${localPublicWebUrl},http://127.0.0.1:8081`;
  const allowedOrigins = [...new Set(originInput.split(',')
    .map((value) => value.trim()).filter(Boolean)
    .map((value) => origin(value, 'CORS_ALLOWED_ORIGINS', production)))];
  if (!allowedOrigins.includes(publicWebUrl)) {
    throw new Error('CORS_ALLOWED_ORIGINS must include PUBLIC_WEB_URL');
  }
  return {
    production,
    databaseUrl: production ? required(env, 'DATABASE_URL')
      : env.DATABASE_URL?.trim() || localDatabaseUrl,
    authSessionSecret: secret(env, 'AUTH_SESSION_SECRET', localAuthSessionSecret, production),
    youthConsentTokenSecret: secret(
      env, 'YOUTH_CONSENT_TOKEN_SECRET', localYouthConsentSecret, production,
    ),
    pilotCommunityId: uuid(env, 'PILOT_COMMUNITY_ID', localCommunityId, production),
    pilotCompetitionId: uuid(env, 'PILOT_COMPETITION_ID', localCompetitionId, production),
    publicWebUrl,
    allowedOrigins,
    localFixturesEnabled: !production,
    trustProxy: production,
  };
}

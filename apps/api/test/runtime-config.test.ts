import { describe, expect, it } from 'vitest';

import { readApiRuntimeConfig } from '../src/runtime-config.js';

describe('API runtime configuration', () => {
  it('keeps local fixtures and loopback origins only outside production', () => {
    const config = readApiRuntimeConfig({ NODE_ENV: 'development' });
    expect(config).toMatchObject({ localFixturesEnabled: true, trustProxy: false,
      publicWebUrl: 'http://localhost:8081' });
    expect(config.allowedOrigins).toEqual([
      'http://localhost:8081',
      'http://127.0.0.1:8081',
    ]);
  });

  it('requires explicit secrets, pilot ids and HTTPS origins in production', () => {
    expect(() => readApiRuntimeConfig({ NODE_ENV: 'production' }))
      .toThrow('PUBLIC_WEB_URL is required in production');
    const config = readApiRuntimeConfig({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://molokh:secret@db/molokh',
      AUTH_SESSION_SECRET: 'a'.repeat(32),
      YOUTH_CONSENT_TOKEN_SECRET: 'b'.repeat(32),
      PILOT_COMMUNITY_ID: '0199a1b2-1234-7000-8000-000000000502',
      PILOT_COMPETITION_ID: '0199a1b2-1234-7000-8000-000000000901',
      PUBLIC_WEB_URL: 'https://app.molokh.example',
      CORS_ALLOWED_ORIGINS: 'https://app.molokh.example,https://admin.molokh.example',
    });
    expect(config).toMatchObject({ localFixturesEnabled: false, trustProxy: true,
      publicWebUrl: 'https://app.molokh.example' });
    expect(config.allowedOrigins).toEqual([
      'https://app.molokh.example',
      'https://admin.molokh.example',
    ]);
  });

  it('rejects insecure or unrelated production browser origins', () => {
    const base = {
      NODE_ENV: 'production', DATABASE_URL: 'postgres://molokh:secret@db/molokh',
      AUTH_SESSION_SECRET: 'a'.repeat(32), YOUTH_CONSENT_TOKEN_SECRET: 'b'.repeat(32),
      PILOT_COMMUNITY_ID: '0199a1b2-1234-7000-8000-000000000502',
      PILOT_COMPETITION_ID: '0199a1b2-1234-7000-8000-000000000901',
    };
    expect(() => readApiRuntimeConfig({ ...base,
      PUBLIC_WEB_URL: 'http://app.molokh.example',
      CORS_ALLOWED_ORIGINS: 'http://app.molokh.example' }))
      .toThrow('PUBLIC_WEB_URL must use HTTPS in production');
    expect(() => readApiRuntimeConfig({ ...base,
      PUBLIC_WEB_URL: 'https://app.molokh.example',
      CORS_ALLOWED_ORIGINS: 'https://admin.molokh.example' }))
      .toThrow('CORS_ALLOWED_ORIGINS must include PUBLIC_WEB_URL');
  });
});

import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';

export interface Database {
  readonly _typeOnly: never;
}

export function createDatabase(connectionString: string): Kysely<Database> {
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString }),
    }),
  });
}

export async function probeDatabase(database: Kysely<Database>): Promise<boolean> {
  const result = await sql<{ ready: number }>`select 1 as ready`.execute(database);
  return result.rows[0]?.ready === 1;
}

export * from './migrations.js';
export * from './appeal.js';
export * from './age-transition.js';
export * from './booking-conversion.js';
export * from './solo-continuation.js';
export * from './training-retention.js';
export * from './chat.js';
export * from './challenge.js';
export * from './community.js';
export * from './community-closure.js';
export * from './community-lifecycle.js';
export * from './discovery.js';
export * from './identity.js';
export * from './integrity-case.js';
export * from './missing-result.js';
export * from './membership-exit.js';
export * from './membership-removal.js';
export * from './notifications.js';
export * from './outbox.js';
export * from './pair-intent.js';
export * from './platform-command.js';
export * from './platform-incident.js';
export * from './role-grants.js';
export * from './result.js';
export * from './scheduling.js';
export * from './session.js';
export * from './social.js';
export * from './status-queue.js';
export * from './status-release.js';
export * from './status-replay.js';
export * from './youth-consent.js';

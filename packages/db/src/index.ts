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
export * from './community.js';
export * from './identity.js';
export * from './notifications.js';
export * from './outbox.js';
export * from './platform-command.js';
export * from './role-grants.js';

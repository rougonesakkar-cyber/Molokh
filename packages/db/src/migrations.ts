import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const migrationLockId = 83_472_611;

export class MigrationChecksumMismatchError extends Error {
  constructor(readonly migrationName: string) {
    super(`Applied migration checksum does not match: ${migrationName}`);
    this.name = 'MigrationChecksumMismatchError';
  }
}

function migrationChecksum(migrationSql: string): string {
  return createHash('sha256').update(migrationSql, 'utf8').digest('hex');
}

export async function runMigrations(
  connectionString: string,
  onApplied: (migrationName: string) => void = () => undefined,
): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    await client.query('select pg_advisory_lock($1)', [migrationLockId]);
    await client.query('create schema if not exists platform');
    await client.query(`
      create table if not exists platform.schema_migrations (
        migration_name text primary key,
        migration_sha256 text,
        applied_at timestamptz not null default clock_timestamp()
      )
    `);
    await client.query(`
      alter table platform.schema_migrations
      add column if not exists migration_sha256 text
    `);

    const appliedResult = await client.query<{
      migration_name: string;
      migration_sha256: string | null;
    }>(
      'select migration_name, migration_sha256 from platform.schema_migrations',
    );
    const applied = new Map(
      appliedResult.rows.map((row) => [row.migration_name, row.migration_sha256]),
    );
    const migrationNames = (await readdir(migrationsDirectory))
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort();

    for (const migrationName of migrationNames) {
      const migrationSql = await readFile(join(migrationsDirectory, migrationName), 'utf8');
      const checksum = migrationChecksum(migrationSql);
      const appliedChecksum = applied.get(migrationName);
      if (applied.has(migrationName)) {
        if (appliedChecksum === null) {
          await client.query(
            `update platform.schema_migrations
             set migration_sha256 = $2
             where migration_name = $1 and migration_sha256 is null`,
            [migrationName, checksum],
          );
        } else if (appliedChecksum !== checksum) {
          throw new MigrationChecksumMismatchError(migrationName);
        }
        continue;
      }

      await client.query('begin');
      try {
        await client.query(migrationSql);
        await client.query(
          `insert into platform.schema_migrations (migration_name, migration_sha256)
           values ($1, $2)`,
          [migrationName, checksum],
        );
        await client.query('commit');
        onApplied(migrationName);
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }
  } finally {
    await client
      .query('select pg_advisory_unlock($1)', [migrationLockId])
      .catch(() => undefined);
    await client.end();
  }
}

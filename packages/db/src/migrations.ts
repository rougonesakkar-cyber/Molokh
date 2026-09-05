import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const migrationLockId = 83_472_611;

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
        applied_at timestamptz not null default clock_timestamp()
      )
    `);

    const appliedResult = await client.query<{ migration_name: string }>(
      'select migration_name from platform.schema_migrations',
    );
    const applied = new Set(appliedResult.rows.map((row) => row.migration_name));
    const migrationNames = (await readdir(migrationsDirectory))
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort();

    for (const migrationName of migrationNames) {
      if (applied.has(migrationName)) continue;

      const migrationSql = await readFile(join(migrationsDirectory, migrationName), 'utf8');
      await client.query('begin');
      try {
        await client.query(migrationSql);
        await client.query(
          'insert into platform.schema_migrations (migration_name) values ($1)',
          [migrationName],
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

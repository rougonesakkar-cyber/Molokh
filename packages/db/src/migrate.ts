import { runMigrations } from './migrations.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to run migrations');
}

await runMigrations(connectionString, (migrationName) => {
  process.stdout.write(`Applied ${migrationName}\n`);
});

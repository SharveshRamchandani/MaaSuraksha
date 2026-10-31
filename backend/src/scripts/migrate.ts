import fs from 'fs';
import path from 'path';
import { pool } from '../config/db';

const MIGRATIONS_DIR = path.join(__dirname, '../../migrations');

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ id: string }>('SELECT id FROM schema_migrations');
  return new Set(result.rows.map((row) => row.id));
}

async function migrate() {
  await ensureMigrationsTable();
  const appliedSet = await getAppliedMigrations();

  const arg = process.argv[2];
  let filesToApply: string[] = [];

  if (arg && arg !== '--all') {
    const filePath = path.join(MIGRATIONS_DIR, arg);
    if (!fs.existsSync(filePath)) {
      console.error(`Migration file not found: ${arg}`);
      process.exitCode = 1;
      return;
    }
    filesToApply = [arg];
  } else {
    filesToApply = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();
  }

  const pending = filesToApply.filter((file) => !appliedSet.has(file));

  if (pending.length === 0) {
    console.log('Database is up to date. No pending migrations to apply.');
    return;
  }

  console.log(`Applying ${pending.length} migration(s)...`);

  for (const file of pending) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`✔ Applied: ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`✘ Migration failed: ${file}`);
      console.error(error);
      process.exitCode = 1;
      break;
    } finally {
      client.release();
    }
  }
}

migrate()
  .catch((err) => {
    console.error('Migration runner error:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

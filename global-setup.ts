import { execSync } from 'child_process';
import { Client } from 'pg';
import type { TestProject } from 'vitest/node';

/** Migra la base de tests y la deja vacía antes de correr. */
export default async function setup(project: TestProject) {
  const url = project.config.env.DATABASE_URL as string;
  if (!/erp_db_test/.test(url) && !process.env.TEST_DATABASE_URL) {
    throw new Error(`Los tests solo corren contra una base de tests, no contra: ${url}`);
  }

  execSync('pnpm prisma migrate deploy', {
    stdio: 'ignore',
    env: { ...process.env, DATABASE_URL: url },
  });

  const client = new Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  );
  if (rows.length) {
    await client.query(
      `TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`
    );
  }
  await client.end();
}

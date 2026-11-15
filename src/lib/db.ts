import { createClient, type Client, type InArgs } from "@libsql/client";
import { SCHEMA } from "./schema";

// One shared connection. Locally DATABASE_URL is a file (file:local.db);
// in production it points at a hosted libSQL database (Turso).
let client: Client | null = null;
let ready: Promise<void> | null = null;

function getClient(): Client {
  if (!client) {
    client = createClient({
      url: process.env.DATABASE_URL || "file:local.db",
      authToken: process.env.DATABASE_AUTH_TOKEN || undefined,
    });
  }
  return client;
}

async function migrate(c: Client) {
  await c.executeMultiple(SCHEMA);
  // Columns added after launch. SQLite has no "ADD COLUMN IF NOT EXISTS".
  for (const sql of ["ALTER TABLE segments ADD COLUMN hazardous INTEGER NOT NULL DEFAULT 0"]) {
    try {
      await c.execute(sql);
    } catch (err) {
      if (!String(err).includes("duplicate column")) throw err;
    }
  }
}

export async function db(): Promise<Client> {
  const c = getClient();
  if (!ready) ready = migrate(c);
  await ready;
  return c;
}

export async function all<T>(sql: string, args: InArgs = []): Promise<T[]> {
  const r = await (await db()).execute({ sql, args });
  return r.rows as unknown as T[];
}

export async function one<T>(sql: string, args: InArgs = []): Promise<T | undefined> {
  return (await all<T>(sql, args))[0];
}

export async function run(sql: string, args: InArgs = []) {
  return (await db()).execute({ sql, args });
}

/** Test/scripts hook: use a specific database (e.g. ":memory:"). */
export function useDatabase(url: string) {
  client = createClient({ url });
  ready = null;
}

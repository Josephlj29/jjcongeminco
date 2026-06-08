// Aplica las migraciones SQL en orden y registra cuáles ya corrieron.
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "./db.ts";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "migrations");

async function main() {
  await sql`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const files = (await readdir(migrationsDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = new Set(
    (await sql`select name from schema_migrations`).map((r) => r.name as string),
  );

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`· ${file} (ya aplicada)`);
      continue;
    }
    const ddl = await readFile(join(migrationsDir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(ddl);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    console.log(`✓ ${file}`);
  }

  console.log("Migraciones al día.");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
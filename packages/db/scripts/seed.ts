// Carga el seed base (roles, unidades, categorías, ubicaciones).
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { sql } from "./db.ts";

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  const ddl = await readFile(join(here, "..", "seed", "seed.sql"), "utf8");
  await sql.unsafe(ddl);
  console.log("✓ Seed aplicado.");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
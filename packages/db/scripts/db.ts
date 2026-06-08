// Conexión compartida a Postgres/Supabase para los scripts de DB.
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL (ej: postgresql://postgres:postgres@localhost:54322/postgres)");
  process.exit(1);
}

export const sql = postgres(url, { onnotice: () => {} });
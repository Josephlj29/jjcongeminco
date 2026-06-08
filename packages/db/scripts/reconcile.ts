// Verifica que el cache T_SaldoStock coincida con el ledger (V_MovimientoStock_SaldoReconciliacion).
// Cualquier descuadre = bug de trigger. Sale con código != 0 si hay diferencias.
import { sql } from "./db.ts";

async function main() {
  const diffs = await sql`
    SELECT
      COALESCE(S."IdProducto", V."IdProducto")   AS "IdProducto",
      COALESCE(S."IdUbicacion", V."IdUbicacion") AS "IdUbicacion",
      COALESCE(S."CantidadDisponible", 0)        AS "Cache",
      COALESCE(V."CantidadDisponible", 0)        AS "Ledger"
    FROM "inv"."T_SaldoStock" S
    FULL OUTER JOIN "inv"."V_MovimientoStock_SaldoReconciliacion" V
      ON V."IdProducto" = S."IdProducto" AND V."IdUbicacion" = S."IdUbicacion"
    WHERE COALESCE(S."CantidadDisponible", 0) <> COALESCE(V."CantidadDisponible", 0)
  `;

  if (diffs.length === 0) {
    const [{ count }] = await sql`SELECT COUNT(*) AS count FROM "inv"."T_SaldoStock"`;
    console.log(`✓ Reconciliación OK. ${count} saldos cuadran con el ledger.`);
    await sql.end();
    return;
  }

  console.error(`✗ ${diffs.length} descuadres entre cache y ledger:`);
  for (const d of diffs) {
    console.error(`  prod=${d.IdProducto} ubic=${d.IdUbicacion} cache=${d.Cache} ledger=${d.Ledger}`);
  }
  await sql.end();
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
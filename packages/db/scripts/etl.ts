// =====================================================================
// ETL — migra SOLO el catálogo de los 6 Excel KARDEX (no movimientos).
//
//  Hoja 1 (Productos) -> inv.T_Producto  (dedupe de Sku global)
//
//  Los movimientos/saldos NO se migran: se configuran desde cero en el
//  sistema. Las familias y categorías ya vienen del seed.
//
//  Cada producto migrado lleva IdMigracion = gen_random_uuid() para trazar
//  su origen y UsuarioCreacion = 'ETL'.
// =====================================================================
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdir } from "node:fs/promises";
import ExcelJS from "exceljs";
import { sql } from "./db.ts";

const here = dirname(fileURLToPath(import.meta.url));
const excelDir = join(here, "..", "..", "..", "RecursosExcel");

// Familia (categoría raíz) por palabra clave del nombre de archivo
function familyOf(file: string): string {
  const f = file.toUpperCase();
  if (f.includes("HERRAMIENTA")) return "FAM-HER";
  if (f.includes("FILTRO")) return "FAM-FIL";
  if (f.includes("ACEITE")) return "FAM-ACE";
  if (f.includes("ESLINGA")) return "FAM-ESL";
  if (f.includes("SUSPENSION")) return "FAM-SUS";
  if (f.includes("SUMINISTRO")) return "FAM-SUM";
  return "FAM-SUM";
}

function cellText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object" && v !== null && "text" in (v as any)) return String((v as any).text).trim();
  if (typeof v === "object" && v !== null && "result" in (v as any)) return String((v as any).result).trim();
  return String(v).trim();
}

function findCol(headerRow: ExcelJS.Row, needle: string): number {
  let found = -1;
  headerRow.eachCell((cell, col) => {
    if (cellText(cell.value).toUpperCase().includes(needle)) found = col;
  });
  return found;
}

function findHeaderRow(ws: ExcelJS.Worksheet, needle: string): number {
  for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
    let hit = false;
    ws.getRow(r).eachCell((cell) => {
      if (cellText(cell.value).toUpperCase() === needle) hit = true;
    });
    if (hit) return r;
  }
  return -1;
}

async function main() {
  const files = (await readdir(excelDir)).filter((f) => f.endsWith(".xlsx")).sort();
  const stats = { productos: 0, omitidos: 0, colisiones: [] as string[] };

  // Catálogo: nombre de categoría (mayúsculas) -> Id
  const catByName = new Map<string, string>();
  const catByCode = new Map<string, string>();
  for (const c of await sql`SELECT "Id", UPPER("Nombre") AS "Nombre", "Codigo" FROM "inv"."T_Categoria"`) {
    catByName.set(c.Nombre as string, c.Id as string);
    catByCode.set(c.Codigo as string, c.Id as string);
  }
  const [unit] = await sql`SELECT "Id" FROM "inv"."T_UnidadMedida" WHERE "Codigo" = 'UND'`;
  if (!unit) throw new Error("Falta seed (unidad UND). Corré db:seed primero.");

  // Sku ya existentes (dedupe global)
  const skuSet = new Set<string>();
  for (const p of await sql`SELECT "Sku" FROM "inv"."T_Producto"`) {
    skuSet.add(String(p.Sku).toUpperCase());
  }

  for (const file of files) {
    const familyId = catByCode.get(familyOf(file)) ?? null;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(join(excelDir, file));
    const ws = wb.worksheets[0];
    console.log(`\n=== ${file} ===`);

    const hp = findHeaderRow(ws, "CÓDIGO");
    if (hp < 0) {
      console.log("  (sin hoja de productos reconocible)");
      continue;
    }
    const header = ws.getRow(hp);
    const cCode = findCol(header, "CÓDIGO");
    const cName = findCol(header, "PRODUCTO");
    const cCat = findCol(header, "CATEGOR");

    for (let r = hp + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const sku = cellText(row.getCell(cCode).value);
      const name = cellText(row.getCell(cName).value);
      if (!sku || !name) continue;
      const key = sku.toUpperCase();
      if (skuSet.has(key)) {
        stats.colisiones.push(`${sku} (${file})`);
        stats.omitidos++;
        continue;
      }
      const catText = cCat > 0 ? cellText(row.getCell(cCat).value).toUpperCase() : "";
      const categoryId = catByName.get(catText) ?? familyId;

      const [ins] = await sql`
        INSERT INTO "inv"."T_Producto"
          ("Sku","Nombre","IdCategoria","IdUnidadMedida","UsuarioCreacion","UsuarioModificacion","IdMigracion")
        VALUES
          (${sku}, ${name}, ${categoryId}, ${unit.Id}, 'ETL', 'ETL', gen_random_uuid())
        ON CONFLICT ("Sku") DO NOTHING
        RETURNING "Id"
      `;
      if (ins) {
        skuSet.add(key);
        stats.productos++;
      }
    }
  }

  console.log("\n========== RESUMEN ETL (catálogo) ==========");
  console.log(`Productos insertados : ${stats.productos}`);
  console.log(`Sku omitidos (dup)   : ${stats.omitidos}`);
  if (stats.colisiones.length) {
    console.log("⚠️  Colisiones de Sku (se conservó la primera aparición):");
    for (const c of stats.colisiones) console.log(`    - ${c}`);
  }
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
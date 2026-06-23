// Lee los 6 KARDEX de RecursosExcel y genera seed/catalogo_kardex.sql:
//   wipe del catálogo (conserva maestros) + 6 familias + sub-cats de Aceites +
//   222 productos clasificados + asociaciones producto↔tipo de equipo.
import ExcelJS from "exceljs";
import { readdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "..", "..", "..", "RecursosExcel");
const out = join(here, "..", "seed", "catalogo_kardex.sql");

const txt = v => v==null ? "" : (typeof v==="object" && ("text" in v) ? String(v.text) : (typeof v==="object" && ("result" in v) ? String(v.result) : String(v))).trim();
const norm = s => s.normalize("NFD").replace(/[̀-ͯ]/g,"").toUpperCase();
const esc = s => s.replace(/'/g,"''");

function familyOf(file){ const f=norm(file);
  if(f.includes("HERRAMIENTA"))return "FAM-HER";
  if(f.includes("FILTRO"))return "FAM-FIL";
  if(f.includes("ESLINGA"))return "FAM-ESL";
  if(f.includes("ACEITE"))return "FAM-LUB";
  if(f.includes("SUSPENSION"))return "FAM-SUS";
  if(f.includes("SUMINISTRO"))return "FAM-SUM";
  return "FAM-SUM"; }
const ACEITE_CAT = { ACEITE:"CAT-ACEITE", GRASA:"CAT-GRASA", LIQUIDO:"CAT-LIQUIDO", REFRIGERANTE:"CAT-REFRIG", HIDROLINA:"CAT-HIDROLINA" };
const unitOf = cat => (cat==="CAT-ACEITE"||cat==="CAT-LIQUIDO"||cat==="CAT-REFRIG"||cat==="CAT-HIDROLINA")?"LT":(cat==="CAT-GRASA"?"KG":"UND");
const EQUIP = [["EX8","CAMION"],["VOLQUETE","CAMION"],["GRUA","GRUA"],["CISTERNA","CISTERNA"],["COUNTY","BUS"],["BUS","BUS"],["HILUX","CAMIONETA"],["CAMIONETA","CAMIONETA"]];
function tiposOf(name){ const n=norm(name); const s=new Set();
  for(const[tok,tipo]of EQUIP){ if(new RegExp(`\\b${tok}\\b`).test(n)) s.add(tipo); } return [...s]; }

const files = (await readdir(dir)).filter(f=>f.endsWith(".xlsx")).sort();
const seen = new Set();
const productos = []; const assoc = [];
const stats = {};
for(const file of files){
  const fam = familyOf(file);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(join(dir,file));
  const ws = wb.worksheets[0];
  let hr=-1; for(let r=1;r<=15;r++){ const c=ws.getRow(r).values.map(txt).map(s=>s.toUpperCase()); if(c.includes("CÓDIGO")&&c.includes("PRODUCTO")){hr=r;break;} }
  const idx={}; ws.getRow(hr).eachCell((c,i)=>{const t=txt(c.value).toUpperCase(); if(t&&!(t in idx))idx[t]=i;});
  const find=re=>{for(const[k,i]of Object.entries(idx))if(re.test(k))return i;return -1;};
  const cCode=find(/^CÓDIGO$/), cName=find(/^PRODUCTO$/), cCat=find(/CATEGOR/);
  for(let r=hr+1;r<=ws.rowCount;r++){
    const row=ws.getRow(r);
    const sku=txt(row.getCell(cCode).value); const name=txt(row.getCell(cName).value);
    if(!sku||!name||sku.toUpperCase()===name.toUpperCase()||sku.toUpperCase()==="CÓDIGO") continue;
    const key=sku.toUpperCase(); if(seen.has(key)) continue; seen.add(key);
    let cat=fam;
    if(fam==="FAM-LUB"){ const cv=cCat>0?norm(txt(row.getCell(cCat).value)):""; cat=ACEITE_CAT[cv]||"FAM-LUB"; }
    const tipos=tiposOf(name); const esGen=tipos.length===0;
    productos.push({sku,name,cat,uni:unitOf(cat),esGen});
    for(const t of tipos) assoc.push({sku,tipo:t});
    stats[cat]=(stats[cat]||0)+1;
  }
}

let sql = `/* GENERADO por scripts/generar-seed-catalogo.mjs desde RecursosExcel. NO editar a mano. */\nBEGIN;\n\n`;
sql += `/* 1. WIPE catálogo + dependientes (conserva proveedores, personal, cargos, equipos, vehiculos, ubicaciones, unidades, tipos, usuarios) */\n`;
sql += `ALTER TABLE "inv"."T_MovimientoStock" DISABLE TRIGGER "TR_T_MovimientoStock_BloquearDelete";\nDELETE FROM "inv"."T_MovimientoStock";\nALTER TABLE "inv"."T_MovimientoStock" ENABLE TRIGGER "TR_T_MovimientoStock_BloquearDelete";\n`;
for(const t of ["T_OrdenMantenimientoTrabajo","T_OrdenMantenimiento","T_ProductoPrecioHistorico","T_SaldoStock","T_RequerimientoDetalle","T_Requerimiento","T_DocumentoInventarioDetalle","T_DocumentoInventario","T_ProductoImagen","T_ProductoTipoEquipo","T_Importacion","T_Producto"]) sql+=`DELETE FROM "inv"."${t}";\n`;
sql += `DELETE FROM "inv"."T_Categoria" WHERE "IdCategoriaPadre" IS NOT NULL;\nDELETE FROM "inv"."T_Categoria";\n\n`;
sql += `/* 2. Familias */\nINSERT INTO "inv"."T_Categoria" ("Codigo","Nombre","IdCategoriaPadre") VALUES\n`;
sql += [["FAM-HER","Herramientas"],["FAM-FIL","Filtros"],["FAM-ESL","Eslingas y Grilletes"],["FAM-SUS","Sistema de Suspensión"],["FAM-SUM","Suministros de Rotación"],["FAM-LUB","Aceites y Líquidos"]].map(([c,n])=>`  ('${c}','${esc(n)}',NULL)`).join(",\n")+";\n\n";
sql += `/* 3. Sub-categorías de Aceites y Líquidos */\nINSERT INTO "inv"."T_Categoria" ("Codigo","Nombre","IdCategoriaPadre")\nSELECT v.cod, v.nom, f."Id" FROM (VALUES\n`;
sql += [["CAT-ACEITE","Aceites"],["CAT-GRASA","Grasas"],["CAT-LIQUIDO","Líquidos"],["CAT-REFRIG","Refrigerantes"],["CAT-HIDROLINA","Hidrolina"]].map(([c,n])=>`  ('${c}','${esc(n)}')`).join(",\n")+`\n) AS v(cod,nom) JOIN "inv"."T_Categoria" f ON f."Codigo"='FAM-LUB';\n\n`;
sql += `/* 4. Productos (${productos.length}) */\nINSERT INTO "inv"."T_Producto" ("Sku","Nombre","IdCategoria","IdUnidadMedida","EsGeneral","UsuarioCreacion","UsuarioModificacion")\nSELECT d.sku, d.nombre, c."Id", u."Id", d.esgen, 'ETL', 'ETL'\nFROM (VALUES\n`;
sql += productos.map(p=>`  ('${esc(p.sku)}','${esc(p.name)}','${p.cat}','${p.uni}',${p.esGen})`).join(",\n");
sql += `\n) AS d(sku,nombre,catcod,unicod,esgen)\nJOIN "inv"."T_Categoria" c ON c."Codigo"=d.catcod\nJOIN "inv"."T_UnidadMedida" u ON u."Codigo"=d.unicod;\n\n`;
sql += `/* 5. Asociaciones producto↔tipo de equipo (${assoc.length}) */\nINSERT INTO "inv"."T_ProductoTipoEquipo" ("IdProducto","IdTipoEquipo")\nSELECT p."Id", t."Id" FROM (VALUES\n`;
sql += assoc.map(a=>`  ('${esc(a.sku)}','${a.tipo}')`).join(",\n");
sql += `\n) AS a(sku,tipocod)\nJOIN "inv"."T_Producto" p ON p."Sku"=a.sku\nJOIN "inv"."T_TipoEquipo" t ON t."Codigo"=a.tipocod;\n\nCOMMIT;\n`;

await writeFile(out, sql, "utf8");
console.log("Productos:", productos.length, "| Generales:", productos.filter(p=>p.esGen).length, "| Específicos:", productos.filter(p=>!p.esGen).length, "| Asociaciones:", assoc.length);
console.log("Por categoría:", JSON.stringify(stats));
console.log("Tipos usados:", JSON.stringify(assoc.reduce((a,x)=>{a[x.tipo]=(a[x.tipo]||0)+1;return a;},{})));
console.log("Seed escrito en:", out, "(", (sql.length/1024).toFixed(1), "KB )");

/**
 * scripts/generar-ejemplos-importacion.mjs
 *
 * Genera los .xlsx de ejemplo para probar la importación masiva:
 *   - ejemplo-importacion-productos.xlsx  (SKUs nuevos → modo "crear")
 *   - ejemplo-importacion-saldos.xlsx     (SKUs en cero del seed → modo "inicial")
 *
 * Uso:  node apps/web/scripts/generar-ejemplos-importacion.mjs
 * (correr desde la raíz del repo; xlsx se resuelve desde apps/web/node_modules)
 */
import * as XLSX from "xlsx";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const aqui = dirname(fileURLToPath(import.meta.url));
const salida = resolve(aqui, "../../../packages/db/seed/ejemplos");
mkdirSync(salida, { recursive: true });

/* ---- Productos: SKUs nuevos; cubre general / 1 tipo / varios tipos ---- */
const productos = [
  {
    Sku: "ACE-5W30",
    Nombre: "Aceite Sintetico 5W30",
    CodigoCategoria: "CAT-ACEITE",
    CodigoUnidad: "LT",
    EsGeneral: "no",
    TiposEquipo: "CAMIONETA;CAMION",
    StockMinimo: 20,
    CodigoBarra: "",
    CodigoProductoProveedor: "LUB-5W30",
  },
  {
    Sku: "FIL-AIRGRU",
    Nombre: "Filtro Aire Grua",
    CodigoCategoria: "CAT-FILTRO",
    CodigoUnidad: "UND",
    EsGeneral: "no",
    TiposEquipo: "GRUA",
    StockMinimo: 6,
    CodigoBarra: "",
    CodigoProductoProveedor: "",
  },
  {
    Sku: "REP-AMORT",
    Nombre: "Amortiguador Delantero",
    CodigoCategoria: "CAT-REPUESTO",
    CodigoUnidad: "UND",
    EsGeneral: "no",
    TiposEquipo: "CAMIONETA;BUS",
    StockMinimo: 8,
    CodigoBarra: "",
    CodigoProductoProveedor: "",
  },
  {
    Sku: "SUM-DESENGRA",
    Nombre: "Desengrasante Industrial",
    CodigoCategoria: "CAT-SUMINISTRO",
    CodigoUnidad: "LT",
    EsGeneral: "si",
    TiposEquipo: "",
    StockMinimo: 10,
    CodigoBarra: "",
    CodigoProductoProveedor: "",
  },
  {
    Sku: "HER-DESTOR",
    Nombre: "Juego Destornilladores",
    CodigoCategoria: "CAT-HERRAMIENTA",
    CodigoUnidad: "UND",
    EsGeneral: "si",
    TiposEquipo: "",
    StockMinimo: 4,
    CodigoBarra: "",
    CodigoProductoProveedor: "",
  },
];
const colsProd = [
  "Sku",
  "Nombre",
  "CodigoCategoria",
  "CodigoUnidad",
  "EsGeneral",
  "TiposEquipo",
  "StockMinimo",
  "CodigoBarra",
  "CodigoProductoProveedor",
];

/* ---- Saldos: SKUs que quedaron en CERO tras el seed; modo "inicial" ---- */
const saldos = [
  { CodigoUbicacion: "ALM-AQP", Sku: "FIL-HIDGRU", Cantidad: 15, CostoUnitario: 42.0 },
  { CodigoUbicacion: "ALM-AQP", Sku: "REP-CORREA", Cantidad: 12, CostoUnitario: 85.0 },
  { CodigoUbicacion: "ALM-AQP", Sku: "HER-GATO", Cantidad: 4, CostoUnitario: 320.0 },
  { CodigoUbicacion: "ALM-AQP", Sku: "SUM-CINTA", Cantidad: 60, CostoUnitario: 3.5 },
  { CodigoUbicacion: "ALM-AQP", Sku: "SUM-SOLDA", Cantidad: 30, CostoUnitario: 12.0 },
];
const colsSaldo = ["CodigoUbicacion", "Sku", "Cantidad", "CostoUnitario"];

function escribir(nombre, filas, cols, hoja) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(filas, { header: cols });
  XLSX.utils.book_append_sheet(wb, ws, hoja);
  const ruta = resolve(salida, nombre);
  XLSX.writeFile(wb, ruta);
  console.log("✓", ruta);
}

escribir("ejemplo-importacion-productos.xlsx", productos, colsProd, "Productos");
escribir("ejemplo-importacion-saldos.xlsx", saldos, colsSaldo, "Saldos");
console.log("Listo.");

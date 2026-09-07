/**
 * scripts/generar-excel-clasificacion.ts — Los dos Excel de la reestructuración
 * de la clasificación (equipos y catálogo de productos).
 *
 *   1. Propuesta-clasificacion-equipos.xlsx
 *      Los cuatro niveles (Línea → Tipo de equipo → Equipo → Placa), los tipos
 *      actuales con su línea propuesta, los equipos y placas con sus huecos, y la
 *      taxonomía de familias actual y propuesta. Cada hoja tiene columnas para
 *      DECIDIR (desplegables), no solo para leer.
 *
 *   2. Revision-catalogo-productos.xlsx
 *      Un renglón por producto con la familia PROPUESTA, el nivel de
 *      incertidumbre y dos columnas para el operador: "Familia correcta" (se
 *      llena si la incertidumbre es Media o Alta) y "Confirmado OK" (se marca si
 *      es Baja). La propuesta sale de palabras clave del nombre; el porqué de
 *      cada decisión queda en la columna Motivo, para que nadie tenga que
 *      adivinar de dónde salió.
 *
 * FUENTE DE DATOS
 *   - Con DATABASE_URL en el entorno lee la base (producción o local).
 *   - Con --datos <ruta.json> lee un snapshot con la misma forma que devuelve
 *     `leerDesdeBase`. Sirve cuando no hay credenciales a mano: el snapshot se
 *     arma con esas mismas consultas desde el MCP y se pasa por archivo.
 *   - --salida <dir> cambia la carpeta (por defecto docs/reestructuracion).
 *
 * POR QUÉ LA PROPUESTA ES POR SISTEMA Y NO POR EQUIPO
 *   El catálogo mezcla dos criterios: familias por SISTEMA (frenos, eléctrico,
 *   filtros) y familias por EQUIPO ("Repuestos CAT 140", productos "de la grúa").
 *   Un repuesto pertenece a UN sistema, pero puede servir a VARIOS equipos: por
 *   eso el equipo ya tiene su lugar en la compatibilidad (T_ProductoTipoEquipo)
 *   y la familia debe decir QUÉ ES la pieza, no PARA QUÉ MÁQUINA es. Cuando las
 *   dos ideas se mezclan aparecen los cajones de sastre ("Suministros de
 *   rotación", "Repuestos") donde termina todo lo que no calza, que es
 *   exactamente lo que pasó.
 */
import ExcelJS from "exceljs";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/* ───────────────────────────── Datos de entrada ───────────────────────────── */

interface TipoEquipo {
  Codigo: string;
  Nombre: string;
  Descripcion: string | null;
  nEquipos: number;
  nProductos: number;
}
interface Equipo {
  Codigo: string;
  Nombre: string;
  Descripcion: string | null;
  TipoCodigo: string | null;
  Placas: string;
}
interface Vehiculo {
  Placa: string;
  Modelo: string | null;
  EquipoCodigo: string | null;
  TipoCodigo: string | null;
}
interface Categoria {
  Codigo: string;
  Nombre: string;
  Descripcion: string | null;
  PadreCodigo: string | null;
  nProductos: number;
  nHijas: number;
}
interface Producto {
  Sku: string;
  Nombre: string;
  CodigoUnidad: string;
  CategoriaCodigo: string;
  CategoriaNombre: string;
  FamiliaCodigo: string;
  FamiliaNombre: string;
  EsGeneral: boolean;
  StockMinimo: number | null;
  CodigoBarra: string | null;
  CodigoProductoProveedor: string | null;
  TiposEquipo: string[];
}
interface Snapshot {
  fuente: string;
  generadoEn: string;
  tiposEquipo: TipoEquipo[];
  equipos: Equipo[];
  vehiculos: Vehiculo[];
  categorias: Categoria[];
  productos: Producto[];
}

async function leerDesdeBase(): Promise<Snapshot> {
  const { sql } = await import("./db.ts");
  const tiposEquipo = await sql<TipoEquipo[]>`
    SELECT te."Codigo", te."Nombre", te."Descripcion",
      (SELECT COUNT(*)::int FROM inv."T_Equipo" e WHERE e."IdTipoEquipo" = te."Id" AND e."Estado") AS "nEquipos",
      (SELECT COUNT(*)::int FROM inv."T_ProductoTipoEquipo" pte
         JOIN inv."T_Producto" p ON p."Id" = pte."IdProducto" AND p."Estado"
       WHERE pte."IdTipoEquipo" = te."Id" AND pte."Estado") AS "nProductos"
    FROM inv."T_TipoEquipo" te WHERE te."Estado" ORDER BY te."Codigo"`;
  const equipos = await sql<Equipo[]>`
    SELECT e."Codigo", e."Nombre", e."Descripcion", te."Codigo" AS "TipoCodigo",
      COALESCE((SELECT string_agg(v."Placa", ', ' ORDER BY v."Placa")
                FROM inv."T_Vehiculo" v WHERE v."IdEquipo" = e."Id" AND v."Estado"), '') AS "Placas"
    FROM inv."T_Equipo" e LEFT JOIN inv."T_TipoEquipo" te ON te."Id" = e."IdTipoEquipo"
    WHERE e."Estado" ORDER BY te."Codigo" NULLS FIRST, e."Codigo"`;
  const vehiculos = await sql<Vehiculo[]>`
    SELECT v."Placa", v."Modelo", e."Codigo" AS "EquipoCodigo", te."Codigo" AS "TipoCodigo"
    FROM inv."T_Vehiculo" v
      LEFT JOIN inv."T_Equipo" e ON e."Id" = v."IdEquipo"
      LEFT JOIN inv."T_TipoEquipo" te ON te."Id" = e."IdTipoEquipo"
    WHERE v."Estado" ORDER BY v."Placa"`;
  const categorias = await sql<Categoria[]>`
    SELECT c."Codigo", c."Nombre", c."Descripcion", p."Codigo" AS "PadreCodigo",
      (SELECT COUNT(*)::int FROM inv."T_Producto" pr WHERE pr."IdCategoria" = c."Id" AND pr."Estado") AS "nProductos",
      (SELECT COUNT(*)::int FROM inv."T_Categoria" h WHERE h."IdCategoriaPadre" = c."Id" AND h."Estado") AS "nHijas"
    FROM inv."T_Categoria" c LEFT JOIN inv."T_Categoria" p ON p."Id" = c."IdCategoriaPadre"
    WHERE c."Estado" ORDER BY COALESCE(p."Codigo", c."Codigo"), c."Codigo"`;
  const productos = await sql<Producto[]>`
    SELECT pr."Sku", pr."Nombre", um."Codigo" AS "CodigoUnidad",
      c."Codigo" AS "CategoriaCodigo", c."Nombre" AS "CategoriaNombre",
      COALESCE(f."Codigo", c."Codigo") AS "FamiliaCodigo", COALESCE(f."Nombre", c."Nombre") AS "FamiliaNombre",
      pr."EsGeneral", pr."StockMinimo", pr."CodigoBarra", pr."CodigoProductoProveedor",
      COALESCE((SELECT array_agg(te."Codigo" ORDER BY te."Codigo")
                FROM inv."T_ProductoTipoEquipo" pte JOIN inv."T_TipoEquipo" te ON te."Id" = pte."IdTipoEquipo"
                WHERE pte."IdProducto" = pr."Id" AND pte."Estado"), '{}') AS "TiposEquipo"
    FROM inv."T_Producto" pr
      JOIN inv."T_Categoria" c ON c."Id" = pr."IdCategoria"
      LEFT JOIN inv."T_Categoria" f ON f."Id" = c."IdCategoriaPadre"
      JOIN inv."T_UnidadMedida" um ON um."Id" = pr."IdUnidadMedida"
    WHERE pr."Estado" ORDER BY pr."Sku"`;
  await sql.end();
  return {
    fuente: "base de datos",
    generadoEn: new Date().toISOString(),
    tiposEquipo,
    equipos,
    vehiculos,
    categorias,
    productos: productos.map((p) => ({ ...p, StockMinimo: p.StockMinimo === null ? null : Number(p.StockMinimo) })),
  };
}

/* ─────────────────────── Propuesta: líneas de equipo ─────────────────────── */

interface Linea {
  codigo: string;
  nombre: string;
  definicion: string;
  ejemplos: string;
}

/* Dos líneas, no cuatro: son las que la flota YA usa, incrustadas en los códigos
   ("LIN AMA - MOTO1", "LIN LIV - CAMION2"). La flota real no tiene volquetes ni
   buses grandes; los camiones EX8 y los minibuses County están cargados como
   liviana y esa es la decisión de la empresa. Si entra flota pesada se agrega
   una línea en ese momento: no hace falta crearla vacía. */
const LINEAS: Linea[] = [
  {
    codigo: "AMARILLA",
    nombre: "Línea amarilla",
    definicion: "Maquinaria de movimiento de tierras, carga e izaje. Se controla por horómetro.",
    ejemplos: "Hoy en la flota: minicargador, motoniveladora, telehandler",
  },
  {
    codigo: "LIVIANA",
    nombre: "Línea liviana",
    definicion: "Vehículos de rodaje: camionetas, camiones ligeros y transporte de personal. Se controlan por kilometraje.",
    ejemplos: "Hoy en la flota: camioneta Hilux, camión EX8 (grúa y cisterna), minibús County",
  },
];

/* La línea sale del prefijo que ya traen los códigos: "LIN AMA", "LIN LIV" y la
   variante con el guion corrido "LIN - LIV". Si no hay prefijo, por palabra clave. */
const RE_PREFIJO_LINEA = /^LIN\s*-?\s*(AMA|LIV)\b\s*-?\s*/;
const REGLAS_LINEA: { re: RegExp; linea: string }[] = [
  { re: /EXCAVADOR|CARGADOR|MOTONIVEL|RETROEXC|RODILLO COMPACT|TRACTOR|ORUGA|COMPACTADOR|MINICARGADOR|TELEHANDLER|MANIPULADOR|PERFORADOR/, linea: "AMARILLA" },
  { re: /CAMIONETA|CAMION|MINIBUS|MINIVAN|HILUX|COUNTY|EX8|\bBUS\b|COASTER|\bAUTO\b|PICKUP|\bVAN\b/, linea: "LIVIANA" },
];

function lineaPara(texto: string): string | null {
  const t = normalizar(texto);
  const m = RE_PREFIJO_LINEA.exec(t);
  if (m) return m[1] === "AMA" ? "AMARILLA" : "LIVIANA";
  return REGLAS_LINEA.find((r) => r.re.test(t))?.linea ?? null;
}

/* Código y nombre limpios para cada tipo actual. El prefijo de línea sale del
   código porque la línea pasa a ser un nivel propio. Solo tipos que existen hoy;
   el que no esté en la tabla se deriva quitando el prefijo. */
const PROPUESTA_TIPO: Record<string, { codigo: string; nombre: string }> = {
  "LIN AMA - MINI": { codigo: "MINICARGADOR", nombre: "Minicargador" },
  "LIN AMA - MOTO": { codigo: "MOTONIVELADORA", nombre: "Motoniveladora" },
  "LIN AMA - TELE": { codigo: "TELEHANDLER", nombre: "Telehandler (manipulador telescópico)" },
  "LIN LIV - CAMIONES": { codigo: "CAMION", nombre: "Camión EX8 (chasis)" },
  "LIN - LIV CAMION CIS": { codigo: "CAMION-CISTERNA", nombre: "Camión cisterna" },
  "LIN - LIV CAMION GRU": { codigo: "CAMION-GRUA", nombre: "Camión grúa" },
  "LIN LIV - CAMIONETA": { codigo: "CAMIONETA", nombre: "Camioneta" },
  "LIN LIV - MINIBUS": { codigo: "MINIBUS", nombre: "Minibús" },
};

function propuestaTipo(t: TipoEquipo): { codigo: string; nombre: string } {
  const fija = PROPUESTA_TIPO[t.Codigo.trim()];
  if (fija) return fija;
  const sinPrefijo = normalizar(t.Codigo).replace(RE_PREFIJO_LINEA, "").replace(/\s+/g, "-") || normalizar(t.Nombre).replace(/\s+/g, "-");
  return { codigo: sinPrefijo, nombre: t.Nombre.trim() };
}

/* "LIN LIV - CAMIONETA1" → "CAMIONETA-01". El prefijo de línea sobra; el número
   se separa y se rellena a dos dígitos para que ordene bien. */
function propuestaCodigoEquipo(codigo: string): string {
  const base = normalizar(codigo).replace(RE_PREFIJO_LINEA, "").trim();
  const m = /^([A-Z]+)\s*(\d+)$/.exec(base);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}` : base.replace(/\s+/g, "-");
}

/* Texto con espacios al inicio, al final o dobles: se cargó a mano y hay que
   limpiarlo antes de usarlo como clave. */
function espaciosSobrantes(texto: string | null | undefined): boolean {
  if (!texto) return false;
  return texto !== texto.trim() || /\s{2,}/.test(texto);
}

/* ───────────────────── Propuesta: familias de producto ───────────────────── */

interface CategoriaPropuesta {
  codigo: string;
  nombre: string;
  /** El código ya existe en la base: se reutiliza (y se recuelga bajo la familia). */
  existente: boolean;
  /** Categorías actuales que se funden en esta. */
  absorbe?: string[];
}

interface FamiliaPropuesta {
  codigo: string;
  nombre: string;
  definicion: string;
  existente: boolean;
  categorias: CategoriaPropuesta[];
}

/* Familias por SISTEMA del vehículo, que es como se ordena un almacén de
   repuestos y como vienen los catálogos de partes. Los códigos que ya existen
   se reutilizan tal cual; las categorías sueltas de la raíz se recuelgan bajo su
   familia; las creadas a mano sin código (FARO, GOMA, MUELLE, TAPA, PRECA, ROD)
   se absorben. */
const FAMILIAS: FamiliaPropuesta[] = [
  {
    codigo: "FAM-FIL",
    nombre: "Filtros",
    definicion: "Todo filtro, del sistema que sea: aceite, aire, combustible, hidráulico, cabina.",
    existente: false,
    categorias: [{ codigo: "CAT-FILTRO", nombre: "Filtros", existente: true }],
  },
  {
    codigo: "FAM-LUB",
    nombre: "Lubricantes y fluidos",
    definicion: "Aceites, grasas, refrigerante, hidrolina, líquido de frenos.",
    existente: true,
    categorias: [
      { codigo: "CAT-LUBRICANTE", nombre: "Aceites y grasas", existente: true },
      { codigo: "CAT-FLUIDO", nombre: "Refrigerante, hidrolina y líquido de frenos", existente: false },
    ],
  },
  {
    codigo: "FAM-ELE",
    nombre: "Sistema eléctrico",
    definicion: "Iluminación, protección eléctrica, carga y arranque, cableado, bocinas y alarmas.",
    existente: true,
    categorias: [
      { codigo: "CAT-FOCO", nombre: "Focos y faros", existente: true, absorbe: ["FARO"] },
      { codigo: "CAT-FUSIBLE", nombre: "Fusibles y portafusibles", existente: true },
      { codigo: "CAT-RELAY", nombre: "Relays y portarelays", existente: true },
      { codigo: "CAT-TERMINAL", nombre: "Terminales, conectores y cables eléctricos", existente: true },
      { codigo: "CAT-ELECTRICO", nombre: "Alternador, arranque, batería, bocinas, alarmas, switches", existente: true },
    ],
  },
  {
    codigo: "FAM-FRE",
    nombre: "Sistema de frenos",
    definicion: "Zapatas, pastillas, fajas, bombines, cañerías, gomas y todo componente del circuito de freno.",
    existente: false,
    categorias: [{ codigo: "CAT-FRENO", nombre: "Frenos", existente: true, absorbe: ["GOMA"] }],
  },
  {
    codigo: "FAM-SUS",
    nombre: "Suspensión y dirección",
    definicion: "Muelles, amortiguadores, bujes, barras y todo el sistema de dirección.",
    existente: false,
    categorias: [
      { codigo: "CAT-MUELLE", nombre: "Muelles, paquetes, abrazaderas y bujes de muelle", existente: false, absorbe: ["MUELLE"] },
      { codigo: "CAT-SUSPENSION", nombre: "Amortiguadores, barras estabilizadoras y bujes", existente: true },
      { codigo: "CAT-DIRECCION", nombre: "Barras, terminales de dirección, muñones, servo, cremallera", existente: true },
    ],
  },
  {
    codigo: "FAM-MOT",
    nombre: "Motor y transmisión",
    definicion: "Refrigeración y componentes de motor, correas, embrague, cardán y transmisión.",
    existente: false,
    categorias: [
      { codigo: "CAT-MOTOR", nombre: "Turbo, termostato, bomba de agua, radiador, tapas, precalentador", existente: true, absorbe: ["TAPA", "PRECA"] },
      { codigo: "CAT-TRANSMISION", nombre: "Embrague, cardán, crucetas, palier", existente: true, absorbe: ["CAT- CRUCETA"] },
      { codigo: "CAT-CORREA", nombre: "Correas, poleas y tensores", existente: false },
      { codigo: "CAT-COMBUSTIBLE", nombre: "Sistema de combustible", existente: true },
    ],
  },
  {
    codigo: "FAM-ROD",
    nombre: "Rodamientos y retenes",
    definicion: "Rodamientos, rodajes, bocamazas, retenes y sellos.",
    existente: false,
    categorias: [
      { codigo: "CAT-RODAMIENTO", nombre: "Rodamientos y bocamazas", existente: true },
      { codigo: "CAT-RETEN", nombre: "Retenes y sellos", existente: true },
    ],
  },
  {
    codigo: "FAM-NEU",
    nombre: "Neumáticos",
    definicion: "Neumáticos, aros y su reparación.",
    existente: true,
    categorias: [
      { codigo: "CAT-LLANTA", nombre: "Neumáticos y aros", existente: false },
      { codigo: "CAT-NEUMATICO", nombre: "Reparación: parches, válvulas, o-rings", existente: true },
    ],
  },
  {
    codigo: "FAM-IZA",
    nombre: "Izaje y remolque",
    definicion: "Eslingas, grilletes, cables de grúa, ganchos y cadenas.",
    existente: false,
    categorias: [{ codigo: "CAT-ESLINGA", nombre: "Eslingas, grilletes y cables", existente: false }],
  },
  {
    codigo: "FAM-HID",
    nombre: "Sistema hidráulico",
    definicion: "Mangueras, válvulas, motores y cilindros hidráulicos (grúa, telehandler, minicargador).",
    existente: false,
    categorias: [{ codigo: "CAT-HIDRAULICO", nombre: "Componentes hidráulicos", existente: false }],
  },
  {
    codigo: "FAM-HER",
    nombre: "Herramientas",
    definicion: "Herramientas del taller. No se consumen: se controlan por inventario y préstamo.",
    existente: true,
    categorias: [
      { codigo: "CAT-HERRAMIENTA", nombre: "Herramientas manuales", existente: true },
      { codigo: "CAT-MEDICION", nombre: "Medición y diagnóstico (torquímetro, vernier, multímetro, scanner)", existente: false },
      { codigo: "CAT-EQUIPO-TALLER", nombre: "Equipos de taller (gatas, caballetes, engrasadoras, herramientas eléctricas)", existente: false },
    ],
  },
  {
    codigo: "FAM-CON",
    nombre: "Consumibles",
    definicion: "Se gastan en el trabajo: cintas, sellantes, químicos, limpieza. NO repuestos.",
    existente: true,
    categorias: [
      { codigo: "CAT-CINTA", nombre: "Cintas", existente: true },
      { codigo: "CAT-SELLANTE", nombre: "Sellantes y adhesivos", existente: true },
      { codigo: "CAT-QUIMICO", nombre: "Químicos (aflojatodo, limpia contacto, auxiliar de arranque)", existente: true },
      { codigo: "CAT-LIMPIEZA", nombre: "Limpieza y abrasivos (trapos, lijas, piedras)", existente: false },
    ],
  },
  {
    codigo: "FAM-SEG",
    nombre: "Seguridad y emergencia",
    definicion: "Extintores, kits antiderrame, bloqueo, protección personal.",
    existente: false,
    categorias: [
      { codigo: "CAT-EMERGENCIA", nombre: "Extintores, kit antiderrame, cajas de bloqueo", existente: false },
      { codigo: "CAT-EPP", nombre: "Protección personal (guantes, lentes)", existente: false },
    ],
  },
  {
    codigo: "FAM-ACC",
    nombre: "Accesorios, fijación y carrocería",
    definicion: "Pernos, tuercas, espárragos, abrazaderas, seguros de tuerca, piezas de cabina y de implemento.",
    existente: false,
    categorias: [
      { codigo: "CAT-FIJACION", nombre: "Pernos, tuercas, arandelas, espárragos, abrazaderas, seguros de tuerca", existente: true, absorbe: ["CAT-SEGURIDAD"] },
      { codigo: "CAT-CARROCERIA", nombre: "Espejos, plumillas y piezas de cabina", existente: false },
      { codigo: "CAT-IMPLEMENTO", nombre: "Piezas de implemento (carrete de cisterna, pistola de combustible, uñas de motoniveladora)", existente: false, absorbe: ["ROD"] },
    ],
  },
];

const FAMILIA_POR_CODIGO = new Map(FAMILIAS.map((f) => [f.codigo, f]));

/* Categoría actual → familia y categoría propuestas cuando el nombre del
   producto no dice nada. Lo que no está acá es cajón de sastre: no hay a dónde
   mandarlo sin mirar el producto. */
const EQUIVALENCIAS: Record<string, { familia: string; categoria: string | null }> = {
  "CAT-FILTRO": { familia: "FAM-FIL", categoria: "CAT-FILTRO" },
  "CAT-LUBRICANTE": { familia: "FAM-LUB", categoria: "CAT-LUBRICANTE" },
  "FAM-LUB": { familia: "FAM-LUB", categoria: null },
  "CAT-FOCO": { familia: "FAM-ELE", categoria: "CAT-FOCO" },
  FARO: { familia: "FAM-ELE", categoria: "CAT-FOCO" },
  "CAT-FUSIBLE": { familia: "FAM-ELE", categoria: "CAT-FUSIBLE" },
  "CAT-RELAY": { familia: "FAM-ELE", categoria: "CAT-RELAY" },
  "CAT-TERMINAL": { familia: "FAM-ELE", categoria: "CAT-TERMINAL" },
  "CAT-ELECTRICO": { familia: "FAM-ELE", categoria: "CAT-ELECTRICO" },
  PRECA: { familia: "FAM-MOT", categoria: "CAT-MOTOR" },
  "FAM-ELE": { familia: "FAM-ELE", categoria: null },
  "CAT-FRENO": { familia: "FAM-FRE", categoria: "CAT-FRENO" },
  GOMA: { familia: "FAM-FRE", categoria: "CAT-FRENO" },
  MUELLE: { familia: "FAM-SUS", categoria: "CAT-MUELLE" },
  "CAT-SUSPENSION": { familia: "FAM-SUS", categoria: "CAT-SUSPENSION" },
  "CAT-DIRECCION": { familia: "FAM-SUS", categoria: "CAT-DIRECCION" },
  "CAT-MOTOR": { familia: "FAM-MOT", categoria: "CAT-MOTOR" },
  TAPA: { familia: "FAM-MOT", categoria: "CAT-MOTOR" },
  "CAT- CRUCETA": { familia: "FAM-MOT", categoria: "CAT-TRANSMISION" },
  "CAT-TRANSMISION": { familia: "FAM-MOT", categoria: "CAT-TRANSMISION" },
  "CAT-COMBUSTIBLE": { familia: "FAM-MOT", categoria: "CAT-COMBUSTIBLE" },
  "CAT-RODAMIENTO": { familia: "FAM-ROD", categoria: "CAT-RODAMIENTO" },
  "CAT-RETEN": { familia: "FAM-ROD", categoria: "CAT-RETEN" },
  "CAT-NEUMATICO": { familia: "FAM-NEU", categoria: "CAT-NEUMATICO" },
  "FAM-NEU": { familia: "FAM-NEU", categoria: null },
  "CAT-HERRAMIENTA": { familia: "FAM-HER", categoria: "CAT-HERRAMIENTA" },
  "FAM-HER": { familia: "FAM-HER", categoria: null },
  "CAT-CINTA": { familia: "FAM-CON", categoria: "CAT-CINTA" },
  "CAT-SELLANTE": { familia: "FAM-CON", categoria: "CAT-SELLANTE" },
  "CAT-QUIMICO": { familia: "FAM-CON", categoria: "CAT-QUIMICO" },
  "CAT-FIJACION": { familia: "FAM-ACC", categoria: "CAT-FIJACION" },
  "CAT-SEGURIDAD": { familia: "FAM-ACC", categoria: "CAT-FIJACION" },
  ROD: { familia: "FAM-ACC", categoria: "CAT-IMPLEMENTO" },
};

/* Dónde cayó "todo lo demás". Un producto sin palabra clave que viva acá es
   incertidumbre ALTA: no hay de dónde inferir. "Consumibles" cuenta solo cuando
   el producto cuelga DIRECTO de la familia: sus subcategorías (Cintas...) son
   legítimas, pero los 70 y pico colgados en la raíz son en su mayoría repuestos. */
const RE_CAJON_DE_SASTRE = /SUMINISTRO|REPUESTO|VARIOS|OTROS|GENERAL|MISCELANE/;

function esCajonDeSastre(codigo: string, nombre: string): boolean {
  return RE_CAJON_DE_SASTRE.test(normalizar(`${codigo} ${nombre}`)) || codigo === "FAM-CON";
}

/* ────────────────────── Reglas por palabra clave ────────────────────── */

type Subcategoria = string | ((nombre: string) => string);

interface Regla {
  etiqueta: string;
  re: RegExp;
  familia: string;
  categoria: Subcategoria;
  /** Si matchea, no se siguen buscando otras familias (evita falsos conflictos
      como "FILTRO DE ACEITE" → Filtros, no Lubricantes). */
  exclusiva?: boolean;
}

const sub = (pares: [RegExp, string][], porDefecto: string) => (n: string) =>
  pares.find(([re]) => re.test(n))?.[1] ?? porDefecto;

/* El ORDEN importa: la primera regla que matchea es la propuesta. Van primero
   las que desambiguan. Cada regla nació de un producto real del catálogo:
   "ESTRACTOR DE FILTRO" es herramienta y no filtro; "LIQUIDO DE FRENO" es
   fluido y no freno; "HIDROLINA PARA GATA" es fluido y no herramienta;
   "TERMINAL DE BARRA LARGA DE DIRECCION" es dirección y no un terminal
   eléctrico; "GRILLETE PARA MUELLE" es suspensión y no izaje; "RODAMIENTO POLEA
   GUIA" es rodamiento y no correa; "SUPER SELLADOR PARA RADIADOR" es sellante y
   no radiador; "JUEGO DE CAMARA DE RETROCESO" es eléctrico y no cámara de llanta. */
const REGLAS: Regla[] = [
  { etiqueta: "EXTRACTOR", re: /ESTRACTO|EXTRACTOR/, familia: "FAM-HER", categoria: "CAT-HERRAMIENTA", exclusiva: true },
  { etiqueta: "FILTRO", re: /\bFILTRO|CARTUCHO DE FILTRO|SEPARADOR DE AGUA/, familia: "FAM-FIL", categoria: "CAT-FILTRO", exclusiva: true },
  { etiqueta: "LIQUIDO DE FRENO", re: /LIQUIDO DE FRENOS?/, familia: "FAM-LUB", categoria: "CAT-FLUIDO", exclusiva: true },
  { etiqueta: "QUIMICO/SELLANTE", re: /SELLADOR|SELLANTE|SILICONA|SILICINA|SOLDIMIX|SOLDIMEC|ADHESIVO|PEGAMENTO|AFLOJATODO|LIMPIA ?CONTACTO|AUXILIAR DE ARRANQUE|WD.?40|PIEDRA PARA RECTIFICAR|\bLIJA|SPRAY/, familia: "FAM-CON", exclusiva: true,
    categoria: sub([[/SILICONA PARA TABLERO|AFLOJATODO|LIMPIA ?CONTACTO|AUXILIAR DE ARRANQUE|WD.?40|SPRAY/, "CAT-QUIMICO"], [/PIEDRA|LIJA/, "CAT-LIMPIEZA"]], "CAT-SELLANTE") },
  { etiqueta: "RADIADOR", re: /DEPOSITO DE REFRIGERANTE|RADIADOR/, familia: "FAM-MOT", categoria: "CAT-MOTOR", exclusiva: true },
  { etiqueta: "LUBRICANTE", re: /\bACEITE|AVEITE|\bGRASA|HIDROLINA|\bATF\b|REFRIGERANTE|ANTICONGELANTE|LUBRICANTE/, familia: "FAM-LUB", exclusiva: true,
    categoria: sub([[/HIDROLINA|\bATF\b|REFRIGERANTE|ANTICONGELANTE/, "CAT-FLUIDO"]], "CAT-LUBRICANTE") },
  { etiqueta: "CINTA", re: /\bCINTA|TEFLON/, familia: "FAM-CON", categoria: "CAT-CINTA", exclusiva: true },
  { etiqueta: "LIMPIEZA", re: /TRAPO|ESCOBILLON|WAYPE|\bPANO\b/, familia: "FAM-CON", categoria: "CAT-LIMPIEZA", exclusiva: true },
  { etiqueta: "SEGURIDAD", re: /EXTINTOR|ANTIDERRAME|CAJA DE SEGURIDAD|LOCKOUT|CANDADO DE BLOQUEO|BOTIQUIN|\bCONOS?\b|TRIANGULO DE SEGURIDAD/, familia: "FAM-SEG", categoria: "CAT-EMERGENCIA", exclusiva: true },
  { etiqueta: "EPP", re: /GUANTES?|\bLENTES\b|\bCASCO|CHALECO|TAPONES AUDITIVOS|RESPIRADOR|\bEPP\b/, familia: "FAM-SEG", categoria: "CAT-EPP", exclusiva: true },
  // Herramientas: van antes que las piezas que nombran ("GATA HIDRAULICA", "COMPRESOR DE RESORTE", "MANERAL CARDANICO").
  { etiqueta: "EQUIPO DE TALLER", re: /\bGATA\b|CABALLETE|ENGRASADORA|KIT ENGRASADOR|ENGRASADOR\b(?! DE)|AMOLADORA|PISTOLA INH?ALAMBRICA|CAUTIL|COMPRESOR DE RESORTE|TALADRO|ESMERIL|PRENSA HIDRAULICA/, familia: "FAM-HER", categoria: "CAT-EQUIPO-TALLER", exclusiva: true },
  { etiqueta: "MEDICION", re: /TORQUIMETRO|VERNIER|MULTIMETRO|SCANN?ER|MEDIDOR|MEDIDO DE AIRE|FLEXOMETRO|\bPILOTO\b/, familia: "FAM-HER", categoria: "CAT-MEDICION", exclusiva: true },
  { etiqueta: "HERRAMIENTA", re: /\bLLAVES?\b|\bDADOS?\b|ALICATE|MARTILLO|MAETILLO|\bCOMBO\b|DESTORNILLADOR|DESARMADOR|ESPATULA|MANERAL|ARCO Y SIERRA|RACHET|RATCHET|ESCOBILLA|AVELLANADOR|SACA SEGURO|JUEGO DE (LLAVE|DADO)|EXTENSION PARA DADOS|CINCEL|\bLIMA\b/, familia: "FAM-HER", categoria: "CAT-HERRAMIENTA", exclusiva: true },
  // Ambiguos a propósito: dos reglas NO exclusivas con la misma palabra → Media.
  // "ACOPLE 1/2" puede ser adaptador de dados o unión de manguera; "ENGRASADOR DE
  // MOTONIVELADORA" puede ser la grasera (pieza) o la engrasadora (herramienta).
  { etiqueta: "ACOPLE (herramienta)", re: /\bACOPLE\b/, familia: "FAM-HER", categoria: "CAT-HERRAMIENTA" },
  { etiqueta: "ACOPLE (unión)", re: /\bACOPLE\b/, familia: "FAM-ACC", categoria: "CAT-FIJACION" },
  { etiqueta: "ENGRASADOR (herramienta)", re: /ENGRASADOR DE/, familia: "FAM-HER", categoria: "CAT-EQUIPO-TALLER" },
  { etiqueta: "GRASERA (pieza)", re: /GRASERA|ENGRASADOR DE/, familia: "FAM-ACC", categoria: "CAT-FIJACION" },
  { etiqueta: "CAMARA DE RETROCESO", re: /CAMARA DE RETROCESO/, familia: "FAM-ELE", categoria: "CAT-ELECTRICO", exclusiva: true },
  { etiqueta: "DIRECCION", re: /DIRECCION|TERMINAL DE BARRA|BARRA (CORTA|LARGA)|CREMALLERA|MUNON|\bSERVO\b|ROTULA|PINES Y BUJES/, familia: "FAM-SUS", categoria: "CAT-DIRECCION", exclusiva: true },
  // "FRENO DE MOTOR" es la válvula de escape: motor y freno a la vez → conflicto a propósito (Media).
  { etiqueta: "FRENO DE MOTOR", re: /FRENO DE MOTOR/, familia: "FAM-MOT", categoria: "CAT-MOTOR" },
  { etiqueta: "FRENO", re: /\bFRENOS?\b|ZAPATA|BALATA|PASTILLA|BOMBIN|KALIPER|CALIPER|CANERIA DE FRENO/, familia: "FAM-FRE", categoria: "CAT-FRENO", exclusiva: true },
  { etiqueta: "MUELLE", re: /MUELLE/, familia: "FAM-SUS", categoria: "CAT-MUELLE", exclusiva: true },
  { etiqueta: "SUSPENSION", re: /AMORTIGUADOR|ESTABILIZADOR|\bBUJES?\b|COMPENSADOR|SUSPENSION/, familia: "FAM-SUS", categoria: "CAT-SUSPENSION", exclusiva: true },
  { etiqueta: "CARGA Y ARRANQUE", re: /ALTERNADOR|ARRANCADOR|MOTOR DE ARRANQUE|BATERIA|\bGENERADOR/, familia: "FAM-ELE", categoria: "CAT-ELECTRICO", exclusiva: true },
  { etiqueta: "RODAMIENTO", re: /RODAMIENTO|RODAJE|\bRETEN|COJINETE|BOCAMA[SZ]A/, familia: "FAM-ROD", exclusiva: true,
    categoria: sub([[/RETEN/, "CAT-RETEN"]], "CAT-RODAMIENTO") },
  { etiqueta: "CORREA", re: /\bFAJAS?\b|\bCORREA|TENSOR DE FAJA|TEMPLADOR|POLEA/, familia: "FAM-MOT", categoria: "CAT-CORREA", exclusiva: true },
  { etiqueta: "IZAJE", re: /ESLINGA|GRILLETE|CABLE DE GRUA|ESTROBO|GANCHO|TENSOR DE CARGA|\bCADENA/, familia: "FAM-IZA", categoria: "CAT-ESLINGA", exclusiva: true },
  { etiqueta: "HIDRAULICO", re: /MOTOR DE GIRO|ELECTRO ?VALVULA|MANGUERA HIDRAULICA|HIDRAULIC|CILINDRO|BOMBA HIDRAULICA/, familia: "FAM-HID", categoria: "CAT-HIDRAULICO" },
  { etiqueta: "MOTOR", re: /\bTURBO\b|TERMOSTATO|BOMBA DE AGUA|HIDROSTATICO|\bMOTOR\b|INYECTOR|BUJIA|CULATA|EMPAQUE|TOMAFUERZA|PRECALENTADOR/, familia: "FAM-MOT", categoria: "CAT-MOTOR" },
  { etiqueta: "TRANSMISION", re: /CRUCETA|CARDAN|EMBRAGUE|COLLARIN|PALIER|DIFERENCIAL|CAJA DE CAMBIO/, familia: "FAM-MOT", categoria: "CAT-TRANSMISION" },
  { etiqueta: "ELECTRICO", re: /\bFOCOS?\b|\bFAROS?\b|NEBLINERO|\bLEDS?\b|\bLES\b|MULTIVOL[TV]AJE|FUSIBLE|RELAY|CLAXON|BOCINA|ALARMA|PULSADOR|SWITCH|CORTA ?CORRIENTE|CONECTOR|TERMINAL (MACHO|HEMBRA)|\bCABLE\b|SENSOR|INTERRUPTOR|PRECALENTADOR|ELECTRO ?VALVULA/, familia: "FAM-ELE",
    categoria: sub([[/FOCO|FARO|NEBLINERO|LED|\bLES\b|MULTIVOL/, "CAT-FOCO"], [/FUSIBLE/, "CAT-FUSIBLE"], [/RELAY/, "CAT-RELAY"], [/CONECTOR|TERMINAL|CABLE/, "CAT-TERMINAL"]], "CAT-ELECTRICO") },
  { etiqueta: "NEUMATICO", re: /NEUMATICO|LLANTA|\bARO DE|PARCHE|CAMARA DE AIRE|ORRIN|O.?RING|VALVULA DE INFLADO|COCADA/, familia: "FAM-NEU",
    categoria: sub([[/PARCHE|CAMARA|ORRIN|O.?RING|VALVULA/, "CAT-NEUMATICO"]], "CAT-LLANTA") },
  { etiqueta: "FIJACION", re: /ESPARRAGO|\bPERNO|\bTUERCA|ARANDELA|REMACHE|ABRAZADERA|SEGURO DE TUERCA|SEGURO DE RUEDA|\bCLIP\b|PASADOR|\bPIN\b|\bPINES\b/, familia: "FAM-ACC", categoria: "CAT-FIJACION" },
  { etiqueta: "CARROCERIA", re: /ESPEJO|PARABRISA|PLUMILLA|\bFUNDA|\bFORRO|ASIENTO|MANIJA|\bCHAPA\b/, familia: "FAM-ACC", categoria: "CAT-CARROCERIA" },
  { etiqueta: "IMPLEMENTO", re: /CARRETE|PISTOLA (PARA|DE) COMBUSTIBLE|\bUNAS DE|CUCHILLA|CANTONERA/, familia: "FAM-ACC", categoria: "CAT-IMPLEMENTO" },
];

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

type Incertidumbre = "Baja" | "Media" | "Alta";

interface Clasificacion {
  familia: string | null;
  categoria: string | null;
  /** Qué tan seguro es el sistema de la familia propuesta. NO mide si cambia. */
  incertidumbre: Incertidumbre;
  /** true si la propuesta mueve el producto de su familia actual. */
  cambia: boolean;
  motivo: string;
}

/* La incertidumbre mide CONFIANZA en la propuesta, no si el producto se mueve.
   "TURBO EX8" que hoy vive en "Consumibles" es incertidumbre BAJA (es motor sin
   discusión) aunque cambie de familia. Si mezcláramos las dos cosas, la columna
   "Media" se llenaría de movimientos obvios y taparía las dudas reales. El
   movimiento va aparte, en `cambia`. */
function clasificarProducto(p: Producto): Clasificacion {
  const n = normalizar(p.Nombre);
  const coincidencias: { regla: Regla; categoria: string }[] = [];
  for (const regla of REGLAS) {
    if (!regla.re.test(n)) continue;
    const categoria = typeof regla.categoria === "function" ? regla.categoria(n) : regla.categoria;
    coincidencias.push({ regla, categoria });
    if (regla.exclusiva) break;
  }
  const familiasDistintas = [...new Set(coincidencias.map((c) => c.regla.familia))];
  const actualEsCajon = esCajonDeSastre(p.CategoriaCodigo, p.CategoriaNombre);
  const equivalente = EQUIVALENCIAS[p.CategoriaCodigo] ?? EQUIVALENCIAS[p.FamiliaCodigo] ?? null;
  const familiaActual = actualEsCajon ? null : equivalente?.familia ?? null;
  const dondeEsta = actualEsCajon
    ? `"${p.CategoriaNombre.trim()}" (cajón de sastre)`
    : p.CategoriaCodigo === p.FamiliaCodigo
      ? `"${p.CategoriaNombre.trim()}"`
      : `"${p.FamiliaNombre.trim()} › ${p.CategoriaNombre.trim()}"`;

  if (coincidencias.length === 0) {
    if (!familiaActual) {
      return {
        familia: null,
        categoria: null,
        incertidumbre: "Alta",
        cambia: true,
        motivo: `Sin palabra clave en el nombre y hoy está en ${dondeEsta}: no hay de dónde inferir. Decidir a mano.`,
      };
    }
    return {
      familia: familiaActual,
      categoria: equivalente?.categoria ?? null,
      incertidumbre: "Media",
      cambia: false,
      motivo: `Sin palabra clave; se mantiene donde está, ${dondeEsta}, como ${nombreFamilia(familiaActual)}. Confirmar que sea así.`,
    };
  }

  const principal = coincidencias[0] as { regla: Regla; categoria: string };
  const familia = principal.regla.familia;
  const categoria = principal.categoria || null;
  const cambia = familiaActual !== familia;

  if (familiasDistintas.length > 1) {
    const otras = coincidencias.slice(1).map((c) => `"${c.regla.etiqueta}" → ${nombreFamilia(c.regla.familia)}`).join(", ");
    return {
      familia,
      categoria,
      incertidumbre: "Media",
      cambia,
      motivo: `Coincide "${principal.regla.etiqueta}" → ${nombreFamilia(familia)}, pero también ${otras}. Elegir.`,
    };
  }
  return {
    familia,
    categoria,
    incertidumbre: "Baja",
    cambia,
    motivo: cambia
      ? `Coincide "${principal.regla.etiqueta}" → ${nombreFamilia(familia)}. Hoy está en ${dondeEsta}: se mueve.`
      : `Coincide "${principal.regla.etiqueta}" y ya está en ${nombreFamilia(familia)}.`,
  };
}

function nombreFamilia(codigo: string | null): string {
  if (!codigo) return "";
  const f = FAMILIA_POR_CODIGO.get(codigo);
  return f ? `${f.codigo} ${f.nombre}` : codigo;
}

function nombreCategoria(codigo: string | null): string {
  if (!codigo) return "";
  for (const f of FAMILIAS) {
    const c = f.categorias.find((x) => x.codigo === codigo);
    if (c) return `${c.codigo} ${c.nombre}`;
  }
  return codigo;
}

/* ─────────────────── Alertas de calidad del catálogo ─────────────────── */

const RE_SKU_REGULAR = /^[A-Z]+-\d{3}$/;

/* Tipos de equipo sin ningún equipo: un producto compatible SOLO con ellos no
   aparece para ninguna placa, porque el filtro va placa → equipo → tipo. */
function tiposHuerfanos(s: Snapshot): Set<string> {
  return new Set(s.tiposEquipo.filter((t) => t.nEquipos === 0).map((t) => t.Codigo));
}

/* Código de proveedor comparable: sin espacios ni guiones ("90240 06158" y
   "9024006158" son el mismo Toyota). "S/C" es "sin código", no una clave. */
function claveProveedor(codigo: string | null): string | null {
  if (!codigo) return null;
  const k = normalizar(codigo).replace(/[^A-Z0-9]/g, "");
  if (k.length < 5 || k === "SC") return null;
  return k;
}

/* "VKBA 6900 PE" y "VKBA6900" son la misma referencia con sufijo de empaque. */
function mismoProveedor(a: string, b: string): boolean {
  if (a === b) return true;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  return corto.length >= 6 && largo.startsWith(corto);
}

/* Nombre comparable: sin acentos, sin artículos ni preposiciones, sin espacios.
   "Fusible de 10A rojo", "Fusible 10A rojo" y "Fusible  10 A rojo" dan lo mismo. */
function claveNombre(nombre: string): string {
  return normalizar(nombre)
    .replace(/\b(DE|DEL|LA|EL|LOS|LAS|PARA|CON|Y|O)\b/g, " ")
    .replace(/[^A-Z0-9]/g, "");
}

/** Alertas por SKU: SKU irregular, unidad sin definir, espacios, tipos huérfanos, duplicados. */
function alertasCatalogo(s: Snapshot): Map<string, string[]> {
  const huerfanos = tiposHuerfanos(s);
  const porNombre = new Map<string, Producto[]>();
  for (const p of s.productos) {
    const kn = claveNombre(p.Nombre);
    porNombre.set(kn, [...(porNombre.get(kn) ?? []), p]);
  }
  const alertas = new Map<string, string[]>();
  for (const p of s.productos) {
    const a: string[] = [];
    if (!RE_SKU_REGULAR.test(p.Sku)) a.push("SKU irregular: regenerar con la categoría final");
    if (p.CodigoUnidad === "ZZ") a.push("Unidad ZZ (sin definir): asignar la unidad real");
    if (espaciosSobrantes(p.Nombre)) a.push("Nombre con espacios sobrantes");
    if (!p.EsGeneral && p.TiposEquipo.length === 0) a.push("Sin compatibilidad: ni general ni tipos");
    if (p.TiposEquipo.length > 0 && p.TiposEquipo.every((t) => huerfanos.has(t))) a.push("Compatible solo con tipos SIN equipos: hoy no aparece para ninguna placa");

    const kp = claveProveedor(p.CodigoProductoProveedor);
    /* Mismo código de proveedor exacto: duplicado casi seguro, aunque el nombre difiera.
       Código "casi igual" (uno es prefijo del otro): puede ser empaque ("VKBA 6900 PE")
       o una variante real ("FAF 40759D" vs "FAF 40759D XX"): se avisa, no se afirma. */
    const otros = kp ? s.productos.filter((q) => q.Sku !== p.Sku && claveProveedor(q.CodigoProductoProveedor) !== null) : [];
    const exactos = otros.filter((q) => claveProveedor(q.CodigoProductoProveedor) === kp).map((q) => q.Sku);
    const parecidos = otros
      .filter((q) => !exactos.includes(q.Sku) && mismoProveedor(kp as string, claveProveedor(q.CodigoProductoProveedor) as string))
      .map((q) => `${q.Sku} (${q.CodigoProductoProveedor?.trim()})`);
    /* Mismo nombre: solo cuenta si los códigos de proveedor no dicen lo contrario.
       "Termostato" del EX8 y "TERMOSTATO" del County tienen códigos distintos: son dos piezas. */
    const skusNom = (porNombre.get(claveNombre(p.Nombre)) ?? [])
      .filter((q) => {
        if (q.Sku === p.Sku || exactos.includes(q.Sku)) return false;
        const kq = claveProveedor(q.CodigoProductoProveedor);
        return !kp || !kq || mismoProveedor(kp, kq);
      })
      .map((q) => q.Sku);
    if (exactos.length > 0) a.push(`Posible duplicado de ${exactos.join(", ")} (mismo código de proveedor)`);
    if (skusNom.length > 0) a.push(`Posible duplicado de ${skusNom.join(", ")} (mismo nombre, sin código que lo desmienta)`);
    if (parecidos.length > 0) a.push(`Código de proveedor casi igual al de ${parecidos.join(", ")}: verificar si es variante o duplicado`);
    alertas.set(p.Sku, a);
  }
  return alertas;
}

/* ───────────────────────────── Ayudas Excel ───────────────────────────── */

const AZUL = "FFDDEBF7";
const VERDE = "FFC6EFCE";
const AMARILLO = "FFFFEB9C";
const ROJO = "FFFFC7CE";
const GRIS = "FFF2F2F2";
const COLOR_INCERTIDUMBRE: Record<Incertidumbre, string> = { Baja: VERDE, Media: AMARILLO, Alta: ROJO };

interface Col {
  header: string;
  key: string;
  width: number;
  /** Columna para que el usuario complete: se pinta de gris claro. */
  editable?: boolean;
}

function letra(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function relleno(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function hoja(wb: ExcelJS.Workbook, nombre: string, columnas: Col[], filas: Record<string, unknown>[]): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columnas.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  for (const f of filas) ws.addRow(f);
  const cab = ws.getRow(1);
  cab.font = { bold: true };
  cab.fill = relleno(AZUL);
  cab.alignment = { vertical: "middle", wrapText: true };
  cab.height = 30;
  ws.autoFilter = { from: "A1", to: `${letra(columnas.length)}1` };
  columnas.forEach((c, i) => {
    if (!c.editable) return;
    for (let r = 2; r <= ws.rowCount; r += 1) ws.getCell(`${letra(i + 1)}${r}`).fill = relleno(GRIS);
  });
  return ws;
}

/** Desplegable con lista fija ("Sí,No") o con un rango de otra hoja. */
function desplegable(ws: ExcelJS.Worksheet, columna: number, desde: number, hasta: number, fuente: string) {
  const formula = fuente.includes("!") ? fuente : `"${fuente}"`;
  for (let r = desde; r <= hasta; r += 1) {
    ws.getCell(`${letra(columna)}${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [formula],
      showErrorMessage: true,
      errorTitle: "Valor no válido",
      error: "Elegí un valor de la lista.",
    };
  }
}

function hojaLeeme(wb: ExcelJS.Workbook, titulo: string, parrafos: string[], snapshot: Snapshot) {
  const ws = wb.addWorksheet("Léeme");
  ws.getColumn(1).width = 110;
  ws.addRow([titulo]).font = { bold: true, size: 14 };
  ws.addRow([`Generado: ${snapshot.generadoEn.slice(0, 16).replace("T", " ")} · Fuente: ${snapshot.fuente}`]).font = { italic: true, color: { argb: "FF666666" } };
  ws.addRow([]);
  for (const p of parrafos) {
    const fila = ws.addRow([p]);
    fila.alignment = { wrapText: true, vertical: "top" };
    if (p.startsWith("•") || p.startsWith("  ")) fila.height = 18;
  }
  return ws;
}

/* ─────────────────── Excel 1: clasificación de equipos ─────────────────── */

const DECISION_TIPO = "Aceptar,Renombrar,Fusionar con otro,Dar de baja,Revisar";
const DECISION_FAMILIA = "Aceptar,Fusionar con otra,Renombrar,No aplica";
const DECISION_CATEGORIA = "Aceptar,Recolgar bajo familia,Fusionar en otra,Vaciar y dar de baja,Dar de baja,Revisar";
const SI_NO = "Sí,No";

async function generarExcelEquipos(s: Snapshot, ruta: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONGEMIN · reestructuración de clasificación";

  const huerfanos = tiposHuerfanos(s);
  const soloEnHuerfanos = s.productos.filter((p) => p.TiposEquipo.length > 0 && p.TiposEquipo.every((t) => huerfanos.has(t))).length;
  const enCajon = s.productos.filter((p) => esCajonDeSastre(p.CategoriaCodigo, p.CategoriaNombre)).length;
  const raices = s.categorias.filter((c) => !c.PadreCodigo);
  const catSueltas = raices.filter((c) => c.Codigo.startsWith("CAT-")).length;
  const sinCodigo = raices.filter((c) => !/^(FAM|CAT)-/.test(c.Codigo)).length;

  hojaLeeme(wb, "Propuesta de clasificación de equipos y familias", [
    "QUÉ ES ESTO. Una propuesta para reordenar cómo se clasifican los equipos (líneas, tipos, equipos, placas) y las familias de productos, armada sobre lo que hay cargado HOY en el sistema. No cambia nada por sí sola: es el documento para DECIDIR. Las columnas grises son las que se completan.",
    "",
    `LO QUE HAY. ${s.tiposEquipo.length} tipos de equipo, ${s.equipos.length} equipos, ${s.vehiculos.length} placas, ${s.categorias.length} categorías y ${s.productos.length} productos activos.`,
    "",
    "POR QUÉ SE PERDIÓ LA IDEA. Tres cosas a la vez:",
    "  1. La LÍNEA no tiene dónde vivir, así que se metió dentro de los códigos: 'LIN AMA - MOTO1', 'LIN LIV - CAMION2'. Sirve para leer, no para filtrar ni contar, y cada código la repite a mano (por eso hay un 'LIN - LIV' con el guion corrido).",
    `  2. El catálogo tiene TRES formas de categoría conviviendo: familias con subcategorías (FAM-ELE › CAT-FOCO), ${catSueltas} categorías sueltas en la raíz sin familia (CAT-FILTRO, CAT-FRENO, CAT-RETEN...) y ${sinCodigo} creadas a mano sin código estándar (FARO, GOMA, MUELLE, TAPA, PRECA, ROD, 'padre').`,
    `  3. Cajones de sastre y nombres engañosos: ${enCajon} productos viven en 'Repuestos' o colgados directo de 'Consumibles' (y la mayoría no son consumibles: turbo, alternador, bomba de agua, muñones). 'Terminales' eléctricos guarda terminales de dirección; 'Herramientas' guarda kits de freno y eslingas; 'Fijación' guarda amortiguadores y una cremallera; 'Seguridad' guarda seguros de rueda.`,
    "",
    "LA PROPUESTA EN CUATRO LÍNEAS. (a) Nivel nuevo 'Línea' con las dos que ya se usan, AMARILLA y LIVIANA; los códigos de tipos y equipos pierden el prefijo. (b) El tipo de equipo se mantiene porque es donde vive la compatibilidad de productos. (c) Toda categoría cuelga de una familia, y las familias son por SISTEMA del vehículo: la familia dice QUÉ ES la pieza, no para qué máquina es. (d) Los cajones de sastre se vacían producto por producto con el otro Excel.",
    "",
    `CAMIONES: LA DECISIÓN MÁS IMPORTANTE DE ESTE ARCHIVO. Hay tres tipos para los dos camiones EX8: 'LIN LIV - CAMIONES' (con las dos placas) y dos tipos viejos sin ningún equipo, 'CAMION CIS' y 'CAMION GRU', que todavía tienen productos asociados. Como el filtro de compatibilidad va placa → equipo → tipo, los ${soloEnHuerfanos} productos que solo están en los tipos viejos hoy NO aparecen para ninguna placa. Opción A (recomendada): dos tipos, CAMION-GRUA y CAMION-CISTERNA; el CAMION1 pasa a grúa, el CAMION2 a cisterna, los productos del chasis se asocian a ambos (la importación lo hace en bloque) y los exclusivos quedan donde están. Así 'cable de grúa' no aparece como compatible con la cisterna. Opción B: un solo tipo CAMION, se le pasan los ${soloEnHuerfanos} productos y los dos tipos viejos se dan de baja; más simple, pero el filtro ofrecerá piezas de grúa para la cisterna y viceversa. Marcá la decisión en la hoja 'Tipos de equipo'.`,
    "",
    "CÓMO LEERLO. 'Niveles': el modelo de cuatro niveles. 'Líneas': las dos líneas. 'Tipos de equipo': lo que hay, con código y nombre propuestos. 'Equipos' y 'Vehículos': lo cargado, con las observaciones. 'Categorías actuales': las 37 de hoy, qué forma tienen y a dónde van. 'Familias propuestas': la taxonomía nueva, marcando qué códigos ya existen.",
    "",
    "CÓMO COMPLETARLO. Cada hoja tiene una columna 'Decisión' con desplegable. Lo que quede en blanco se toma como 'Aceptar'. Cuando lo devuelvas, con eso se arma la migración de la base y la recarga del catálogo.",
  ], s);

  /* Niveles */
  hoja(wb, "Niveles", [
    { header: "Nivel", key: "nivel", width: 8 },
    { header: "Nombre", key: "nombre", width: 22 },
    { header: "Qué es", key: "que", width: 70 },
    { header: "Ejemplo con la flota actual", key: "ejemplo", width: 46 },
    { header: "Hoy en el sistema", key: "hoy", width: 56 },
  ], [
    { nivel: 1, nombre: "Línea", que: "Agrupación gruesa de la flota por naturaleza del equipo. Sirve para reportes, filtros y responsables. NUEVO.", ejemplo: "AMARILLA / LIVIANA", hoy: "No existe como dato: está incrustada en los códigos ('LIN AMA - ...'). Se agrega la tabla T_LineaEquipo y una columna en T_TipoEquipo." },
    { nivel: 2, nombre: "Tipo de equipo", que: "Clase de máquina o vehículo. Es donde se define la COMPATIBILIDAD de los productos (un filtro sirve para 'Minibús', no para 'toda la línea liviana').", ejemplo: "MOTONIVELADORA, MINIBUS, CAMIONETA, CAMION-GRUA", hoy: "Existe (T_TipoEquipo). Se mantiene; se le quita el prefijo de línea y se le agrega la línea como campo." },
    { nivel: 3, nombre: "Equipo", que: "La unidad física, con su código interno. Agrupa una o varias placas (normalmente una).", ejemplo: "MOTO-01 'CAT - Motoniveladora'", hoy: "Existe (T_Equipo). El tipo hoy es opcional: se vuelve obligatorio. La descripción se está usando como área ('OPERACIONES')." },
    { nivel: 4, nombre: "Placa / unidad", que: "La placa de rodaje, o el código interno si la máquina no tiene placa. Es a lo que se le atribuye el consumo.", ejemplo: "HL300339, VBU158", hoy: "Existe (T_Vehiculo). El equipo hoy es opcional: se vuelve obligatorio. Los dos telehandler no tienen placa." },
  ]);

  /* Líneas */
  const wsL = hoja(wb, "Líneas", [
    { header: "Código", key: "codigo", width: 12 },
    { header: "Nombre", key: "nombre", width: 22 },
    { header: "Definición", key: "def", width: 60 },
    { header: "Ejemplos", key: "ej", width: 60 },
    { header: "Tipos hoy", key: "n", width: 10 },
    { header: "Placas hoy", key: "nPlacas", width: 10 },
    { header: "Decisión", key: "dec", width: 18, editable: true },
    { header: "Observación", key: "obs", width: 40, editable: true },
  ], LINEAS.map((l) => ({
    codigo: l.codigo, nombre: l.nombre, def: l.definicion, ej: l.ejemplos,
    n: s.tiposEquipo.filter((t) => lineaPara(`${t.Codigo} ${t.Nombre}`) === l.codigo).length,
    nPlacas: s.vehiculos.filter((v) => v.TipoCodigo && lineaPara(v.TipoCodigo) === l.codigo).length,
  })));
  desplegable(wsL, 7, 2, wsL.rowCount, DECISION_FAMILIA);

  /* Tipos de equipo actuales */
  const exclusivos = (codigo: string) => s.productos.filter((p) => p.TiposEquipo.length > 0 && p.TiposEquipo.every((t) => t === codigo || huerfanos.has(t)) && p.TiposEquipo.includes(codigo)).length;
  const filasTipos = s.tiposEquipo.map((t) => {
    const linea = lineaPara(`${t.Codigo} ${t.Nombre} ${t.Descripcion ?? ""}`);
    const prop = propuestaTipo(t);
    const problemas: string[] = [];
    let accion = "Renombrar: quitar el prefijo de línea del código";
    if (!linea) problemas.push("No pude inferir la línea");
    if (huerfanos.has(t.Codigo)) {
      problemas.push(`SIN EQUIPOS: sus ${t.nProductos} productos compatibles no aparecen para ninguna placa`);
      accion = "DECIDIR (ver Léeme, 'Camiones'): opción A = mantener como tipo y asignarle su camión; opción B = pasar sus productos a CAMION y dar de baja";
    } else if (/CAMIONES/.test(t.Codigo)) {
      accion = "DECIDIR (ver Léeme, 'Camiones'): opción A = repartir sus 2 equipos en CAMION-GRUA y CAMION-CISTERNA y asociar sus productos a ambos; opción B = queda como único tipo CAMION";
    }
    if (t.nProductos === 0) problemas.push("Sin productos compatibles");
    if (/SUPERVISION|EXPLOSIVOS|TRANSPORTE DE PERSONAL/.test(normalizar(t.Nombre))) problemas.push("El nombre describe el USO de las unidades, no el tipo de vehículo");
    if (espaciosSobrantes(t.Codigo) || espaciosSobrantes(t.Nombre)) problemas.push("Espacios sobrantes en código o nombre");
    return {
      codigo: t.Codigo, nombre: t.Nombre, nEq: t.nEquipos, nProd: t.nProductos, nExcl: exclusivos(t.Codigo),
      linea: linea ?? "", codProp: prop.codigo, nomProp: prop.nombre, accion,
      problema: problemas.join("; "),
    };
  });
  const wsT = hoja(wb, "Tipos de equipo", [
    { header: "Código actual", key: "codigo", width: 22 },
    { header: "Nombre actual", key: "nombre", width: 26 },
    { header: "Equipos", key: "nEq", width: 9 },
    { header: "Productos compatibles", key: "nProd", width: 12 },
    { header: "Productos SOLO en este tipo", key: "nExcl", width: 12 },
    { header: "Línea", key: "linea", width: 12 },
    { header: "Código propuesto", key: "codProp", width: 18 },
    { header: "Nombre propuesto", key: "nomProp", width: 30 },
    { header: "Acción propuesta", key: "accion", width: 70 },
    { header: "Observación automática", key: "problema", width: 60 },
    { header: "Línea correcta (si difiere)", key: "lineaOk", width: 16, editable: true },
    { header: "Código final", key: "codOk", width: 18, editable: true },
    { header: "Nombre final", key: "nomOk", width: 26, editable: true },
    { header: "Decisión", key: "dec", width: 18, editable: true },
    { header: "Camiones: opción elegida (A/B)", key: "camiones", width: 16, editable: true },
    { header: "Observación", key: "obs", width: 40, editable: true },
  ], filasTipos);
  desplegable(wsT, 11, 2, wsT.rowCount, "'Líneas'!$A$2:$A$" + (LINEAS.length + 1));
  desplegable(wsT, 14, 2, wsT.rowCount, DECISION_TIPO);
  desplegable(wsT, 15, 2, wsT.rowCount, "A,B");
  for (let r = 2; r <= wsT.rowCount; r += 1) {
    if (Number(wsT.getCell(`C${r}`).value) === 0) wsT.getCell(`C${r}`).fill = relleno(ROJO);
  }

  /* Equipos */
  const tipoPorCodigo = new Map(s.tiposEquipo.map((t) => [t.Codigo, t]));
  const filasEquipos = s.equipos.map((e) => {
    const tipo = e.TipoCodigo ? tipoPorCodigo.get(e.TipoCodigo) : undefined;
    const linea = e.TipoCodigo ? lineaPara(`${e.TipoCodigo} ${tipo?.Nombre ?? ""}`) : null;
    const problemas: string[] = [];
    if (!e.TipoCodigo) problemas.push("SIN TIPO: la compatibilidad de productos no funciona para sus placas");
    if (!e.Placas) problemas.push("Sin placa: registrar el código interno como placa para poder atribuirle consumo");
    if (espaciosSobrantes(e.Codigo) || espaciosSobrantes(e.Nombre)) problemas.push("Espacios sobrantes en código o nombre");
    if (/^(OPERACIONES|COMPANIA|COMPAÑIA|ADMINISTRACION)$/.test(normalizar(e.Descripcion ?? ""))) problemas.push("La descripción se usa como área o propietario: si eso importa, es un campo aparte");
    return {
      codigo: e.Codigo, nombre: e.Nombre, desc: e.Descripcion ?? "", tipo: e.TipoCodigo ?? "", linea: linea ?? "", placas: e.Placas,
      codProp: propuestaCodigoEquipo(e.Codigo), tipoProp: tipo ? propuestaTipo(tipo).codigo : "",
      problema: problemas.join("; "),
    };
  });
  const wsE = hoja(wb, "Equipos", [
    { header: "Código actual", key: "codigo", width: 22 },
    { header: "Nombre", key: "nombre", width: 32 },
    { header: "Descripción", key: "desc", width: 16 },
    { header: "Tipo actual", key: "tipo", width: 22 },
    { header: "Línea", key: "linea", width: 12 },
    { header: "Placas", key: "placas", width: 14 },
    { header: "Código propuesto", key: "codProp", width: 16 },
    { header: "Tipo propuesto", key: "tipoProp", width: 18 },
    { header: "Observación automática", key: "problema", width: 70 },
    { header: "Código final", key: "codOk", width: 16, editable: true },
    { header: "Tipo correcto (si difiere)", key: "tipoOk", width: 22, editable: true },
    { header: "Placa o código a registrar", key: "placaOk", width: 18, editable: true },
    { header: "Confirmado OK", key: "ok", width: 12, editable: true },
    { header: "Observación", key: "obs", width: 40, editable: true },
  ], filasEquipos);
  desplegable(wsE, 11, 2, wsE.rowCount, "'Tipos de equipo'!$G$2:$G$" + (s.tiposEquipo.length + 1));
  desplegable(wsE, 13, 2, wsE.rowCount, SI_NO);

  /* Vehículos */
  const filasVeh = s.vehiculos.map((v) => {
    const linea = v.TipoCodigo ? lineaPara(`${v.TipoCodigo} ${tipoPorCodigo.get(v.TipoCodigo)?.Nombre ?? ""}`) : null;
    const problemas: string[] = [];
    if (!v.EquipoCodigo) problemas.push("SIN EQUIPO: no hereda tipo ni línea");
    else if (!v.TipoCodigo) problemas.push("Su equipo no tiene tipo");
    else problemas.push("Cadena placa → equipo → tipo completa");
    if (espaciosSobrantes(v.Modelo) || espaciosSobrantes(v.EquipoCodigo)) problemas.push("Espacios sobrantes en modelo o código de equipo");
    return { placa: v.Placa, modelo: v.Modelo ?? "", equipo: v.EquipoCodigo ?? "", tipo: v.TipoCodigo ?? "", linea: linea ?? "", problema: problemas.join("; ") };
  });
  const wsV = hoja(wb, "Vehículos", [
    { header: "Placa", key: "placa", width: 12 },
    { header: "Modelo", key: "modelo", width: 24 },
    { header: "Equipo actual", key: "equipo", width: 22 },
    { header: "Tipo (derivado)", key: "tipo", width: 22 },
    { header: "Línea (derivada)", key: "linea", width: 12 },
    { header: "Observación automática", key: "problema", width: 50 },
    { header: "Equipo correcto (si difiere)", key: "equipoOk", width: 22, editable: true },
    { header: "Confirmado OK", key: "ok", width: 12, editable: true },
    { header: "Observación", key: "obs", width: 40, editable: true },
  ], filasVeh);
  desplegable(wsV, 7, 2, wsV.rowCount, "Equipos!$A$2:$A$" + (s.equipos.length + 1));
  desplegable(wsV, 8, 2, wsV.rowCount, SI_NO);

  /* Categorías actuales: las 37, con su forma y su destino */
  const absorbidaPor = new Map<string, string>();
  for (const f of FAMILIAS) for (const c of f.categorias) for (const a of c.absorbe ?? []) absorbidaPor.set(a, `${c.codigo} (${f.codigo})`);
  const propuestaTieneCodigo = (codigo: string) => FAMILIAS.some((f) => f.codigo === codigo || f.categorias.some((c) => c.codigo === codigo));
  const filasCat = s.categorias.map((c) => {
    const esRaiz = !c.PadreCodigo;
    const cajon = esCajonDeSastre(c.Codigo, c.Nombre) && (c.Codigo !== "FAM-CON" || c.nProductos > 0);
    const eq = EQUIVALENCIAS[c.Codigo];
    let forma: string;
    if (!esRaiz) forma = "Categoría bajo familia (forma correcta)";
    else if (/^padre$/i.test(c.Codigo)) forma = "Categoría de prueba";
    else if (c.Codigo.startsWith("FAM-") && c.nProductos > 0 && c.nHijas > 0) forma = `Familia con ${c.nProductos} productos colgados directo (deberían estar en una subcategoría)`;
    else if (c.Codigo.startsWith("FAM-") && c.nProductos > 0) forma = `Familia sin subcategorías, con ${c.nProductos} productos directos`;
    else if (c.Codigo.startsWith("FAM-")) forma = "Familia (forma correcta)";
    else if (c.Codigo.startsWith("CAT-")) forma = "Categoría SUELTA en la raíz: no tiene familia";
    else forma = "Creada a mano, sin código estándar";
    let accion: string;
    let destino = "";
    if (/^padre$/i.test(c.Codigo)) {
      accion = "Dar de baja: es una prueba ('padre 1') sin productos";
    } else if (c.Codigo === "FAM-REP" || c.Codigo === "CAT-VARIOS") {
      accion = c.nProductos > 0 ? "Vaciar producto por producto (ver Revision-catalogo-productos.xlsx) y dar de baja" : "Dar de baja: vacía";
    } else if (c.Codigo === "FAM-CON") {
      accion = `Mantener la familia; los ${c.nProductos} productos colgados directo se redistribuyen: la mayoría son repuestos, no consumibles`;
      destino = nombreFamilia("FAM-CON");
    } else if (absorbidaPor.has(c.Codigo)) {
      destino = absorbidaPor.get(c.Codigo) ?? "";
      accion = `Fusionar en ${destino} y dar de baja`;
    } else if (eq && propuestaTieneCodigo(c.Codigo)) {
      destino = eq.categoria && eq.categoria !== c.Codigo ? nombreCategoria(eq.categoria) : nombreFamilia(eq.familia);
      accion = esRaiz && c.Codigo.startsWith("CAT-") ? `Recolgar bajo ${nombreFamilia(eq.familia)} (mismo código)` : "Mantener (mismo código)";
    } else if (eq) {
      destino = eq.categoria ? nombreCategoria(eq.categoria) : nombreFamilia(eq.familia);
      accion = `Fusionar en ${destino} y dar de baja`;
    } else {
      accion = "Revisar";
    }
    if (c.nProductos === 0 && c.nHijas === 0 && !/^padre$/i.test(c.Codigo) && c.Codigo !== "CAT-VARIOS") accion = `${accion}. Hoy está vacía`;
    return {
      codigo: c.Codigo, nombre: c.Nombre, padre: c.PadreCodigo ?? "(raíz)", nProd: c.nProductos, nHijas: c.nHijas,
      forma, cajon: cajon ? "Sí" : "", accion, destino,
    };
  });
  const wsC = hoja(wb, "Categorías actuales", [
    { header: "Código", key: "codigo", width: 18 },
    { header: "Nombre", key: "nombre", width: 26 },
    { header: "Padre", key: "padre", width: 12 },
    { header: "Productos directos", key: "nProd", width: 10 },
    { header: "Subcategorías", key: "nHijas", width: 10 },
    { header: "Forma que tiene hoy", key: "forma", width: 46 },
    { header: "¿Cajón de sastre?", key: "cajon", width: 12 },
    { header: "Acción propuesta", key: "accion", width: 70 },
    { header: "Destino propuesto", key: "destino", width: 46 },
    { header: "Decisión", key: "dec", width: 22, editable: true },
    { header: "Observación", key: "obs", width: 40, editable: true },
  ], filasCat);
  desplegable(wsC, 10, 2, wsC.rowCount, DECISION_CATEGORIA);
  for (let r = 2; r <= wsC.rowCount; r += 1) {
    if (wsC.getCell(`G${r}`).value === "Sí") wsC.getCell(`G${r}`).fill = relleno(ROJO);
    if (/SUELTA|sin código|prueba|colgados/.test(String(wsC.getCell(`F${r}`).value))) wsC.getCell(`F${r}`).fill = relleno(AMARILLO);
  }

  /* Familias propuestas */
  const filasProp: Record<string, unknown>[] = [];
  for (const f of FAMILIAS) {
    filasProp.push({ nivel: "FAMILIA", codigo: f.codigo, nombre: f.nombre, def: f.definicion, padre: "", existe: f.existente ? "Sí" : "Nueva", absorbe: "" });
    for (const c of f.categorias) {
      filasProp.push({ nivel: "categoría", codigo: c.codigo, nombre: c.nombre, def: "", padre: f.codigo, existe: c.existente ? "Sí" : "Nueva", absorbe: (c.absorbe ?? []).join(", ") });
    }
  }
  const wsP = hoja(wb, "Familias propuestas", [
    { header: "Nivel", key: "nivel", width: 11 },
    { header: "Código", key: "codigo", width: 20 },
    { header: "Nombre", key: "nombre", width: 64 },
    { header: "Definición", key: "def", width: 60 },
    { header: "Familia padre", key: "padre", width: 12 },
    { header: "¿El código ya existe?", key: "existe", width: 12 },
    { header: "Absorbe (categorías actuales)", key: "absorbe", width: 24 },
    { header: "Decisión", key: "dec", width: 18, editable: true },
    { header: "Nombre / código corregido", key: "corr", width: 30, editable: true },
    { header: "Observación", key: "obs", width: 40, editable: true },
  ], filasProp);
  desplegable(wsP, 8, 2, wsP.rowCount, DECISION_FAMILIA);
  for (let r = 2; r <= wsP.rowCount; r += 1) {
    if (wsP.getCell(`A${r}`).value === "FAMILIA") wsP.getRow(r).font = { bold: true };
  }

  await wb.xlsx.writeFile(ruta);
}

/* ─────────────────── Excel 2: revisión del catálogo ─────────────────── */

async function generarExcelCatalogo(s: Snapshot, ruta: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CONGEMIN · reestructuración de clasificación";

  const clasificados = s.productos.map((p) => ({ p, c: clasificarProducto(p) }));
  const alertas = alertasCatalogo(s);
  const conteo: Record<Incertidumbre, number> = { Baja: 0, Media: 0, Alta: 0 };
  let cambian = 0;
  for (const { c } of clasificados) {
    conteo[c.incertidumbre] += 1;
    if (c.cambia) cambian += 1;
  }
  const conAlertas = [...alertas.values()].filter((a) => a.length > 0).length;
  const porTipoAlerta = new Map<string, number>();
  for (const a of alertas.values()) for (const x of a) {
    const k = x.split(":")[0]?.replace(/ de .*$/, "") ?? x;
    porTipoAlerta.set(k, (porTipoAlerta.get(k) ?? 0) + 1);
  }

  hojaLeeme(wb, "Revisión del catálogo de productos: familia y nivel de incertidumbre", [
    `RESUMEN. ${s.productos.length} productos activos. Incertidumbre BAJA: ${conteo.Baja} (solo confirmar). MEDIA: ${conteo.Media} (mirar un segundo y aceptar o corregir). ALTA: ${conteo.Alta} (decidir a mano). Cambian de familia: ${cambian}. Con alguna alerta de calidad: ${conAlertas}.`,
    "",
    "QUÉ ES ESTO. Un renglón por producto con la FAMILIA PROPUESTA, la CATEGORÍA PROPUESTA y un NIVEL DE INCERTIDUMBRE. La propuesta sale de palabras clave del nombre del producto; la columna 'Motivo' dice exactamente por qué, para que no haya que adivinar.",
    "",
    "DOS COSAS DISTINTAS. La INCERTIDUMBRE mide qué tan seguro está el sistema de la familia propuesta. 'CAMBIA DE FAMILIA' dice si el producto se mueve de donde está hoy. 'Turbo EX8' que hoy vive colgado en 'Consumibles' es incertidumbre BAJA (es motor, sin discusión) y cambia de familia = Sí. Filtrá la columna 'Cambia' para ver solo los movimientos.",
    "",
    "CÓMO COMPLETARLO. Solo las columnas grises:",
    "  • Incertidumbre BAJA (verde): la propuesta es segura. Marcá 'Confirmado OK' = Sí. Si igual no estás de acuerdo, elegí la familia correcta y eso manda.",
    "  • Incertidumbre MEDIA (amarillo): hay dos lecturas posibles, o el nombre no dice nada y se mantiene donde está. Mirá el Motivo y elegí la 'Familia correcta' si difiere, o marcá OK.",
    "  • Incertidumbre ALTA (rojo): no hay de dónde inferir y hoy está en un cajón de sastre. Elegí la 'Familia correcta' del desplegable; es obligatorio.",
    "  • 'Categoría correcta' es opcional: si no la ponés, se usa la propuesta o la categoría genérica de la familia.",
    "  • 'Tipos correctos': los códigos NUEVOS de tipo (hoja 'Tipos de equipo' del otro Excel), separados por punto y coma. Si el producto sirve para todo, poné GENERAL.",
    "",
    "ALERTAS DE CALIDAD. La columna 'Alertas' marca lo que hay que arreglar además de la familia: SKU irregulares ('Fil 095', 'Hdhejehw', '1'), unidad ZZ (sin definir), productos compatibles solo con tipos que no tienen equipos (hoy no aparecen para ninguna placa), posibles duplicados por mismo código de proveedor o mismo nombre, y nombres con espacios sobrantes. Usá 'Observación' para decir qué hacer con cada uno (por ejemplo, 'fusionar con REP-022').",
    "",
    "REGLA DE ORO. La familia dice QUÉ ES la pieza (freno, filtro, eléctrico), no PARA QUÉ MÁQUINA es. Para qué máquina es se marca en 'Tipos de equipo' (compatibilidad), que también está en esta hoja para que lo revises de paso.",
    "",
    "DESPUÉS. Con el archivo devuelto se genera la planilla de importación (modo actualizar) y se recarga el catálogo. Los SKU regulares no cambian: 'CON-013 Turbo' puede terminar en Motor y sigue siendo el mismo producto. Los SKU irregulares se regeneran con la categoría final.",
  ], s);

  /* Referencia para los desplegables */
  const wsF = wb.addWorksheet("Familias");
  wsF.columns = [
    { header: "Código familia", key: "codigo", width: 14 },
    { header: "Nombre", key: "nombre", width: 40 },
    { header: "Definición", key: "def", width: 80 },
  ];
  for (const f of FAMILIAS) wsF.addRow({ codigo: f.codigo, nombre: f.nombre, def: f.definicion });
  wsF.getRow(1).font = { bold: true };
  wsF.getRow(1).fill = relleno(AZUL);

  const wsK = wb.addWorksheet("Categorías");
  wsK.columns = [
    { header: "Código categoría", key: "codigo", width: 20 },
    { header: "Nombre", key: "nombre", width: 70 },
    { header: "Familia", key: "familia", width: 14 },
    { header: "¿Ya existe?", key: "existe", width: 10 },
  ];
  for (const f of FAMILIAS) for (const c of f.categorias) wsK.addRow({ codigo: c.codigo, nombre: c.nombre, familia: f.codigo, existe: c.existente ? "Sí" : "Nueva" });
  wsK.getRow(1).font = { bold: true };
  wsK.getRow(1).fill = relleno(AZUL);

  /* Productos */
  const columnas: Col[] = [
    { header: "SKU", key: "sku", width: 16 },
    { header: "Nombre", key: "nombre", width: 52 },
    { header: "Unidad", key: "unidad", width: 8 },
    { header: "Categoría actual", key: "catAct", width: 26 },
    { header: "Familia actual", key: "famAct", width: 26 },
    { header: "Familia PROPUESTA", key: "famProp", width: 32 },
    { header: "Categoría propuesta", key: "catProp", width: 40 },
    { header: "Nivel de incertidumbre", key: "inc", width: 12 },
    { header: "Cambia de familia", key: "cambia", width: 9 },
    { header: "Motivo", key: "motivo", width: 70 },
    { header: "Alertas de calidad", key: "alertas", width: 60 },
    { header: "Familia correcta (llenar si Media o Alta)", key: "famOk", width: 22, editable: true },
    { header: "Categoría correcta (opcional)", key: "catOk", width: 22, editable: true },
    { header: "Confirmado OK (Sí si Baja)", key: "ok", width: 12, editable: true },
    { header: "Es general", key: "general", width: 8 },
    { header: "Tipos de equipo actuales", key: "tipos", width: 40 },
    { header: "Tipos correctos (códigos nuevos, separados por ;)", key: "tiposOk", width: 26, editable: true },
    { header: "Observación", key: "obs", width: 36, editable: true },
    { header: "Stock mínimo", key: "stockMin", width: 9 },
    { header: "Cód. proveedor", key: "codProv", width: 18 },
    { header: "Cód. barra", key: "codBar", width: 12 },
  ];
  const filas = clasificados.map(({ p, c }) => ({
    sku: p.Sku,
    nombre: p.Nombre,
    unidad: p.CodigoUnidad,
    catAct: `${p.CategoriaCodigo} ${p.CategoriaNombre.trim()}`,
    famAct: p.FamiliaCodigo === p.CategoriaCodigo ? `${p.FamiliaCodigo} (está en la raíz)` : `${p.FamiliaCodigo} ${p.FamiliaNombre.trim()}`,
    famProp: nombreFamilia(c.familia),
    catProp: nombreCategoria(c.categoria),
    inc: c.incertidumbre,
    cambia: c.cambia ? "Sí" : "No",
    motivo: c.motivo,
    alertas: (alertas.get(p.Sku) ?? []).join(" · "),
    general: p.EsGeneral ? "Sí" : "",
    tipos: p.TiposEquipo.join("; ") || (p.EsGeneral ? "" : "SIN CLASIFICAR"),
    stockMin: p.StockMinimo ?? "",
    codProv: p.CodigoProductoProveedor ?? "",
    codBar: p.CodigoBarra ?? "",
  }));
  const ws = hoja(wb, "Productos", columnas, filas);
  const ultima = ws.rowCount;
  const col = (key: string) => columnas.findIndex((c) => c.key === key) + 1;
  desplegable(ws, col("famOk"), 2, ultima, "Familias!$A$2:$A$" + (FAMILIAS.length + 1));
  desplegable(ws, col("catOk"), 2, ultima, "'Categorías'!$A$2:$A$" + wsK.rowCount);
  desplegable(ws, col("ok"), 2, ultima, SI_NO);
  for (let r = 2; r <= ultima; r += 1) {
    const celdaInc = ws.getCell(`${letra(col("inc"))}${r}`);
    celdaInc.fill = relleno(COLOR_INCERTIDUMBRE[celdaInc.value as Incertidumbre]);
    const celdaTipos = ws.getCell(`${letra(col("tipos"))}${r}`);
    if (celdaTipos.value === "SIN CLASIFICAR") celdaTipos.fill = relleno(AMARILLO);
    const celdaAlertas = ws.getCell(`${letra(col("alertas"))}${r}`);
    if (celdaAlertas.value) celdaAlertas.fill = relleno(AMARILLO);
  }
  /* La hoja Productos va primero: es la que se trabaja. */
  ws.orderNo = 0;

  /* Resumen */
  const porFamilia = new Map<string, number>();
  for (const { c } of clasificados) {
    const k = c.familia ? nombreFamilia(c.familia) : "(sin propuesta: decidir a mano)";
    porFamilia.set(k, (porFamilia.get(k) ?? 0) + 1);
  }
  const porActual = new Map<string, number>();
  for (const p of s.productos) {
    const k = `${p.CategoriaCodigo} ${p.CategoriaNombre.trim()}`;
    porActual.set(k, (porActual.get(k) ?? 0) + 1);
  }
  const wsR = wb.addWorksheet("Resumen");
  wsR.columns = [
    { header: "Concepto", key: "k", width: 60 },
    { header: "Cantidad", key: "v", width: 12 },
  ];
  wsR.addRow({ k: "Productos activos", v: s.productos.length });
  wsR.addRow({ k: "Incertidumbre BAJA (confirmar)", v: conteo.Baja });
  wsR.addRow({ k: "Incertidumbre MEDIA (revisar)", v: conteo.Media });
  wsR.addRow({ k: "Incertidumbre ALTA (decidir a mano)", v: conteo.Alta });
  wsR.addRow({ k: "Cambian de familia con la propuesta", v: cambian });
  wsR.addRow({ k: "Con alguna alerta de calidad", v: conAlertas });
  wsR.addRow({});
  wsR.addRow({ k: "Alertas por tipo", v: "" }).font = { bold: true };
  for (const [k, v] of [...porTipoAlerta.entries()].sort((a, b) => b[1] - a[1])) wsR.addRow({ k, v });
  wsR.addRow({});
  wsR.addRow({ k: "Por familia propuesta", v: "" }).font = { bold: true };
  for (const [k, v] of [...porFamilia.entries()].sort((a, b) => b[1] - a[1])) wsR.addRow({ k, v });
  wsR.addRow({});
  wsR.addRow({ k: "Por categoría actual", v: "" }).font = { bold: true };
  for (const [k, v] of [...porActual.entries()].sort((a, b) => b[1] - a[1])) wsR.addRow({ k, v });
  wsR.getRow(1).font = { bold: true };
  wsR.getRow(1).fill = relleno(AZUL);

  await wb.xlsx.writeFile(ruta);
  return conteo;
}

/* ──────────────────────────────── main ──────────────────────────────── */

async function main() {
  const args = process.argv.slice(2);
  const leerArg = (nombre: string) => {
    const i = args.indexOf(nombre);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const aqui = dirname(fileURLToPath(import.meta.url));
  const salida = resolve(leerArg("--salida") ?? join(aqui, "..", "..", "..", "docs", "reestructuracion"));
  const rutaDatos = leerArg("--datos");

  let snapshot: Snapshot;
  if (rutaDatos) {
    snapshot = JSON.parse(readFileSync(resolve(rutaDatos), "utf8")) as Snapshot;
  } else if (process.env.DATABASE_URL) {
    snapshot = await leerDesdeBase();
  } else {
    console.error("Falta DATABASE_URL o --datos <snapshot.json>.");
    process.exit(1);
  }

  mkdirSync(salida, { recursive: true });
  const f1 = join(salida, "Propuesta-clasificacion-equipos.xlsx");
  const f2 = join(salida, "Revision-catalogo-productos.xlsx");
  await generarExcelEquipos(snapshot, f1);
  const conteo = await generarExcelCatalogo(snapshot, f2);

  console.log(`Fuente: ${snapshot.fuente}`);
  console.log(`✓ ${f1}`);
  console.log(`  tipos=${snapshot.tiposEquipo.length} equipos=${snapshot.equipos.length} vehiculos=${snapshot.vehiculos.length} categorias=${snapshot.categorias.length}`);
  console.log(`✓ ${f2}`);
  console.log(`  productos=${snapshot.productos.length} baja=${conteo.Baja} media=${conteo.Media} alta=${conteo.Alta}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

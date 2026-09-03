/**
 * lib/cantidad.ts — Interpreta la cantidad TAL COMO LA ESCRIBE EL OPERARIO.
 *
 * EL PROBLEMA REAL: en obra se consume "un cuarto de balde". El sistema pedía el
 * decimal ya calculado, así que sacaban el celular, dividían y transcribían. Acá
 * se acepta `1/4`, `20/4`, `1 1/2`, `2*3` y la coma decimal, y la división la
 * hace el sistema.
 *
 * POR QUÉ EL CAMPO NO PUEDE SER type="number": el navegador descarta la barra,
 * así que `1/4` deja el input vacío y `valueAsNumber` devuelve NaN. El campo es
 * de texto (ver components/InputCantidad.tsx) y este módulo hace el parseo.
 *
 * SIN eval NI new Function: la entrada viene de un formulario, y aunque acá sea
 * del propio operario, evaluar texto arbitrario es una puerta que no se abre por
 * comodidad. Tokenizador + descenso recursivo, ~60 líneas, puro y testeado.
 *
 * DECISIONES QUE NO SE VEN EN EL CÓDIGO (no las "simplifiques" sin leer esto):
 *
 *  - `1,500` se interpreta como MIL QUINIENTOS, no como 1.5. Es ambiguo por
 *    construcción; gana el separador de miles porque es lo que imprime la propia
 *    app (`numero()` de lib/format.ts) y lo que sale al pegar desde Excel. Con
 *    una sola coma y sin grupos de tres (`1,5`) gana el decimal.
 *
 *  - NUNCA se borra el espacio entre dos dígitos. `20 4` se RECHAZA en vez de
 *    convertirse en 204: adivinar ahí es inventar stock. El único espacio válido
 *    entre dígitos es el del número mixto (`1 1/2`), que se resuelve antes.
 *
 *  - `1½` inyecta un espacio antes de expandir la fracción. Sin eso queda
 *    `11/2` = 5.5 en vez de 1.5.
 *
 *  - No hay menos unario en la gramática. `-5` cae como expresión incompleta y
 *    `5-8` se calcula y lo atrapa la revisión de negativo. Dos caminos, los dos
 *    rechazan, y la gramática queda de tres reglas.
 *
 *  - Un punto final suelto (`1.`) se ACEPTA: es el estado intermedio más común
 *    mientras se tipea, y marcarlo en rojo sería castigar a mitad de camino.
 */
import { DECIMALES_CANTIDAD } from "@congeminco/shared";

export type CodigoErrorCantidad =
  | "vacio"
  | "caracter_invalido"
  | "numero_invalido"
  | "expresion_incompleta"
  | "division_por_cero"
  | "negativo"
  | "no_finito";

export type ResultadoCantidad =
  | { ok: true; valor: number }
  | { ok: false; codigo: CodigoErrorCantidad; mensaje: string };

/* Los tests afirman contra `codigo`, que es estable; `mensaje` es lo que se
   muestra y puede reescribirse sin romper nada. */
const MENSAJES: Record<CodigoErrorCantidad, string> = {
  vacio: "",
  caracter_invalido: "Usá solo números y + - * /.",
  numero_invalido: "Número mal escrito.",
  expresion_incompleta: "La operación está incompleta.",
  division_por_cero: "No se puede dividir entre cero.",
  negativo: "La cantidad no puede ser negativa.",
  no_finito: "El número es demasiado grande.",
};

function falla(codigo: CodigoErrorCantidad): ResultadoCantidad & { ok: false } {
  return { ok: false, codigo, mensaje: MENSAJES[codigo] };
}

/** Unidades que por convención no se fraccionan. Solo dispara un AVISO, nunca
    bloquea: T_UnidadMedida no tiene columna de divisibilidad, así que esto es
    una heurística y un falso negativo ("no podés entregar 0.5 KG") sería peor. */
export const UNIDADES_NO_FRACCIONABLES: ReadonlySet<string> = new Set(["UND", "NIU"]);

const FRACCIONES_UNICODE: Record<string, string> = {
  "½": "1/2",
  "⅓": "1/3",
  "⅔": "2/3",
  "¼": "1/4",
  "¾": "3/4",
  "⅕": "1/5",
  "⅙": "1/6",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};
const RE_FRACCION_UNICODE = /[½⅓⅔¼¾⅕⅙⅛⅜⅝⅞]/;
const RE_FRACCION_UNICODE_G = new RegExp(RE_FRACCION_UNICODE.source, "g");
/** Miles con grupos de tres y decimal opcional: 1,234 · 1,234.5 · 12,345,678 */
const RE_MILES = /^\d{1,3}(,\d{3})+(\.\d+)?$/;

/** Normaliza el texto del operario a una expresión ASCII, o falla. */
function normalizar(entrada: string): { ok: true; texto: string } | (ResultadoCantidad & { ok: false }) {
  // Espacios raros incluidos: el no separable y el fino vienen de pegar desde
  // Excel, Word y WhatsApp.
  let s = entrada.replace(/[\s  ]+/g, " ").trim();
  if (!s) return falla("vacio");

  // Operadores que escriben los teclados y las planillas.
  s = s.replace(/÷/g, "/").replace(/[×✕]/g, "*").replace(/[−–—]/g, "-").replace(/⁄/g, "/");

  // Fracción unicode a su forma con barra, con espacio si viene pegada a un
  // dígito (`1½` → `1 1/2`, no `11/2`).
  s = s.replace(RE_FRACCION_UNICODE_G, (glifo, posicion: number, texto: string) => {
    const previo = posicion > 0 ? texto[posicion - 1] : undefined;
    const expandida = FRACCIONES_UNICODE[glifo] ?? glifo;
    return previo && /\d/.test(previo) ? ` ${expandida}` : expandida;
  });

  // Separadores: miles o decimal (ver la nota de arriba sobre `1,500`).
  s = RE_MILES.test(s) ? s.replace(/,/g, "") : s.replace(/,/g, ".");

  // Número mixto: `1 1/2` → `1+1/2`, y la precedencia hace el resto.
  s = s.replace(/(\d)\s+(?=\d+\s*\/)/g, "$1+");

  // Cualquier espacio que siga entre dígitos es ambiguo: se rechaza.
  if (/\d\s+\d/.test(s)) return falla("expresion_incompleta");
  s = s.replace(/\s+/g, "");

  // Potencia explícita: el mensaje "usá solo + - * /" es más útil que dejar que
  // el parser falle por un `*` suelto.
  if (s.includes("**")) return falla("caracter_invalido");
  // Esta lista blanca es la que descarta letras, paréntesis, % y notación
  // exponencial (1e3), que nunca llega al evaluador.
  if (!/^[0-9.+\-*/]+$/.test(s)) return falla("caracter_invalido");

  return { ok: true, texto: s };
}

type Operador = "+" | "-" | "*" | "/";
type Token = { tipo: "num"; valor: number } | { tipo: "op"; op: Operador };

function esOperador(c: string): c is Operador {
  return c === "+" || c === "-" || c === "*" || c === "/";
}

function tokenizar(s: string): { ok: true; tokens: Token[] } | (ResultadoCantidad & { ok: false }) {
  const tokens: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i] as string;
    if (esOperador(c)) {
      tokens.push({ tipo: "op", op: c });
      i += 1;
      continue;
    }
    let j = i;
    let puntos = 0;
    while (j < s.length) {
      const d = s[j] as string;
      if (d === ".") puntos += 1;
      else if (d < "0" || d > "9") break;
      j += 1;
    }
    const crudo = s.slice(i, j);
    // `1.` es válido (se está tipeando); `1.2.3` y un punto solo, no.
    if (puntos > 1 || crudo === ".") return falla("numero_invalido");
    const n = Number(crudo);
    if (Number.isNaN(n)) return falla("numero_invalido");
    // Un número con cientos de dígitos está bien escrito, solo es impagable:
    // "demasiado grande" le dice al operario qué pasó, "mal escrito" no.
    if (!Number.isFinite(n)) return falla("no_finito");
    tokens.push({ tipo: "num", valor: n });
    i = j;
  }
  return { ok: true, tokens };
}

/**
 * expr   := term (("+" | "-") term)*
 * term   := factor (("*" | "/") factor)*
 * factor := NUMERO
 */
function evaluar(tokens: Token[]): { ok: true; valor: number } | (ResultadoCantidad & { ok: false }) {
  let i = 0;
  let fallo: (ResultadoCantidad & { ok: false }) | null = null;

  const registrar = (codigo: CodigoErrorCantidad) => {
    fallo ??= falla(codigo);
    return NaN;
  };

  const proximoOperador = (ops: readonly Operador[]): Operador | null => {
    const t = tokens[i];
    return t && t.tipo === "op" && ops.includes(t.op) ? t.op : null;
  };

  const factor = (): number => {
    const t = tokens[i];
    if (!t || t.tipo !== "num") return registrar("expresion_incompleta");
    i += 1;
    return t.valor;
  };

  const term = (): number => {
    let valor = factor();
    for (let op = proximoOperador(["*", "/"]); op && !fallo; op = proximoOperador(["*", "/"])) {
      i += 1;
      const derecha = factor();
      if (fallo) break;
      if (op === "/" && derecha === 0) return registrar("division_por_cero");
      valor = op === "/" ? valor / derecha : valor * derecha;
      if (!Number.isFinite(valor)) return registrar("no_finito");
    }
    return valor;
  };

  const expr = (): number => {
    let valor = term();
    for (let op = proximoOperador(["+", "-"]); op && !fallo; op = proximoOperador(["+", "-"])) {
      i += 1;
      const derecha = term();
      if (fallo) break;
      valor = op === "+" ? valor + derecha : valor - derecha;
      if (!Number.isFinite(valor)) return registrar("no_finito");
    }
    return valor;
  };

  const valor = expr();
  if (fallo) return fallo;
  // Sobró texto: `1 2` ya se rechazó antes, pero `1+2+` llega hasta acá.
  if (i !== tokens.length) return falla("expresion_incompleta");
  if (!Number.isFinite(valor)) return falla("no_finito");
  return { ok: true, valor };
}

/**
 * Redondea a la escala de la BD sin el artefacto binario del doble.
 * `toPrecision(15)` es lo que hace que 1.0005 dé 1.001: el doble en realidad
 * vale 1.00049999…, así que `toFixed(3)` devolvería 1.000, que no es lo que
 * espera quien lo escribió.
 */
export function redondear(n: number, decimales: number): number {
  const factor = 10 ** decimales;
  const r = Math.round(Number((n * factor).toPrecision(15))) / factor;
  return Object.is(r, -0) ? 0 : r;
}

/**
 * Texto canónico de una cantidad, SIEMPRE re-parseable por `parsearCantidad`.
 *
 * NO uses `numero()` de lib/format.ts acá: esa función formatea para es-PE y
 * emite `1,234.5`, que al volver al campo depende de la heurística de miles.
 * `numero()` es para MOSTRAR; esta es para la ida y vuelta del input.
 */
export function formatearCantidad(n: number, decimales = DECIMALES_CANTIDAD): string {
  return String(redondear(n, decimales));
}

/**
 * ¿El texto es una operación y no un número escrito derecho?
 * Es la compuerta del eco "= 0.25": mostrarlo solo acá evita que aparezca y
 * desaparezca mientras se tipea `1` → `1.` → `1.5`.
 */
export function esExpresion(texto: string): boolean {
  return /[+\-*/÷×⁄]/.test(texto) || RE_FRACCION_UNICODE.test(texto) || /\d\s+\d/.test(texto);
}

/** Interpreta el texto del operario. El valor sale ya redondeado a la escala. */
export function parsearCantidad(texto: string, decimales = DECIMALES_CANTIDAD): ResultadoCantidad {
  const normalizado = normalizar(texto);
  if (!normalizado.ok) return normalizado;

  const tokenizado = tokenizar(normalizado.texto);
  if (!tokenizado.ok) return tokenizado;

  const evaluado = evaluar(tokenizado.tokens);
  if (!evaluado.ok) return evaluado;

  if (evaluado.valor < 0) return falla("negativo");
  return { ok: true, valor: redondear(evaluado.valor, decimales) };
}
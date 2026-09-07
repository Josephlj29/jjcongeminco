/**
 * lib/responsive-guardrails.test.ts
 *
 * Guardrails del sistema responsive. Escanea el código fuente de app/ y
 * components/ (excepto components/ui/, que ES el sistema) con expresiones
 * regulares y falla listando `archivo:línea` de cada violación.
 *
 * No renderiza nada: corre en entorno node como el resto de los tests.
 * Cada regla documenta la convención que protege. Si necesitás una
 * excepción legítima, agregala a la allowlist de esa regla con el porqué.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const DIRECTORIOS_IGNORADOS = new Set(["node_modules", ".next", ".open-next"]);

function listarTsx(dir: string, acumulado: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (DIRECTORIOS_IGNORADOS.has(nombre)) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) listarTsx(ruta, acumulado);
    else if (/\.tsx?$/.test(nombre) && !/\.test\.tsx?$/.test(nombre)) acumulado.push(ruta);
  }
  return acumulado;
}

const ARCHIVOS = [...listarTsx(join(RAIZ, "app")), ...listarTsx(join(RAIZ, "components"))];
/** Todo menos las primitivas: components/ui/ es la única capa que define tamaños. */
const ARCHIVOS_APP = ARCHIVOS.filter((f) => !f.includes(`${join("components", "ui")}/`));

interface Violacion {
  archivo: string;
  linea: number;
  texto: string;
}

interface OpcionesBusqueda {
  /** Archivos exceptuados (con el porqué en un comentario al lado). */
  allowlist?: RegExp[];
  /** Descarta coincidencias según la línea y la anterior (para JSX multilínea). */
  filtro?: (linea: string, anterior: string) => boolean;
}

function buscar(archivos: string[], patron: RegExp, opciones: OpcionesBusqueda = {}): Violacion[] {
  const violaciones: Violacion[] = [];
  for (const archivo of archivos) {
    const rel = relative(RAIZ, archivo);
    if (opciones.allowlist?.some((a) => a.test(rel))) continue;
    const lineas = readFileSync(archivo, "utf8").split("\n");
    lineas.forEach((texto, i) => {
      if (!patron.test(texto)) return;
      if (opciones.filtro && !opciones.filtro(texto, lineas[i - 1] ?? "")) return;
      violaciones.push({ archivo: rel, linea: i + 1, texto: texto.trim() });
    });
  }
  return violaciones;
}

function formatear(violaciones: Violacion[]): string {
  return violaciones.map((v) => `  ${v.archivo}:${v.linea}  →  ${v.texto}`).join("\n");
}

describe("guardrails responsive", () => {
  it("shell: usa dvh, no h-screen/min-h-screen (100vh se rompe con la barra del navegador móvil)", () => {
    const v = buscar(ARCHIVOS, /\b(min-|max-)?h-screen\b/);
    expect(v, `Reemplazar por h-dvh / min-h-dvh:\n${formatear(v)}`).toEqual([]);
  });

  it("alturas: nada en vh (usar dvh o calc(100dvh-…)); en móvil 100vh incluye la barra del navegador", () => {
    const v = buscar(ARCHIVOS_APP, /\b\d+vh\b/);
    expect(v, `Reemplazar Nvh por Ndvh:\n${formatear(v)}`).toEqual([]);
  });

  it("navegación: el hinge de sidebar/hamburger/bottom-nav es lg, no md (el contenido sí usa md)", () => {
    const nav = ARCHIVOS.filter((f) =>
      /components\/layout\/App(Sidebar|Topbar|BottomNav)\.tsx$/.test(f),
    );
    expect(nav.length, "deben existir los 3 componentes de navegación").toBe(3);
    const v = buscar(nav, /\bmd:(hidden|flex|block|inline-flex)\b/);
    expect(
      v,
      `La navegación cambia en lg: (1024px). Usar lg:hidden / lg:flex:\n${formatear(v)}`,
    ).toEqual([]);
  });

  it("dialogs: el tamaño lo define la prop size, no className (max-w/max-h/overflow prohibidos fuera de ui/)", () => {
    const v = buscar(
      ARCHIVOS_APP,
      /<(Dialog|AlertDialog|Sheet)Content\b[^>]*className=["{][^"}]*\b(max-w-|max-h-|overflow-)/,
    );
    expect(
      v,
      `Usar <DialogContent size="sm|md|lg|xl|full"> y envolver el cuerpo en <DialogBody>:\n${formatear(v)}`,
    ).toEqual([]);
  });

  it("grids: todo grid-cols-N arranca en grid-cols-1 (o usa prefijo sm:/md:/@md:) para no apretar 2+ columnas en celular", () => {
    const v = buscar(ARCHIVOS_APP, /(?<![\w:@-])grid-cols-[2-9]\b/, {
      filtro: (linea) => !/grid-cols-1\b/.test(linea),
      allowlist: [
        // 4 atajos de fracción de 56px dentro de un popover de 224px: no hay nada que apilar.
        /components\/InputCantidad\.tsx$/,
        // Launcher de accesos grandes: 2 columnas ES el diseño de celular.
        /components\/dashboard\/AccesosRapidos\.tsx$/,
      ],
    });
    expect(
      v,
      `Usar "grid grid-cols-1 gap-4 @md:grid-cols-2" dentro de dialogs o "grid-cols-1 sm:grid-cols-2" a nivel página:\n${formatear(v)}`,
    ).toEqual([]);
  });

  it("anchos fijos: min-w-[Npx] ≥ 300 sin prefijo solo se permite en <Table> (ahí hace scroll en vez de aplastar celdas)", () => {
    const v = buscar(ARCHIVOS_APP, /(?<![\w:@-])min-w-\[(\d+)px\]/, {
      filtro: (linea) => {
        const ancho = Number(/(?<![\w:@-])min-w-\[(\d+)px\]/.exec(linea)?.[1] ?? 0);
        return ancho >= 300 && !/<Table\b/.test(linea);
      },
    });
    expect(
      v,
      `Un min-w fijo fuera de una tabla desborda el viewport en celular. Usar w-full sm:w-N o ponerlo en <Table>:\n${formatear(v)}`,
    ).toEqual([]);
  });

  it("táctil: los botones icon de 32px (h-8 w-8) crecen a 40px en celular (h-10 w-10 md:h-8 md:w-8)", () => {
    const v = buscar(ARCHIVOS_APP, /\bh-8 w-8\b/, {
      filtro: (linea, anterior) =>
        /size="icon"/.test(linea + anterior) && !/\bmd:h-\d+\b/.test(linea),
      allowlist: [
        // El sidebar solo existe desde lg (puntero fino): 32px alcanza.
        /components\/layout\/AppSidebar\.tsx$/,
      ],
    });
    expect(
      v,
      `Mínimo táctil 40px en celular. Usar "h-10 w-10 md:h-8 md:w-8":\n${formatear(v)}`,
    ).toEqual([]);
  });
});

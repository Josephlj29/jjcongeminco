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

interface Violacion {
  archivo: string;
  linea: number;
  texto: string;
}

function buscar(
  archivos: string[],
  patron: RegExp,
  opciones: { allowlist?: RegExp[]; filtro?: (linea: string) => boolean } = {},
): Violacion[] {
  const violaciones: Violacion[] = [];
  for (const archivo of archivos) {
    const rel = relative(RAIZ, archivo);
    if (opciones.allowlist?.some((a) => a.test(rel))) continue;
    readFileSync(archivo, "utf8")
      .split("\n")
      .forEach((texto, i) => {
        if (patron.test(texto) && (!opciones.filtro || opciones.filtro(texto))) {
          violaciones.push({ archivo: rel, linea: i + 1, texto: texto.trim() });
        }
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

  it("navegación: el hinge de sidebar/hamburger/bottom-nav es lg, no md (el contenido sí usa md)", () => {
    const nav = ARCHIVOS.filter((f) => /components\/layout\/App(Sidebar|Topbar|BottomNav)\.tsx$/.test(f));
    expect(nav.length, "deben existir los 3 componentes de navegación").toBe(3);
    const v = buscar(nav, /\bmd:(hidden|flex|block|inline-flex)\b/);
    expect(v, `La navegación cambia en lg: (1024px). Usar lg:hidden / lg:flex:\n${formatear(v)}`).toEqual([]);
  });
});

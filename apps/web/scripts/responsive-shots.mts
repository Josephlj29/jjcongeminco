/**
 * scripts/responsive-shots.mts — Matriz de screenshots responsive.
 *
 * Levanta un Chromium headless (Playwright), inicia sesión UNA vez con
 * E2E_EMAIL / E2E_PASSWORD, y por cada viewport × ruta guarda una captura
 * full-page en .responsive-shots/<ancho>x<alto>/<ruta>.png. En las rutas con
 * modal clave, además abre el modal y guarda <ruta>--<modal>.png.
 *
 * Uso (con `pnpm dev` corriendo en otra terminal):
 *   pnpm --filter web shots                 # todos los viewports
 *   VIEWPORTS=390,1440 pnpm --filter web shots\n *   RUTAS=/requerimientos,/saldos pnpm --filter web shots
 *   E2E_BASE_URL=https://staging.ejemplo.com pnpm --filter web shots
 *
 * Variables (apps/web/.env.local): E2E_EMAIL, E2E_PASSWORD, [E2E_BASE_URL].
 * No corre en CI: es una herramienta de revisión visual a demanda.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page } from "@playwright/test";

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const SALIDA = ".responsive-shots";
const ESTADO_SESION = ".auth/state.json";

/** Matriz por dispositivo: celular chico/grande, tablet vertical/horizontal, laptop, desktop. */
const VIEWPORTS: Record<string, { width: number; height: number; movil?: boolean }> = {
  "360": { width: 360, height: 780, movil: true },
  "390": { width: 390, height: 844, movil: true },
  "768": { width: 768, height: 1024, movil: true },
  "1024": { width: 1024, height: 768 },
  "1280": { width: 1280, height: 800 },
  "1440": { width: 1440, height: 900 },
  "1920": { width: 1920, height: 1080 },
  "2560": { width: 2560, height: 1440 },
};

interface Escena {
  ruta: string;
  /** Pasos que abren el modal clave de la ruta. Si fallan, se registra y se sigue. */
  modales?: Array<{ nombre: string; abrir: (page: Page) => Promise<void> }>;
}

const ESCENAS: Escena[] = [
  { ruta: "/" },
  {
    ruta: "/productos",
    modales: [
      {
        nombre: "nuevo-producto",
        abrir: async (page) => {
          await page
            .getByRole("button", { name: /nuevo producto/i })
            .first()
            .click();
          await page.getByRole("dialog").waitFor();
        },
      },
      {
        nombre: "kardex",
        abrir: async (page) => {
          await page.getByRole("button", { name: "Abrir menú de acciones" }).first().click();
          await page.getByRole("menuitem", { name: /ver kardex/i }).click();
          await page.getByRole("dialog").waitFor();
        },
      },
    ],
  },
  { ruta: "/saldos" },
  {
    ruta: "/mantenimiento",
    modales: [
      {
        nombre: "nueva-orden",
        abrir: async (page) => {
          await page
            .getByRole("button", { name: /nueva orden/i })
            .first()
            .click();
          await page.getByRole("dialog").waitFor();
        },
      },
    ],
  },
  { ruta: "/requerimientos" },
  {
    ruta: "/aprobaciones",
    modales: [
      {
        nombre: "aprobar",
        abrir: async (page) => {
          // La primera fila de "por atender" abre DialogAprobarRequerimiento.
          await page.getByRole("row").nth(1).click();
          await page.getByRole("dialog").waitFor();
        },
      },
    ],
  },
  { ruta: "/reportes" },
  {
    ruta: "/maestros/proveedores",
    modales: [
      {
        nombre: "nuevo-proveedor",
        abrir: async (page) => {
          await page
            .getByRole("button", { name: /nuevo proveedor/i })
            .first()
            .click();
          await page.getByRole("dialog").waitFor();
        },
      },
    ],
  },
];

/**
 * Espera a que la pantalla "asiente": sin skeletons (animate-pulse) y con el DOM de
 * <main> estable durante dos muestreos seguidos (cubre contenido gateado por permisos
 * que aparece sin skeleton). Tope de 12s; nunca bloquea la corrida.
 */
async function esperarDatos(page: Page) {
  const inicio = Date.now();
  let anterior = -1;
  while (Date.now() - inicio < 12_000) {
    const estado = await page
      .evaluate(() => ({
        skeletons: document.querySelectorAll(".animate-pulse").length,
        tamano: document.querySelector("main")?.innerHTML.length ?? document.body.innerHTML.length,
      }))
      .catch(() => ({ skeletons: 0, tamano: -2 }));
    if (estado.skeletons === 0 && estado.tamano === anterior) break;
    anterior = estado.tamano;
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(300); // fuentes e imágenes
}

function nombreArchivo(ruta: string) {
  return ruta === "/" ? "inicio" : ruta.replace(/^\//, "").replace(/\//g, "__");
}

async function iniciarSesion(context: BrowserContext) {
  if (!EMAIL || !PASSWORD) {
    console.error("Faltan E2E_EMAIL y/o E2E_PASSWORD (apps/web/.env.local).");
    process.exit(1);
  }
  const page = await context.newPage();
  // Hasta 3 intentos: si se hace clic antes de que React hidrate, el <form> se envía
  // como GET nativo (la URL queda con ?email=...) y no hay login. networkidle evita
  // casi siempre esa carrera; el reintento cubre al dev server recompilando.
  for (let intento = 1; intento <= 3; intento++) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    try {
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
      break;
    } catch (e) {
      if (intento === 3) throw e;
      console.warn(`Login sin hidratar (intento ${intento}); reintentando…`);
    }
  }
  await mkdir(".auth", { recursive: true });
  await context.storageState({ path: ESTADO_SESION });
  await page.close();
}

async function main() {
  const seleccion = (process.env.VIEWPORTS ?? Object.keys(VIEWPORTS).join(","))
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s in VIEWPORTS);
  const rutasFiltro = process.env.RUTAS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const escenas = rutasFiltro?.length
    ? ESCENAS.filter((e) => rutasFiltro.includes(e.ruta))
    : ESCENAS;

  const browser = await chromium.launch();
  const erroresConsola: string[] = [];
  const fallos: string[] = [];

  // Login una sola vez; el estado (cookies de Supabase) se reutiliza en cada viewport.
  const contextoLogin = await browser.newContext();
  await iniciarSesion(contextoLogin);
  await contextoLogin.close();

  for (const clave of seleccion) {
    const vp = VIEWPORTS[clave];
    const carpeta = join(SALIDA, `${vp.width}x${vp.height}`);
    await mkdir(carpeta, { recursive: true });

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.movil ? 2 : 1,
      hasTouch: vp.movil ?? false,
      isMobile: vp.width < 768,
      storageState: ESTADO_SESION,
    });
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") erroresConsola.push(`[${clave}] ${page.url()} → ${msg.text()}`);
    });

    for (const escena of escenas) {
      const base = nombreArchivo(escena.ruta);
      try {
        await page.goto(`${BASE_URL}${escena.ruta}`, { waitUntil: "load" });
        // networkidle espera las queries iniciales (permisos, listados); si algo hace polling, seguimos igual.
        await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
        await esperarDatos(page);
        await page.screenshot({ path: join(carpeta, `${base}.png`), fullPage: true });
      } catch (e) {
        fallos.push(`[${clave}] ${escena.ruta}: ${(e as Error).message.split("\n")[0]}`);
        continue;
      }

      for (const modal of escena.modales ?? []) {
        try {
          await modal.abrir(page);
          await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
          await esperarDatos(page);
          await page.screenshot({ path: join(carpeta, `${base}--${modal.nombre}.png`) });
          await page.keyboard.press("Escape");
          await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 5_000 });
        } catch (e) {
          fallos.push(
            `[${clave}] ${escena.ruta} → ${modal.nombre}: ${(e as Error).message.split("\n")[0]}`,
          );
          await page.goto(`${BASE_URL}${escena.ruta}`, { waitUntil: "load" }).catch(() => {});
        }
      }
    }
    await context.close();
    console.log(`✓ ${vp.width}x${vp.height} → ${carpeta}`);
  }

  await browser.close();

  const resumen = [
    `# Resumen ${new Date().toISOString()}`,
    `Base: ${BASE_URL}`,
    `Viewports: ${seleccion.join(", ")}`,
    "",
    `## Fallos (${fallos.length})`,
    ...fallos.map((f) => `- ${f}`),
    "",
    `## Errores de consola (${erroresConsola.length})`,
    ...erroresConsola.map((e) => `- ${e}`),
  ].join("\n");
  await writeFile(join(SALIDA, "resumen.md"), resumen);
  console.log(resumen);
  if (fallos.length) process.exitCode = 2;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

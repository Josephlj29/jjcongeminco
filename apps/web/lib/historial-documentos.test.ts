import { describe, expect, it } from "vitest";
import { leerFiltrosHistorial } from "./historial-documentos";

const leer = (qs: string) => leerFiltrosHistorial(new URLSearchParams(qs));

describe("leerFiltrosHistorial", () => {
  it("sin parámetros: página 1 de 20, sin filtros", () => {
    expect(leer("")).toEqual({
      pagina: 1,
      limit: 20,
      desde: null,
      hasta: null,
      tipo: null,
      situacion: null,
      q: "",
      registradoPor: "",
      idProducto: null,
    });
  });

  it("acota página y límite a rangos válidos", () => {
    expect(leer("pagina=0&limit=9999")).toMatchObject({ pagina: 1, limit: 100 });
    expect(leer("pagina=abc&limit=-3")).toMatchObject({ pagina: 1, limit: 1 });
    expect(leer("pagina=4&limit=50")).toMatchObject({ pagina: 4, limit: 50 });
  });

  it("acepta solo fechas YYYY-MM-DD reales", () => {
    expect(leer("desde=2026-09-01&hasta=2026-09-30")).toMatchObject({
      desde: "2026-09-01",
      hasta: "2026-09-30",
    });
    // 31 de febrero no existe: se ignora en vez de mandarle basura a Postgres.
    expect(leer("desde=2026-02-31&hasta=01/09/2026")).toMatchObject({ desde: null, hasta: null });
  });

  it("si el rango viene al revés lo da vuelta", () => {
    expect(leer("desde=2026-10-31&hasta=2026-10-01")).toMatchObject({
      desde: "2026-10-01",
      hasta: "2026-10-31",
    });
  });

  it("tipo y situación solo con valores conocidos", () => {
    expect(leer("tipo=salida&situacion=anulado")).toMatchObject({
      tipo: "salida",
      situacion: "anulado",
    });
    expect(leer("tipo=robo&situacion=borrado")).toMatchObject({ tipo: null, situacion: null });
  });

  it("limpia los textos para que no rompan el filtro de PostgREST", () => {
    // Coma y paréntesis separan condiciones en or=(...); % y * son comodines.
    expect(leer("q=F001-23,(4%)").q).toBe("F001-23 4");
    expect(leer("registradoPor=  Juan   Pérez  ").registradoPor).toBe("Juan Pérez");
  });

  it("idProducto solo si es un uuid", () => {
    const uuid = "5ef7c580-7929-44ad-aff4-7b8960d87a21";
    expect(leer(`idProducto=${uuid}`).idProducto).toBe(uuid);
    expect(leer("idProducto=1 or 1=1").idProducto).toBeNull();
  });
});

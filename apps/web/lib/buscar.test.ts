import { describe, expect, it } from "vitest";
import { coincideBusqueda, normalizarTexto } from "./buscar";

describe("normalizarTexto", () => {
  it("baja a minúsculas y quita acentos", () => {
    expect(normalizarTexto("Cañería")).toBe("caneria");
    expect(normalizarTexto("ACEITE HIDRÁULICO")).toBe("aceite hidraulico");
  });

  it("deja intactos los textos que ya están normalizados", () => {
    expect(normalizarTexto("faro-003")).toBe("faro-003");
    expect(normalizarTexto("")).toBe("");
  });
});

describe("coincideBusqueda", () => {
  const producto = ["Faro cuadrado multivoltaje", "FARO-003", "LUZ-88/A"];

  it("encuentra por cualquiera de los campos", () => {
    expect(coincideBusqueda(producto, "faro cuadrado")).toBe(true);
    expect(coincideBusqueda(producto, "FARO-003")).toBe(true);
    expect(coincideBusqueda(producto, "LUZ-88")).toBe(true);
  });

  it("encuentra por el código del proveedor, que es el caso que faltaba", () => {
    expect(coincideBusqueda(producto, "luz-88/a")).toBe(true);
  });

  it("ignora acentos y mayúsculas en ambos lados", () => {
    expect(coincideBusqueda(["Cañería de alta presión"], "caneria")).toBe(true);
    expect(coincideBusqueda(["Caneria de alta presion"], "CAÑERÍA")).toBe(true);
  });

  it("con término vacío o en blanco no filtra nada", () => {
    expect(coincideBusqueda(producto, "")).toBe(true);
    expect(coincideBusqueda(producto, "   ")).toBe(true);
  });

  it("recorta el término antes de comparar", () => {
    expect(coincideBusqueda(producto, "  faro-003  ")).toBe(true);
  });

  it("descarta lo que no coincide en ningún campo", () => {
    expect(coincideBusqueda(producto, "filtro")).toBe(false);
  });

  it("tolera campos nulos o ausentes sin romperse", () => {
    expect(coincideBusqueda([null, undefined, "FARO-003"], "faro")).toBe(true);
    expect(coincideBusqueda([null, undefined], "faro")).toBe(false);
  });

  it("no cruza el límite entre campos distintos", () => {
    // "multivoltaje FARO" no existe en ningún campo por separado: los campos no
    // se concatenan en una sola cadena buscable.
    expect(coincideBusqueda(producto, "multivoltaje faro")).toBe(false);
  });
});

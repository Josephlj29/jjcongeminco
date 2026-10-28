import { describe, expect, it } from "vitest";
import {
  esFamilia,
  esSinCategoriaReal,
  idsFamilias,
  opcionesParaAsignar,
  opcionesParaFiltrar,
  soloCategorias,
  soloFamilias,
  type CategoriaBasica,
} from "./categorias";

/* El caso real que destapó el problema: la familia FAM-FIL y la categoría
   CAT-FILTRO se llaman las DOS "Filtros". En una lista plana son dos filas
   idénticas y hay que adivinar cuál es cuál. */
const FAM_FIL: CategoriaBasica = {
  Id: "f-fil",
  IdCategoriaPadre: null,
  Codigo: "FAM-FIL",
  Nombre: "Filtros",
};
const CAT_FILTRO: CategoriaBasica = {
  Id: "c-filtro",
  IdCategoriaPadre: "f-fil",
  Codigo: "CAT-FILTRO",
  Nombre: "Filtros",
};
const FAM_ELE: CategoriaBasica = {
  Id: "f-ele",
  IdCategoriaPadre: null,
  Codigo: "FAM-ELE",
  Nombre: "Sistema eléctrico",
};
const CAT_FOCO: CategoriaBasica = {
  Id: "c-foco",
  IdCategoriaPadre: "f-ele",
  Codigo: "CAT-FOCO",
  Nombre: "Focos y faros",
};
const CAT_FUSIBLE: CategoriaBasica = {
  Id: "c-fusible",
  IdCategoriaPadre: "f-ele",
  Codigo: "CAT-FUSIBLE",
  Nombre: "Fusibles",
};
/* FAM-REP sigue activa a propósito: es el corral de los productos que todavía
   no se repartieron. Justo la que el formulario NO debe ofrecer. */
const FAM_REP: CategoriaBasica = {
  Id: "f-rep",
  IdCategoriaPadre: null,
  Codigo: "FAM-REP",
  Nombre: "Repuestos",
};

const CATALOGO = [FAM_FIL, CAT_FILTRO, FAM_ELE, CAT_FOCO, CAT_FUSIBLE, FAM_REP];

describe("esFamilia", () => {
  it("una familia es raíz: no cuelga de nadie", () => {
    expect(esFamilia(FAM_FIL)).toBe(true);
    expect(esFamilia(FAM_REP)).toBe(true);
  });

  it("una categoría cuelga de una familia", () => {
    expect(esFamilia(CAT_FILTRO)).toBe(false);
    expect(esFamilia(CAT_FOCO)).toBe(false);
  });
});

describe("soloCategorias / soloFamilias", () => {
  it("parte el catálogo plano en los dos niveles", () => {
    expect(soloCategorias(CATALOGO).map((c) => c.Codigo)).toEqual([
      "CAT-FILTRO",
      "CAT-FOCO",
      "CAT-FUSIBLE",
    ]);
    expect(soloFamilias(CATALOGO).map((c) => c.Codigo)).toEqual(["FAM-FIL", "FAM-ELE", "FAM-REP"]);
  });

  it("con la lista vacía o sin cargar devuelve vacío, no explota", () => {
    expect(soloCategorias([])).toEqual([]);
    expect(soloCategorias(undefined)).toEqual([]);
    expect(soloFamilias(undefined)).toEqual([]);
  });
});

describe("idsFamilias / esSinCategoriaReal", () => {
  it("un producto colgado de una familia no tiene categoría real", () => {
    const familias = idsFamilias(CATALOGO);
    expect(esSinCategoriaReal("f-rep", familias)).toBe(true);
    expect(esSinCategoriaReal("f-fil", familias)).toBe(true);
  });

  it("un producto en una categoría real sí la tiene", () => {
    const familias = idsFamilias(CATALOGO);
    expect(esSinCategoriaReal("c-filtro", familias)).toBe(false);
    expect(esSinCategoriaReal("c-foco", familias)).toBe(false);
  });

  it("sin categoría o con el catálogo sin cargar no afirma nada", () => {
    expect(esSinCategoriaReal(null, idsFamilias(CATALOGO))).toBe(false);
    expect(esSinCategoriaReal("f-rep", idsFamilias(undefined))).toBe(false);
  });
});

describe("opcionesParaAsignar", () => {
  const opciones = opcionesParaAsignar(CATALOGO);

  it("NUNCA ofrece una familia: un producto va en una categoría", () => {
    expect(opciones.map((o) => o.codigo)).not.toContain("FAM-REP");
    expect(opciones.map((o) => o.codigo)).not.toContain("FAM-FIL");
    expect(opciones).toHaveLength(3);
  });

  it("agrupa por familia: ordena por familia y después por categoría", () => {
    expect(opciones.map((o) => o.codigo)).toEqual(["CAT-FILTRO", "CAT-FOCO", "CAT-FUSIBLE"]);
  });

  it("cada opción dice de qué familia cuelga, así 'Filtros' deja de ser ambiguo", () => {
    const filtro = opciones.find((o) => o.codigo === "CAT-FILTRO");
    expect(filtro?.label).toBe("Filtros");
    expect(filtro?.descripcion).toBe("FAM-FIL Filtros");
  });

  it("el value es el Id, que es lo que guarda el producto", () => {
    expect(opciones.find((o) => o.codigo === "CAT-FOCO")?.value).toBe("c-foco");
  });

  it("una categoría cuya familia no está en la lista no se pierde: queda al final", () => {
    const huerfana: CategoriaBasica = {
      Id: "c-rara",
      IdCategoriaPadre: "f-que-no-vino",
      Codigo: "CAT-RARA",
      Nombre: "Rara",
    };
    const conHuerfana = opcionesParaAsignar([...CATALOGO, huerfana]);
    expect(conHuerfana).toHaveLength(4);
    expect(conHuerfana.at(-1)?.codigo).toBe("CAT-RARA");
    expect(conHuerfana.at(-1)?.descripcion).toBe("Sin familia");
  });
});

describe("opcionesParaFiltrar", () => {
  const opciones = opcionesParaFiltrar(CATALOGO);

  it("incluye las familias, porque filtrar u operar por familia es válido", () => {
    expect(opciones).toHaveLength(6);
    expect(opciones.map((o) => o.codigo)).toContain("FAM-REP");
  });

  it("marca la familia como tal: las dos 'Filtros' se distinguen de un vistazo", () => {
    const familia = opciones.find((o) => o.codigo === "FAM-FIL");
    const categoria = opciones.find((o) => o.codigo === "CAT-FILTRO");
    expect(familia?.label).toBe("Filtros");
    expect(categoria?.label).toBe("Filtros");
    expect(familia?.descripcion).not.toBe(categoria?.descripcion);
    expect(familia?.descripcion).toBe("Familia (agrupa categorías)");
  });

  it("pone la familia antes que sus categorías", () => {
    const codigos = opciones.map((o) => o.codigo);
    expect(codigos.indexOf("FAM-ELE")).toBeLessThan(codigos.indexOf("CAT-FOCO"));
    expect(codigos.indexOf("FAM-FIL")).toBeLessThan(codigos.indexOf("CAT-FILTRO"));
  });
});

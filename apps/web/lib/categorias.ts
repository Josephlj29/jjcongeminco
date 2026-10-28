/**
 * lib/categorias.ts — la forma del catálogo de dos niveles (familia > categoría).
 *
 * La migración 0080 dejó el árbol en dos niveles: las FAMILIAS son raíz
 * (IdCategoriaPadre = null) y toda CATEGORÍA cuelga de una. Pero la API
 * devuelve las dos cosas en una sola lista plana, así que cada pantalla tiene
 * que decidir qué ofrece:
 *
 *   - asignar la categoría de un producto → SOLO categorías reales;
 *   - filtrar u operar en bloque          → familias también, pero marcadas.
 *
 * Sin esta distinción el selector del formulario muestra 49 opciones
 * indistinguibles con "Filtros" repetido (la familia FAM-FIL y la categoría
 * CAT-FILTRO se llaman igual), y quien reclasifica puede volver a elegir la
 * familia que justamente hay que dejar de usar.
 *
 * Es lógica pura y en memoria, como lib/buscar.ts: ni red ni React, para que se
 * pueda testear sola.
 */

/** Lo mínimo que necesitamos de una fila de inv.T_Categoria. */
export interface CategoriaBasica {
  Id: string;
  IdCategoriaPadre: string | null;
  Codigo: string;
  Nombre: string;
}

/** Compatible con OpcionCombobox: `codigo` y `descripcion` también se buscan. */
export interface OpcionCategoria {
  value: string;
  label: string;
  codigo: string;
  descripcion: string;
}

const SIN_FAMILIA = "Sin familia";
const ES_FAMILIA = "Familia (agrupa categorías)";

/** Una familia es raíz: no cuelga de nadie. */
export function esFamilia(categoria: CategoriaBasica): boolean {
  return categoria.IdCategoriaPadre === null;
}

/** Las categorías reales, las que cuelgan de una familia. */
export function soloCategorias(lista: readonly CategoriaBasica[] | undefined): CategoriaBasica[] {
  return (lista ?? []).filter((c) => !esFamilia(c));
}

/** Las familias, el primer nivel. */
export function soloFamilias(lista: readonly CategoriaBasica[] | undefined): CategoriaBasica[] {
  return (lista ?? []).filter(esFamilia);
}

/** Ids de las familias: con esto se detecta un producto sin categoría real. */
export function idsFamilias(lista: readonly CategoriaBasica[] | undefined): Set<string> {
  return new Set(soloFamilias(lista).map((f) => f.Id));
}

/**
 * Un producto cuyo IdCategoria apunta a una FAMILIA está sin clasificar: la
 * familia es un corral, no un destino. Son los que hay que repartir a mano.
 */
export function esSinCategoriaReal(
  idCategoria: string | null | undefined,
  familias: ReadonlySet<string>,
): boolean {
  return !!idCategoria && familias.has(idCategoria);
}

/** La familia de una categoría, si vino en la lista. */
function familiaDe(
  categoria: CategoriaBasica,
  porId: ReadonlyMap<string, CategoriaBasica>,
): CategoriaBasica | undefined {
  return categoria.IdCategoriaPadre ? porId.get(categoria.IdCategoriaPadre) : undefined;
}

function comparar(a: string, b: string): number {
  return a.localeCompare(b, "es");
}

/**
 * Opciones para ASIGNAR la categoría de un producto.
 *
 * Nunca ofrece una familia, y cada opción dice de qué familia cuelga, así
 * "Filtros" deja de ser ambiguo. Ordena por el NOMBRE de la familia (el texto
 * que la persona lee, no el código) y después por categoría, para que la lista
 * se lea agrupada. Una categoría cuya familia no vino en la lista no se
 * esconde: queda al final marcada como "Sin familia", porque ocultarla sería
 * perderla sin avisar.
 */
export function opcionesParaAsignar(
  lista: readonly CategoriaBasica[] | undefined,
): OpcionCategoria[] {
  const porId = new Map((lista ?? []).map((c) => [c.Id, c]));

  return soloCategorias(lista)
    .map((c) => {
      const familia = familiaDe(c, porId);
      return {
        orden: familia ? familia.Nombre : "",
        huerfana: !familia,
        opcion: {
          value: c.Id,
          label: c.Nombre,
          codigo: c.Codigo,
          descripcion: familia ? `${familia.Codigo} ${familia.Nombre}` : SIN_FAMILIA,
        },
      };
    })
    .sort((a, b) => {
      /* Las huérfanas al final: no tienen familia con la que ordenarse. */
      if (a.huerfana !== b.huerfana) return a.huerfana ? 1 : -1;
      return comparar(a.orden, b.orden) || comparar(a.opcion.label, b.opcion.label);
    })
    .map((x) => x.opcion);
}

/**
 * Opciones para FILTRAR u operar en bloque.
 *
 * Acá la familia sí es una elección válida ("todos los consumibles"), pero
 * tiene que verse como familia. Cada familia aparece seguida de sus categorías.
 */
export function opcionesParaFiltrar(
  lista: readonly CategoriaBasica[] | undefined,
): OpcionCategoria[] {
  const porId = new Map((lista ?? []).map((c) => [c.Id, c]));
  const familias = soloFamilias(lista).sort((a, b) => comparar(a.Nombre, b.Nombre));
  const hijasDe = new Map<string, CategoriaBasica[]>();
  const huerfanas: CategoriaBasica[] = [];

  for (const c of soloCategorias(lista)) {
    const idFamilia = c.IdCategoriaPadre!;
    if (!porId.has(idFamilia)) {
      huerfanas.push(c);
      continue;
    }
    hijasDe.set(idFamilia, [...(hijasDe.get(idFamilia) ?? []), c]);
  }

  const opcion = (c: CategoriaBasica, descripcion: string): OpcionCategoria => ({
    value: c.Id,
    label: c.Nombre,
    codigo: c.Codigo,
    descripcion,
  });

  return [
    ...familias.flatMap((f) => [
      opcion(f, ES_FAMILIA),
      ...(hijasDe.get(f.Id) ?? [])
        .sort((a, b) => comparar(a.Nombre, b.Nombre))
        .map((c) => opcion(c, `${f.Codigo} ${f.Nombre}`)),
    ]),
    ...huerfanas
      .sort((a, b) => comparar(a.Nombre, b.Nombre))
      .map((c) => opcion(c, SIN_FAMILIA)),
  ];
}

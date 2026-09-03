/**
 * lib/serializar.ts
 *
 * Serialización estable: mismo contenido, mismo string, sin importar en qué
 * orden se hayan agregado las claves.
 *
 * Nace de un bug concreto del borrador de formularios (hooks/useBorradorFormulario):
 * ahí se compara "¿el formulario está como recién abierto?" contra los valores
 * iniciales, y `JSON.stringify` respeta el orden de inserción, así que dos objetos
 * con el mismo contenido pero distinto orden de claves dan strings distintos.
 * react-hook-form agrega las claves a medida que los campos se registran, o sea
 * que ese orden no está garantizado. Sin normalizar, un formulario intacto puede
 * verse como "sucio" y disparar el cartel de borrador recuperado sin nada que
 * recuperar.
 */

/** Ordena las claves de todo objeto anidado y descarta las de valor undefined. */
export function normalizar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(normalizar);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor as Record<string, unknown>)
        // undefined no sobrevive a JSON.stringify: se descarta acá también, para
        // que los dos lados de una comparación coincidan.
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalizar(v)]),
    );
  }
  return valor;
}

/**
 * JSON con las claves ordenadas en todos los niveles. Sirve para comparar dos
 * estructuras por contenido; NO para persistir algo que después se lea por clave,
 * porque reordena.
 *
 * El orden de los ARRAYS se respeta: en un detalle de requerimiento el orden de
 * las líneas es parte del dato, no ruido.
 */
export function serializarEstable(valor: unknown): string {
  return JSON.stringify(normalizar(valor));
}

import { describe, it, expect } from "vitest";
import { serializarEstable } from "./serializar";

describe("serializarEstable", () => {
  it("da el mismo string aunque cambie el orden de las claves", () => {
    expect(serializarEstable({ a: 1, b: 2 })).toBe(serializarEstable({ b: 2, a: 1 }));
  });

  it("ordena también en los objetos anidados", () => {
    const uno = { Detalle: [{ Cantidad: 1, IdProducto: "x" }] };
    const otro = { Detalle: [{ IdProducto: "x", Cantidad: 1 }] };
    expect(serializarEstable(uno)).toBe(serializarEstable(otro));
  });

  it("descarta las claves con undefined, igual que JSON.stringify", () => {
    // Es el caso real del borrador: react-hook-form agrega el campo cuando se
    // registra, con valor undefined, y eso no debe contar como "el usuario cargó algo".
    expect(serializarEstable({ a: 1, Origen: undefined })).toBe(serializarEstable({ a: 1 }));
  });

  it("respeta el orden de los arrays, que ahí sí es parte del dato", () => {
    expect(serializarEstable([1, 2])).not.toBe(serializarEstable([2, 1]));
  });

  it("distingue contenidos distintos", () => {
    expect(serializarEstable({ Cantidad: 1 })).not.toBe(serializarEstable({ Cantidad: 2 }));
  });

  it("no confunde el número con su texto", () => {
    expect(serializarEstable({ Cantidad: 1 })).not.toBe(serializarEstable({ Cantidad: "1" }));
  });

  it("maneja null sin romperse ni tratarlo como objeto", () => {
    expect(serializarEstable({ Notas: null })).toBe('{"Notas":null}');
  });

  it("detecta un formulario recién abierto contra uno con datos", () => {
    const vacio = { FechaRequerimiento: "2026-09-03", IdsPersonalSolicitante: [], Detalle: [] };
    // Mismo contenido, otro orden de claves: tiene que dar igual.
    const intacto = { Detalle: [], FechaRequerimiento: "2026-09-03", IdsPersonalSolicitante: [] };
    const cargado = { ...vacio, Detalle: [{ IdProducto: "abc", Cantidad: 2 }] };
    expect(serializarEstable(intacto)).toBe(serializarEstable(vacio));
    expect(serializarEstable(cargado)).not.toBe(serializarEstable(vacio));
  });
});

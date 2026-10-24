import { describe, expect, it } from "vitest";
import { ubicacionConsumoPorDefecto, ubicacionesConsumo } from "./ubicaciones-consumo";

const tambomayo = { Id: "tam", Nombre: "Proyecto Tambomayo" };
const arequipa = { Id: "aqp", Nombre: "Almacén Central - Arequipa" };
const todas = [arequipa, tambomayo];

describe("ubicacionesConsumo", () => {
  it("sin restricción (null) ofrece todos los almacenes", () => {
    expect(ubicacionesConsumo(todas, null)).toEqual(todas);
  });

  it("con restricción ofrece solo los permitidos", () => {
    expect(ubicacionesConsumo(todas, ["tam"])).toEqual([tambomayo]);
  });

  it("mientras cargan los datos no ofrece nada", () => {
    expect(ubicacionesConsumo(undefined, ["tam"])).toEqual([]);
  });
});

describe("ubicacionConsumoPorDefecto", () => {
  it("con un único almacén permitido lo preselecciona", () => {
    expect(ubicacionConsumoPorDefecto([tambomayo], "")).toBe("tam");
  });

  it("no pisa una elección ya hecha que sigue siendo válida", () => {
    expect(ubicacionConsumoPorDefecto(todas, "aqp")).toBe("aqp");
  });

  it("reemplaza una elección que ya no está permitida", () => {
    expect(ubicacionConsumoPorDefecto([tambomayo], "aqp")).toBe("tam");
  });

  it("con varios almacenes y sin elección deja que el usuario elija", () => {
    expect(ubicacionConsumoPorDefecto(todas, "")).toBe("");
  });

  it("mientras cargan los datos conserva lo elegido", () => {
    expect(ubicacionConsumoPorDefecto([], "aqp")).toBe("aqp");
  });
});

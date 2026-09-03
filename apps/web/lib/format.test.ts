import { describe, it, expect } from "vitest";
import { moneda, numero, fechaISO, fechaCorta, fechaHora, hoyLima, porcentaje } from "./format";

describe("moneda", () => {
  it("formatea con símbolo S/ y 2 decimales", () => {
    expect(moneda(1234.5)).toBe("S/ 1,234.50");
    expect(moneda(0)).toBe("S/ 0.00");
  });
});

describe("numero", () => {
  it("agrega separador de miles", () => {
    expect(numero(1234567)).toBe("1,234,567");
  });
});

describe("fechaISO (día calendario en hora de Lima)", () => {
  it("devuelve YYYY-MM-DD", () => {
    expect(fechaISO(new Date("2026-08-28T12:00:00Z"))).toBe("2026-08-28");
  });

  /* Regresión del bug de un día: Lima es UTC−5, así que entre las 19:00 y 23:59
     hora Lima el instante ya cayó en el día siguiente en UTC. `toISOString()`
     devolvía ese día siguiente y contaminaba FechaOrden/FechaRequerimiento y el
     N° de orden (que se arma desde la fecha). */
  it("a las 20:30 de Lima sigue siendo el MISMO día, no el siguiente", () => {
    // 2026-09-04T01:30Z === 2026-09-03 20:30 en Lima
    const instante = new Date("2026-09-04T01:30:00Z");
    expect(instante.toISOString().split("T")[0]).toBe("2026-09-04"); // lo que fallaba
    expect(fechaISO(instante)).toBe("2026-09-03"); // lo correcto
  });

  it("a las 00:30 de Lima ya es el día nuevo", () => {
    // 2026-09-03T05:30Z === 2026-09-03 00:30 en Lima
    expect(fechaISO(new Date("2026-09-03T05:30:00Z"))).toBe("2026-09-03");
  });

  it("no adelanta el día justo antes de medianoche en Lima", () => {
    // 2026-09-04T04:59Z === 2026-09-03 23:59 en Lima
    expect(fechaISO(new Date("2026-09-04T04:59:00Z"))).toBe("2026-09-03");
  });

  it("hoyLima devuelve formato YYYY-MM-DD", () => {
    expect(hoyLima()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("fechaCorta con columnas DATE (día calendario)", () => {
  /* Regresión: FechaOrden/FechaDocumento/FechaRequerimiento son DATE y llegan
     como "YYYY-MM-DD". `new Date("2026-09-03")` es medianoche UTC, así que al
     renderizar en Lima (UTC−5) retrocedía al día anterior: la grilla de OTs
     mostraba un día MENOS que la fecha del propio N° de orden. Una DATE no se
     convierte de zona: es el día, punto. */
  it("muestra la DATE tal cual, sin correr el día", () => {
    expect(fechaCorta("2026-09-03")).toBe("03/09/2026");
    expect(fechaCorta("2026-09-01")).toBe("01/09/2026");
    expect(fechaCorta("2026-08-31")).toBe("31/08/2026");
  });

  it("no se cuelga del parseo UTC de un string pelado", () => {
    // Lo que hacía antes y estaba mal:
    expect(
      new Date("2026-09-03").toLocaleDateString("es-PE", { timeZone: "America/Lima" }),
    ).not.toBe("3/9/2026");
    // Lo correcto:
    expect(fechaCorta("2026-09-03")).toBe("03/09/2026");
  });

  it("respeta el primer día del mes (el caso más frágil)", () => {
    expect(fechaCorta("2026-01-01")).toBe("01/01/2026");
  });
});

describe("fechaCorta / fechaHora fijadas a Lima", () => {
  it("no corren el día por la zona del dispositivo", () => {
    // 20:30 de Lima: el día mostrado debe ser 03, no 04.
    expect(fechaCorta(new Date("2026-09-04T01:30:00Z"))).toBe("03/09/2026");
  });

  it("un TIMESTAMPTZ con offset sí se convierte a Lima", () => {
    expect(fechaCorta("2026-09-04T01:30:00Z")).toBe("03/09/2026");
  });

  it("muestra la hora de Lima, no UTC", () => {
    // toLocaleString intercala coma entre fecha y hora ("03/09/2026, 20:30").
    expect(fechaHora(new Date("2026-09-04T01:30:00Z"))).toMatch(/^03\/09\/2026,? 20:30$/);
  });
});

describe("fechaCorta", () => {
  it("formatea es-PE dd/mm/yyyy desde ISO", () => {
    expect(fechaCorta("2026-08-28T00:00:00Z")).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});

describe("porcentaje", () => {
  it("convierte fracción a % entero por defecto", () => {
    expect(porcentaje(0.153)).toBe("15%");
    expect(porcentaje(-0.2)).toBe("-20%");
  });
});

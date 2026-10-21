import { describe, it, expect } from "vitest";
import {
  moneda,
  numero,
  fechaISO,
  fechaCorta,
  fechaHora,
  hoyLima,
  porcentaje,
  sumarDias,
  diasEntre,
  registroMovimiento,
} from "./format";

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

describe("sumarDias / diasEntre (aritmética de día calendario, sin zona)", () => {
  it("suma y resta días sobre YYYY-MM-DD cruzando mes y año", () => {
    expect(sumarDias("2026-09-11", -30)).toBe("2026-08-12");
    expect(sumarDias("2026-01-01", -1)).toBe("2025-12-31");
    expect(sumarDias("2026-02-28", 1)).toBe("2026-03-01");
    expect(sumarDias("2026-09-11", 0)).toBe("2026-09-11");
  });

  it("no depende de la zona del dispositivo ni de la hora del día", () => {
    // El bug histórico: new Date("2026-08-14") es medianoche UTC y en Lima es el
    // día anterior. La aritmética de calendario tiene que dar siempre lo mismo.
    expect(sumarDias("2026-08-14", -1)).toBe("2026-08-13");
    expect(sumarDias("2026-08-14", 0)).toBe("2026-08-14");
  });

  it("cuenta los días entre dos fechas calendario", () => {
    expect(diasEntre("2026-08-12", "2026-09-11")).toBe(30);
    expect(diasEntre("2026-09-11", "2026-09-11")).toBe(0);
    expect(diasEntre("2026-09-11", "2026-09-01")).toBe(-10);
  });
});

describe("registroMovimiento (fecha contable vs. fecha real de carga)", () => {
  // El caso que lo motivó: la carga inicial del 02/09 08:41 y una entrada
  // registrada el 04/09 23:37 pero fechada al 02/09 se veían idénticas en el
  // kardex, porque ambas muestran la fecha del documento.
  it("marca como retroactivo cuando se registró un día distinto al del documento", () => {
    const r = registroMovimiento("2026-09-02", "2026-09-05T04:37:00Z"); // 04/09 23:37 en Lima
    expect(r.retroactivo).toBe(true);
    expect(r.texto).toBe("04/09/2026 23:37");
  });

  it("si se registró el mismo día solo muestra la hora y no es retroactivo", () => {
    const r = registroMovimiento("2026-09-02", "2026-09-02T13:41:27Z"); // 02/09 08:41 en Lima
    expect(r.retroactivo).toBe(false);
    expect(r.texto).toBe("08:41");
  });

  it("compara el día en hora de Lima, no en UTC", () => {
    // 02/09 20:30 Lima es 03/09 01:30 UTC: en UTC parecería otro día.
    const r = registroMovimiento("2026-09-02", "2026-09-03T01:30:00Z");
    expect(r.retroactivo).toBe(false);
    expect(r.texto).toBe("20:30");
  });

  it("detecta también el documento fechado hacia adelante", () => {
    const r = registroMovimiento("2026-09-10", "2026-09-05T04:37:00Z");
    expect(r.retroactivo).toBe(true);
    expect(r.texto).toBe("04/09/2026 23:37");
  });

  it("sin fecha de registro no afirma nada", () => {
    expect(registroMovimiento("2026-09-02", null)).toEqual({ texto: "", retroactivo: false });
    expect(registroMovimiento("2026-09-02", "")).toEqual({ texto: "", retroactivo: false });
  });
});

describe("porcentaje", () => {
  it("convierte fracción a % entero por defecto", () => {
    expect(porcentaje(0.153)).toBe("15%");
    expect(porcentaje(-0.2)).toBe("-20%");
  });
});

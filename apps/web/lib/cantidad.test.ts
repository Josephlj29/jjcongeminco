import { describe, it, expect } from "vitest";
import { DECIMALES_CANTIDAD, PASO_CANTIDAD } from "@congeminco/shared";
import {
  esExpresion,
  formatearCantidad,
  parsearCantidad,
  redondear,
  type CodigoErrorCantidad,
} from "./cantidad";

/** Atajo: el valor parseado, o null si falló. */
function valor(texto: string, decimales?: number): number | null {
  const r = parsearCantidad(texto, decimales);
  return r.ok ? r.valor : null;
}

/** Atajo: el código de error, o null si pasó. */
function codigo(texto: string): CodigoErrorCantidad | null {
  const r = parsearCantidad(texto);
  return r.ok ? null : r.codigo;
}

describe("parsearCantidad — decimales", () => {
  it("acepta las formas normales de escribir un decimal", () => {
    expect(valor("1")).toBe(1);
    expect(valor("1.5")).toBe(1.5);
    expect(valor("0.25")).toBe(0.25);
    expect(valor(".5")).toBe(0.5);
    expect(valor("0")).toBe(0);
    expect(valor("  2  ")).toBe(2);
  });

  it("acepta la coma como separador decimal (es-PE)", () => {
    expect(valor("1,5")).toBe(1.5);
    expect(valor("0,25")).toBe(0.25);
  });

  it("acepta un punto final suelto: es el estado intermedio al tipear", () => {
    expect(valor("1.")).toBe(1);
  });

  it("trata la coma con grupos de tres como separador de miles", () => {
    // Al pegar desde Excel llega "1,234.5"; convertir la coma en decimal daría
    // un número mal escrito con dos separadores.
    expect(valor("1,234.5")).toBe(1234.5);
    expect(valor("12,345")).toBe(12345);
  });

  it('resuelve "1,500" como mil quinientos, no como 1.5', () => {
    // Ambiguo por construcción: gana el separador de miles porque es lo que
    // imprime la propia app y lo que llega desde una planilla.
    expect(valor("1,500")).toBe(1500);
  });

  it("rechaza el formato europeo con dos separadores", () => {
    expect(codigo("1.234,56")).toBe("numero_invalido");
  });
});

describe("parsearCantidad — fracciones", () => {
  it("divide la fracción escrita con barra", () => {
    expect(valor("1/4")).toBe(0.25);
    expect(valor("3/4")).toBe(0.75);
    expect(valor("1/5")).toBe(0.2);
    expect(valor("1/6")).toBe(0.167);
    expect(valor("1/3")).toBe(0.333);
    expect(valor("2/3")).toBe(0.667);
  });

  it("suma la parte entera del número mixto", () => {
    expect(valor("1 1/2")).toBe(1.5);
    expect(valor("2 3/4")).toBe(2.75);
  });

  it("expande las fracciones unicode que llegan al pegar texto", () => {
    expect(valor("½")).toBe(0.5);
    expect(valor("¾")).toBe(0.75);
    expect(valor("1 ½")).toBe(1.5);
  });

  it('"1½" pegado sin espacio da 1.5, no 5.5', () => {
    // Sin inyectar el espacio antes de expandir queda "11/2" = 5.5, que sería
    // un consumo diez veces mayor al real.
    expect(valor("1½")).toBe(1.5);
  });
});

describe("parsearCantidad — aritmética y precedencia", () => {
  it("resuelve las operaciones que hoy hacen con la calculadora del celular", () => {
    expect(valor("20/4")).toBe(5);
    expect(valor("2*3")).toBe(6);
    expect(valor("1+0.5")).toBe(1.5);
    expect(valor("100/8")).toBe(12.5);
  });

  it("respeta la precedencia de * y / sobre + y -", () => {
    expect(valor("2+3*4")).toBe(14);
    expect(valor("10-2/4")).toBe(9.5);
  });

  it("evalúa la división de izquierda a derecha", () => {
    expect(valor("1/4/2")).toBe(0.125);
  });

  it("acepta los operadores unicode de las planillas", () => {
    expect(valor("20÷4")).toBe(5);
    expect(valor("2×3")).toBe(6);
  });
});

describe("parsearCantidad — rechazos", () => {
  const casos: [string, CodigoErrorCantidad][] = [
    ["", "vacio"],
    ["   ", "vacio"],
    ["abc", "caracter_invalido"],
    ["1a", "caracter_invalido"],
    ["(1+2)", "caracter_invalido"],
    ["2**3", "caracter_invalido"],
    ["50%", "caracter_invalido"],
    ["1e3", "caracter_invalido"],
    ["12.5 LT", "caracter_invalido"],
    ["1..5", "numero_invalido"],
    ["1.2.3", "numero_invalido"],
    [".", "numero_invalido"],
    ["1+", "expresion_incompleta"],
    ["*3", "expresion_incompleta"],
    ["1/", "expresion_incompleta"],
    ["1/0", "division_por_cero"],
    ["0/0", "division_por_cero"],
    ["-5", "expresion_incompleta"],
    ["5-8", "negativo"],
  ];

  it.each(casos)("rechaza %j con código %s", (texto, esperado) => {
    expect(codigo(texto)).toBe(esperado);
  });

  it('rechaza "20 4" en vez de convertirlo en 204', () => {
    // Borrar el espacio entre dígitos sería inventar stock: 204 unidades donde
    // el operario quiso decir 20 y 4 son cosas muy distintas.
    expect(codigo("20 4")).toBe("expresion_incompleta");
    expect(codigo("1 000")).toBe("expresion_incompleta");
  });

  it("rechaza un número que desborda al doble", () => {
    expect(codigo("9".repeat(400))).toBe("no_finito");
  });
});

describe("redondear (a prueba de artefactos de coma flotante)", () => {
  it("redondea al alza cuando el decimal exacto lo pide", () => {
    // toFixed(3) daría 1.000 porque el doble vale 1.00049999…
    expect(redondear(1.0005, 3)).toBe(1.001);
    expect(redondear(2.675, 2)).toBe(2.68);
    expect(redondear(8.575, 2)).toBe(8.58);
  });

  it("corta en la escala de la BD", () => {
    expect(redondear(1 / 3, 3)).toBe(0.333);
    expect(redondear(0.0005, 3)).toBe(0.001);
    expect(redondear(0.0004, 3)).toBe(0);
  });

  it("normaliza el cero negativo", () => {
    expect(Object.is(redondear(-0, 3), 0)).toBe(true);
  });
});

describe("formatearCantidad", () => {
  it("no deja ceros a la derecha ni separador de miles", () => {
    // Con separador de miles el texto no volvería a entrar por el parser igual:
    // por eso esta función no es `numero()` de lib/format.ts.
    expect(formatearCantidad(0.25)).toBe("0.25");
    expect(formatearCantidad(1)).toBe("1");
    expect(formatearCantidad(1.5)).toBe("1.5");
    expect(formatearCantidad(1234.5)).toBe("1234.5");
  });

  it("todo valor aceptado sobrevive la ida y vuelta", () => {
    for (const texto of ["1/4", "20/4", "1 1/2", "2+3*4", "1,5", "0.333", "1234.5"]) {
      const v = valor(texto);
      expect(v).not.toBeNull();
      expect(valor(formatearCantidad(v as number))).toBe(v);
    }
  });
});

describe("esExpresion (compuerta del eco)", () => {
  it("es verdadero cuando hay una operación que mostrar", () => {
    expect(esExpresion("1/4")).toBe(true);
    expect(esExpresion("1 1/2")).toBe(true);
    expect(esExpresion("½")).toBe(true);
    expect(esExpresion("2*3")).toBe(true);
  });

  it("es falso mientras se tipea un número normal, para que el eco no parpadee", () => {
    expect(esExpresion("1")).toBe(false);
    expect(esExpresion("1.")).toBe(false);
    expect(esExpresion("1.5")).toBe(false);
    expect(esExpresion("1,5")).toBe(false);
  });
});

describe("escala compartida con la BD", () => {
  it("el paso se deriva de los decimales", () => {
    // Si alguien cambia uno sin el otro, el redondeo del cliente y el
    // multipleOf del schema dejan de coincidir.
    expect(PASO_CANTIDAD).toBe(10 ** -DECIMALES_CANTIDAD);
  });

  it("parsea con la escala de cantidad por defecto", () => {
    expect(valor("1/3")).toBe(0.333);
    expect(valor("1/3", 4)).toBe(0.3333);
  });
});
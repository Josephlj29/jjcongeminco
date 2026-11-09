import { describe, expect, it } from "vitest";
import { armarSku, prefijoSku } from "./sku";

describe("prefijoSku", () => {
  it("usa el PrefijoSku de la categoría cuando existe", () => {
    expect(prefijoSku({ Codigo: "CAT-FILTRO", PrefijoSku: "FIL" })).toBe("FIL");
  });

  it("sin PrefijoSku, toma las 3 primeras letras del código sin CAT-/FAM- (igual que la BD)", () => {
    expect(prefijoSku({ Codigo: "CAT-EQUIPO-TALLER", PrefijoSku: null })).toBe("EQU");
    expect(prefijoSku({ Codigo: "fam-prueba" })).toBe("PRU");
  });

  it("devuelve null si el código no deja letras útiles", () => {
    expect(prefijoSku({ Codigo: "CAT---" })).toBeNull();
  });
});

describe("armarSku", () => {
  it("devuelve null sin categoría", () => {
    expect(armarSku(undefined, [])).toBeNull();
  });

  it("arma PREFIJO-NNNN con el primer correlativo libre", () => {
    const cat = { Codigo: "CAT-FILTRO", PrefijoSku: "FIL" };
    expect(armarSku(cat, [])).toBe("FIL-0001");
    expect(armarSku(cat, ["FIL-0001", "FIL-0003", "FOC-0002"])).toBe("FIL-0002");
  });

  it("compara sin distinguir mayúsculas e ignora SKUs de otro formato", () => {
    const cat = { Codigo: "CAT-FILTRO", PrefijoSku: "FIL" };
    expect(armarSku(cat, ["fil-0001", "FILTRO-002", "FIL-02"])).toBe("FIL-0002");
  });

  it("pasado el 9999 sigue sin truncar", () => {
    const cat = { Codigo: "CAT-FILTRO", PrefijoSku: "FIL" };
    const skus = Array.from({ length: 9999 }, (_, i) => `FIL-${String(i + 1).padStart(4, "0")}`);
    expect(armarSku(cat, skus)).toBe("FIL-10000");
  });
});

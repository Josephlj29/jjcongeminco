import { afterEach, describe, expect, it, vi } from "vitest";
import { esc, esperarImagenes } from "./imprimir";

describe("esc", () => {
  it("escapa lo necesario para texto y para atributos", () => {
    expect(esc(`<b>"x" & 'y'</b>`)).toBe("&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;");
  });

  it("trata null y undefined como cadena vacía y convierte números", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
    expect(esc(12.5)).toBe("12.5");
  });
});

type ImagenFalsa = {
  complete: boolean;
  naturalWidth: number;
  listeners: Partial<Record<"load" | "error", () => void>>;
  addEventListener(tipo: "load" | "error", fn: () => void): void;
};

function imagen(complete: boolean, naturalWidth = 1): ImagenFalsa {
  return {
    complete,
    naturalWidth,
    listeners: {},
    addEventListener(tipo, fn) {
      this.listeners[tipo] = fn;
    },
  };
}

describe("esperarImagenes", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sin imágenes resuelve de inmediato", async () => {
    await expect(esperarImagenes([])).resolves.toBeUndefined();
  });

  it("con todas completas no engancha listeners y avisa las que ya fallaron", async () => {
    const ok = imagen(true, 320);
    const rota = imagen(true, 0);
    const alFallar = vi.fn();

    await esperarImagenes([ok, rota], { alFallar });

    expect(ok.listeners.load).toBeUndefined();
    expect(rota.listeners.load).toBeUndefined();
    expect(alFallar).toHaveBeenCalledTimes(1);
    expect(alFallar).toHaveBeenCalledWith(rota);
  });

  it("espera a que las pendientes carguen o fallen y reporta la que falló", async () => {
    const carga = imagen(false);
    const falla = imagen(false);
    const alFallar = vi.fn();
    let resuelto = false;

    const promesa = esperarImagenes([carga, falla], { alFallar }).then(() => {
      resuelto = true;
    });

    carga.listeners.load?.();
    await Promise.resolve();
    expect(resuelto).toBe(false);

    falla.listeners.error?.();
    await promesa;

    expect(resuelto).toBe(true);
    expect(alFallar).toHaveBeenCalledTimes(1);
    expect(alFallar).toHaveBeenCalledWith(falla);
  });

  it("una imagen colgada no bloquea: resuelve al vencer el timeout", async () => {
    vi.useFakeTimers();
    const colgada = imagen(false);
    let resuelto = false;

    void esperarImagenes([colgada], { timeoutMs: 8000 }).then(() => {
      resuelto = true;
    });

    await vi.advanceTimersByTimeAsync(7999);
    expect(resuelto).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(resuelto).toBe(true);
  });
});

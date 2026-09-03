"use client";

/**
 * components/InputCantidad.tsx — Campo único de cantidad de TODO el sistema.
 *
 * Acepta lo de siempre (decimales con punto o coma) y además fracciones y
 * operaciones: `1/4`, `20/4`, `1 1/2`, `2*3`. La división la hace el sistema, no
 * la calculadora del celular. El parseo vive en lib/cantidad.ts.
 *
 * NO es type="number", y no puede serlo: el navegador descarta la barra, así que
 * `1/4` dejaría el campo vacío. Efecto colateral bienvenido: se termina el
 * incremento silencioso con la rueda del mouse sobre un campo enfocado, que hoy
 * cambia cantidades sin que nadie lo note.
 *
 * CONTRATO: el TEXTO que se ve vive acá adentro; el NÚMERO vive afuera. El padre
 * recibe `null` mientras lo escrito no sea un número válido, así que nunca ve un
 * NaN ni un cero que en realidad era un campo vacío.
 *
 * DECISIONES QUE NO SE VEN EN EL CÓDIGO:
 *
 *  - `max` AVISA, no recorta. El recorte silencioso (escribir 9 sobre un
 *    pendiente de 5 y que se entreguen 5) es un defecto de integridad: el
 *    operario nunca se enteraba. Quien use `max` deshabilita su botón de guardar.
 *
 *  - El eco "= 0.25" se muestra solo cuando lo escrito ES una operación. Con la
 *    regla más obvia ("mostrar si el texto no es el número final") aparecería y
 *    desaparecería mientras se tipea `1` → `1.` → `1.5`.
 *
 *  - Los atajos van en un desplegable y no en la fila: en la tabla de escritorio
 *    la celda de cantidad mide 112px y una hilera de botones la rompía.
 *
 *  - Los atajos SUMAN al valor actual, y por eso están rotulados con "+". La
 *    frase real es "litro y medio": se escribe 1, se toca +½ y queda 1.5. Si
 *    reemplazaran, ese 1 se perdería. De ahí también el botón de limpiar.
 *
 *  - La tecla "/" del desplegable existe porque el teclado decimal del celular
 *    NO tiene barra: es la única forma de escribir 1/7 desde el teléfono.
 */
import * as React from "react";
import { Divide, Eraser } from "lucide-react";
import { DECIMALES_CANTIDAD } from "@congeminco/shared";
import {
  esExpresion,
  formatearCantidad,
  parsearCantidad,
  redondear,
  UNIDADES_NO_FRACCIONABLES,
} from "@/lib/cantidad";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Fracciones más usadas en obra. Se SUMAN al valor actual. */
const ATAJOS: readonly { etiqueta: string; delta: number }[] = [
  { etiqueta: "+½", delta: 1 / 2 },
  { etiqueta: "+⅓", delta: 1 / 3 },
  { etiqueta: "+¼", delta: 1 / 4 },
  { etiqueta: "+⅕", delta: 1 / 5 },
  { etiqueta: "+⅙", delta: 1 / 6 },
  { etiqueta: "+⅛", delta: 1 / 8 },
  { etiqueta: "+⅔", delta: 2 / 3 },
  { etiqueta: "+¾", delta: 3 / 4 },
];

export interface InputCantidadProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "type" | "min" | "max" | "inputMode" | "step"
  > {
  value: number | null;
  onChange: (n: number | null) => void;
  /** Código de unidad del producto ("LT"), para el eco y el aviso de fracción. */
  unidad?: string;
  /** Inclusivo. Los campos que exigen cantidad positiva pasan PASO_CANTIDAD. */
  min?: number;
  /** Inclusivo. Avisa, nunca recorta. */
  max?: number;
  /** Qué es ese máximo, para el mensaje: "pendiente" → "Máximo 5 (pendiente)". */
  etiquetaMax?: string;
  /** Escala. Por defecto la de cantidad; los costos pasan DECIMALES_COSTO. */
  decimales?: number;
  /** El desplegable de fracciones. Se apaga donde no aporta (stock mínimo). */
  atajos?: boolean;
}

export function InputCantidad({
  value,
  onChange,
  unidad,
  min = 0,
  max,
  etiquetaMax,
  decimales = DECIMALES_CANTIDAD,
  atajos = true,
  className,
  disabled,
  id,
  onBlur,
  onFocus,
  onKeyDown,
  ...resto
}: InputCantidadProps) {
  const [texto, setTexto] = React.useState(() =>
    value === null || value === undefined ? "" : formatearCantidad(value, decimales),
  );
  const [enfocado, setEnfocado] = React.useState(false);
  const refInput = React.useRef<HTMLInputElement>(null);
  /* Lo último que le avisamos al padre. Es lo que distingue "el padre nos
     devolvió lo nuestro" de "el valor cambió desde afuera y hay que repintar",
     que es el caso real cuando useFieldArray borra una línea del medio y los
     valores se corren una posición. */
  const ultimoEmitido = React.useRef<number | null>(value ?? null);

  const idBase = React.useId();
  const idAyuda = `${id ?? idBase}-ayuda`;

  const resultado = React.useMemo(() => parsearCantidad(texto, decimales), [texto, decimales]);
  const valor = resultado.ok ? resultado.valor : null;

  const excedeMax = valor !== null && max !== undefined && valor > max;
  const bajaDeMin = valor !== null && valor < min;
  const fueraRango = excedeMax || bajaDeMin;

  /* Mientras se tipea, un texto que termina en operador está a medio escribir:
     marcar `1/` en rojo sería castigar al operario a mitad de camino. */
  const esperandoMas =
    !resultado.ok && resultado.codigo === "expresion_incompleta" && /[+\-*/]$/.test(texto.trim());

  const errorParseo = !resultado.ok && resultado.codigo !== "vacio" && !(enfocado && esperandoMas);
  const mensajeError = excedeMax
    ? `Máximo ${formatearCantidad(max as number, decimales)}${etiquetaMax ? ` (${etiquetaMax})` : ""}`
    : bajaDeMin
      ? `Mínimo ${formatearCantidad(min, decimales)}`
      : !resultado.ok
        ? resultado.mensaje
        : "";
  const hayError = (errorParseo || fueraRango) && mensajeError !== "";

  const mostrarEco = valor !== null && !fueraRango && esExpresion(texto);
  const avisoFraccion =
    valor !== null &&
    !hayError &&
    !!unidad &&
    UNIDADES_NO_FRACCIONABLES.has(unidad.toUpperCase()) &&
    valor % 1 !== 0;

  /** Único camino de escritura: mantiene texto, valor emitido y padre en fase. */
  const aplicarTexto = (nuevo: string) => {
    setTexto(nuevo);
    const r = parsearCantidad(nuevo, decimales);
    const v = r.ok ? r.valor : null;
    ultimoEmitido.current = v;
    onChange(v);
  };

  const canonizar = () => {
    if (resultado.ok) setTexto(formatearCantidad(resultado.valor, decimales));
  };

  React.useEffect(() => {
    const externo = value ?? null;
    if (externo !== ultimoEmitido.current) {
      ultimoEmitido.current = externo;
      setTexto(externo === null ? "" : formatearCantidad(externo, decimales));
    }
  }, [value, decimales]);

  const sumar = (delta: number) => {
    aplicarTexto(formatearCantidad(redondear((valor ?? 0) + delta, decimales), decimales));
    refInput.current?.focus();
  };

  const insertarBarra = () => {
    aplicarTexto(texto.endsWith("/") ? texto : `${texto}/`);
    refInput.current?.focus();
  };

  return (
    <div className="space-y-1">
      <div className="relative">
        <Input
          {...resto}
          ref={refInput}
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          disabled={disabled}
          value={texto}
          aria-invalid={hayError || undefined}
          aria-describedby={hayError || mostrarEco || avisoFraccion ? idAyuda : undefined}
          className={cn(atajos && "pr-9", hayError && "border-destructive", className)}
          onChange={(e) => aplicarTexto(e.target.value)}
          onFocus={(e) => {
            setEnfocado(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setEnfocado(false);
            canonizar();
            onBlur?.(e);
          }}
          onKeyDown={(e) => {
            // Confirma sin enviar el formulario: estos campos viven dentro de
            // formularios grandes y el "Go" del teclado del celular manda Enter
            // en medio de la carga de una línea.
            if (e.key === "Enter") {
              e.preventDefault();
              canonizar();
            }
            onKeyDown?.(e);
          }}
        />

        {atajos && !disabled && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Fracciones y operaciones"
                title="Fracciones (¼, ½, …) y la tecla /"
                className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Divide className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            {/* Sin autofoco: el cursor se queda en el campo, así se puede seguir
                tecleando con el desplegable abierto y acumular atajos. */}
            <PopoverContent
              align="end"
              className="w-56 p-2"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <p className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">
                Sumar fracción
              </p>
              <div className="grid grid-cols-4 gap-1">
                {ATAJOS.map((a) => (
                  <Button
                    key={a.etiqueta}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-0 font-normal"
                    // El teclado del celular se cerraría al tocar el botón.
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => sumar(a.delta)}
                  >
                    {a.etiqueta}
                  </Button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-1 border-t pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 font-mono"
                  title="Escribir una fracción distinta (1/7)"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={insertarBarra}
                >
                  /
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 flex-1 font-normal text-muted-foreground"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => {
                    aplicarTexto("");
                    refInput.current?.focus();
                  }}
                >
                  <Eraser className="mr-1 h-3 w-3" />
                  Limpiar
                </Button>
              </div>
              <p className="mt-2 px-1 text-[11px] leading-tight text-muted-foreground">
                También podés escribir <span className="font-mono">1/4</span>,{" "}
                <span className="font-mono">20/4</span> o{" "}
                <span className="font-mono">1 1/2</span>.
              </p>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* Una sola línea de ayuda, y solo cuando hay algo que decir: reservarla
          siempre le sumaría altura a cada celda de cada tabla. */}
      {hayError ? (
        <p id={idAyuda} className="text-xs text-destructive">
          {mensajeError}
        </p>
      ) : mostrarEco ? (
        <p id={idAyuda} role="status" aria-live="polite" className="text-xs text-muted-foreground">
          = {formatearCantidad(valor as number, decimales)}
          {unidad ? ` ${unidad}` : ""}
        </p>
      ) : avisoFraccion ? (
        <p id={idAyuda} className="text-xs text-amber-600 dark:text-amber-500">
          {unidad} normalmente no se fracciona.
        </p>
      ) : null}
    </div>
  );
}

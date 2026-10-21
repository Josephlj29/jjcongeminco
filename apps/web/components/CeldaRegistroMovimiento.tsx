"use client";

/**
 * components/CeldaRegistroMovimiento.tsx
 *
 * Celda "Registro" de las tablas de movimientos (kardex del producto y reporte
 * de movimientos).
 *
 * Un documento se fecha con el DÍA CONTABLE, que puede ser anterior al día en
 * que se cargó, y debe poder serlo: en un kardex la fecha del movimiento es la
 * del hecho económico, no la de digitación. El costo de eso es que dos cargas
 * muy distintas se ven iguales. Esta celda muestra cuándo se cargó de verdad y
 * quién lo hizo, y resalta el caso en que NO coincide con la fecha del
 * documento, que es la señal de una carga retroactiva.
 */
import { registroMovimiento } from "@/lib/format";
import { TableCell } from "@/components/ui/table";

export function CeldaRegistroMovimiento({
  fechaDocumento,
  fechaRegistro,
  registradoPor,
}: {
  fechaDocumento: string;
  fechaRegistro: string | null;
  registradoPor: string | null;
}) {
  const registro = registroMovimiento(fechaDocumento, fechaRegistro);

  if (!registro.texto) {
    return <TableCell className="text-xs text-muted-foreground">—</TableCell>;
  }

  return (
    <TableCell className="text-xs">
      <div className="flex flex-col">
        <span
          className={registro.retroactivo ? "font-medium text-warning" : undefined}
          title={
            registro.retroactivo
              ? "Se cargó en una fecha distinta a la del documento"
              : "Se cargó el mismo día del documento"
          }
        >
          {registro.texto}
        </span>
        {registradoPor && (
          <span className="text-[11px] text-muted-foreground">{registradoPor}</span>
        )}
      </div>
    </TableCell>
  );
}

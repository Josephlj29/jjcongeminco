"use client";

/**
 * components/ExportarMenu.tsx — Menú "Exportar" (CSV / Excel).
 *
 * Vivía como función local dentro de reportes/page.tsx. Se extrajo acá cuando el
 * catálogo necesitó lo mismo: dos pantallas con el mismo menú es el momento de
 * compartirlo, no de copiarlo.
 *
 * `dataset` es una FÁBRICA, no un objeto: se evalúa al hacer clic. Si fuera un
 * objeto habría que recalcularlo en cada render de la pantalla (con filtros que
 * cambian mientras se tipea, eso es armar miles de filas para un menú que quizá
 * nadie abra) y además correría el riesgo de exportar una foto vieja de los datos.
 */
import { Download } from "lucide-react";
import { toast } from "sonner";
import { exportarCsv } from "@/lib/csv";
import { exportarExcel } from "@/lib/exportar-xlsx";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Datos listos para exportar: los mismos {filas, columnas} sirven a CSV y Excel. */
export interface ExportDataset {
  nombreArchivo: string;
  nombreHoja: string;
  columnas: { key: string; label: string }[];
  filas: Record<string, unknown>[];
}

export function ExportarMenu({
  dataset,
  etiqueta = "Exportar",
  disabled = false,
  tamano = "sm",
}: {
  dataset: () => ExportDataset;
  /** Para distinguirlo cuando en la pantalla hay más de una exportación. */
  etiqueta?: string;
  disabled?: boolean;
  /** "sm" dentro de una tarjeta; "default" al lado de un botón principal, para
      que no quede un botón más bajo que el que tiene al lado. */
  tamano?: "sm" | "default";
}) {
  /* Sin filas no se genera el archivo: un Excel con solo encabezados parece un
     error del sistema y manda al usuario a buscar un problema que no existe. */
  const conDatos = (d: ExportDataset): boolean => {
    if (d.filas.length) return true;
    toast.error("No hay datos para exportar con los filtros actuales.");
    return false;
  };

  const aExcel = async () => {
    const d = dataset();
    if (!conDatos(d)) return;
    try {
      await exportarExcel(d.nombreArchivo, [
        { nombre: d.nombreHoja, columnas: d.columnas, filas: d.filas },
      ]);
    } catch {
      toast.error("No se pudo exportar a Excel");
    }
  };

  const aCsv = () => {
    const d = dataset();
    if (!conDatos(d)) return;
    exportarCsv(d.filas, d.columnas, d.nombreArchivo);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={tamano} disabled={disabled}>
          <Download className="mr-1 h-3.5 w-3.5" />
          {etiqueta}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={aCsv}>CSV</DropdownMenuItem>
        <DropdownMenuItem onClick={() => void aExcel()}>Excel</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

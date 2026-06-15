"use client";

/**
 * components/productos/DialogHistorialPrecios.tsx
 *
 * Muestra el historial de precios de un producto (inv.T_Producto_PrecioHistorico)
 * y permite elegir un precio puntual como override manual del costo de una línea.
 *
 * El método oficial de valorización es promedio móvil (NIC 2 / SUNAT); el override
 * queda registrado como excepción manual.
 */
import type { PrecioHistoricoConProveedor } from "@congeminco/shared";
import { usePreciosProducto } from "@/hooks/usePreciosProducto";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const ORIGEN_LABEL: Record<PrecioHistoricoConProveedor["Origen"], string> = {
  compra: "Compra",
  manual: "Manual",
  ajuste: "Ajuste",
};

const ORIGEN_VARIANTE: Record<
  PrecioHistoricoConProveedor["Origen"],
  "success" | "warning" | "secondary"
> = {
  compra: "success",
  manual: "warning",
  ajuste: "secondary",
};

interface DialogHistorialPreciosProps {
  idProducto: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Recibe el Costo (no el promedio) de la fila elegida como override. */
  onUsarPrecio: (costo: number) => void;
}

export function DialogHistorialPrecios({
  idProducto,
  open,
  onOpenChange,
  onUsarPrecio,
}: DialogHistorialPreciosProps) {
  const { data: precios, isLoading } = usePreciosProducto(idProducto, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Historial de precios</DialogTitle>
          <DialogDescription>
            Costos registrados por compras, ajustes o cargas manuales. Solo se
            puede elegir un precio cuyo lote todavía tiene stock; los agotados se
            muestran pero no son seleccionables. Valorización: promedio móvil (NIC 2).
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        ) : !precios?.length ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed h-28 text-muted-foreground text-sm">
            Este producto no tiene historial de precios registrado.
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Promedio result.</TableHead>
                  <TableHead>Proveedor</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead className="text-right">Remanente</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {precios.map((p) => (
                  <TableRow key={p.Id} className={p.TieneStock ? "" : "opacity-50"}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(p.FechaPrecio).toLocaleDateString("es-PE")}
                    </TableCell>
                    <TableCell className="text-right text-xs font-medium">
                      S/ {p.Costo.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      S/ {p.CostoPromedio.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.NombreProveedor ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ORIGEN_VARIANTE[p.Origen]}>
                        {ORIGEN_LABEL[p.Origen]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {p.TieneStock ? (
                        <span className="font-medium">{p.CantidadRemanente}</span>
                      ) : (
                        <Badge variant="secondary">Agotado</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.TieneStock ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            onUsarPrecio(p.Costo);
                            onOpenChange(false);
                          }}
                        >
                          Usar este precio
                        </Button>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          Sin stock
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

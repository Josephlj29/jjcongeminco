"use client";

/**
 * components/requerimientos/DialogAprobarRequerimiento.tsx
 *
 * Bandeja de aprobación de un requerimiento. Muestra el detalle (productos,
 * cantidades, costo promedio y subtotal estimado) y, si está pendiente, permite:
 *  - Aprobar → genera la salida valorizada desde el almacén origen elegido.
 *  - Rechazar → marca el requerimiento como anulado (motivo opcional).
 *
 * La aprobación puede fallar por stock insuficiente: el error de la función
 * llega como 409 y se muestra tal cual (indica qué producto y cuánto falta).
 */
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, PackageX } from "lucide-react";
import {
  useRequerimientoDetalle,
  useAtenderRequerimiento,
  useAnularRequerimiento,
} from "@/hooks/useRequerimientos";
import { useUbicaciones } from "@/hooks/useUbicaciones";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const ORIGEN_LABEL: Record<string, string> = {
  planificado: "Planificado",
  presupuestado: "Presupuestado",
  desgaste_prematuro: "Desgaste prematuro",
};

const SITUACION_VARIANTE = {
  pendiente: "default" as const,
  atendido: "success" as const,
  anulado: "destructive" as const,
};

function moneda(n: number): string {
  return `S/ ${n.toFixed(2)}`;
}

export function DialogAprobarRequerimiento({
  idRequerimiento,
  puedeAprobar,
  onClose,
}: {
  idRequerimiento: string | null;
  /** Si el rol del usuario puede aprobar/rechazar (documentoEscritura). */
  puedeAprobar: boolean;
  onClose: () => void;
}) {
  const { data: req, isLoading } = useRequerimientoDetalle(idRequerimiento);
  const { data: ubicaciones } = useUbicaciones();
  const { mutateAsync: atender, isPending: aprobando } = useAtenderRequerimiento();
  const { mutateAsync: anular, isPending: rechazando } = useAnularRequerimiento();

  const [idUbicacion, setIdUbicacion] = useState("");
  const [rechazar, setRechazar] = useState(false);
  const [motivo, setMotivo] = useState("");

  const cerrar = () => {
    setIdUbicacion("");
    setRechazar(false);
    setMotivo("");
    onClose();
  };

  const onAprobar = async () => {
    if (!idRequerimiento || !idUbicacion) return;
    try {
      await atender({ id: idRequerimiento, data: { IdUbicacionOrigen: idUbicacion } });
      toast.success("Requerimiento aprobado — salida generada y valorizada.");
      cerrar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onRechazar = async () => {
    if (!idRequerimiento) return;
    try {
      await anular({ id: idRequerimiento, motivo: motivo.trim() || undefined });
      toast.success("Requerimiento rechazado.");
      cerrar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const total = (req?.Detalle ?? []).reduce(
    (acc, l) => acc + l.Cantidad * l.CostoPromedio,
    0
  );
  const pendiente = req?.Situacion === "pendiente";
  const puedeActuar = pendiente && puedeAprobar;
  const sinAlmacenes = !!ubicaciones && ubicaciones.length === 0;

  return (
    <Dialog open={!!idRequerimiento} onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Requerimiento
            {req && (
              <span className="font-mono text-sm text-muted-foreground">
                {req.NumeroRequerimiento ?? `#${req.Id.slice(0, 8)}`}
              </span>
            )}
            {req && (
              <Badge variant={SITUACION_VARIANTE[req.Situacion]}>
                {req.Situacion}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {puedeActuar
              ? "Revisá el detalle y aprobá para generar la salida valorizada, o rechazá el pedido."
              : "Detalle del requerimiento."}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !req ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Cabecera */}
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Fecha</p>
                <p>{new Date(req.FechaRequerimiento).toLocaleDateString("es-PE")}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Origen</p>
                <p>{ORIGEN_LABEL[req.Origen] ?? req.Origen}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Destino</p>
                <p>{req.Placa ?? req.NombreEquipo ?? "—"}</p>
              </div>
            </div>

            {/* Detalle */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead className="text-right">Costo prom.</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {req.Detalle.map((l) => (
                    <TableRow key={l.Id}>
                      <TableCell>
                        <p className="font-medium leading-tight">{l.NombreProducto}</p>
                        <p className="font-mono text-xs text-muted-foreground">{l.Sku}</p>
                      </TableCell>
                      <TableCell className="text-right">{l.Cantidad}</TableCell>
                      <TableCell className="text-right">{moneda(l.CostoPromedio)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {moneda(l.Cantidad * l.CostoPromedio)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end text-sm">
              <span className="text-muted-foreground">Total estimado:&nbsp;</span>
              <span className="font-semibold">{moneda(total)}</span>
            </div>

            {/* Estado no-pendiente */}
            {req.Situacion === "atendido" && (
              <div className="flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2.5 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <p>Este requerimiento ya fue atendido: la salida fue registrada en el ledger y valorizada.</p>
              </div>
            )}
            {req.Situacion === "anulado" && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm">
                <PackageX className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p>Este requerimiento fue rechazado.</p>
              </div>
            )}

            {/* Solo lectura: pendiente pero el usuario no puede aprobar */}
            {pendiente && !puedeAprobar && (
              <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
                Tu rol no puede aprobar ni rechazar requerimientos. Solo lectura.
              </div>
            )}

            {/* Acciones (pendiente + permiso) */}
            {puedeActuar && !rechazar && (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                {sinAlmacenes ? (
                  <p className="text-sm text-muted-foreground">
                    No hay almacenes activos. Creá uno en Maestros → Almacenes para
                    poder aprobar.
                  </p>
                ) : (
                  <div className="space-y-1">
                    <Label>Almacén de origen</Label>
                    <Select value={idUbicacion} onValueChange={setIdUbicacion}>
                      <SelectTrigger>
                        <SelectValue placeholder="¿De qué almacén sale el material?" />
                      </SelectTrigger>
                      <SelectContent>
                        {ubicaciones?.map((u) => (
                          <SelectItem key={u.Id} value={u.Id}>
                            {u.Codigo} — {u.Nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <AlertTriangle className="h-3 w-3" />
                      Aprobar consume el stock de este almacén y valoriza al costo promedio.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Confirmación de rechazo */}
            {puedeActuar && rechazar && (
              <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <Label htmlFor="motivo">Motivo del rechazo (opcional)</Label>
                <Input
                  id="motivo"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ej. fuera de presupuesto"
                  maxLength={500}
                />
              </div>
            )}
          </div>
        )}

        {puedeActuar && (
          <DialogFooter className="gap-2 sm:gap-2">
            {rechazar ? (
              <>
                <Button variant="ghost" onClick={() => setRechazar(false)} disabled={rechazando}>
                  Volver
                </Button>
                <Button variant="destructive" onClick={onRechazar} disabled={rechazando}>
                  {rechazando ? "Rechazando..." : "Confirmar rechazo"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setRechazar(true)} disabled={aprobando}>
                  Rechazar
                </Button>
                <Button onClick={onAprobar} disabled={aprobando || !idUbicacion || sinAlmacenes}>
                  {aprobando ? "Generando salida..." : "Aprobar y generar salida"}
                </Button>
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

"use client";

/**
 * components/requerimientos/DialogAprobarRequerimiento.tsx
 *
 * Gestión/aprobación de un requerimiento (panel de Aprobaciones). Por cada línea:
 *  - Cantidad a entregar (≤ solicitada) → entrega PARCIAL.
 *  - Modo "stock" (sale del almacén) o "compra" (compra directa: la BD genera
 *    entrada + salida, valorizada al costo).
 * Si alguna línea es "compra", se piden proveedor + comprobante (batch) y un
 * costo por línea. Aprobar genera la salida; rechazar anula el requerimiento.
 */
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, PackageX } from "lucide-react";
import type { LineaEntrega } from "@congeminco/shared";
import {
  useRequerimientoDetalle,
  useAtenderRequerimiento,
  useAnularRequerimiento,
} from "@/hooks/useRequerimientos";
import { useUbicaciones } from "@/hooks/useUbicaciones";
import { useProveedores } from "@/hooks/useProveedores";
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

type EstadoLinea = { cantidad: string; modo: "stock" | "compra"; costo: string };

export function DialogAprobarRequerimiento({
  idRequerimiento,
  puedeAprobar,
  onClose,
}: {
  idRequerimiento: string | null;
  puedeAprobar: boolean;
  onClose: () => void;
}) {
  const { data: req, isLoading } = useRequerimientoDetalle(idRequerimiento);
  const { data: ubicaciones } = useUbicaciones();
  const { data: proveedores } = useProveedores();
  const { mutateAsync: atender, isPending: aprobando } = useAtenderRequerimiento();
  const { mutateAsync: anular, isPending: rechazando } = useAnularRequerimiento();

  const [idUbicacion, setIdUbicacion] = useState("");
  const [lineas, setLineas] = useState<Record<string, EstadoLinea>>({});
  const [idProveedor, setIdProveedor] = useState("");
  const [comprobante, setComprobante] = useState("");
  const [rechazar, setRechazar] = useState(false);
  const [motivo, setMotivo] = useState("");
  const seededRef = useRef<string | null>(null);

  // Siembra el estado de entrega UNA sola vez por requerimiento (todo a "stock",
  // cantidad = solicitada). No re-siembra en refetches en background (que pisarían
  // lo que el aprobador ya editó: cantidades parciales, modo, costos).
  useEffect(() => {
    if (req?.Id && req.Detalle && seededRef.current !== req.Id) {
      seededRef.current = req.Id;
      const init: Record<string, EstadoLinea> = {};
      req.Detalle.forEach((l) => {
        init[l.Id] = { cantidad: String(l.Cantidad), modo: "stock", costo: "" };
      });
      setLineas(init);
    }
  }, [req]);

  const cerrar = () => {
    seededRef.current = null;
    setIdUbicacion("");
    setLineas({});
    setIdProveedor("");
    setComprobante("");
    setRechazar(false);
    setMotivo("");
    onClose();
  };

  const setLinea = (id: string, patch: Partial<EstadoLinea>) =>
    setLineas((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  // Cantidad numérica efectiva por línea (clamp 0..solicitada).
  const cantNum = (solicitada: number, st?: EstadoLinea) =>
    Math.max(0, Math.min(solicitada, Number(st?.cantidad) || 0));

  const hayCompra = (req?.Detalle ?? []).some(
    (l) => lineas[l.Id]?.modo === "compra" && cantNum(l.Cantidad, lineas[l.Id]) > 0
  );

  const total = (req?.Detalle ?? []).reduce((acc, l) => {
    const st = lineas[l.Id];
    const cant = cantNum(l.Cantidad, st);
    if (cant <= 0) return acc;
    const costo = st?.modo === "compra" ? Number(st.costo) || 0 : l.CostoPromedio;
    return acc + cant * costo;
  }, 0);

  const pendiente = req?.Situacion === "pendiente";
  const puedeActuar = pendiente && puedeAprobar;
  const sinAlmacenes = !!ubicaciones && ubicaciones.length === 0;

  const onAprobar = async () => {
    if (!idRequerimiento || !req) return;
    const payload: LineaEntrega[] = req.Detalle.map((l) => {
      const st = lineas[l.Id];
      return {
        IdDetalle: l.Id,
        Cantidad: cantNum(l.Cantidad, st),
        Modo: st?.modo ?? "stock",
        Costo: st?.modo === "compra" ? Number(st.costo) || undefined : undefined,
      };
    });

    if (!payload.some((l) => l.Cantidad > 0)) {
      toast.error("Indicá al menos una cantidad a entregar.");
      return;
    }
    if (hayCompra && (!idProveedor || !comprobante.trim())) {
      toast.error("La compra directa requiere proveedor y comprobante.");
      return;
    }
    if (payload.some((l) => l.Modo === "compra" && l.Cantidad > 0 && !(Number(l.Costo) > 0))) {
      toast.error("Cada línea de compra directa necesita un costo unitario.");
      return;
    }

    try {
      await atender({
        id: idRequerimiento,
        data: {
          IdUbicacionOrigen: idUbicacion,
          IdProveedor: idProveedor || undefined,
          Comprobante: comprobante.trim() || undefined,
          Lineas: payload,
        },
      });
      toast.success("Requerimiento atendido — salida generada y valorizada.");
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

  return (
    <Dialog open={!!idRequerimiento} onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Requerimiento
            {req && (
              <span className="font-mono text-sm text-muted-foreground">
                {req.NumeroRequerimiento ?? `#${req.Id.slice(0, 8)}`}
              </span>
            )}
            {req && (
              <Badge variant={SITUACION_VARIANTE[req.Situacion]}>{req.Situacion}</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {puedeActuar
              ? "Ajustá la cantidad a entregar por línea (parcial si falta stock) y elegí el modo. Compra directa genera la compra + salida automáticamente."
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

            {/* Almacén origen (solo si puede actuar) */}
            {puedeActuar && (
              <div className="space-y-1">
                <Label>Almacén de origen</Label>
                {sinAlmacenes ? (
                  <p className="text-sm text-muted-foreground">
                    No hay almacenes activos. Creá uno en Maestros → Almacenes.
                  </p>
                ) : (
                  <Select value={idUbicacion} onValueChange={setIdUbicacion}>
                    <SelectTrigger className="sm:w-80">
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
                )}
              </div>
            )}

            {/* Detalle por línea */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right w-20">Solic.</TableHead>
                    {puedeActuar ? (
                      <>
                        <TableHead className="w-24">Entregar</TableHead>
                        <TableHead className="w-40">Modo</TableHead>
                        <TableHead className="w-28">Costo compra</TableHead>
                      </>
                    ) : (
                      <TableHead className="text-right w-24">Atendido</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {req.Detalle.map((l) => {
                    const st = lineas[l.Id];
                    return (
                      <TableRow key={l.Id}>
                        <TableCell>
                          <p className="font-medium leading-tight">{l.NombreProducto}</p>
                          <p className="font-mono text-xs text-muted-foreground">{l.Sku}</p>
                        </TableCell>
                        <TableCell className="text-right">{l.Cantidad}</TableCell>
                        {puedeActuar ? (
                          <>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                max={l.Cantidad}
                                className="h-8"
                                value={st?.cantidad ?? ""}
                                onChange={(e) => setLinea(l.Id, { cantidad: e.target.value })}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex rounded-md border p-0.5 text-xs">
                                <button
                                  type="button"
                                  onClick={() => setLinea(l.Id, { modo: "stock" })}
                                  className={`flex-1 rounded px-2 py-1 ${
                                    st?.modo === "stock"
                                      ? "bg-primary text-primary-foreground"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  Stock
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setLinea(l.Id, { modo: "compra" })}
                                  className={`flex-1 rounded px-2 py-1 ${
                                    st?.modo === "compra"
                                      ? "bg-primary text-primary-foreground"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  Compra
                                </button>
                              </div>
                            </TableCell>
                            <TableCell>
                              {st?.modo === "compra" ? (
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  placeholder="S/"
                                  className="h-8"
                                  value={st?.costo ?? ""}
                                  onChange={(e) => setLinea(l.Id, { costo: e.target.value })}
                                />
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {moneda(l.CostoPromedio)}
                                </span>
                              )}
                            </TableCell>
                          </>
                        ) : (
                          <TableCell className="text-right font-medium">
                            {l.CantidadAtendida}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Datos de compra directa (si alguna línea es compra) */}
            {puedeActuar && hayCompra && (
              <div className="grid grid-cols-1 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Proveedor (compra directa)</Label>
                  <Select value={idProveedor} onValueChange={setIdProveedor}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar proveedor..." />
                    </SelectTrigger>
                    <SelectContent>
                      {proveedores?.map((p) => (
                        <SelectItem key={p.Id} value={p.Id}>
                          {p.Nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="comprobante">Comprobante</Label>
                  <Input
                    id="comprobante"
                    value={comprobante}
                    onChange={(e) => setComprobante(e.target.value)}
                    placeholder="F001-123"
                    maxLength={60}
                  />
                </div>
              </div>
            )}

            {puedeActuar && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3 w-3" />
                  Stock consume el almacén; compra directa genera la compra + salida.
                </span>
                <span>
                  <span className="text-muted-foreground">Total estimado:&nbsp;</span>
                  <span className="font-semibold">{moneda(total)}</span>
                </span>
              </div>
            )}

            {req.Situacion === "atendido" && (
              <div className="flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2.5 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                <p>Este requerimiento ya fue atendido: la salida quedó registrada y valorizada.</p>
              </div>
            )}
            {req.Situacion === "anulado" && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm">
                <PackageX className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <p>Este requerimiento fue rechazado.</p>
              </div>
            )}

            {pendiente && !puedeAprobar && (
              <div className="rounded-lg border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground">
                Tu rol no puede aprobar ni rechazar requerimientos. Solo lectura.
              </div>
            )}

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
                  {aprobando ? "Generando salida..." : "Aprobar y entregar"}
                </Button>
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

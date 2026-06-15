"use client";

/**
 * components/mantenimiento/DialogOrdenMantenimiento.tsx
 *
 * Alta/edición de una Orden de Trabajo de Mantenimiento (cabecera + trabajos).
 * Selects controlados (value={watch}) y montaje condicional desde el padre para
 * evitar el bug de valor pegado/stale. La edición solo aplica a OTs abiertas.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  CrearOrdenMantenimientoSchema,
  TIPO_MANTENIMIENTO,
  TURNO,
  type CrearOrdenMantenimiento,
  type OrdenMantenimientoConDetalle,
} from "@congeminco/shared";
import {
  useCrearOrdenMantenimiento,
  useActualizarOrdenMantenimiento,
} from "@/hooks/useOrdenesMantenimiento";
import { useVehiculos } from "@/hooks/useEquipos";
import { usePersonal } from "@/hooks/usePersonal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const TIPO_LABEL: Record<string, string> = {
  preventivo: "Preventivo",
  correctivo: "Correctivo",
};
const TURNO_LABEL: Record<string, string> = {
  dia: "Día",
  tarde: "Tarde",
  noche: "Noche",
};

export function DialogOrdenMantenimiento({
  orden,
  onClose,
}: {
  orden: OrdenMantenimientoConDetalle | null;
  onClose: () => void;
}) {
  const modoEdicion = !!orden;
  const { mutateAsync: crear, isPending: creando } = useCrearOrdenMantenimiento();
  const { mutateAsync: actualizar, isPending: act } = useActualizarOrdenMantenimiento();
  const { data: vehiculos } = useVehiculos();
  const { data: personal } = usePersonal();
  const isPending = creando || act;

  const [trabajos, setTrabajos] = useState<string[]>(
    orden && orden.Trabajos.length ? orden.Trabajos.map((t) => t.Descripcion) : [""]
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CrearOrdenMantenimiento>({
    resolver: zodResolver(CrearOrdenMantenimientoSchema),
    defaultValues: orden
      ? {
          NumeroOrden: orden.NumeroOrden ?? undefined,
          TipoMantenimiento: orden.TipoMantenimiento,
          FechaOrden: orden.FechaOrden.slice(0, 10),
          Turno: orden.Turno,
          Kilometraje: orden.Kilometraje ?? undefined,
          IdVehiculo: orden.IdVehiculo,
          IdMecanicoResponsable: orden.IdMecanicoResponsable,
          Observaciones: orden.Observaciones ?? undefined,
          Trabajos: [],
        }
      : {
          FechaOrden: new Date().toISOString().split("T")[0],
          Trabajos: [],
        },
  });

  const onSubmit = async (data: CrearOrdenMantenimiento) => {
    const trabajosLimpios = trabajos
      .map((d) => d.trim())
      .filter(Boolean)
      .map((Descripcion, i) => ({ Secuencia: i + 1, Descripcion }));
    const payload = { ...data, Trabajos: trabajosLimpios };
    try {
      if (modoEdicion) {
        await actualizar({ id: orden.Id, data: payload });
        toast.success("Orden actualizada correctamente");
      } else {
        await crear(payload);
        toast.success("Orden creada correctamente");
      }
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{modoEdicion ? "Editar orden de trabajo" : "Nueva orden de trabajo"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Tipo *</Label>
              <Select
                value={watch("TipoMantenimiento") ?? ""}
                onValueChange={(v) =>
                  setValue("TipoMantenimiento", v as CrearOrdenMantenimiento["TipoMantenimiento"], {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Preventivo / Correctivo" />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_MANTENIMIENTO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.TipoMantenimiento && (
                <p className="text-xs text-destructive">{errors.TipoMantenimiento.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="FechaOrden">Fecha *</Label>
              <Input id="FechaOrden" type="date" {...register("FechaOrden")} />
            </div>

            <div className="space-y-1">
              <Label>Turno *</Label>
              <Select
                value={watch("Turno") ?? ""}
                onValueChange={(v) =>
                  setValue("Turno", v as CrearOrdenMantenimiento["Turno"], { shouldValidate: true })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Turno" />
                </SelectTrigger>
                <SelectContent>
                  {TURNO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TURNO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.Turno && <p className="text-xs text-destructive">{errors.Turno.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>Placa *</Label>
              <Select
                value={watch("IdVehiculo") ?? ""}
                onValueChange={(v) => setValue("IdVehiculo", v, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar placa..." />
                </SelectTrigger>
                <SelectContent>
                  {vehiculos?.map((v) => (
                    <SelectItem key={v.Id} value={v.Id}>
                      {v.Placa}
                      {v.Modelo ? ` — ${v.Modelo}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.IdVehiculo && (
                <p className="text-xs text-destructive">{errors.IdVehiculo.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Mecánico responsable *</Label>
              <Select
                value={watch("IdMecanicoResponsable") ?? ""}
                onValueChange={(v) =>
                  setValue("IdMecanicoResponsable", v, { shouldValidate: true })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {personal?.map((p) => (
                    <SelectItem key={p.Id} value={p.Id}>
                      {p.NombreCompleto}
                      {p.NombreCargo ? ` · ${p.NombreCargo}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.IdMecanicoResponsable && (
                <p className="text-xs text-destructive">{errors.IdMecanicoResponsable.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="Kilometraje">Kilometraje</Label>
              <Input
                id="Kilometraje"
                type="number"
                min={0}
                step="0.01"
                placeholder="Opcional"
                {...register("Kilometraje", {
                  setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)),
                })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="NumeroOrden">N° Orden (opcional)</Label>
            <Input id="NumeroOrden" placeholder="OT-0001" {...register("NumeroOrden")} />
          </div>

          {/* Trabajos realizados */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Trabajos realizados</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTrabajos((t) => [...t, ""])}
              >
                <Plus className="mr-1 h-3 w-3" />
                Agregar
              </Button>
            </div>
            <div className="space-y-2">
              {trabajos.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}</span>
                  <Input
                    value={t}
                    placeholder="Descripción del trabajo..."
                    onChange={(e) =>
                      setTrabajos((arr) => arr.map((v, idx) => (idx === i ? e.target.value : v)))
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() =>
                      setTrabajos((arr) => (arr.length > 1 ? arr.filter((_, idx) => idx !== i) : arr))
                    }
                    disabled={trabajos.length === 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="Observaciones">Observaciones</Label>
            <Input id="Observaciones" placeholder="Opcional" {...register("Observaciones")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : modoEdicion ? "Guardar cambios" : "Crear orden"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

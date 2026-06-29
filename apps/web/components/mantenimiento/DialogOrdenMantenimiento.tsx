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
import { Plus, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import {
  CrearOrdenMantenimientoSchema,
  TIPO_MANTENIMIENTO,
  TURNO,
  type CrearOrdenMantenimiento,
  type OrdenMantenimientoConDetalle,
} from "@congeminco/shared";
import {
  useOrdenesMantenimiento,
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const TIPO_LABEL: Record<string, string> = {
  preventivo: "Preventivo",
  correctivo: "Correctivo",
};
const TURNO_LABEL: Record<string, string> = {
  dia: "Día",
  tarde: "Tarde",
  noche: "Noche",
};

/**
 * Arma el N° de orden completo: PREFIJO-DDMMYYYY-PLACA-NN.
 * Espeja la lógica del servidor (inv.FnRegistrarOrdenMantenimiento): busca el
 * primer correlativo libre para esa base entre los números ya existentes. El
 * servidor sigue siendo la fuente de verdad y reconfirma el NN al guardar;
 * esto es solo la previsualización del número que se va a asignar.
 */
function armarNumeroOrden(
  tipo: string | undefined,
  fecha: string | undefined,
  placa: string | null | undefined,
  numerosExistentes: string[]
): string | null {
  if (!tipo || !fecha || !placa) return null;
  const [y, m, d] = fecha.split("-");
  if (!y || !m || !d) return null;
  const prefijo = tipo === "correctivo" ? "CORR" : "PREV";
  const placaLimpia = placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const base = `${prefijo}-${d}${m}${y}-${placaLimpia}`;

  const ocupados = new Set<number>();
  for (const numero of numerosExistentes) {
    if (!numero.startsWith(`${base}-`)) continue;
    const sufijo = Number(numero.slice(base.length + 1));
    if (Number.isInteger(sufijo) && sufijo > 0) ocupados.add(sufijo);
  }
  let correlativo = 1;
  while (ocupados.has(correlativo)) correlativo += 1;

  return `${base}-${String(correlativo).padStart(2, "0")}`;
}

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
          IdsPersonal: orden.Personales.map((p) => p.IdPersonal),
          Observaciones: orden.Observaciones ?? undefined,
          Trabajos: [],
        }
      : {
          FechaOrden: new Date().toISOString().split("T")[0],
          IdsPersonal: [],
          Trabajos: [],
        },
  });

  const { data: ordenes } = useOrdenesMantenimiento();
  const idsPersonal = watch("IdsPersonal") ?? [];
  const placaSeleccionada = vehiculos?.find((v) => v.Id === watch("IdVehiculo"))?.Placa;
  const numerosExistentes = (ordenes ?? [])
    .map((o) => o.NumeroOrden)
    .filter((n): n is string => !!n);
  const numeroArmado = armarNumeroOrden(
    watch("TipoMantenimiento"),
    watch("FechaOrden"),
    placaSeleccionada,
    numerosExistentes
  );
  const togglePersonal = (id: string) => {
    const next = idsPersonal.includes(id)
      ? idsPersonal.filter((x) => x !== id)
      : [...idsPersonal, id];
    setValue("IdsPersonal", next, { shouldValidate: true });
  };

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

          <div className="grid grid-cols-2 gap-4">
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

          {/* Personal asignado (varios; todos por igual) */}
          <div className="space-y-1">
            <Label>
              Personal asignado * {idsPersonal.length > 0 && (
                <span className="text-muted-foreground font-normal">
                  ({idsPersonal.length} seleccionado{idsPersonal.length === 1 ? "" : "s"})
                </span>
              )}
            </Label>
            <Command className="rounded-lg border">
              <CommandInput placeholder="Buscar personal..." />
              <CommandList className="max-h-44">
                <CommandEmpty>No se encontró personal.</CommandEmpty>
                <CommandGroup>
                  {personal?.map((p) => {
                    const activo = idsPersonal.includes(p.Id);
                    return (
                      <CommandItem
                        key={p.Id}
                        value={p.NombreCompleto}
                        onSelect={() => togglePersonal(p.Id)}
                        className="gap-2"
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded border",
                            activo ? "bg-primary border-primary text-primary-foreground" : "border-input"
                          )}
                        >
                          {activo && <Check className="h-3 w-3" />}
                        </span>
                        <span className="flex-1">{p.NombreCompleto}</span>
                        {p.NombreCargo && (
                          <span className="text-xs text-muted-foreground">{p.NombreCargo}</span>
                        )}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
            {errors.IdsPersonal && (
              <p className="text-xs text-destructive">{errors.IdsPersonal.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>N° Orden</Label>
            {modoEdicion ? (
              <Input readOnly className="bg-muted font-mono" {...register("NumeroOrden")} />
            ) : (
              <div className="rounded-md border bg-muted px-3 py-2 text-sm">
                {numeroArmado ? (
                  <>
                    <span className="font-mono font-medium">{numeroArmado}</span>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Se asigna automáticamente al guardar.
                    </p>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Elegí tipo, fecha y placa para ver el número.
                  </span>
                )}
              </div>
            )}
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

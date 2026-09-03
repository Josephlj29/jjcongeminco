"use client";

/**
 * app/(app)/requerimientos/page.tsx — Requerimientos de materiales
 *
 * Funcionalidades:
 * - Formulario para crear requerimiento (origen: planificado/presupuestado/desgaste_prematuro)
 * - Debe apuntar a equipo O vehículo (placa)
 *
 * Responsive: el formulario colapsa a 1 columna en móvil; el detalle de
 * materiales se presenta como una tarjeta por línea en móvil (`md:hidden`) y
 * como tabla en desktop (`hidden md:block`). Ambas escriben el mismo fieldArray.
 */
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  CrearRequerimientoSchema,
  ORIGEN_REQUERIMIENTO,
  type CrearRequerimiento,
} from "@congeminco/shared";
import { useCrearRequerimiento } from "@/hooks/useRequerimientos";
import { useSaldos } from "@/hooks/useSaldos";
import { useEquipos, useVehiculos } from "@/hooks/useEquipos";
import { usePersonal } from "@/hooks/usePersonal";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePermiso } from "@/hooks/useYo";
import { ProductoCombobox } from "@/components/ProductoCombobox";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const ORIGEN_LABEL: Record<string, string> = {
  planificado: "Planificado",
  presupuestado: "Presupuestado",
  desgaste_prematuro: "Desgaste prematuro",
};

export default function RequerimientosPage() {
  const { mutateAsync, isPending } = useCrearRequerimiento();
  const { data: productos } = useSaldos();
  const { data: equipos } = useEquipos();
  const { data: vehiculos } = useVehiculos();
  const { data: personal } = usePersonal();

  const puedeCrear = usePermiso("requerimientoCrear");

  // Renderizamos UNA sola presentación de las líneas (cards en móvil, tabla en
  // desktop). No con CSS `hidden`: eso dejaría montados dos <input> por campo con
  // el mismo name de RHF, y reset()/setValue solo sincroniza el último ref (el
  // oculto), dejando valores obsoletos en la vista visible. El form está detrás
  // de `puedeCrear` (query cliente que resuelve tras el mount), así que para
  // cuando aparece, isMobile ya refleja el viewport real: sin flash.
  const isMobile = useIsMobile();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    reset,
    formState: { errors },
  } = useForm<CrearRequerimiento>({
    resolver: zodResolver(CrearRequerimientoSchema),
    defaultValues: {
      FechaRequerimiento: new Date().toISOString().split("T")[0],
      Detalle: [{ IdProducto: "", Cantidad: 1 }],
    },
  });

  const { fields, append, remove, insert } = useFieldArray({
    control,
    name: "Detalle",
  });

  /* Duplicar línea: mismo producto/cantidad/notas, placa a elegir. Es el camino
     para pedir un material a VARIAS placas: una línea por placa, cada una con
     su cantidad (el ledger y los reportes atribuyen consumo por placa). */
  const duplicarLinea = (idx: number) => {
    const linea = watch(`Detalle.${idx}`);
    insert(idx + 1, { ...linea, IdVehiculo: undefined });
  };

  const origenSeleccionado = watch("Origen");
  const placaDefault = watch("IdVehiculo");
  // El refine de Detalle (path:["Detalle"]) puede quedar en .message o en .root.message.
  const detalleErrorMsg =
    errors.Detalle?.message ??
    (errors.Detalle as { root?: { message?: string } } | undefined)?.root?.message;

  const onSubmit = async (data: CrearRequerimiento) => {
    try {
      await mutateAsync(data);
      toast.success("Requerimiento creado correctamente");
      reset({
        FechaRequerimiento: new Date().toISOString().split("T")[0],
        Detalle: [{ IdProducto: "", Cantidad: 1 }],
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  /* Selector de placa por línea — reutilizado en tarjeta (móvil) y fila (desktop).
     Función de render (no componente anidado) para no remontar el Select en cada
     render del formulario. */
  const renderSelectPlaca = (idx: number) => (
    <Select
      value={watch(`Detalle.${idx}.IdVehiculo`) ?? ""}
      onValueChange={(v) => setValue(`Detalle.${idx}.IdVehiculo`, v, { shouldValidate: true })}
    >
      <SelectTrigger className="h-9">
        <SelectValue placeholder="Placa..." />
      </SelectTrigger>
      <SelectContent>
        {vehiculos?.map((v) => (
          <SelectItem key={v.Id} value={v.Id}>
            {v.Placa}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        titulo="Requerimientos"
        descripcion="Crea solicitudes de materiales asociadas a equipos o vehículos"
      />

      {/* Formulario (solo para roles que pueden crear) */}
      {puedeCrear && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nuevo requerimiento</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>Origen</Label>
                  <Select
                    value={origenSeleccionado ?? ""}
                    onValueChange={(v) =>
                      setValue("Origen", v as CrearRequerimiento["Origen"], {
                        shouldValidate: true,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ORIGEN_REQUERIMIENTO.map((o) => (
                        <SelectItem key={o} value={o}>
                          {ORIGEN_LABEL[o]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.Origen && (
                    <p className="text-xs text-destructive">{errors.Origen.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="FechaRequerimiento">Fecha</Label>
                  <Input id="FechaRequerimiento" type="date" {...register("FechaRequerimiento")} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="NumeroRequerimiento">N° Requerimiento (opcional)</Label>
                  <Input
                    id="NumeroRequerimiento"
                    placeholder="REQ-0001"
                    {...register("NumeroRequerimiento")}
                  />
                </div>
              </div>

              {/* Solicitante (personal) */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Solicitante</Label>
                  <Select
                    value={watch("IdPersonalSolicitante") ?? ""}
                    onValueChange={(v) =>
                      setValue("IdPersonalSolicitante", v, { shouldValidate: true })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="¿Quién lo solicita?" />
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
                </div>
              </div>

              {/* Equipo / Vehículo — al menos uno */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Equipo</Label>
                  <Select
                    value={watch("IdEquipo") ?? ""}
                    onValueChange={(v) => setValue("IdEquipo", v, { shouldValidate: true })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar equipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {equipos?.map((eq) => (
                        <SelectItem key={eq.Id} value={eq.Id}>
                          {eq.Codigo} — {eq.Nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Placa por defecto (opcional)</Label>
                  <Select
                    value={placaDefault ?? ""}
                    onValueChange={(v) => setValue("IdVehiculo", v)}
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
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!placaDefault}
                  className="w-full sm:w-auto"
                  onClick={() =>
                    fields.forEach((_, i) =>
                      setValue(`Detalle.${i}.IdVehiculo`, placaDefault, {
                        shouldValidate: true,
                      }),
                    )
                  }
                >
                  Aplicar placa a todas las líneas
                </Button>
                <p className="text-xs text-muted-foreground">
                  Cada línea puede llevar su propia placa destino, o elige un equipo como destino
                  general.
                </p>
              </div>

              <Separator />

              {/* Detalle */}
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium">Materiales solicitados</h3>
                  <p className="text-xs text-muted-foreground">
                    ¿El mismo material para otra placa? Duplicá la línea y elegí la placa.
                  </p>
                </div>

                {/* Una sola presentación montada a la vez (ver nota de isMobile). */}
                {isMobile ? (
                  /* Móvil: una tarjeta por línea */
                  <div className="space-y-3">
                    {fields.map((field, idx) => (
                      <Card key={field.id} className="space-y-3 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">
                            Línea {idx + 1}
                          </span>
                          <div className="flex items-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 text-muted-foreground"
                              title="Duplicar línea (misma cantidad, otra placa)"
                              onClick={() => duplicarLinea(idx)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 text-muted-foreground hover:text-destructive"
                              onClick={() => fields.length > 1 && remove(idx)}
                              disabled={fields.length === 1}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Producto</Label>
                          <ProductoCombobox
                            productos={productos ?? []}
                            value={watch(`Detalle.${idx}.IdProducto`) || null}
                            onChange={(v) =>
                              setValue(`Detalle.${idx}.IdProducto`, v ?? "", {
                                shouldValidate: true,
                              })
                            }
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Placa</Label>
                            {renderSelectPlaca(idx)}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Cantidad</Label>
                            <Input
                              type="number"
                              min={1}
                              inputMode="numeric"
                              className="h-9"
                              {...register(`Detalle.${idx}.Cantidad`, {
                                valueAsNumber: true,
                              })}
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Notas (opcional)</Label>
                          <Input
                            className="h-9"
                            placeholder="Observaciones..."
                            {...register(`Detalle.${idx}.Notas`)}
                          />
                        </div>
                      </Card>
                    ))}
                    {/* Agregar línea al pie: el flujo natural es terminar una
                       línea y pedir la siguiente sin volver arriba. */}
                    <button
                      type="button"
                      onClick={() =>
                        append({ IdProducto: "", Cantidad: 1, IdVehiculo: placaDefault })
                      }
                      className="flex min-h-[3rem] w-full cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/25 p-3 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50"
                    >
                      <Plus className="h-4 w-4" />
                      Agregar línea
                    </button>
                  </div>
                ) : (
                  /* Desktop: tabla */
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Producto</TableHead>
                          <TableHead className="w-44">Placa</TableHead>
                          <TableHead className="w-28">Cantidad</TableHead>
                          <TableHead className="w-48">Notas (opt.)</TableHead>
                          <TableHead className="w-20"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fields.map((field, idx) => (
                          <TableRow key={field.id}>
                            <TableCell className="min-w-64 align-top">
                              <ProductoCombobox
                                productos={productos ?? []}
                                value={watch(`Detalle.${idx}.IdProducto`) || null}
                                onChange={(v) =>
                                  setValue(`Detalle.${idx}.IdProducto`, v ?? "", {
                                    shouldValidate: true,
                                  })
                                }
                              />
                            </TableCell>
                            <TableCell className="align-top">{renderSelectPlaca(idx)}</TableCell>
                            <TableCell className="align-top">
                              <Input
                                type="number"
                                min={1}
                                className="h-9"
                                {...register(`Detalle.${idx}.Cantidad`, {
                                  valueAsNumber: true,
                                })}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                className="h-8"
                                placeholder="Observaciones..."
                                {...register(`Detalle.${idx}.Notas`)}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground"
                                  title="Duplicar línea (misma cantidad, otra placa)"
                                  onClick={() => duplicarLinea(idx)}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => fields.length > 1 && remove(idx)}
                                  disabled={fields.length === 1}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {/* Agregar línea al pie: el flujo natural es terminar una
                       línea y pedir la siguiente sin volver arriba. */}
                    <button
                      type="button"
                      onClick={() =>
                        append({ IdProducto: "", Cantidad: 1, IdVehiculo: placaDefault })
                      }
                      className="flex w-full cursor-pointer items-center justify-center gap-2 border-t border-dashed p-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" />
                      Agregar línea
                    </button>
                  </div>
                )}
                {detalleErrorMsg && <p className="text-xs text-destructive">{detalleErrorMsg}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="Notas">Notas generales (opcional)</Label>
                <Input
                  id="Notas"
                  placeholder="Observaciones del requerimiento..."
                  {...register("Notas")}
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
                  {isPending ? "Creando..." : "Crear requerimiento"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

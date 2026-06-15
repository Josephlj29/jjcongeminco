"use client";

/**
 * app/(app)/requerimientos/page.tsx — Requerimientos de materiales
 *
 * Funcionalidades:
 * - Formulario para crear requerimiento (origen: planificado/presupuestado/desgaste_prematuro)
 * - Debe apuntar a equipo O vehículo (placa)
 * - Lista de requerimientos recientes
 */
import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  CrearRequerimientoSchema,
  ORIGEN_REQUERIMIENTO,
  puede,
  type CrearRequerimiento,
  type RoleCode,
} from "@congeminco/shared";
import { useCrearRequerimiento } from "@/hooks/useRequerimientos";
import { useSaldos } from "@/hooks/useSaldos";
import { useEquipos, useVehiculos } from "@/hooks/useEquipos";
import { usePersonal } from "@/hooks/usePersonal";
import { ProductoCombobox } from "@/components/ProductoCombobox";
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

/* Rol del usuario actual (para gating de acciones de escritura), igual que el
   resto de los maestros. */
function useRolActual() {
  return useQuery({
    queryKey: ["yo"],
    queryFn: async () => {
      const res = await fetch("/api/yo");
      if (!res.ok) throw new Error("Sin sesión");
      return res.json() as Promise<{ rol: RoleCode }>;
    },
  });
}

export default function RequerimientosPage() {
  const { mutateAsync, isPending } = useCrearRequerimiento();
  const { data: productos } = useSaldos();
  const { data: equipos } = useEquipos();
  const { data: vehiculos } = useVehiculos();
  const { data: personal } = usePersonal();

  const { data: yo } = useRolActual();
  const puedeCrear = puede(yo?.rol ?? null, "requerimientoCrear");

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

  const { fields, append, remove } = useFieldArray({
    control,
    name: "Detalle",
  });

  const origenSeleccionado = watch("Origen");

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Requerimientos</h1>
        <p className="text-muted-foreground">
          Crea solicitudes de materiales asociadas a equipos o vehículos
        </p>
      </div>

      {/* Formulario (solo para roles que pueden crear) */}
      {puedeCrear && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nuevo requerimiento</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                  <p className="text-xs text-destructive">
                    {errors.Origen.message}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="FechaRequerimiento">Fecha</Label>
                <Input
                  id="FechaRequerimiento"
                  type="date"
                  {...register("FechaRequerimiento")}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="NumeroRequerimiento">
                  N° Requerimiento (opcional)
                </Label>
                <Input
                  id="NumeroRequerimiento"
                  placeholder="REQ-0001"
                  {...register("NumeroRequerimiento")}
                />
              </div>
            </div>

            {/* Solicitante (personal) */}
            <div className="grid grid-cols-2 gap-4">
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Equipo</Label>
                <Select
                  value={watch("IdEquipo") ?? ""}
                  onValueChange={(v) =>
                    setValue("IdEquipo", v, { shouldValidate: true })
                  }
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
                <Label>Vehículo (placa)</Label>
                <Select
                  value={watch("IdVehiculo") ?? ""}
                  onValueChange={(v) =>
                    setValue("IdVehiculo", v, { shouldValidate: true })
                  }
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
            {/* Error de validación del refine (equipo o placa requerido) */}
            {errors.root && (
              <p className="text-xs text-destructive">{errors.root.message}</p>
            )}

            <Separator />

            {/* Detalle */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Materiales solicitados</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ IdProducto: "", Cantidad: 1 })}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Agregar línea
                </Button>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="w-28">Cantidad</TableHead>
                      <TableHead className="w-48">Notas (opt.)</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, idx) => (
                      <TableRow key={field.id}>
                        <TableCell className="align-top min-w-64">
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
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
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
              <Button type="submit" disabled={isPending}>
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

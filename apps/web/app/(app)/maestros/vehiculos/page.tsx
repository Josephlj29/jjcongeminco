"use client";

/**
 * app/(app)/maestros/vehiculos/page.tsx — ABM de vehículos/placas
 *
 * Funcionalidades:
 * - Lista de vehículos activos
 * - Dialog para crear nuevo vehículo (valida con CrearVehiculoSchema)
 *   - Dropdown de equipos cargado desde /api/equipos
 * - Acción editar por fila (mismo dialog en modo edición)
 * - Acciones restringidas por rol (productoEscritura = admin, almacenero)
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { usePaginacion } from "@/hooks/usePaginacion";
import { Paginacion } from "@/components/Paginacion";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { DialogEliminar } from "@/components/DialogEliminar";
import { toast } from "sonner";
import {
  CrearVehiculoSchema,
  ActualizarVehiculoSchema,
  type CrearVehiculo,
  type ActualizarVehiculo,
  type Vehiculo,
  puede,
} from "@congeminco/shared";
import {
  useVehiculos,
  useCrearVehiculo,
  useActualizarVehiculo,
  useEquipos,
  useEliminarVehiculo,
} from "@/hooks/useEquipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";

/* ─── Hook: rol del usuario actual ─── */
function useRolActual() {
  return useQuery({
    queryKey: ["yo"],
    queryFn: async () => {
      const res = await fetch("/api/yo");
      if (!res.ok) throw new Error("Sin sesión");
      return res.json() as Promise<{ rol: import("@congeminco/shared").RoleCode }>;
    },
  });
}

/* ─── Dialog: Crear / Editar vehículo ─── */
function DialogVehiculo({
  open,
  vehiculo,
  onClose,
}: {
  open: boolean;
  vehiculo: Vehiculo | null;
  onClose: () => void;
}) {
  const modoEdicion = !!vehiculo;
  const { mutateAsync: crear, isPending: creando } = useCrearVehiculo();
  const { mutateAsync: actualizar, isPending: actualizando } = useActualizarVehiculo();
  const { data: equipos } = useEquipos();
  const isPending = creando || actualizando;

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CrearVehiculo>({
    resolver: zodResolver(modoEdicion ? ActualizarVehiculoSchema : CrearVehiculoSchema),
    defaultValues: vehiculo
      ? {
          Placa: vehiculo.Placa,
          Modelo: vehiculo.Modelo ?? "",
          IdEquipo: vehiculo.IdEquipo ?? undefined,
        }
      : {},
  });

  const onSubmit = async (data: CrearVehiculo | ActualizarVehiculo) => {
    try {
      if (modoEdicion) {
        await actualizar({ id: vehiculo.Id, data });
        toast.success("Vehículo actualizado correctamente");
      } else {
        await crear(data as CrearVehiculo);
        toast.success("Vehículo creado correctamente");
      }
      reset();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{modoEdicion ? "Editar vehículo" : "Nuevo vehículo"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="Placa">Placa *</Label>
              <Input id="Placa" placeholder="ABC-123" {...register("Placa")} />
              {errors.Placa && (
                <p className="text-xs text-destructive">{errors.Placa.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="Modelo">Modelo</Label>
              <Input id="Modelo" placeholder="Toyota Hilux 2022" {...register("Modelo")} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Equipo</Label>
            <Select
              defaultValue={vehiculo?.IdEquipo ?? undefined}
              onValueChange={(v) => setValue("IdEquipo", v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin equipo asignado" />
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : modoEdicion ? "Guardar cambios" : "Crear vehículo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Página principal ─── */
export default function VehiculosPage() {
  const [mostrarDialog, setMostrarDialog] = useState(false);
  const [vehiculoEditar, setVehiculoEditar] = useState<Vehiculo | null>(null);
  const [vehiculoEliminar, setVehiculoEliminar] = useState<Vehiculo | null>(null);

  const { data: vehiculos, isLoading } = useVehiculos();
  const { data: equipos } = useEquipos();
  const { data: yo } = useRolActual();
  const puedeEscribir = puede(yo?.rol ?? null, "productoEscritura");
  const { mutateAsync: eliminarVehiculo } = useEliminarVehiculo();

  const paginacion = usePaginacion(vehiculos ?? [], 10);

  const equipoNombre = (idEquipo: string | null) => {
    if (!idEquipo) return "—";
    const eq = equipos?.find((e) => e.Id === idEquipo);
    return eq ? `${eq.Codigo} — ${eq.Nombre}` : idEquipo;
  };

  const abrirNuevo = () => {
    setVehiculoEditar(null);
    setMostrarDialog(true);
  };

  const abrirEditar = (v: Vehiculo) => {
    setVehiculoEditar(v);
    setMostrarDialog(true);
  };

  const cerrarDialog = () => {
    setMostrarDialog(false);
    setVehiculoEditar(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vehículos</h1>
          <p className="text-muted-foreground">Administra las placas y su equipo asignado</p>
        </div>
        {puedeEscribir && (
          <Button onClick={abrirNuevo}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo vehículo
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Placa</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Equipo</TableHead>
                {puedeEscribir && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!paginacion.itemsPagina.length ? (
                <TableRow>
                  <TableCell
                    colSpan={puedeEscribir ? 4 : 3}
                    className="text-center text-muted-foreground py-10"
                  >
                    No hay vehículos registrados.
                  </TableCell>
                </TableRow>
              ) : (
                paginacion.itemsPagina.map((v) => (
                  <TableRow key={v.Id}>
                    <TableCell className="font-mono font-medium">{v.Placa}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {v.Modelo ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {equipoNombre(v.IdEquipo)}
                    </TableCell>
                    {puedeEscribir && (
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => abrirEditar(v)}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setVehiculoEliminar(v)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Eliminar
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <Paginacion
            pagina={paginacion.pagina}
            totalPaginas={paginacion.totalPaginas}
            totalItems={paginacion.totalItems}
            desde={paginacion.desde}
            hasta={paginacion.hasta}
            onPagina={paginacion.setPagina}
          />
        </div>
      )}

      <DialogVehiculo
        open={mostrarDialog}
        vehiculo={vehiculoEditar}
        onClose={cerrarDialog}
      />

      <DialogEliminar
        entidad="vehiculo"
        id={vehiculoEliminar?.Id ?? null}
        nombre={vehiculoEliminar?.Placa ?? ""}
        open={!!vehiculoEliminar}
        onOpenChange={(v) => { if (!v) setVehiculoEliminar(null); }}
        onConfirmar={async () => {
          if (!vehiculoEliminar) return;
          try {
            await eliminarVehiculo(vehiculoEliminar.Id);
            toast.success("Vehículo eliminado correctamente");
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />
    </div>
  );
}

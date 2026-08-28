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
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Truck } from "lucide-react";
import { DialogEliminar } from "@/components/DialogEliminar";
import { toast } from "sonner";
import {
  CrearVehiculoSchema,
  ActualizarVehiculoSchema,
  type CrearVehiculo,
  type ActualizarVehiculo,
  type Vehiculo,
} from "@congeminco/shared";
import {
  useVehiculos,
  useCrearVehiculo,
  useActualizarVehiculo,
  useEquipos,
  useEliminarVehiculo,
} from "@/hooks/useEquipos";
import { usePermiso } from "@/hooks/useYo";
import { DataTable, type ColumnaDataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

/* ─── Dialog: Crear / Editar vehículo ─── */
function DialogVehiculo({ vehiculo, onClose }: { vehiculo: Vehiculo | null; onClose: () => void }) {
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
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{modoEdicion ? "Editar vehículo" : "Nuevo vehículo"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="Placa">Placa *</Label>
              <Input id="Placa" placeholder="ABC-123" {...register("Placa")} />
              {errors.Placa && <p className="text-xs text-destructive">{errors.Placa.message}</p>}
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
              onValueChange={(v) => setValue("IdEquipo", v === "__ninguno__" ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin equipo asignado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__ninguno__">Sin equipo</SelectItem>
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

  const { data: vehiculos, isLoading: cargando, isError: error, refetch } = useVehiculos();
  const { data: equipos } = useEquipos();
  const puedeEscribir = usePermiso("productoEscritura");
  const { mutateAsync: eliminarVehiculo } = useEliminarVehiculo();

  const equipoNombre = (idEquipo: string | null) => {
    if (!idEquipo) return "—";
    const eq = equipos?.find((e) => e.Id === idEquipo);
    return eq ? `${eq.Codigo} — ${eq.Nombre}` : idEquipo;
  };

  const columnas: ColumnaDataTable<Vehiculo>[] = [
    {
      id: "placa",
      titulo: "Placa",
      celda: (v) => v.Placa,
      className: "font-mono font-medium",
    },
    {
      id: "modelo",
      titulo: "Modelo",
      celda: (v) => v.Modelo ?? "—",
      className: "text-sm text-muted-foreground",
      ocultarEnMovil: true,
    },
    {
      id: "equipo",
      titulo: "Equipo",
      celda: (v) => equipoNombre(v.IdEquipo),
      className: "text-sm text-muted-foreground",
    },
  ];

  const abrirNuevo = () => {
    setVehiculoEditar(null);
    setMostrarDialog(true);
  };

  const cerrarDialog = () => {
    setMostrarDialog(false);
    setVehiculoEditar(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Vehículos"
        descripcion="Administra las placas y su equipo asignado"
        breadcrumbs={[{ label: "Maestros" }, { label: "Vehículos" }]}
        acciones={
          puedeEscribir && (
            <Button onClick={abrirNuevo}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo vehículo
            </Button>
          )
        }
      />

      <DataTable
        columnas={columnas}
        datos={vehiculos}
        obtenerId={(v) => v.Id}
        cargando={cargando}
        error={error}
        onReintentar={() => void refetch()}
        vacio={{
          icono: Truck,
          titulo: "No hay vehículos registrados",
        }}
        acciones={
          puedeEscribir
            ? [
                {
                  label: "Editar",
                  icono: Pencil,
                  onClick: (v) => {
                    setVehiculoEditar(v);
                    setMostrarDialog(true);
                  },
                },
                {
                  label: "Eliminar",
                  icono: Trash2,
                  variante: "destructiva",
                  onClick: (v) => setVehiculoEliminar(v),
                },
              ]
            : undefined
        }
      />

      {mostrarDialog && <DialogVehiculo vehiculo={vehiculoEditar} onClose={cerrarDialog} />}

      <DialogEliminar
        entidad="vehiculo"
        id={vehiculoEliminar?.Id ?? null}
        nombre={vehiculoEliminar?.Placa ?? ""}
        open={!!vehiculoEliminar}
        onOpenChange={(v) => {
          if (!v) setVehiculoEliminar(null);
        }}
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

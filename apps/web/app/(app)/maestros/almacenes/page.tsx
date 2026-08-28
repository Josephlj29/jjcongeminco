"use client";

/**
 * app/(app)/maestros/almacenes/page.tsx — ABM de ubicaciones/almacenes
 *
 * Funcionalidades:
 * - Lista de ubicaciones activas
 * - Dialog para crear nueva ubicación (valida con CrearUbicacionSchema)
 * - Acción editar por fila (mismo dialog en modo edición)
 * - Acciones restringidas por rol (catalogoAdmin = solo admin)
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Warehouse } from "lucide-react";
import { DialogEliminar } from "@/components/DialogEliminar";
import { toast } from "sonner";
import {
  CrearUbicacionSchema,
  ActualizarUbicacionSchema,
  TIPO_UBICACION,
  type CrearUbicacion,
  type ActualizarUbicacion,
  type Ubicacion,
} from "@congeminco/shared";
import {
  useUbicaciones,
  useCrearUbicacion,
  useActualizarUbicacion,
  useEliminarUbicacion,
} from "@/hooks/useUbicaciones";
import { usePermiso } from "@/hooks/useYo";
import { DataTable, type ColumnaDataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

const ETIQUETA_TIPO: Record<string, string> = {
  almacen_central: "Almacén central",
  proyecto: "Proyecto",
  otro: "Otro",
};

/* ─── Dialog: Crear / Editar ubicación ─── */
function DialogUbicacion({
  ubicacion,
  onClose,
}: {
  ubicacion: Ubicacion | null;
  onClose: () => void;
}) {
  const modoEdicion = !!ubicacion;
  const { mutateAsync: crear, isPending: creando } = useCrearUbicacion();
  const { mutateAsync: actualizar, isPending: actualizando } = useActualizarUbicacion();
  const isPending = creando || actualizando;

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CrearUbicacion>({
    resolver: zodResolver(modoEdicion ? ActualizarUbicacionSchema : CrearUbicacionSchema),
    defaultValues: ubicacion
      ? {
          Codigo: ubicacion.Codigo,
          Nombre: ubicacion.Nombre,
          Tipo: ubicacion.Tipo,
          Direccion: ubicacion.Direccion ?? "",
        }
      : { Tipo: "proyecto" },
  });

  const onSubmit = async (data: CrearUbicacion | ActualizarUbicacion) => {
    try {
      if (modoEdicion) {
        await actualizar({ id: ubicacion.Id, data });
        toast.success("Ubicación actualizada correctamente");
      } else {
        await crear(data as CrearUbicacion);
        toast.success("Ubicación creada correctamente");
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
          <DialogTitle>{modoEdicion ? "Editar ubicación" : "Nueva ubicación"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="Codigo">Código *</Label>
              <Input id="Codigo" placeholder="ALM-001" {...register("Codigo")} />
              {errors.Codigo && <p className="text-xs text-destructive">{errors.Codigo.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Tipo *</Label>
              <Select
                defaultValue={ubicacion?.Tipo ?? "proyecto"}
                onValueChange={(v) => setValue("Tipo", v as CrearUbicacion["Tipo"])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_UBICACION.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ETIQUETA_TIPO[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.Tipo && <p className="text-xs text-destructive">{errors.Tipo.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="Nombre">Nombre *</Label>
            <Input id="Nombre" placeholder="Almacén principal" {...register("Nombre")} />
            {errors.Nombre && <p className="text-xs text-destructive">{errors.Nombre.message}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="Direccion">Dirección</Label>
            <Input id="Direccion" placeholder="Av. ejemplo 123" {...register("Direccion")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : modoEdicion ? "Guardar cambios" : "Crear ubicación"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const COLUMNAS: ColumnaDataTable<Ubicacion>[] = [
  {
    id: "codigo",
    titulo: "Código",
    celda: (u) => u.Codigo,
    className: "font-mono text-xs",
  },
  {
    id: "nombre",
    titulo: "Nombre",
    celda: (u) => u.Nombre,
    className: "font-medium",
  },
  {
    id: "tipo",
    titulo: "Tipo",
    celda: (u) => <Badge variant="outline">{ETIQUETA_TIPO[u.Tipo] ?? u.Tipo}</Badge>,
  },
  {
    id: "direccion",
    titulo: "Dirección",
    celda: (u) => u.Direccion ?? "—",
    className: "text-sm text-muted-foreground",
    ocultarEnMovil: true,
  },
];

/* ─── Página principal ─── */
export default function AlmacenesPage() {
  const [mostrarDialog, setMostrarDialog] = useState(false);
  const [ubicacionEditar, setUbicacionEditar] = useState<Ubicacion | null>(null);
  const [ubicacionEliminar, setUbicacionEliminar] = useState<Ubicacion | null>(null);

  const { data: ubicaciones, isLoading: cargando, isError: error, refetch } = useUbicaciones();
  const puedeEscribir = usePermiso("catalogoAdmin");
  const { mutateAsync: eliminarUbicacion } = useEliminarUbicacion();

  const abrirNuevo = () => {
    setUbicacionEditar(null);
    setMostrarDialog(true);
  };

  const cerrarDialog = () => {
    setMostrarDialog(false);
    setUbicacionEditar(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Almacenes"
        descripcion="Administra las ubicaciones y almacenes"
        breadcrumbs={[{ label: "Maestros" }, { label: "Almacenes" }]}
        acciones={
          puedeEscribir && (
            <Button onClick={abrirNuevo}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva ubicación
            </Button>
          )
        }
      />

      <DataTable
        columnas={COLUMNAS}
        datos={ubicaciones}
        obtenerId={(u) => u.Id}
        cargando={cargando}
        error={error}
        onReintentar={() => void refetch()}
        vacio={{
          icono: Warehouse,
          titulo: "No hay ubicaciones registradas",
        }}
        acciones={
          puedeEscribir
            ? [
                {
                  label: "Editar",
                  icono: Pencil,
                  onClick: (u) => {
                    setUbicacionEditar(u);
                    setMostrarDialog(true);
                  },
                },
                {
                  label: "Eliminar",
                  icono: Trash2,
                  variante: "destructiva",
                  onClick: (u) => setUbicacionEliminar(u),
                },
              ]
            : undefined
        }
      />

      {mostrarDialog && <DialogUbicacion ubicacion={ubicacionEditar} onClose={cerrarDialog} />}

      <DialogEliminar
        entidad="ubicacion"
        id={ubicacionEliminar?.Id ?? null}
        nombre={ubicacionEliminar?.Nombre ?? ""}
        open={!!ubicacionEliminar}
        onOpenChange={(v) => {
          if (!v) setUbicacionEliminar(null);
        }}
        onConfirmar={async () => {
          if (!ubicacionEliminar) return;
          try {
            await eliminarUbicacion(ubicacionEliminar.Id);
            toast.success("Ubicación eliminada correctamente");
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />
    </div>
  );
}

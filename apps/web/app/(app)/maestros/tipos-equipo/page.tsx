"use client";

/**
 * app/(app)/maestros/tipos-equipo/page.tsx — ABM de tipos de equipo
 *
 * Funcionalidades:
 * - Lista de tipos de equipo activos
 * - Dialog para crear nuevo tipo (valida con CrearTipoEquipoSchema)
 * - Acción editar por fila (mismo dialog en modo edición)
 * - Acción eliminar con verificación de dependencias (DialogEliminar)
 * - Acciones restringidas por rol (productoEscritura = admin, almacenero)
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Wrench } from "lucide-react";
import { DialogEliminar } from "@/components/DialogEliminar";
import { toast } from "sonner";
import {
  CrearTipoEquipoSchema,
  ActualizarTipoEquipoSchema,
  type CrearTipoEquipo,
  type ActualizarTipoEquipo,
  type TipoEquipo,
} from "@congeminco/shared";
import {
  useTiposEquipo,
  useCrearTipoEquipo,
  useActualizarTipoEquipo,
  useEliminarTipoEquipo,
} from "@/hooks/useTiposEquipo";
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

/* ─── Dialog: Crear / Editar tipo de equipo ─── */
function DialogTipoEquipo({
  tipoEquipo,
  onClose,
}: {
  tipoEquipo: TipoEquipo | null;
  onClose: () => void;
}) {
  const modoEdicion = !!tipoEquipo;
  const { mutateAsync: crear, isPending: creando } = useCrearTipoEquipo();
  const { mutateAsync: actualizar, isPending: actualizando } = useActualizarTipoEquipo();
  const isPending = creando || actualizando;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearTipoEquipo>({
    resolver: zodResolver(modoEdicion ? ActualizarTipoEquipoSchema : CrearTipoEquipoSchema),
    defaultValues: tipoEquipo
      ? {
          Codigo: tipoEquipo.Codigo,
          Nombre: tipoEquipo.Nombre,
          Descripcion: tipoEquipo.Descripcion ?? "",
        }
      : {},
  });

  const onSubmit = async (data: CrearTipoEquipo | ActualizarTipoEquipo) => {
    try {
      if (modoEdicion) {
        await actualizar({ id: tipoEquipo.Id, data });
        toast.success("Tipo de equipo actualizado correctamente");
      } else {
        await crear(data as CrearTipoEquipo);
        toast.success("Tipo de equipo creado correctamente");
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
          <DialogTitle>
            {modoEdicion ? "Editar tipo de equipo" : "Nuevo tipo de equipo"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="Codigo">Código *</Label>
              <Input id="Codigo" placeholder="TE-001" {...register("Codigo")} />
              {errors.Codigo && <p className="text-xs text-destructive">{errors.Codigo.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="Nombre">Nombre *</Label>
              <Input id="Nombre" placeholder="Excavadora hidráulica" {...register("Nombre")} />
              {errors.Nombre && <p className="text-xs text-destructive">{errors.Nombre.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="Descripcion">Descripción</Label>
            <Input
              id="Descripcion"
              placeholder="Descripción del tipo de equipo"
              {...register("Descripcion")}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : modoEdicion ? "Guardar cambios" : "Crear tipo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const COLUMNAS: ColumnaDataTable<TipoEquipo>[] = [
  {
    id: "codigo",
    titulo: "Código",
    celda: (t) => t.Codigo,
    className: "font-mono text-xs",
  },
  {
    id: "nombre",
    titulo: "Nombre",
    celda: (t) => t.Nombre,
    className: "font-medium",
  },
  {
    id: "descripcion",
    titulo: "Descripción",
    celda: (t) => t.Descripcion ?? "—",
    className: "text-sm text-muted-foreground",
    ocultarEnMovil: true,
  },
];

/* ─── Página principal ─── */
export default function TiposEquipoPage() {
  const [mostrarDialog, setMostrarDialog] = useState(false);
  const [tipoEditar, setTipoEditar] = useState<TipoEquipo | null>(null);
  const [tipoEliminar, setTipoEliminar] = useState<TipoEquipo | null>(null);

  const { data: tipos, isLoading: cargando, isError: error, refetch } = useTiposEquipo();
  const puedeEscribir = usePermiso("productoEscritura");
  const { mutateAsync: eliminarTipo } = useEliminarTipoEquipo();

  const abrirNuevo = () => {
    setTipoEditar(null);
    setMostrarDialog(true);
  };

  const cerrarDialog = () => {
    setMostrarDialog(false);
    setTipoEditar(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Tipos de equipo"
        descripcion="Clasificaciones de equipos para asociar a productos compatibles"
        breadcrumbs={[{ label: "Maestros" }, { label: "Tipos de equipo" }]}
        acciones={
          puedeEscribir && (
            <Button onClick={abrirNuevo}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo tipo
            </Button>
          )
        }
      />

      <DataTable
        columnas={COLUMNAS}
        datos={tipos}
        obtenerId={(t) => t.Id}
        cargando={cargando}
        error={error}
        onReintentar={() => void refetch()}
        vacio={{
          icono: Wrench,
          titulo: "No hay tipos de equipo registrados",
          descripcion:
            "Crea el primer tipo para poder clasificar los equipos y asociarlos a productos.",
          accion: puedeEscribir ? (
            <Button size="sm" onClick={abrirNuevo}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo tipo
            </Button>
          ) : undefined,
        }}
        acciones={
          puedeEscribir
            ? [
                {
                  label: "Editar",
                  icono: Pencil,
                  onClick: (t) => {
                    setTipoEditar(t);
                    setMostrarDialog(true);
                  },
                },
                {
                  label: "Eliminar",
                  icono: Trash2,
                  variante: "destructiva",
                  onClick: (t) => setTipoEliminar(t),
                },
              ]
            : undefined
        }
      />

      {mostrarDialog && <DialogTipoEquipo tipoEquipo={tipoEditar} onClose={cerrarDialog} />}

      <DialogEliminar
        entidad="tipoEquipo"
        id={tipoEliminar?.Id ?? null}
        nombre={tipoEliminar?.Nombre ?? ""}
        open={!!tipoEliminar}
        onOpenChange={(v) => {
          if (!v) setTipoEliminar(null);
        }}
        onConfirmar={async () => {
          if (!tipoEliminar) return;
          try {
            await eliminarTipo(tipoEliminar.Id);
            toast.success("Tipo de equipo eliminado correctamente");
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />
    </div>
  );
}

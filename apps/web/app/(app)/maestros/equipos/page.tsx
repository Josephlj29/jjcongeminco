"use client";

/**
 * app/(app)/maestros/equipos/page.tsx — ABM de equipos
 *
 * Funcionalidades:
 * - Lista de equipos activos
 * - Dialog para crear nuevo equipo (valida con CrearEquipoSchema)
 * - Acción editar por fila (mismo dialog en modo edición)
 * - Acciones restringidas por rol (productoEscritura = admin, almacenero)
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Cog } from "lucide-react";
import { DialogEliminar } from "@/components/DialogEliminar";
import { toast } from "sonner";
import {
  CrearEquipoSchema,
  ActualizarEquipoSchema,
  type CrearEquipo,
  type ActualizarEquipo,
  type Equipo,
} from "@congeminco/shared";
import {
  useEquipos,
  useCrearEquipo,
  useActualizarEquipo,
  useEliminarEquipo,
} from "@/hooks/useEquipos";
import { useTiposEquipo } from "@/hooks/useTiposEquipo";
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

/* ─── Dialog: Crear / Editar equipo ─── */
function DialogEquipo({ equipo, onClose }: { equipo: Equipo | null; onClose: () => void }) {
  const modoEdicion = !!equipo;
  const { mutateAsync: crear, isPending: creando } = useCrearEquipo();
  const { mutateAsync: actualizar, isPending: actualizando } = useActualizarEquipo();
  const { data: tiposEquipo } = useTiposEquipo();
  const isPending = creando || actualizando;

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CrearEquipo>({
    resolver: zodResolver(modoEdicion ? ActualizarEquipoSchema : CrearEquipoSchema),
    defaultValues: equipo
      ? {
          Codigo: equipo.Codigo,
          Nombre: equipo.Nombre,
          Descripcion: equipo.Descripcion ?? "",
          IdTipoEquipo: equipo.IdTipoEquipo ?? undefined,
        }
      : {},
  });

  const onSubmit = async (data: CrearEquipo | ActualizarEquipo) => {
    try {
      if (modoEdicion) {
        await actualizar({ id: equipo.Id, data });
        toast.success("Equipo actualizado correctamente");
      } else {
        await crear(data as CrearEquipo);
        toast.success("Equipo creado correctamente");
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
          <DialogTitle>{modoEdicion ? "Editar equipo" : "Nuevo equipo"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="Codigo">Código *</Label>
              <Input id="Codigo" placeholder="EQ-001" {...register("Codigo")} />
              {errors.Codigo && <p className="text-xs text-destructive">{errors.Codigo.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="Nombre">Nombre *</Label>
              <Input id="Nombre" placeholder="Excavadora CAT 320" {...register("Nombre")} />
              {errors.Nombre && <p className="text-xs text-destructive">{errors.Nombre.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Tipo de equipo</Label>
            <Select
              defaultValue={equipo?.IdTipoEquipo ?? undefined}
              onValueChange={(v) => setValue("IdTipoEquipo", v === "__ninguno__" ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tipo..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__ninguno__">Sin tipo</SelectItem>
                {tiposEquipo?.map((t) => (
                  <SelectItem key={t.Id} value={t.Id}>
                    {t.Nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.IdTipoEquipo && (
              <p className="text-xs text-destructive">{errors.IdTipoEquipo.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="Descripcion">Descripción</Label>
            <Input
              id="Descripcion"
              placeholder="Descripción del equipo"
              {...register("Descripcion")}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : modoEdicion ? "Guardar cambios" : "Crear equipo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const COLUMNAS: ColumnaDataTable<Equipo>[] = [
  {
    id: "codigo",
    titulo: "Código",
    celda: (e) => e.Codigo,
    className: "font-mono text-xs",
  },
  {
    id: "nombre",
    titulo: "Nombre",
    celda: (e) => e.Nombre,
    className: "font-medium",
  },
  {
    id: "tipo",
    titulo: "Tipo",
    celda: (e) =>
      e.NombreTipoEquipo ? (
        <Badge variant="secondary">{e.NombreTipoEquipo}</Badge>
      ) : (
        <Badge variant="warning">Sin tipo</Badge>
      ),
  },
  {
    id: "descripcion",
    titulo: "Descripción",
    celda: (e) => e.Descripcion ?? "—",
    className: "text-sm text-muted-foreground",
    ocultarEnMovil: true,
  },
];

/* ─── Página principal ─── */
export default function EquiposPage() {
  const [mostrarDialog, setMostrarDialog] = useState(false);
  const [equipoEditar, setEquipoEditar] = useState<Equipo | null>(null);
  const [equipoEliminar, setEquipoEliminar] = useState<Equipo | null>(null);

  const { data: equipos, isLoading: cargando, isError: error, refetch } = useEquipos();
  const puedeEscribir = usePermiso("productoEscritura");
  const { mutateAsync: eliminarEquipo } = useEliminarEquipo();

  const abrirNuevo = () => {
    setEquipoEditar(null);
    setMostrarDialog(true);
  };

  const cerrarDialog = () => {
    setMostrarDialog(false);
    setEquipoEditar(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Equipos"
        descripcion="Administra los equipos de la empresa"
        breadcrumbs={[{ label: "Maestros" }, { label: "Equipos" }]}
        acciones={
          puedeEscribir && (
            <Button onClick={abrirNuevo}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo equipo
            </Button>
          )
        }
      />

      <DataTable
        columnas={COLUMNAS}
        datos={equipos}
        obtenerId={(e) => e.Id}
        cargando={cargando}
        error={error}
        onReintentar={() => void refetch()}
        vacio={{
          icono: Cog,
          titulo: "No hay equipos registrados",
        }}
        acciones={
          puedeEscribir
            ? [
                {
                  label: "Editar",
                  icono: Pencil,
                  onClick: (e) => {
                    setEquipoEditar(e);
                    setMostrarDialog(true);
                  },
                },
                {
                  label: "Eliminar",
                  icono: Trash2,
                  variante: "destructiva",
                  onClick: (e) => setEquipoEliminar(e),
                },
              ]
            : undefined
        }
      />

      {mostrarDialog && <DialogEquipo equipo={equipoEditar} onClose={cerrarDialog} />}

      <DialogEliminar
        entidad="equipo"
        id={equipoEliminar?.Id ?? null}
        nombre={equipoEliminar?.Nombre ?? ""}
        open={!!equipoEliminar}
        onOpenChange={(v) => {
          if (!v) setEquipoEliminar(null);
        }}
        onConfirmar={async () => {
          if (!equipoEliminar) return;
          try {
            await eliminarEquipo(equipoEliminar.Id);
            toast.success("Equipo eliminado correctamente");
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />
    </div>
  );
}

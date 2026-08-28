"use client";

/**
 * app/(app)/maestros/cargos/page.tsx — ABM de cargos del personal
 * Catálogo simple (Código, Nombre, Descripción). Escritura: admin (catalogoAdmin).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, BriefcaseBusiness } from "lucide-react";
import { toast } from "sonner";
import {
  CrearCargoSchema,
  ActualizarCargoSchema,
  type CrearCargo,
  type Cargo,
} from "@congeminco/shared";
import {
  useCargos,
  useCrearCargo,
  useActualizarCargo,
  useEliminarCargo,
} from "@/hooks/useCargos";
import { usePermiso } from "@/hooks/useYo";
import { DataTable, type ColumnaDataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { DialogEliminar } from "@/components/DialogEliminar";
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

function DialogCargo({
  cargo,
  onClose,
}: {
  cargo: Cargo | null;
  onClose: () => void;
}) {
  const modoEdicion = !!cargo;
  const { mutateAsync: crear, isPending: creando } = useCrearCargo();
  const { mutateAsync: actualizar, isPending: act } = useActualizarCargo();
  const isPending = creando || act;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CrearCargo>({
    resolver: zodResolver(modoEdicion ? ActualizarCargoSchema : CrearCargoSchema),
    defaultValues: cargo
      ? { Codigo: cargo.Codigo, Nombre: cargo.Nombre, Descripcion: cargo.Descripcion ?? "" }
      : {},
  });

  const onSubmit = async (data: CrearCargo) => {
    try {
      if (modoEdicion) {
        await actualizar({ id: cargo.Id, data });
        toast.success("Cargo actualizado correctamente");
      } else {
        await crear(data);
        toast.success("Cargo creado correctamente");
      }
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{modoEdicion ? "Editar cargo" : "Nuevo cargo"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="Codigo">Código *</Label>
              <Input id="Codigo" placeholder="MEC" {...register("Codigo")} />
              {errors.Codigo && (
                <p className="text-xs text-destructive">{errors.Codigo.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="Nombre">Nombre *</Label>
              <Input id="Nombre" placeholder="Mecánico" {...register("Nombre")} />
              {errors.Nombre && (
                <p className="text-xs text-destructive">{errors.Nombre.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="Descripcion">Descripción</Label>
            <Input id="Descripcion" placeholder="Opcional" {...register("Descripcion")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : modoEdicion ? "Guardar cambios" : "Crear cargo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const COLUMNAS: ColumnaDataTable<Cargo>[] = [
  {
    id: "codigo",
    titulo: "Código",
    celda: (c) => c.Codigo,
    className: "font-mono text-xs",
  },
  {
    id: "nombre",
    titulo: "Nombre",
    celda: (c) => c.Nombre,
    className: "font-medium",
  },
  {
    id: "descripcion",
    titulo: "Descripción",
    celda: (c) => c.Descripcion ?? "—",
    className: "text-sm text-muted-foreground",
    ocultarEnMovil: true,
  },
];

export default function CargosPage() {
  const [mostrarDialog, setMostrarDialog] = useState(false);
  const [editar, setEditar] = useState<Cargo | null>(null);
  const [eliminarC, setEliminarC] = useState<Cargo | null>(null);

  const { data: cargos, isLoading: cargando, isError: error, refetch } = useCargos();
  const puedeEscribir = usePermiso("catalogoAdmin");
  const { mutateAsync: eliminar } = useEliminarCargo();

  const abrirNuevo = () => {
    setEditar(null);
    setMostrarDialog(true);
  };
  const cerrar = () => {
    setMostrarDialog(false);
    setEditar(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Cargos"
        descripcion="Catálogo de cargos del personal (mecánico, operador, jefe de taller…)."
        breadcrumbs={[{ label: "Maestros" }, { label: "Cargos" }]}
        acciones={
          puedeEscribir && (
            <Button onClick={abrirNuevo}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo cargo
            </Button>
          )
        }
      />

      <DataTable
        columnas={COLUMNAS}
        datos={cargos}
        obtenerId={(c) => c.Id}
        cargando={cargando}
        error={error}
        onReintentar={() => void refetch()}
        vacio={{
          icono: BriefcaseBusiness,
          titulo: "No hay cargos registrados",
          descripcion: "Crea el primer cargo para clasificar al personal.",
          accion: puedeEscribir ? (
            <Button size="sm" onClick={abrirNuevo}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo cargo
            </Button>
          ) : undefined,
        }}
        acciones={
          puedeEscribir
            ? [
                {
                  label: "Editar",
                  icono: Pencil,
                  onClick: (c) => {
                    setEditar(c);
                    setMostrarDialog(true);
                  },
                },
                {
                  label: "Eliminar",
                  icono: Trash2,
                  variante: "destructiva",
                  onClick: (c) => setEliminarC(c),
                },
              ]
            : undefined
        }
      />

      {mostrarDialog && <DialogCargo cargo={editar} onClose={cerrar} />}

      <DialogEliminar
        entidad="cargo"
        id={eliminarC?.Id ?? null}
        nombre={eliminarC?.Nombre ?? ""}
        open={!!eliminarC}
        onOpenChange={(v) => {
          if (!v) setEliminarC(null);
        }}
        onConfirmar={async () => {
          if (!eliminarC) return;
          try {
            await eliminar(eliminarC.Id);
            toast.success("Cargo eliminado correctamente");
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />
    </div>
  );
}

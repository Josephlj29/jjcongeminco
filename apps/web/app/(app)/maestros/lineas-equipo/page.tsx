"use client";

/**
 * app/(app)/maestros/lineas-equipo/page.tsx — ABM de líneas de flota.
 *
 * La línea es el primer nivel: línea > tipo de equipo > equipo > placa.
 * Antes vivía como prefijo dentro del código del tipo ("LIN AMA - MINI"), así
 * que sumar una línea obligaba a renombrar tipos a mano y no se podía agrupar
 * ni filtrar por ella. Con este maestro, agregar una línea (oruga, perforación,
 * lo que venga) es un registro más y los tipos se cuelgan de ella solos.
 *
 * Escritura: admin (catalogoAdmin).
 */
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Layers } from "lucide-react";
import { toast } from "sonner";
import {
  CrearLineaEquipoSchema,
  ActualizarLineaEquipoSchema,
  type CrearLineaEquipo,
} from "@congeminco/shared";
import {
  useLineasEquipo,
  useCrearLineaEquipo,
  useActualizarLineaEquipo,
  useEliminarLineaEquipo,
  type LineaEquipoFila,
} from "@/hooks/useLineasEquipo";
import { useTiposEquipo } from "@/hooks/useTiposEquipo";
import { usePermiso } from "@/hooks/useYo";
import { DataTable, type ColumnaDataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { DialogEliminar } from "@/components/DialogEliminar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";

function DialogLinea({
  linea,
  onClose,
}: {
  linea: LineaEquipoFila | null;
  onClose: () => void;
}) {
  const modoEdicion = !!linea;
  const { mutateAsync: crear, isPending: creando } = useCrearLineaEquipo();
  const { mutateAsync: actualizar, isPending: act } = useActualizarLineaEquipo();
  const isPending = creando || act;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CrearLineaEquipo>({
    resolver: zodResolver(modoEdicion ? ActualizarLineaEquipoSchema : CrearLineaEquipoSchema),
    defaultValues: linea
      ? {
          Codigo: linea.Codigo,
          Nombre: linea.Nombre,
          Descripcion: linea.Descripcion ?? "",
          Orden: linea.Orden,
        }
      : { Orden: 0 },
  });

  const onSubmit = async (data: CrearLineaEquipo) => {
    try {
      if (modoEdicion) {
        await actualizar({ id: linea.Id, data });
        toast.success("Línea actualizada correctamente");
      } else {
        await crear(data);
        toast.success("Línea creada correctamente");
      }
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{modoEdicion ? "Editar línea" : "Nueva línea de equipo"}</DialogTitle>
          <p className="pt-1 text-sm text-muted-foreground">
            La línea agrupa tipos de equipo. Los tipos se cuelgan de ella desde el maestro de tipos
            de equipo.
          </p>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="Codigo">Código *</Label>
                <Input id="Codigo" placeholder="ORUGA" {...register("Codigo")} />
                {errors.Codigo && (
                  <p className="text-xs text-destructive">{errors.Codigo.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="Nombre">Nombre *</Label>
                <Input id="Nombre" placeholder="Línea oruga" {...register("Nombre")} />
                {errors.Nombre && (
                  <p className="text-xs text-destructive">{errors.Nombre.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="Descripcion">Descripción</Label>
              <Input
                id="Descripcion"
                placeholder="Qué equipos agrupa y cómo se controla (horómetro, kilometraje…)"
                {...register("Descripcion")}
              />
              {errors.Descripcion && (
                <p className="text-xs text-destructive">{errors.Descripcion.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="Orden">Orden</Label>
              <Input
                id="Orden"
                type="number"
                min={0}
                step={1}
                {...register("Orden", { valueAsNumber: true })}
              />
              <p className="text-xs text-muted-foreground">
                En qué posición aparece en los selectores. Es solo presentación, no jerarquía.
              </p>
              {errors.Orden && <p className="text-xs text-destructive">{errors.Orden.message}</p>}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : modoEdicion ? "Guardar cambios" : "Crear línea"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function LineasEquipoPage() {
  const [mostrarDialog, setMostrarDialog] = useState(false);
  const [editar, setEditar] = useState<LineaEquipoFila | null>(null);
  const [eliminarL, setEliminarL] = useState<LineaEquipoFila | null>(null);

  const { data: lineas, isLoading: cargando, isError: error, refetch } = useLineasEquipo();
  const { data: tipos } = useTiposEquipo();
  const puedeEscribir = usePermiso("catalogoAdmin");
  const { mutateAsync: eliminar } = useEliminarLineaEquipo();

  /* Cuántos tipos cuelgan de cada línea. Se muestra en la grilla porque es el
     dato que decide si una línea se puede dar de baja o no. */
  const tiposPorLinea = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const t of tipos ?? []) {
      mapa.set(t.IdLinea, (mapa.get(t.IdLinea) ?? 0) + 1);
    }
    return mapa;
  }, [tipos]);

  const columnas: ColumnaDataTable<LineaEquipoFila>[] = [
    {
      id: "codigo",
      titulo: "Código",
      celda: (l) => l.Codigo,
      className: "font-mono text-xs",
    },
    {
      id: "nombre",
      titulo: "Nombre",
      celda: (l) => l.Nombre,
      className: "font-medium",
    },
    {
      id: "tipos",
      titulo: "Tipos",
      celda: (l) => {
        const n = tiposPorLinea.get(l.Id) ?? 0;
        return (
          <Badge variant={n === 0 ? "outline" : "secondary"}>
            {n} {n === 1 ? "tipo" : "tipos"}
          </Badge>
        );
      },
    },
    {
      id: "descripcion",
      titulo: "Descripción",
      celda: (l) => l.Descripcion ?? "—",
      className: "text-sm text-muted-foreground",
      ocultarEnMovil: true,
    },
    {
      id: "orden",
      titulo: "Orden",
      celda: (l) => l.Orden,
      className: "text-sm text-muted-foreground",
      ocultarEnMovil: true,
    },
  ];

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
        titulo="Líneas de equipo"
        descripcion="Primer nivel de la flota: agrupa los tipos de equipo (trackless, liviana, y las que sumes)."
        breadcrumbs={[{ label: "Maestros" }, { label: "Líneas de equipo" }]}
        acciones={
          puedeEscribir && (
            <Button onClick={abrirNuevo}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva línea
            </Button>
          )
        }
      />

      <DataTable
        columnas={columnas}
        datos={lineas}
        obtenerId={(l) => l.Id}
        cargando={cargando}
        error={error}
        onReintentar={() => void refetch()}
        vacio={{
          icono: Layers,
          titulo: "No hay líneas registradas",
          descripcion: "Crea la primera línea para agrupar los tipos de equipo.",
          accion: puedeEscribir ? (
            <Button size="sm" onClick={abrirNuevo}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva línea
            </Button>
          ) : undefined,
        }}
        acciones={
          puedeEscribir
            ? [
                {
                  label: "Editar",
                  icono: Pencil,
                  onClick: (l) => {
                    setEditar(l);
                    setMostrarDialog(true);
                  },
                },
                {
                  label: "Eliminar",
                  icono: Trash2,
                  variante: "destructiva",
                  onClick: (l) => setEliminarL(l),
                },
              ]
            : undefined
        }
      />

      {mostrarDialog && <DialogLinea linea={editar} onClose={cerrar} />}

      <DialogEliminar
        entidad="lineaEquipo"
        id={eliminarL?.Id ?? null}
        nombre={eliminarL?.Nombre ?? ""}
        open={!!eliminarL}
        onOpenChange={(v) => {
          if (!v) setEliminarL(null);
        }}
        onConfirmar={async () => {
          if (!eliminarL) return;
          try {
            await eliminar(eliminarL.Id);
            toast.success("Línea eliminada correctamente");
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />
    </div>
  );
}

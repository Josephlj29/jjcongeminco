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
import { Plus, Trash2, Wrench } from "lucide-react";
import { usePaginacion } from "@/hooks/usePaginacion";
import { Paginacion } from "@/components/Paginacion";
import { DialogEliminar } from "@/components/DialogEliminar";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "sonner";
import {
  CrearTipoEquipoSchema,
  ActualizarTipoEquipoSchema,
  type CrearTipoEquipo,
  type ActualizarTipoEquipo,
  type TipoEquipo,
  puede,
} from "@congeminco/shared";
import {
  useTiposEquipo,
  useCrearTipoEquipo,
  useActualizarTipoEquipo,
  useEliminarTipoEquipo,
} from "@/hooks/useTiposEquipo";
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

/* ─── Dialog: Crear / Editar tipo de equipo ─── */
function DialogTipoEquipo({
  open,
  tipoEquipo,
  onClose,
}: {
  open: boolean;
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
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
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
              {errors.Codigo && (
                <p className="text-xs text-destructive">{errors.Codigo.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="Nombre">Nombre *</Label>
              <Input id="Nombre" placeholder="Excavadora hidráulica" {...register("Nombre")} />
              {errors.Nombre && (
                <p className="text-xs text-destructive">{errors.Nombre.message}</p>
              )}
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
              {isPending
                ? "Guardando..."
                : modoEdicion
                ? "Guardar cambios"
                : "Crear tipo"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Página principal ─── */
export default function TiposEquipoPage() {
  const [mostrarDialog, setMostrarDialog] = useState(false);
  const [tipoEditar, setTipoEditar] = useState<TipoEquipo | null>(null);
  const [tipoEliminar, setTipoEliminar] = useState<TipoEquipo | null>(null);

  const { data: tipos, isLoading } = useTiposEquipo();
  const { data: yo } = useRolActual();
  const puedeEscribir = puede(yo?.rol ?? null, "productoEscritura");
  const { mutateAsync: eliminarTipo } = useEliminarTipoEquipo();

  const paginacion = usePaginacion(tipos ?? [], 10);

  const abrirNuevo = () => {
    setTipoEditar(null);
    setMostrarDialog(true);
  };

  const abrirEditar = (t: TipoEquipo) => {
    setTipoEditar(t);
    setMostrarDialog(true);
  };

  const cerrarDialog = () => {
    setMostrarDialog(false);
    setTipoEditar(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tipos de equipo</h1>
          <p className="text-muted-foreground">
            Clasificaciones de equipos para asociar a productos compatibles
          </p>
        </div>
        {puedeEscribir && (
          <Button onClick={abrirNuevo}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo tipo
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
                <TableHead>Código</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Descripción</TableHead>
                {puedeEscribir && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!paginacion.itemsPagina.length ? (
                <TableRow>
                  <TableCell colSpan={puedeEscribir ? 4 : 3} className="p-0">
                    <EmptyState
                      icon={Wrench}
                      titulo="No hay tipos de equipo registrados"
                      descripcion="Creá el primer tipo para poder clasificar los equipos y asociarlos a productos."
                      accion={
                        puedeEscribir ? (
                          <Button size="sm" onClick={abrirNuevo}>
                            <Plus className="mr-2 h-4 w-4" />
                            Nuevo tipo
                          </Button>
                        ) : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                paginacion.itemsPagina.map((t) => (
                  <TableRow key={t.Id}>
                    <TableCell className="font-mono text-xs">{t.Codigo}</TableCell>
                    <TableCell className="font-medium">{t.Nombre}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {t.Descripcion ?? "—"}
                    </TableCell>
                    {puedeEscribir && (
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => abrirEditar(t)}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setTipoEliminar(t)}
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
          {paginacion.totalPaginas > 1 && (
            <Paginacion
              pagina={paginacion.pagina}
              totalPaginas={paginacion.totalPaginas}
              totalItems={paginacion.totalItems}
              desde={paginacion.desde}
              hasta={paginacion.hasta}
              onPagina={paginacion.setPagina}
            />
          )}
        </div>
      )}

      <DialogTipoEquipo
        open={mostrarDialog}
        tipoEquipo={tipoEditar}
        onClose={cerrarDialog}
      />

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

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
import { usePaginacion } from "@/hooks/usePaginacion";
import { Paginacion } from "@/components/Paginacion";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { DialogEliminar } from "@/components/DialogEliminar";
import { toast } from "sonner";
import {
  CrearEquipoSchema,
  ActualizarEquipoSchema,
  type CrearEquipo,
  type ActualizarEquipo,
  type Equipo,
  puede,
} from "@congeminco/shared";
import {
  useEquipos,
  useCrearEquipo,
  useActualizarEquipo,
  useEliminarEquipo,
} from "@/hooks/useEquipos";
import { useTiposEquipo } from "@/hooks/useTiposEquipo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

/* ─── Dialog: Crear / Editar equipo ─── */
function DialogEquipo({
  open,
  equipo,
  onClose,
}: {
  open: boolean;
  equipo: Equipo | null;
  onClose: () => void;
}) {
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
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{modoEdicion ? "Editar equipo" : "Nuevo equipo"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="Codigo">Código *</Label>
              <Input id="Codigo" placeholder="EQ-001" {...register("Codigo")} />
              {errors.Codigo && (
                <p className="text-xs text-destructive">{errors.Codigo.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="Nombre">Nombre *</Label>
              <Input id="Nombre" placeholder="Excavadora CAT 320" {...register("Nombre")} />
              {errors.Nombre && (
                <p className="text-xs text-destructive">{errors.Nombre.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Tipo de equipo</Label>
            <Select
              defaultValue={equipo?.IdTipoEquipo ?? undefined}
              onValueChange={(v) =>
                setValue("IdTipoEquipo", v === "__ninguno__" ? undefined : v)
              }
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
            <Input id="Descripcion" placeholder="Descripción del equipo" {...register("Descripcion")} />
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

/* ─── Página principal ─── */
export default function EquiposPage() {
  const [mostrarDialog, setMostrarDialog] = useState(false);
  const [equipoEditar, setEquipoEditar] = useState<Equipo | null>(null);
  const [equipoEliminar, setEquipoEliminar] = useState<Equipo | null>(null);

  const { data: equipos, isLoading } = useEquipos();
  const { data: yo } = useRolActual();
  const puedeEscribir = puede(yo?.rol ?? null, "productoEscritura");
  const { mutateAsync: eliminarEquipo } = useEliminarEquipo();

  const paginacion = usePaginacion(equipos ?? [], 10);

  const abrirNuevo = () => {
    setEquipoEditar(null);
    setMostrarDialog(true);
  };

  const abrirEditar = (e: Equipo) => {
    setEquipoEditar(e);
    setMostrarDialog(true);
  };

  const cerrarDialog = () => {
    setMostrarDialog(false);
    setEquipoEditar(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Equipos</h1>
          <p className="text-muted-foreground">Administra los equipos de la empresa</p>
        </div>
        {puedeEscribir && (
          <Button onClick={abrirNuevo}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo equipo
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
                <TableHead>Tipo</TableHead>
                <TableHead>Descripción</TableHead>
                {puedeEscribir && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!paginacion.itemsPagina.length ? (
                <TableRow>
                  <TableCell
                    colSpan={puedeEscribir ? 5 : 4}
                    className="text-center text-muted-foreground py-10"
                  >
                    No hay equipos registrados.
                  </TableCell>
                </TableRow>
              ) : (
                paginacion.itemsPagina.map((e) => (
                  <TableRow key={e.Id}>
                    <TableCell className="font-mono text-xs">{e.Codigo}</TableCell>
                    <TableCell className="font-medium">{e.Nombre}</TableCell>
                    <TableCell>
                      {e.NombreTipoEquipo ? (
                        <Badge variant="secondary">{e.NombreTipoEquipo}</Badge>
                      ) : (
                        <Badge variant="warning">Sin tipo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.Descripcion ?? "—"}
                    </TableCell>
                    {puedeEscribir && (
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => abrirEditar(e)}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setEquipoEliminar(e)}
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

      <DialogEquipo
        open={mostrarDialog}
        equipo={equipoEditar}
        onClose={cerrarDialog}
      />

      <DialogEliminar
        entidad="equipo"
        id={equipoEliminar?.Id ?? null}
        nombre={equipoEliminar?.Nombre ?? ""}
        open={!!equipoEliminar}
        onOpenChange={(v) => { if (!v) setEquipoEliminar(null); }}
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

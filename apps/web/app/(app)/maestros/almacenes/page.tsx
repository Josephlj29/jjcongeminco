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
import { usePaginacion } from "@/hooks/usePaginacion";
import { Paginacion } from "@/components/Paginacion";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { DialogEliminar } from "@/components/DialogEliminar";
import { toast } from "sonner";
import {
  CrearUbicacionSchema,
  ActualizarUbicacionSchema,
  TIPO_UBICACION,
  type CrearUbicacion,
  type ActualizarUbicacion,
  type Ubicacion,
  puede,
} from "@congeminco/shared";
import { useUbicaciones, useCrearUbicacion, useActualizarUbicacion, useEliminarUbicacion } from "@/hooks/useUbicaciones";
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

const ETIQUETA_TIPO: Record<string, string> = {
  almacen_central: "Almacén central",
  proyecto: "Proyecto",
  otro: "Otro",
};

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

/* ─── Dialog: Crear / Editar ubicación ─── */
function DialogUbicacion({
  open,
  ubicacion,
  onClose,
}: {
  open: boolean;
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
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{modoEdicion ? "Editar ubicación" : "Nueva ubicación"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="Codigo">Código *</Label>
              <Input id="Codigo" placeholder="ALM-001" {...register("Codigo")} />
              {errors.Codigo && (
                <p className="text-xs text-destructive">{errors.Codigo.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Tipo *</Label>
              <Select
                defaultValue={ubicacion?.Tipo ?? "proyecto"}
                onValueChange={(v) =>
                  setValue("Tipo", v as CrearUbicacion["Tipo"])
                }
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
              {errors.Tipo && (
                <p className="text-xs text-destructive">{errors.Tipo.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="Nombre">Nombre *</Label>
            <Input id="Nombre" placeholder="Almacén principal" {...register("Nombre")} />
            {errors.Nombre && (
              <p className="text-xs text-destructive">{errors.Nombre.message}</p>
            )}
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

/* ─── Página principal ─── */
export default function AlmacenesPage() {
  const [mostrarDialog, setMostrarDialog] = useState(false);
  const [ubicacionEditar, setUbicacionEditar] = useState<Ubicacion | null>(null);
  const [ubicacionEliminar, setUbicacionEliminar] = useState<Ubicacion | null>(null);

  const { data: ubicaciones, isLoading } = useUbicaciones();
  const { data: yo } = useRolActual();
  const puedeEscribir = puede(yo?.rol ?? null, "catalogoAdmin");
  const { mutateAsync: eliminarUbicacion } = useEliminarUbicacion();

  const paginacion = usePaginacion(ubicaciones ?? [], 10);

  const abrirNuevo = () => {
    setUbicacionEditar(null);
    setMostrarDialog(true);
  };

  const abrirEditar = (u: Ubicacion) => {
    setUbicacionEditar(u);
    setMostrarDialog(true);
  };

  const cerrarDialog = () => {
    setMostrarDialog(false);
    setUbicacionEditar(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Almacenes</h1>
          <p className="text-muted-foreground">Administrá las ubicaciones y almacenes</p>
        </div>
        {puedeEscribir && (
          <Button onClick={abrirNuevo}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva ubicación
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
                <TableHead>Dirección</TableHead>
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
                    No hay ubicaciones registradas.
                  </TableCell>
                </TableRow>
              ) : (
                paginacion.itemsPagina.map((u) => (
                  <TableRow key={u.Id}>
                    <TableCell className="font-mono text-xs">{u.Codigo}</TableCell>
                    <TableCell className="font-medium">{u.Nombre}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ETIQUETA_TIPO[u.Tipo] ?? u.Tipo}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.Direccion ?? "—"}
                    </TableCell>
                    {puedeEscribir && (
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => abrirEditar(u)}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setUbicacionEliminar(u)}
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

      <DialogUbicacion
        open={mostrarDialog}
        ubicacion={ubicacionEditar}
        onClose={cerrarDialog}
      />

      <DialogEliminar
        entidad="ubicacion"
        id={ubicacionEliminar?.Id ?? null}
        nombre={ubicacionEliminar?.Nombre ?? ""}
        open={!!ubicacionEliminar}
        onOpenChange={(v) => { if (!v) setUbicacionEliminar(null); }}
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

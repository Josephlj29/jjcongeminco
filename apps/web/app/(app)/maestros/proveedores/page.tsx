"use client";

/**
 * app/(app)/maestros/proveedores/page.tsx — ABM de proveedores
 *
 * Funcionalidades:
 * - Lista de proveedores activos
 * - Dialog para crear nuevo proveedor (valida con CrearProveedorSchema)
 * - Acción editar por fila (mismo dialog en modo edición con ActualizarProveedorSchema)
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
  CrearProveedorSchema,
  ActualizarProveedorSchema,
  type CrearProveedor,
  type ActualizarProveedor,
  type Proveedor,
  puede,
} from "@congeminco/shared";
import { useProveedores, useCrearProveedor, useActualizarProveedor, useEliminarProveedor } from "@/hooks/useProveedores";
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

/* ─── Dialog: Crear / Editar proveedor ─── */
function DialogProveedor({
  open,
  proveedor,
  onClose,
}: {
  open: boolean;
  proveedor: Proveedor | null;
  onClose: () => void;
}) {
  const modoEdicion = !!proveedor;
  const { mutateAsync: crear, isPending: creando } = useCrearProveedor();
  const { mutateAsync: actualizar, isPending: actualizando } = useActualizarProveedor();
  const isPending = creando || actualizando;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearProveedor>({
    resolver: zodResolver(modoEdicion ? ActualizarProveedorSchema : CrearProveedorSchema),
    defaultValues: proveedor
      ? {
          Nombre: proveedor.Nombre,
          Ruc: proveedor.Ruc ?? "",
          Contacto: proveedor.Contacto ?? "",
          Telefono: proveedor.Telefono ?? "",
        }
      : {},
  });

  const onSubmit = async (data: CrearProveedor | ActualizarProveedor) => {
    try {
      if (modoEdicion) {
        await actualizar({ id: proveedor.Id, data });
        toast.success("Proveedor actualizado correctamente");
      } else {
        await crear(data as CrearProveedor);
        toast.success("Proveedor creado correctamente");
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
          <DialogTitle>{modoEdicion ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="Nombre">Nombre *</Label>
            <Input id="Nombre" placeholder="Proveedor S.A." {...register("Nombre")} />
            {errors.Nombre && (
              <p className="text-xs text-destructive">{errors.Nombre.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="Ruc">RUC</Label>
              <Input id="Ruc" placeholder="20123456789" {...register("Ruc")} />
              {errors.Ruc && (
                <p className="text-xs text-destructive">{errors.Ruc.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="Telefono">Teléfono</Label>
              <Input id="Telefono" placeholder="+51 999 999 999" {...register("Telefono")} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="Contacto">Contacto</Label>
            <Input id="Contacto" placeholder="Nombre del contacto" {...register("Contacto")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : modoEdicion ? "Guardar cambios" : "Crear proveedor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Página principal ─── */
export default function ProveedoresPage() {
  const [mostrarDialog, setMostrarDialog] = useState(false);
  const [proveedorEditar, setProveedorEditar] = useState<Proveedor | null>(null);
  const [proveedorEliminar, setProveedorEliminar] = useState<Proveedor | null>(null);

  const { data: proveedores, isLoading } = useProveedores();
  const { data: yo } = useRolActual();
  const puedeEscribir = puede(yo?.rol ?? null, "productoEscritura");
  const { mutateAsync: eliminarProveedor } = useEliminarProveedor();

  const paginacion = usePaginacion(proveedores ?? [], 10);

  const abrirNuevo = () => {
    setProveedorEditar(null);
    setMostrarDialog(true);
  };

  const abrirEditar = (p: Proveedor) => {
    setProveedorEditar(p);
    setMostrarDialog(true);
  };

  const cerrarDialog = () => {
    setMostrarDialog(false);
    setProveedorEditar(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Proveedores</h1>
          <p className="text-muted-foreground">Administrá los proveedores de la empresa</p>
        </div>
        {puedeEscribir && (
          <Button onClick={abrirNuevo}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo proveedor
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
                <TableHead>Nombre</TableHead>
                <TableHead>RUC</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Teléfono</TableHead>
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
                    No hay proveedores registrados.
                  </TableCell>
                </TableRow>
              ) : (
                paginacion.itemsPagina.map((p) => (
                  <TableRow key={p.Id}>
                    <TableCell className="font-medium">{p.Nombre}</TableCell>
                    <TableCell className="font-mono text-xs">{p.Ruc ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.Contacto ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.Telefono ?? "—"}
                    </TableCell>
                    {puedeEscribir && (
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => abrirEditar(p)}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setProveedorEliminar(p)}
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

      <DialogProveedor
        open={mostrarDialog}
        proveedor={proveedorEditar}
        onClose={cerrarDialog}
      />

      <DialogEliminar
        entidad="proveedor"
        id={proveedorEliminar?.Id ?? null}
        nombre={proveedorEliminar?.Nombre ?? ""}
        open={!!proveedorEliminar}
        onOpenChange={(v) => { if (!v) setProveedorEliminar(null); }}
        onConfirmar={async () => {
          if (!proveedorEliminar) return;
          try {
            await eliminarProveedor(proveedorEliminar.Id);
            toast.success("Proveedor eliminado correctamente");
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />
    </div>
  );
}

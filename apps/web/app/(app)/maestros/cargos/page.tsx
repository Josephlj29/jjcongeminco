"use client";

/**
 * app/(app)/maestros/cargos/page.tsx — ABM de cargos del personal
 * Catálogo simple (Código, Nombre, Descripción). Escritura: admin (catalogoAdmin).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, BriefcaseBusiness } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CrearCargoSchema,
  ActualizarCargoSchema,
  puede,
  type CrearCargo,
  type Cargo,
  type RoleCode,
} from "@congeminco/shared";
import {
  useCargos,
  useCrearCargo,
  useActualizarCargo,
  useEliminarCargo,
} from "@/hooks/useCargos";
import { usePaginacion } from "@/hooks/usePaginacion";
import { Paginacion } from "@/components/Paginacion";
import { DialogEliminar } from "@/components/DialogEliminar";
import { EmptyState } from "@/components/EmptyState";
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

function useRolActual() {
  return useQuery({
    queryKey: ["yo"],
    queryFn: async () => {
      const res = await fetch("/api/yo");
      if (!res.ok) throw new Error("Sin sesión");
      return res.json() as Promise<{ rol: RoleCode }>;
    },
  });
}

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

export default function CargosPage() {
  const [mostrarDialog, setMostrarDialog] = useState(false);
  const [editar, setEditar] = useState<Cargo | null>(null);
  const [eliminarC, setEliminarC] = useState<Cargo | null>(null);

  const { data: cargos, isLoading } = useCargos();
  const { data: yo } = useRolActual();
  const puedeEscribir = puede(yo?.rol ?? null, "catalogoAdmin");
  const { mutateAsync: eliminar } = useEliminarCargo();

  const paginacion = usePaginacion(cargos ?? [], 10);

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cargos</h1>
          <p className="text-muted-foreground">
            Catálogo de cargos del personal (mecánico, operador, jefe de taller…).
          </p>
        </div>
        {puedeEscribir && (
          <Button onClick={abrirNuevo}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo cargo
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
                      icon={BriefcaseBusiness}
                      titulo="No hay cargos registrados"
                      descripcion="Crea el primer cargo para clasificar al personal."
                      accion={
                        puedeEscribir ? (
                          <Button size="sm" onClick={abrirNuevo}>
                            <Plus className="mr-2 h-4 w-4" />
                            Nuevo cargo
                          </Button>
                        ) : undefined
                      }
                    />
                  </TableCell>
                </TableRow>
              ) : (
                paginacion.itemsPagina.map((c) => (
                  <TableRow key={c.Id}>
                    <TableCell className="font-mono text-xs">{c.Codigo}</TableCell>
                    <TableCell className="font-medium">{c.Nombre}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.Descripcion ?? "—"}
                    </TableCell>
                    {puedeEscribir && (
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => { setEditar(c); setMostrarDialog(true); }}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setEliminarC(c)}
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

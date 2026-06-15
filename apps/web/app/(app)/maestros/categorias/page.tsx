"use client";

/**
 * app/(app)/maestros/categorias/page.tsx — ABM de categorías / familias
 *
 * - Categorías jerárquicas: cada una puede tener una familia padre (por Id, FK).
 * - Crear / editar (mismo dialog) con select de familia padre (excluye a sí misma).
 * - Eliminar con verificación de dependientes por FK (productos + subcategorías).
 * - Escritura restringida a admin (catalogoAdmin), igual que la RLS de la tabla.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, FolderTree } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CrearCategoriaSchema,
  ActualizarCategoriaSchema,
  puede,
  type CrearCategoria,
  type RoleCode,
} from "@congeminco/shared";
import {
  useCategoriasMaestro,
  useCrearCategoria,
  useActualizarCategoria,
  useEliminarCategoria,
  type CategoriaMaestro,
} from "@/hooks/useCategoriasMaestro";
import { usePaginacion } from "@/hooks/usePaginacion";
import { Paginacion } from "@/components/Paginacion";
import { DialogEliminar } from "@/components/DialogEliminar";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const SIN_PADRE = "__none__";

/* ─── Dialog: Crear / Editar categoría ─── */
function DialogCategoria({
  categoria,
  categorias,
  onClose,
}: {
  categoria: CategoriaMaestro | null;
  categorias: CategoriaMaestro[];
  onClose: () => void;
}) {
  const modoEdicion = !!categoria;
  const { mutateAsync: crear, isPending: creando } = useCrearCategoria();
  const { mutateAsync: actualizar, isPending: actualizando } = useActualizarCategoria();
  const isPending = creando || actualizando;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CrearCategoria>({
    resolver: zodResolver(modoEdicion ? ActualizarCategoriaSchema : CrearCategoriaSchema),
    defaultValues: categoria
      ? {
          Codigo: categoria.Codigo,
          Nombre: categoria.Nombre,
          Descripcion: categoria.Descripcion ?? "",
          IdCategoriaPadre: categoria.IdCategoriaPadre ?? undefined,
        }
      : {},
  });

  const idPadre = watch("IdCategoriaPadre");

  const onSubmit = async (data: CrearCategoria) => {
    try {
      if (modoEdicion) {
        await actualizar({ id: categoria.Id, data });
        toast.success("Categoría actualizada correctamente");
      } else {
        await crear(data);
        toast.success("Categoría creada correctamente");
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
          <DialogTitle>
            {modoEdicion ? "Editar categoría" : "Nueva categoría"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="Codigo">Código *</Label>
              <Input id="Codigo" placeholder="CAT-001" {...register("Codigo")} />
              {errors.Codigo && (
                <p className="text-xs text-destructive">{errors.Codigo.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="Nombre">Nombre *</Label>
              <Input id="Nombre" placeholder="Filtros" {...register("Nombre")} />
              {errors.Nombre && (
                <p className="text-xs text-destructive">{errors.Nombre.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Familia padre</Label>
            <Select
              value={idPadre ?? SIN_PADRE}
              onValueChange={(v) =>
                setValue("IdCategoriaPadre", v === SIN_PADRE ? undefined : v)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Ninguna (familia raíz)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_PADRE}>Ninguna (familia raíz)</SelectItem>
                {categorias
                  .filter((c) => c.Id !== categoria?.Id)
                  .map((c) => (
                    <SelectItem key={c.Id} value={c.Id}>
                      {c.Codigo} — {c.Nombre}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] leading-tight text-muted-foreground">
              Dejala vacía si es una familia de nivel superior.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="Descripcion">Descripción</Label>
            <Input
              id="Descripcion"
              placeholder="Descripción opcional"
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
                  : "Crear categoría"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CategoriasPage() {
  const [mostrarDialog, setMostrarDialog] = useState(false);
  const [catEditar, setCatEditar] = useState<CategoriaMaestro | null>(null);
  const [catEliminar, setCatEliminar] = useState<CategoriaMaestro | null>(null);

  const { data: categorias, isLoading } = useCategoriasMaestro();
  const { data: yo } = useRolActual();
  const puedeEscribir = puede(yo?.rol ?? null, "catalogoAdmin");
  const { mutateAsync: eliminar } = useEliminarCategoria();

  const paginacion = usePaginacion(categorias ?? [], 10);

  const abrirNuevo = () => {
    setCatEditar(null);
    setMostrarDialog(true);
  };
  const abrirEditar = (c: CategoriaMaestro) => {
    setCatEditar(c);
    setMostrarDialog(true);
  };
  const cerrar = () => {
    setMostrarDialog(false);
    setCatEditar(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Categorías y familias</h1>
          <p className="text-muted-foreground">
            Clasificación jerárquica de los productos (familia → categoría).
          </p>
        </div>
        {puedeEscribir && (
          <Button onClick={abrirNuevo}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva categoría
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
                <TableHead>Familia padre</TableHead>
                <TableHead>Descripción</TableHead>
                {puedeEscribir && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!paginacion.itemsPagina.length ? (
                <TableRow>
                  <TableCell colSpan={puedeEscribir ? 5 : 4} className="p-0">
                    <EmptyState
                      icon={FolderTree}
                      titulo="No hay categorías registradas"
                      descripcion="Creá la primera familia o categoría para clasificar los productos."
                      accion={
                        puedeEscribir ? (
                          <Button size="sm" onClick={abrirNuevo}>
                            <Plus className="mr-2 h-4 w-4" />
                            Nueva categoría
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
                      {c.NombreCategoriaPadre ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.Descripcion ?? "—"}
                    </TableCell>
                    {puedeEscribir && (
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => abrirEditar(c)}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setCatEliminar(c)}
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

      {mostrarDialog && (
        <DialogCategoria
          categoria={catEditar}
          categorias={categorias ?? []}
          onClose={cerrar}
        />
      )}

      <DialogEliminar
        entidad="categoria"
        id={catEliminar?.Id ?? null}
        nombre={catEliminar?.Nombre ?? ""}
        open={!!catEliminar}
        onOpenChange={(v) => {
          if (!v) setCatEliminar(null);
        }}
        onConfirmar={async () => {
          if (!catEliminar) return;
          try {
            await eliminar(catEliminar.Id);
            toast.success("Categoría eliminada correctamente");
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />
    </div>
  );
}

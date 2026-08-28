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
import { Plus, Pencil, Trash2, FolderTree } from "lucide-react";
import { toast } from "sonner";
import {
  CrearCategoriaSchema,
  ActualizarCategoriaSchema,
  type CrearCategoria,
} from "@congeminco/shared";
import {
  useCategoriasMaestro,
  useCrearCategoria,
  useActualizarCategoria,
  useEliminarCategoria,
  type CategoriaMaestro,
} from "@/hooks/useCategoriasMaestro";
import { usePermiso } from "@/hooks/useYo";
import { DataTable, type ColumnaDataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { DialogEliminar } from "@/components/DialogEliminar";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

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
          <DialogTitle>{modoEdicion ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="Codigo">Código *</Label>
              <Input id="Codigo" placeholder="CAT-001" {...register("Codigo")} />
              {errors.Codigo && <p className="text-xs text-destructive">{errors.Codigo.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="Nombre">Nombre *</Label>
              <Input id="Nombre" placeholder="Filtros" {...register("Nombre")} />
              {errors.Nombre && <p className="text-xs text-destructive">{errors.Nombre.message}</p>}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Familia padre</Label>
            <Select
              value={idPadre ?? SIN_PADRE}
              onValueChange={(v) => setValue("IdCategoriaPadre", v === SIN_PADRE ? null : v)}
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
              {isPending ? "Guardando..." : modoEdicion ? "Guardar cambios" : "Crear categoría"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const COLUMNAS: ColumnaDataTable<CategoriaMaestro>[] = [
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
    id: "familiaPadre",
    titulo: "Familia padre",
    celda: (c) => c.NombreCategoriaPadre ?? "—",
    className: "text-sm text-muted-foreground",
  },
  {
    id: "descripcion",
    titulo: "Descripción",
    celda: (c) => c.Descripcion ?? "—",
    className: "text-sm text-muted-foreground",
    ocultarEnMovil: true,
  },
];

export default function CategoriasPage() {
  const [mostrarDialog, setMostrarDialog] = useState(false);
  const [catEditar, setCatEditar] = useState<CategoriaMaestro | null>(null);
  const [catEliminar, setCatEliminar] = useState<CategoriaMaestro | null>(null);

  const { data: categorias, isLoading: cargando, isError: error, refetch } = useCategoriasMaestro();
  const puedeEscribir = usePermiso("catalogoAdmin");
  const { mutateAsync: eliminar } = useEliminarCategoria();

  const abrirNuevo = () => {
    setCatEditar(null);
    setMostrarDialog(true);
  };
  const cerrar = () => {
    setMostrarDialog(false);
    setCatEditar(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Categorías y familias"
        descripcion="Clasificación jerárquica de los productos (familia → categoría)."
        breadcrumbs={[{ label: "Maestros" }, { label: "Categorías" }]}
        acciones={
          puedeEscribir && (
            <Button onClick={abrirNuevo}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva categoría
            </Button>
          )
        }
      />

      <DataTable
        columnas={COLUMNAS}
        datos={categorias}
        obtenerId={(c) => c.Id}
        cargando={cargando}
        error={error}
        onReintentar={() => void refetch()}
        vacio={{
          icono: FolderTree,
          titulo: "No hay categorías registradas",
          descripcion: "Crea la primera familia o categoría para clasificar los productos.",
          accion: puedeEscribir ? (
            <Button size="sm" onClick={abrirNuevo}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva categoría
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
                    setCatEditar(c);
                    setMostrarDialog(true);
                  },
                },
                {
                  label: "Eliminar",
                  icono: Trash2,
                  variante: "destructiva",
                  onClick: (c) => setCatEliminar(c),
                },
              ]
            : undefined
        }
      />

      {mostrarDialog && (
        <DialogCategoria categoria={catEditar} categorias={categorias ?? []} onClose={cerrar} />
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

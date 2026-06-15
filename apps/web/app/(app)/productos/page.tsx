"use client";

/**
 * app/(app)/productos/page.tsx — Catálogo de productos
 *
 * Funcionalidades:
 * - Lista de productos con búsqueda por nombre/SKU
 * - Dialog para crear nuevo producto (valida con CrearProductoSchema)
 * - Gestión de imágenes (subir hasta MAX_IMAGENES_PRODUCTO a Supabase Storage)
 * - Ver kardex del producto en un dialog
 * - Compatibilidad (general o tipos de equipo) se configura en el ALTA/EDICIÓN
 *   del producto (DialogProducto), no en la grilla. La grilla solo la muestra.
 * - Columna "Tipos de equipo": "General" / chips por tipo / "Sin clasificar"
 * - Botón toolbar "Asociar por categoría": asociación masiva categoría→tipo (atajo)
 * - Acciones restringidas por rol (productoEscritura)
 */
import { useState, useMemo, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Search, Image as ImageIcon, Trash2, Pencil, Tags } from "lucide-react";
import { DialogEliminar } from "@/components/DialogEliminar";
import { ImagenAmpliable } from "@/components/ImagenAmpliable";
import { usePaginacion } from "@/hooks/usePaginacion";
import { Paginacion } from "@/components/Paginacion";
import { toast } from "sonner";
import {
  CrearProductoSchema,
  type CrearProducto,
  puede,
  MAX_IMAGENES_PRODUCTO,
} from "@congeminco/shared";
import {
  useProductos,
  useCrearProducto,
  useEditarProducto,
  useProductoDetalle,
  useEliminarProducto,
} from "@/hooks/useProductos";
import { useImagenesProducto, useCrearImagenProducto, useEliminarImagenProducto } from "@/hooks/useImagenes";
import { useCategorias, useUnidades } from "@/hooks/useCatalogo";
import { useKardex } from "@/hooks/useKardex";
import {
  useTiposEquipo,
  useAsociacionesTiposEquipo,
  useAsociarCategoria,
} from "@/hooks/useTiposEquipo";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Skeleton } from "@/components/ui/skeleton";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { KardexFila } from "@congeminco/shared";
import { useQuery } from "@tanstack/react-query";

/* ─── Tipo para producto de la vista consolidada ─── */
interface ProductoConsolidado {
  IdProducto: string;
  Sku: string;
  NombreProducto: string;
  NombreCategoria: string;
  CodigoUnidad: string;
  StockMinimo: number;
  StockTotal: number;
  BajoMinimo: boolean;
  IdCategoria: string;
  EsGeneral: boolean;
}

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

/* ─── Dialog: Alta / edición de producto ───
   La compatibilidad (general o tipos de equipo) se configura ACÁ, en el alta,
   no en la grilla. */
function DialogProducto({
  open,
  producto,
  onClose,
}: {
  open: boolean;
  producto: ProductoConsolidado | null;
  onClose: () => void;
}) {
  const esEdicion = !!producto;
  const { mutateAsync: crear, isPending: creando } = useCrearProducto();
  const { mutateAsync: editar, isPending: editandoProd } = useEditarProducto();
  const { data: categorias } = useCategorias();
  const { data: unidades } = useUnidades();
  const { data: tipos } = useTiposEquipo();
  const { data: detalle, isLoading: cargandoDetalle } = useProductoDetalle(
    producto?.IdProducto ?? null
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CrearProducto>({
    resolver: zodResolver(CrearProductoSchema),
    defaultValues: {
      StockMinimo: 0,
      Atributos: {},
      EsGeneral: false,
      IdsTipoEquipo: [],
    },
  });

  const esGeneral = watch("EsGeneral");
  const idsTipo = watch("IdsTipoEquipo") ?? [];
  const idCategoria = watch("IdCategoria");
  const idUnidad = watch("IdUnidadMedida");

  // Prellenar al abrir (edición) o limpiar (alta).
  useEffect(() => {
    if (!open) return;
    if (esEdicion && detalle) {
      reset({
        Sku: detalle.Sku,
        Nombre: detalle.Nombre,
        IdCategoria: detalle.IdCategoria,
        IdUnidadMedida: detalle.IdUnidadMedida,
        StockMinimo: detalle.StockMinimo,
        CodigoBarra: detalle.CodigoBarra ?? undefined,
        CodigoProductoProveedor: detalle.CodigoProductoProveedor ?? undefined,
        Atributos: detalle.Atributos,
        EsGeneral: detalle.EsGeneral,
        IdsTipoEquipo: detalle.IdsTipoEquipo,
      });
    } else if (!esEdicion) {
      reset({
        Sku: "",
        Nombre: "",
        IdCategoria: undefined,
        IdUnidadMedida: undefined,
        StockMinimo: 0,
        CodigoBarra: undefined,
        CodigoProductoProveedor: undefined,
        Atributos: {},
        EsGeneral: false,
        IdsTipoEquipo: [],
      });
    }
  }, [open, esEdicion, detalle, reset]);

  const toggleTipo = (id: string) => {
    const next = idsTipo.includes(id)
      ? idsTipo.filter((x) => x !== id)
      : [...idsTipo, id];
    setValue("IdsTipoEquipo", next, { shouldValidate: true });
  };

  const onSubmit = async (data: CrearProducto) => {
    if (!data.EsGeneral && (data.IdsTipoEquipo?.length ?? 0) === 0) {
      toast.error(
        "Elegí al menos un tipo de equipo o marcá el producto como general."
      );
      return;
    }
    const payload: CrearProducto = {
      ...data,
      IdsTipoEquipo: data.EsGeneral ? [] : data.IdsTipoEquipo,
    };
    try {
      if (esEdicion && producto) {
        await editar({ id: producto.IdProducto, data: payload });
        toast.success("Producto actualizado");
      } else {
        await crear(payload);
        toast.success("Producto creado correctamente");
      }
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const guardando = creando || editandoProd;
  // En edición, no renderizamos el form hasta tener el detalle: evita mostrar
  // (y peor, guardar) los datos del producto editado anteriormente.
  const cargandoEdicion = esEdicion && (cargandoDetalle || !detalle);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{esEdicion ? "Editar producto" : "Nuevo producto"}</DialogTitle>
        </DialogHeader>
        {cargandoEdicion ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="Sku">SKU</Label>
              <Input id="Sku" placeholder="PROD-001" {...register("Sku")} />
              {errors.Sku && (
                <p className="text-xs text-destructive">{errors.Sku.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="StockMinimo">Stock mínimo</Label>
              <Input
                id="StockMinimo"
                type="number"
                min={0}
                {...register("StockMinimo", { valueAsNumber: true })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="Nombre">Nombre</Label>
            <Input
              id="Nombre"
              placeholder="Descripción del producto"
              {...register("Nombre")}
            />
            {errors.Nombre && (
              <p className="text-xs text-destructive">{errors.Nombre.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Categoría</Label>
              <Select
                value={idCategoria ?? ""}
                onValueChange={(v) => setValue("IdCategoria", v, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {categorias?.map((c) => (
                    <SelectItem key={c.Id} value={c.Id}>
                      {c.Nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.IdCategoria && (
                <p className="text-xs text-destructive">{errors.IdCategoria.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Unidad de medida</Label>
              <Select
                value={idUnidad ?? ""}
                onValueChange={(v) => setValue("IdUnidadMedida", v, { shouldValidate: true })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {unidades?.map((u) => (
                    <SelectItem key={u.Id} value={u.Id}>
                      {u.Nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.IdUnidadMedida && (
                <p className="text-xs text-destructive">{errors.IdUnidadMedida.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="CodigoProductoProveedor">Código del proveedor</Label>
              <Input
                id="CodigoProductoProveedor"
                placeholder="Ej. X123"
                {...register("CodigoProductoProveedor")}
              />
              <p className="text-[11px] leading-tight text-muted-foreground">
                Con el que el proveedor identifica el producto (para comprar).
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="CodigoBarra">Código de barra (opcional)</Label>
              <Input id="CodigoBarra" {...register("CodigoBarra")} />
            </div>
          </div>

          {/* Compatibilidad: general o tipos específicos */}
          <div className="space-y-2 rounded-lg border p-3">
            <Label>¿A qué equipos aplica?</Label>
            <button
              type="button"
              onClick={() => setValue("EsGeneral", !esGeneral, { shouldValidate: true })}
              className="flex w-full items-center gap-2 text-left text-sm"
            >
              <span
                className={`h-4 w-4 rounded border flex items-center justify-center text-xs font-bold ${
                  esGeneral
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-muted-foreground/40"
                }`}
              >
                {esGeneral && "✓"}
              </span>
              <span>General — compatible con todos los equipos</span>
            </button>

            {!esGeneral && (
              <div className="space-y-1 pt-1">
                <p className="text-xs text-muted-foreground">
                  Seleccioná los tipos de equipo compatibles:
                </p>
                <Command className="rounded-lg border">
                  <CommandInput placeholder="Buscar tipo..." />
                  <CommandList>
                    <CommandEmpty>No se encontraron tipos.</CommandEmpty>
                    <CommandGroup>
                      {tipos?.map((tipo) => {
                        const activo = idsTipo.includes(tipo.Id);
                        return (
                          <CommandItem
                            key={tipo.Id}
                            value={tipo.Nombre}
                            onSelect={() => toggleTipo(tipo.Id)}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <span
                              className={`h-4 w-4 rounded border flex items-center justify-center text-xs font-bold ${
                                activo
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : "border-muted-foreground/40"
                              }`}
                            >
                              {activo && "✓"}
                            </span>
                            <span className="flex-1">{tipo.Nombre}</span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {tipo.Codigo}
                            </span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
                {idsTipo.length === 0 && (
                  <p className="text-xs text-destructive">
                    Elegí al menos un tipo, o marcá el producto como general.
                  </p>
                )}
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Las imágenes (hasta {MAX_IMAGENES_PRODUCTO}) se cargan desde la
            acción &quot;Imágenes&quot; del producto, una vez creado.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando
                ? "Guardando..."
                : esEdicion
                  ? "Guardar cambios"
                  : "Crear producto"}
            </Button>
          </DialogFooter>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Dialog: Imágenes del producto ─── */
function DialogImagenes({
  idProducto,
  onClose,
}: {
  idProducto: string | null;
  onClose: () => void;
}) {
  const { data: imagenes, isLoading } = useImagenesProducto(idProducto);
  const { mutateAsync: crearImagen, isPending: subiendo } =
    useCrearImagenProducto(idProducto ?? "");
  const { mutateAsync: eliminarImagen } = useEliminarImagenProducto(
    idProducto ?? ""
  );

  const handleSubir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo || !idProducto) return;

    try {
      const supabase = crearClienteNavegador();
      const ruta = `${idProducto}/${Date.now()}-${archivo.name}`;
      const { data: storageData, error: storageError } =
        await supabase.storage.from("productos").upload(ruta, archivo, {
          upsert: false,
        });

      if (storageError) throw new Error(storageError.message);

      const { data: urlData } = supabase.storage
        .from("productos")
        .getPublicUrl(storageData.path);

      const orden = (imagenes?.length ?? 0) + 1;
      await crearImagen({
        Url: urlData.publicUrl,
        Orden: orden,
        EsPrincipal: orden === 1,
      });

      toast.success("Imagen subida correctamente");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <Dialog open={!!idProducto} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Imágenes del producto</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {imagenes?.map((img) => (
              <div
                key={img.Id}
                className="flex items-center gap-3 rounded-md border p-2"
              >
                <ImagenAmpliable
                  url={img.Url}
                  size={64}
                  alt={`Imagen ${img.Orden}`}
                />
                <div className="flex-1 text-xs text-muted-foreground">
                  Orden: {img.Orden}
                  {img.EsPrincipal && (
                    <Badge className="ml-2" variant="default">
                      Principal
                    </Badge>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() =>
                    void eliminarImagen(img.Id).then(() =>
                      toast.success("Imagen eliminada")
                    )
                  }
                >
                  Eliminar
                </Button>
              </div>
            ))}

            {(imagenes?.length ?? 0) < MAX_IMAGENES_PRODUCTO && (
              <label className="flex cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/25 p-4 text-sm text-muted-foreground hover:border-muted-foreground/50 transition-colors">
                {subiendo ? "Subiendo..." : "Agregar imagen"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleSubir}
                  disabled={subiendo}
                />
              </label>
            )}

            {(imagenes?.length ?? 0) >= MAX_IMAGENES_PRODUCTO && (
              <p className="text-xs text-muted-foreground text-center">
                Límite de {MAX_IMAGENES_PRODUCTO} imágenes alcanzado.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Dialog: Kardex ─── */
function DialogKardex({
  idProducto,
  nombreProducto,
  onClose,
}: {
  idProducto: string | null;
  nombreProducto: string;
  onClose: () => void;
}) {
  const { data: kardex, isLoading } = useKardex(idProducto);

  return (
    <Dialog open={!!idProducto} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kardex — {nombreProducto}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : !kardex?.length ? (
          <p className="text-muted-foreground text-center py-8 text-sm">
            No hay movimientos registrados.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Comprobante</TableHead>
                <TableHead>Ubicación</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {kardex.map((fila: KardexFila) => (
                <TableRow key={fila.IdMovimientoStock}>
                  <TableCell className="text-xs">
                    {new Date(fila.FechaMovimiento).toLocaleDateString("es-PE")}
                  </TableCell>
                  <TableCell className="capitalize text-xs">
                    {fila.TipoDocumento}
                  </TableCell>
                  <TableCell className="text-xs">
                    {fila.Comprobante ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {fila.NombreUbicacion}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      fila.Direccion === 1
                        ? "text-emerald-600"
                        : "text-red-600"
                    }`}
                  >
                    {fila.Direccion === 1 ? "+" : "-"}
                    {fila.Cantidad}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    {fila.SaldoCorrido}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ─── Dialog: Asociar categoría a tipo ─── */
function DialogAsociarCategoria({
  open,
  onClose,
  productos,
}: {
  open: boolean;
  onClose: () => void;
  productos: ProductoConsolidado[];
}) {
  const { data: categorias } = useCategorias();
  const { data: tipos } = useTiposEquipo();
  const { mutateAsync: asociarCategoria, isPending } = useAsociarCategoria();

  const [idCategoriaSeleccionada, setIdCategoriaSeleccionada] = useState("");
  const [idTipoSeleccionado, setIdTipoSeleccionado] = useState("");

  // Contar cuántos productos hay en la categoría seleccionada (memoria local)
  const cantidadProductosCategoria = useMemo(() => {
    if (!idCategoriaSeleccionada) return 0;
    return productos.filter((p) => p.IdCategoria === idCategoriaSeleccionada).length;
  }, [productos, idCategoriaSeleccionada]);

  const handleConfirmar = async () => {
    if (!idTipoSeleccionado || !idCategoriaSeleccionada) {
      toast.error("Selecciona una categoría y un tipo de equipo");
      return;
    }
    try {
      const resultado = await asociarCategoria({
        idTipoEquipo: idTipoSeleccionado,
        idCategoria: idCategoriaSeleccionada,
      });
      toast.success(
        `${resultado.insertados} producto${resultado.insertados !== 1 ? "s" : ""} asociados (los ya asociados se omitieron)`
      );
      setIdCategoriaSeleccionada("");
      setIdTipoSeleccionado("");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setIdCategoriaSeleccionada("");
      setIdTipoSeleccionado("");
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Asociar categoría a tipo de equipo</DialogTitle>
          <p className="text-sm text-muted-foreground pt-1">
            Todos los productos de la categoría elegida quedarán asociados al tipo seleccionado.
            Los productos ya asociados a ese tipo se omiten.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Categoría</Label>
            <Select
              value={idCategoriaSeleccionada}
              onValueChange={setIdCategoriaSeleccionada}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar categoría..." />
              </SelectTrigger>
              <SelectContent>
                {categorias?.map((c) => (
                  <SelectItem key={c.Id} value={c.Id}>
                    {c.Nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {idCategoriaSeleccionada && (
            <p className="text-xs text-muted-foreground">
              Productos en esta categoría:{" "}
              <span className="font-semibold">{cantidadProductosCategoria}</span>
            </p>
          )}

          <div className="space-y-1">
            <Label>Tipo de equipo</Label>
            <Select
              value={idTipoSeleccionado}
              onValueChange={setIdTipoSeleccionado}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar tipo..." />
              </SelectTrigger>
              <SelectContent>
                {tipos?.map((t) => (
                  <SelectItem key={t.Id} value={t.Id}>
                    {t.Nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmar}
            disabled={isPending || !idCategoriaSeleccionada || !idTipoSeleccionado}
          >
            {isPending ? "Asociando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Página principal ─── */
export default function ProductosPage() {
  const [busqueda, setBusqueda] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState("__todas__");
  // null = cerrado; "nuevo" = alta; producto = edición.
  const [editando, setEditando] = useState<ProductoConsolidado | "nuevo" | null>(null);
  const [mostrarAsociarCategoria, setMostrarAsociarCategoria] = useState(false);
  const [productoKardex, setProductoKardex] =
    useState<ProductoConsolidado | null>(null);
  const [productoImagenes, setProductoImagenes] =
    useState<ProductoConsolidado | null>(null);
  const [productoEliminar, setProductoEliminar] =
    useState<ProductoConsolidado | null>(null);

  const { data: productos, isLoading } = useProductos();
  const { data: yo } = useRolActual();
  const puedeEscribir = puede(yo?.rol ?? null, "productoEscritura");
  const { mutateAsync: eliminarProducto } = useEliminarProducto();

  // Una sola query para TODA la puente producto<->tipo
  const { data: todasAsociaciones } = useAsociacionesTiposEquipo();

  // Agrupación en memoria: IdProducto → NombreTipoEquipo[]
  const tiposPorProducto = useMemo(() => {
    const mapa = new Map<string, string[]>();
    for (const a of todasAsociaciones ?? []) {
      const lista = mapa.get(a.IdProducto) ?? [];
      lista.push(a.NombreTipoEquipo);
      mapa.set(a.IdProducto, lista);
    }
    return mapa;
  }, [todasAsociaciones]);

  // Categorías únicas derivadas de los datos reales
  const categorias = useMemo(() => {
    if (!productos) return [];
    return [...new Set(productos.map((p) => p.NombreCategoria))].sort();
  }, [productos]);

  // Filtrado en memoria: búsqueda + categoría
  const productosFiltrados = useMemo(() => {
    if (!productos) return [];
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      const coincideBusqueda =
        !q ||
        p.NombreProducto.toLowerCase().includes(q) ||
        p.Sku.toLowerCase().includes(q);
      const coincideCategoria =
        categoriaFiltro === "__todas__" || p.NombreCategoria === categoriaFiltro;
      return coincideBusqueda && coincideCategoria;
    });
  }, [productos, busqueda, categoriaFiltro]);

  // El tipo local del hook useProductos no incluye IdCategoria; lo casteamos
  // desde ProductoStockConsolidado que sí lo tiene (la API lo devuelve).
  const productosFiltradosConId = productosFiltrados as ProductoConsolidado[];

  const paginacion = usePaginacion(productosFiltradosConId, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Catálogo de productos
          </h1>
          <p className="text-muted-foreground">
            Administra el inventario de materiales
          </p>
        </div>
        {puedeEscribir && (
          <Button onClick={() => setEditando("nuevo")}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo producto
          </Button>
        )}
      </div>

      {/* Búsqueda + filtro por categoría + asociar por categoría */}
      <div className="flex flex-wrap gap-3">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o SKU..."
            className="pl-9"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="Todas las categorías" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__todas__">Todas las categorías</SelectItem>
            {categorias.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {puedeEscribir && (
          <Button
            variant="outline"
            onClick={() => setMostrarAsociarCategoria(true)}
          >
            <Tags className="mr-2 h-4 w-4" />
            Asociar por categoría
          </Button>
        )}
      </div>

      {/* Tabla */}
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
                <TableHead>SKU</TableHead>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Tipos de equipo</TableHead>
                <TableHead className="text-right">Stock mín.</TableHead>
                <TableHead className="text-right">Stock actual</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!paginacion.itemsPagina.length ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground py-10"
                  >
                    No se encontraron productos.
                  </TableCell>
                </TableRow>
              ) : (
                paginacion.itemsPagina.map((p) => {
                  const tiposNombres = tiposPorProducto.get(p.IdProducto);
                  return (
                    <TableRow key={p.IdProducto}>
                      <TableCell className="font-mono text-xs">{p.Sku}</TableCell>
                      <TableCell className="font-medium">
                        {p.NombreProducto}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.NombreCategoria}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {p.EsGeneral ? (
                            <Badge variant="outline" className="text-xs">
                              General
                            </Badge>
                          ) : tiposNombres?.length ? (
                            tiposNombres.map((nombre) => (
                              <Badge key={nombre} variant="secondary" className="text-xs">
                                {nombre}
                              </Badge>
                            ))
                          ) : (
                            <Badge variant="warning" className="text-xs">
                              Sin clasificar
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{p.StockMinimo}</TableCell>
                      <TableCell
                        className={`text-right font-semibold ${
                          p.BajoMinimo ? "text-amber-600" : ""
                        }`}
                      >
                        {p.StockTotal}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.BajoMinimo ? "warning" : "default"}>
                          {p.BajoMinimo ? "Bajo mínimo" : "OK"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setProductoKardex(p)}
                        >
                          Kardex
                        </Button>
                        {puedeEscribir && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditando(p)}
                              title="Editar producto"
                            >
                              <Pencil className="h-3.5 w-3.5 mr-1" />
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setProductoImagenes(p)}
                            >
                              <ImageIcon className="h-3.5 w-3.5 mr-1" />
                              Imágenes
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setProductoEliminar(p)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Eliminar
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
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

      {/* Dialogs */}
      <DialogProducto
        open={editando !== null}
        producto={editando === "nuevo" ? null : editando}
        onClose={() => setEditando(null)}
      />
      <DialogKardex
        idProducto={productoKardex?.IdProducto ?? null}
        nombreProducto={productoKardex?.NombreProducto ?? ""}
        onClose={() => setProductoKardex(null)}
      />
      <DialogImagenes
        idProducto={productoImagenes?.IdProducto ?? null}
        onClose={() => setProductoImagenes(null)}
      />
      <DialogAsociarCategoria
        open={mostrarAsociarCategoria}
        onClose={() => setMostrarAsociarCategoria(false)}
        productos={productosFiltradosConId}
      />

      <DialogEliminar
        entidad="producto"
        id={productoEliminar?.IdProducto ?? null}
        nombre={productoEliminar?.NombreProducto ?? ""}
        open={!!productoEliminar}
        onOpenChange={(v) => { if (!v) setProductoEliminar(null); }}
        onConfirmar={async () => {
          if (!productoEliminar) return;
          try {
            await eliminarProducto(productoEliminar.IdProducto);
            toast.success("Producto eliminado correctamente");
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />
    </div>
  );
}

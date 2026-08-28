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
import {
  Plus,
  Search,
  Image as ImageIcon,
  Trash2,
  Pencil,
  Tags,
  MoreHorizontal,
  History,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import {
  useImagenesProducto,
  useCrearImagenProducto,
  useEliminarImagenProducto,
} from "@/hooks/useImagenes";
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
import { ComboboxBuscable } from "@/components/ComboboxBuscable";
import { Skeleton } from "@/components/ui/skeleton";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { KardexFila } from "@congeminco/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
  const qc = useQueryClient();
  const { mutateAsync: crear, isPending: creando } = useCrearProducto();
  const { mutateAsync: editar, isPending: editandoProd } = useEditarProducto();
  const { data: categorias } = useCategorias();
  const { data: unidades } = useUnidades();
  const { data: tipos } = useTiposEquipo();
  const { data: detalle, isLoading: cargandoDetalle } = useProductoDetalle(
    producto?.IdProducto ?? null,
  );

  // Imágenes seleccionadas en el ALTA (se suben recién al crear el producto,
  // porque el Id no existe antes). En edición se sigue usando la acción "Imágenes".
  const [archivos, setArchivos] = useState<{ file: File; url: string }[]>([]);
  const [subiendoImagenes, setSubiendoImagenes] = useState(false);

  const agregarArchivos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nuevos = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!nuevos.length) return;
    setArchivos((prev) => {
      const disponibles = MAX_IMAGENES_PRODUCTO - prev.length;
      if (nuevos.length > disponibles) {
        toast.error(`Máximo ${MAX_IMAGENES_PRODUCTO} imágenes por producto.`);
      }
      return [
        ...prev,
        ...nuevos.slice(0, disponibles).map((file) => ({ file, url: URL.createObjectURL(file) })),
      ];
    });
  };

  const quitarArchivo = (idx: number) => {
    setArchivos((prev) => {
      URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx);
    });
  };

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
    // Al (re)abrir, descartar las imágenes seleccionadas de la sesión anterior.
    setArchivos((prev) => {
      prev.forEach((a) => URL.revokeObjectURL(a.url));
      return [];
    });
  }, [open, esEdicion, detalle, reset]);

  const toggleTipo = (id: string) => {
    const next = idsTipo.includes(id) ? idsTipo.filter((x) => x !== id) : [...idsTipo, id];
    setValue("IdsTipoEquipo", next, { shouldValidate: true });
  };

  const onSubmit = async (data: CrearProducto) => {
    if (!data.EsGeneral && (data.IdsTipoEquipo?.length ?? 0) === 0) {
      toast.error("Elige al menos un tipo de equipo o marca el producto como general.");
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
        const { Id } = await crear(payload);

        // Subir las imágenes seleccionadas (el producto YA quedó creado; si
        // alguna falla, se puede reintentar desde la acción "Imágenes").
        let fallidas = 0;
        if (archivos.length) {
          setSubiendoImagenes(true);
          const supabase = crearClienteNavegador();
          let orden = 0;
          for (const a of archivos) {
            try {
              const ruta = `${Id}/${Date.now()}-${a.file.name}`;
              const { data: storageData, error: storageError } = await supabase.storage
                .from("productos")
                .upload(ruta, a.file, {
                  upsert: false,
                });
              if (storageError) throw new Error(storageError.message);

              const { data: urlData } = supabase.storage
                .from("productos")
                .getPublicUrl(storageData.path);

              orden += 1;
              const res = await fetch(`/api/productos/${Id}/imagenes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  Url: urlData.publicUrl,
                  Orden: orden,
                  EsPrincipal: orden === 1,
                }),
              });
              if (!res.ok) {
                orden -= 1;
                throw new Error(`Error ${res.status}`);
              }
            } catch {
              fallidas += 1;
            }
          }
          setSubiendoImagenes(false);
          archivos.forEach((a) => URL.revokeObjectURL(a.url));
          setArchivos([]);
          void qc.invalidateQueries({ queryKey: ["imagenes", Id] });
          void qc.invalidateQueries({ queryKey: ["productos"] });
        }

        if (fallidas > 0) {
          toast.warning(
            `Producto creado, pero ${fallidas} imagen(es) no se subieron. Reintenta desde la acción "Imágenes".`,
          );
        } else {
          toast.success(
            archivos.length
              ? `Producto creado con ${archivos.length} imagen(es)`
              : "Producto creado correctamente",
          );
        }
      }
      onClose();
    } catch (e) {
      setSubiendoImagenes(false);
      toast.error((e as Error).message);
    }
  };

  const guardando = creando || editandoProd || subiendoImagenes;
  // En edición, no renderizamos el form hasta tener el detalle: evita mostrar
  // (y peor, guardar) los datos del producto editado anteriormente.
  const cargandoEdicion = esEdicion && (cargandoDetalle || !detalle);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
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
                {errors.Sku && <p className="text-xs text-destructive">{errors.Sku.message}</p>}
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
              <Input id="Nombre" placeholder="Descripción del producto" {...register("Nombre")} />
              {errors.Nombre && <p className="text-xs text-destructive">{errors.Nombre.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Categoría</Label>
                <ComboboxBuscable
                  opciones={(categorias ?? []).map((c) => ({
                    value: c.Id,
                    label: c.Nombre,
                  }))}
                  value={idCategoria ?? ""}
                  onChange={(v) => setValue("IdCategoria", v, { shouldValidate: true })}
                  buscarPlaceholder="Buscar categoría..."
                  vacioTexto="No se encontraron categorías."
                />
                {errors.IdCategoria && (
                  <p className="text-xs text-destructive">{errors.IdCategoria.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Unidad de medida</Label>
                <ComboboxBuscable
                  opciones={(unidades ?? []).map((u) => ({
                    value: u.Id,
                    label: u.Nombre,
                    codigo: u.Codigo,
                  }))}
                  value={idUnidad ?? ""}
                  onChange={(v) => setValue("IdUnidadMedida", v, { shouldValidate: true })}
                  buscarPlaceholder="Buscar por código o nombre..."
                  vacioTexto="No se encontraron unidades."
                />
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
                  className={`flex h-4 w-4 items-center justify-center rounded border text-xs font-bold ${
                    esGeneral
                      ? "border-primary bg-primary text-primary-foreground"
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
                    Selecciona los tipos de equipo compatibles:
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
                              className="flex cursor-pointer items-center gap-2"
                            >
                              <span
                                className={`flex h-4 w-4 items-center justify-center rounded border text-xs font-bold ${
                                  activo
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-muted-foreground/40"
                                }`}
                              >
                                {activo && "✓"}
                              </span>
                              <span className="flex-1">{tipo.Nombre}</span>
                              <span className="font-mono text-xs text-muted-foreground">
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
                      Elige al menos un tipo, o marca el producto como general.
                    </p>
                  )}
                </div>
              )}
            </div>

            {esEdicion ? (
              <p className="text-xs text-muted-foreground">
                Las imágenes (hasta {MAX_IMAGENES_PRODUCTO}) se gestionan desde la acción
                &quot;Imágenes&quot; del producto.
              </p>
            ) : (
              <div className="space-y-2">
                <Label>
                  Imágenes{" "}
                  <span className="font-normal text-muted-foreground">
                    (opcional, hasta {MAX_IMAGENES_PRODUCTO})
                  </span>
                </Label>
                {archivos.length > 0 && (
                  <div className="flex flex-wrap gap-3 md:gap-2">
                    {archivos.map((a, i) => (
                      <div key={a.url} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.url}
                          alt={`Imagen ${i + 1}`}
                          className="h-20 w-20 rounded-md border object-cover md:h-16 md:w-16"
                        />
                        {i === 0 && (
                          <Badge className="absolute -bottom-1 left-0 scale-75" variant="default">
                            Principal
                          </Badge>
                        )}
                        <button
                          type="button"
                          onClick={() => quitarArchivo(i)}
                          className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border bg-background text-muted-foreground hover:text-destructive md:h-5 md:w-5"
                          aria-label="Quitar imagen"
                        >
                          <Trash2 className="h-3.5 w-3.5 md:h-3 md:w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {archivos.length < MAX_IMAGENES_PRODUCTO && (
                  <label className="flex min-h-[3.5rem] cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/25 p-4 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50 md:min-h-0 md:p-3">
                    Agregar imágenes
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={agregarArchivos}
                    />
                  </label>
                )}
                <p className="text-xs text-muted-foreground">
                  Se suben al crear el producto. También puedes gestionarlas después desde la acción
                  &quot;Imágenes&quot;.
                </p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando}>
                {subiendoImagenes
                  ? "Subiendo imágenes..."
                  : guardando
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
  const { mutateAsync: crearImagen, isPending: subiendo } = useCrearImagenProducto(
    idProducto ?? "",
  );
  const { mutateAsync: eliminarImagen } = useEliminarImagenProducto(idProducto ?? "");

  const handleSubir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const archivo = e.target.files?.[0];
    if (!archivo || !idProducto) return;

    try {
      const supabase = crearClienteNavegador();
      const ruta = `${idProducto}/${Date.now()}-${archivo.name}`;
      const { data: storageData, error: storageError } = await supabase.storage
        .from("productos")
        .upload(ruta, archivo, {
          upsert: false,
        });

      if (storageError) throw new Error(storageError.message);

      const { data: urlData } = supabase.storage.from("productos").getPublicUrl(storageData.path);

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
              <div key={img.Id} className="flex items-center gap-3 rounded-md border p-2">
                <ImagenAmpliable url={img.Url} size={64} alt={`Imagen ${img.Orden}`} />
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
                    void eliminarImagen(img.Id).then(() => toast.success("Imagen eliminada"))
                  }
                >
                  Eliminar
                </Button>
              </div>
            ))}

            {(imagenes?.length ?? 0) < MAX_IMAGENES_PRODUCTO && (
              <label className="flex cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/25 p-4 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50">
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
              <p className="text-center text-xs text-muted-foreground">
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
      <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
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
          <p className="py-8 text-center text-sm text-muted-foreground">
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
                  <TableCell className="text-xs capitalize">{fila.TipoDocumento}</TableCell>
                  <TableCell className="text-xs">{fila.Comprobante ?? "—"}</TableCell>
                  <TableCell className="text-xs">{fila.NombreUbicacion}</TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      fila.Direccion === 1 ? "text-emerald-600" : "text-red-600"
                    }`}
                  >
                    {fila.Direccion === 1 ? "+" : "-"}
                    {fila.Cantidad}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{fila.SaldoCorrido}</TableCell>
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
        `${resultado.insertados} producto${resultado.insertados !== 1 ? "s" : ""} asociados (los ya asociados se omitieron)`,
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
          <p className="pt-1 text-sm text-muted-foreground">
            Todos los productos de la categoría elegida quedarán asociados al tipo seleccionado. Los
            productos ya asociados a ese tipo se omiten.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Categoría</Label>
            <ComboboxBuscable
              opciones={(categorias ?? []).map((c) => ({
                value: c.Id,
                label: c.Nombre,
              }))}
              value={idCategoriaSeleccionada}
              onChange={setIdCategoriaSeleccionada}
              placeholder="Seleccionar categoría..."
              buscarPlaceholder="Buscar categoría..."
              vacioTexto="No se encontraron categorías."
            />
          </div>

          {idCategoriaSeleccionada && (
            <p className="text-xs text-muted-foreground">
              Productos en esta categoría:{" "}
              <span className="font-semibold">{cantidadProductosCategoria}</span>
            </p>
          )}

          <div className="space-y-1">
            <Label>Tipo de equipo</Label>
            <Select value={idTipoSeleccionado} onValueChange={setIdTipoSeleccionado}>
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
  const [productoKardex, setProductoKardex] = useState<ProductoConsolidado | null>(null);
  const [productoImagenes, setProductoImagenes] = useState<ProductoConsolidado | null>(null);
  const [productoEliminar, setProductoEliminar] = useState<ProductoConsolidado | null>(null);

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
        !q || p.NombreProducto.toLowerCase().includes(q) || p.Sku.toLowerCase().includes(q);
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
          <h1 className="text-2xl font-bold tracking-tight">Catálogo de productos</h1>
          <p className="text-muted-foreground">Administra el inventario de materiales</p>
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
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o SKU..."
            className="pl-9"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <ComboboxBuscable
          className="w-52"
          opciones={[
            { value: "__todas__", label: "Todas las categorías" },
            ...categorias.map((cat) => ({ value: cat, label: cat })),
          ]}
          value={categoriaFiltro}
          onChange={setCategoriaFiltro}
          placeholder="Todas las categorías"
          buscarPlaceholder="Buscar categoría..."
          vacioTexto="No se encontraron categorías."
        />

        {puedeEscribir && (
          <Button variant="outline" onClick={() => setMostrarAsociarCategoria(true)}>
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
                  <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                    No se encontraron productos.
                  </TableCell>
                </TableRow>
              ) : (
                paginacion.itemsPagina.map((p) => {
                  const tiposNombres = tiposPorProducto.get(p.IdProducto);
                  return (
                    <TableRow key={p.IdProducto}>
                      <TableCell className="font-mono text-xs">{p.Sku}</TableCell>
                      <TableCell className="font-medium">{p.NombreProducto}</TableCell>
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
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Acciones"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => setProductoKardex(p)}>
                              <History className="mr-2 h-4 w-4" />
                              Ver kardex
                            </DropdownMenuItem>
                            {puedeEscribir && (
                              <>
                                <DropdownMenuItem onClick={() => setEditando(p)}>
                                  <Pencil className="mr-2 h-4 w-4" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setProductoImagenes(p)}>
                                  <ImageIcon className="mr-2 h-4 w-4" />
                                  Imágenes
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setProductoEliminar(p)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Eliminar
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
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
        onOpenChange={(v) => {
          if (!v) setProductoEliminar(null);
        }}
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

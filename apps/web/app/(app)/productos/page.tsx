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
import { useState, useMemo, useEffect, useRef } from "react";
import { Controller, useForm, type DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus,
  Search,
  Image as ImageIcon,
  Trash2,
  Pencil,
  Tags,
  History,
  Package,
  Camera,
  Eraser,
  AlertTriangle,
  Ban,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { DialogEliminar } from "@/components/DialogEliminar";
import { InputCantidad } from "@/components/InputCantidad";
import { ImagenAmpliable } from "@/components/ImagenAmpliable";
import { comprimirImagen } from "@/lib/image";
import { coincideBusqueda } from "@/lib/buscar";
import { DataTable, type ColumnaDataTable, type AccionFila } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { ExportarMenu, type ExportDataset } from "@/components/ExportarMenu";
import { toast } from "sonner";
import { CrearProductoSchema, type CrearProducto, MAX_IMAGENES_PRODUCTO } from "@congeminco/shared";
import {
  useProductos,
  useCrearProducto,
  useEditarProducto,
  useProductoDetalle,
  useEliminarProducto,
  buscarProductosSimilares,
  useDarDeBajaProducto,
  useReactivarProducto,
} from "@/hooks/useProductos";
import { evaluarSimilares, type EvaluacionSimilares } from "@/lib/productos-similares";
import { accionesDeBaja } from "@/lib/baja-producto";
import { Textarea } from "@/components/ui/textarea";
import {
  useImagenesProducto,
  useCrearImagenProducto,
  useEliminarImagenProducto,
} from "@/hooks/useImagenes";
import { useCategorias, useUnidades } from "@/hooks/useCatalogo";
import {
  esSinCategoriaReal,
  idsFamilias,
  opcionesParaAsignar,
  opcionesParaFiltrar,
} from "@/lib/categorias";
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
import { Skeleton } from "@/components/ui/skeleton";
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
  DialogBody,
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
import { Combobox } from "@/components/Combobox";
import { usePermiso, useYo } from "@/hooks/useYo";
import { useBorradorFormulario } from "@/hooks/useBorradorFormulario";
import { AvisoBorrador } from "@/components/AvisoBorrador";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { KardexFila } from "@congeminco/shared";
import { useQueryClient } from "@tanstack/react-query";
import { fechaCorta, hoyLima } from "@/lib/format";
import { CeldaRegistroMovimiento } from "@/components/CeldaRegistroMovimiento";

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
  /* Baja de productos con historial (0086): solo llegan cuando el admin pide
     ver los dados de baja. */
  DadoDeBaja?: boolean;
  SkuUnificado?: string | null;
}

/**
 * Arma el SKU autogenerado: PREFIJO-NNN.
 * Espeja la lógica del servidor (inv.FnGuardarProducto, migración 0059):
 * prefijo = código de la categoría sin CAT-/FAM-, saneado y en mayúsculas;
 * NNN = primer correlativo libre entre los SKUs ya cargados. El servidor
 * sigue siendo la fuente de verdad y reconfirma el número al guardar (además
 * considera productos dados de baja, que esta lista no incluye); esto es solo
 * la previsualización del SKU que se va a asignar.
 */
function armarSku(codigoCategoria: string | undefined, skusExistentes: string[]): string | null {
  if (!codigoCategoria) return null;
  const prefijo = codigoCategoria
    .replace(/^(CAT|FAM)-/i, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase();
  if (!prefijo) return null;

  const ocupados = new Set<number>();
  for (const sku of skusExistentes) {
    const s = sku.toUpperCase();
    if (!s.startsWith(`${prefijo}-`)) continue;
    const sufijo = Number(s.slice(prefijo.length + 1));
    if (Number.isInteger(sufijo) && sufijo > 0) ocupados.add(sufijo);
  }
  let correlativo = 1;
  while (ocupados.has(correlativo)) correlativo += 1;

  return `${prefijo}-${String(correlativo).padStart(3, "0")}`;
}

/* ─── Dialog: Alta / edición de producto ───
   La compatibilidad (general o tipos de equipo) se configura ACÁ, en el alta,
   no en la grilla. */
/* Estado inicial del alta. Única fuente de verdad para defaultValues, el reset
   al abrir, "Limpiar todo" y el borrador: si se separan, uno queda desfasado. */
function productoVacio(): DefaultValues<CrearProducto> {
  return {
    // Sku ausente a propósito: lo autogenera la BD (FnGuardarProducto).
    Sku: undefined,
    Nombre: "",
    IdCategoria: undefined,
    IdUnidadMedida: undefined,
    StockMinimo: 0,
    CodigoBarra: undefined,
    CodigoProductoProveedor: undefined,
    Atributos: {},
    EsGeneral: false,
    IdsTipoEquipo: [],
  };
}

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
  const { data: yo } = useYo();
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
    getValues,
    clearErrors,
    control,
    formState: { errors },
  } = useForm<CrearProducto>({
    resolver: zodResolver(CrearProductoSchema),
    defaultValues: productoVacio(),
  });

  const esGeneral = watch("EsGeneral");
  const idsTipo = watch("IdsTipoEquipo") ?? [];
  const idCategoria = watch("IdCategoria");
  const idUnidad = watch("IdUnidadMedida");
  const nombreEscrito = watch("Nombre");
  const codigoEscrito = watch("CodigoProductoProveedor");

  /* Control de duplicados del ALTA: antes de crear se buscan productos
     parecidos. Si los hay, se muestran y el usuario decide. La confirmación va
     en un ref (no en state) porque el reenvío ocurre en el mismo tick y el
     closure de onSubmit leería el valor viejo. */
  const [revision, setRevision] = useState<EvaluacionSimilares | null>(null);
  const [verificando, setVerificando] = useState(false);
  const confirmadoNuevo = useRef(false);

  // Si cambia lo que se compara, la revisión anterior ya no vale.
  useEffect(() => {
    setRevision(null);
    confirmadoNuevo.current = false;
  }, [open, nombreEscrito, codigoEscrito]);

  // Preview del SKU autogenerado (solo alta). Mismo queryKey que la lista de
  // la página, así que react-query no dispara un fetch extra.
  const { data: productosExistentes } = useProductos();
  const skuArmado = armarSku(
    categorias?.find((c) => c.Id === idCategoria)?.Codigo,
    (productosExistentes ?? []).map((p) => p.Sku),
  );

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
      reset(productoVacio());
    }
    // Al (re)abrir, descartar las imágenes seleccionadas de la sesión anterior.
    setArchivos((prev) => {
      prev.forEach((a) => URL.revokeObjectURL(a.url));
      return [];
    });
  }, [open, esEdicion, detalle, reset]);

  /* Red de contención del ALTA (en edición nunca: pisaría un producto real con
     datos viejos). Declarado DESPUÉS del efecto que resetea al abrir a propósito:
     los efectos corren en orden de declaración, así que la restauración del
     borrador se aplica sobre ese reset y no al revés. */
  const borrador = useBorradorFormulario<CrearProducto>({
    clave: "producto",
    version: 1,
    activo: open && !esEdicion,
    idUsuario: yo?.id,
    watch,
    getValues,
    reset,
    valoresIniciales: productoVacio,
  });

  /* "Limpiar todo": vacía los campos, suelta los objectURL de las imágenes
     elegidas y borra el borrador para que no reaparezca al reabrir. */
  const limpiarTodo = () => {
    setArchivos((prev) => {
      prev.forEach((a) => URL.revokeObjectURL(a.url));
      return [];
    });
    clearErrors();
    borrador.descartar();
  };

  const toggleTipo = (id: string) => {
    const next = idsTipo.includes(id) ? idsTipo.filter((x) => x !== id) : [...idsTipo, id];
    setValue("IdsTipoEquipo", next, { shouldValidate: true });
  };

  const onSubmit = async (data: CrearProducto) => {
    if (!data.EsGeneral && (data.IdsTipoEquipo?.length ?? 0) === 0) {
      toast.error("Elige al menos un tipo de equipo o marca el producto como general.");
      return;
    }
    if (!esEdicion && !confirmadoNuevo.current) {
      setVerificando(true);
      let evaluacion: EvaluacionSimilares | null = null;
      try {
        evaluacion = evaluarSimilares(
          await buscarProductosSimilares({
            nombre: data.Nombre,
            codigo: data.CodigoProductoProveedor,
          }),
        );
      } catch {
        // Si la consulta falla no se frena el alta: el código repetido igual lo
        // bloquea la BD (trigger de 0085). Solo se pierde la sugerencia.
        evaluacion = null;
      } finally {
        setVerificando(false);
      }
      if (evaluacion && evaluacion.accion !== "crear") {
        setRevision(evaluacion);
        return;
      }
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
              const comprimida = await comprimirImagen(a.file);
              const ruta = `${Id}/${Date.now()}-${comprimida.name}`;
              const { data: storageData, error: storageError } = await supabase.storage
                .from("productos")
                .upload(ruta, comprimida, {
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
      // El alta ya está guardada: se olvida el borrador (y se cancela el guardado
      // con retardo pendiente, que si no reescribiría lo recién enviado).
      borrador.olvidar();
      onClose();
    } catch (e) {
      setSubiendoImagenes(false);
      toast.error((e as Error).message);
    }
  };

  const crearIgual = () => {
    confirmadoNuevo.current = true;
    setRevision(null);
    void handleSubmit(onSubmit)();
  };

  const guardando = creando || editandoProd || subiendoImagenes || verificando;
  // En edición, no renderizamos el form hasta tener el detalle: evita mostrar
  // (y peor, guardar) los datos del producto editado anteriormente.
  const cargandoEdicion = esEdicion && (cargandoDetalle || !detalle);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{esEdicion ? "Editar producto" : "Nuevo producto"}</DialogTitle>
        </DialogHeader>
        {cargandoEdicion ? (
          <DialogBody className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </DialogBody>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <DialogBody className="space-y-4">
              {borrador.restaurado && (
                <AvisoBorrador guardadoEn={borrador.guardadoEn} onDescartar={limpiarTodo} />
              )}
              <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
                <div className="space-y-1">
                  <Label>SKU</Label>
                  {esEdicion ? (
                    <Input readOnly className="bg-muted font-mono" {...register("Sku")} />
                  ) : (
                    <>
                      <div className="flex min-h-9 items-center rounded-md border bg-muted px-3 py-1 text-sm">
                        {skuArmado ? (
                          <span className="font-mono font-medium">{skuArmado}</span>
                        ) : (
                          <span className="text-muted-foreground">Elige una categoría…</span>
                        )}
                      </div>
                      <p className="text-[11px] leading-tight text-muted-foreground">
                        Se asigna automáticamente al guardar.
                      </p>
                    </>
                  )}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="StockMinimo">Stock mínimo</Label>
                  {/* Sin atajos: acá no se piden fracciones de envase, pero el
                      campo comparte el parseo (acepta 1,5 y 100/4). */}
                  <Controller
                    control={control}
                    name="StockMinimo"
                    render={({ field: f }) => (
                      <InputCantidad
                        id="StockMinimo"
                        value={f.value ?? null}
                        onChange={(n) => f.onChange(n ?? 0)}
                        onBlur={f.onBlur}
                        min={0}
                        atajos={false}
                      />
                    )}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="Nombre">Nombre</Label>
                <Input id="Nombre" placeholder="Descripción del producto" {...register("Nombre")} />
                {errors.Nombre && (
                  <p className="text-xs text-destructive">{errors.Nombre.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Categoría</Label>
                  {/* Solo categorías reales: un producto va en una categoría, no
                      en una familia. Ofrecer la familia es lo que dejó 189
                      productos colgados del primer nivel. */}
                  <Combobox
                    opciones={opcionesParaAsignar(categorias)}
                    value={idCategoria || null}
                    onChange={(v) => setValue("IdCategoria", v ?? "", { shouldValidate: true })}
                    permitirLimpiar={false}
                    buscarPlaceholder="Buscar categoría o familia..."
                    vacioTexto="No se encontraron categorías."
                  />
                  {errors.IdCategoria && (
                    <p className="text-xs text-destructive">{errors.IdCategoria.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Unidad de medida</Label>
                  <Combobox
                    opciones={(unidades ?? []).map((u) => ({
                      value: u.Id,
                      label: u.Nombre,
                      codigo: u.Codigo,
                    }))}
                    value={idUnidad || null}
                    onChange={(v) => setValue("IdUnidadMedida", v ?? "", { shouldValidate: true })}
                    permitirLimpiar={false}
                    buscarPlaceholder="Buscar por código o nombre..."
                    vacioTexto="No se encontraron unidades."
                  />
                  {errors.IdUnidadMedida && (
                    <p className="text-xs text-destructive">{errors.IdUnidadMedida.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
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
                          {/* Miniatura ampliable (doble clic / mantener presionado). */}
                          <ImagenAmpliable url={a.url} size={72} alt={`Imagen ${i + 1}`} />
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
                    <div className="flex flex-col gap-2">
                      <label className="flex min-h-[3.5rem] cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/25 p-4 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50 md:min-h-0 md:p-3">
                        <ImageIcon className="h-4 w-4 shrink-0" />
                        Agregar imágenes
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={agregarArchivos}
                        />
                      </label>
                      {/* capture abre la cámara en Android/iOS. Se muestra por capacidad táctil (pointer:coarse), no por ancho de pantalla. */}
                      <label className="flex hidden min-h-[3.5rem] cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/25 p-4 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50 [@media(pointer:coarse)]:flex">
                        <Camera className="h-4 w-4 shrink-0" />
                        Tomar foto
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={agregarArchivos}
                        />
                      </label>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Se suben al crear el producto. También puedes gestionarlas después desde la
                    acción &quot;Imágenes&quot;.
                  </p>
                </div>
              )}
            </DialogBody>
            {revision && (
              <PanelSimilares
                revision={revision}
                onCrearIgual={crearIgual}
                onRevisar={() => setRevision(null)}
              />
            )}
            <DialogFooter>
              {!esEdicion && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={limpiarTodo}
                  disabled={guardando}
                  className="sm:mr-auto"
                >
                  <Eraser className="mr-2 h-4 w-4" />
                  Limpiar todo
                </Button>
              )}
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando || !!revision}>
                {verificando
                  ? "Buscando parecidos..."
                  : subiendoImagenes
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

/* ─── Panel: "¿No es alguno de estos?" (control de duplicados del alta) ───
   Bloqueo: otro producto ya tiene el mismo código de proveedor; no se ofrece
   "crear igual". Confirmación: solo parecidos por nombre; el usuario decide. */
function PanelSimilares({
  revision,
  onCrearIgual,
  onRevisar,
}: {
  revision: EvaluacionSimilares;
  onCrearIgual: () => void;
  onRevisar: () => void;
}) {
  const bloquea = revision.accion === "bloquear";
  return (
    <div
      role="alert"
      className={`mx-4 mb-2 max-h-64 overflow-y-auto rounded-md border p-3 text-sm md:mx-6 ${
        bloquea ? "border-destructive/50 bg-destructive/5" : "border-amber-500/50 bg-amber-500/5"
      }`}
    >
      {revision.bloqueante && (
        <div className="mb-2 flex gap-2">
          <Ban className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p>
            El código de proveedor <strong>{revision.bloqueante.CodigoProductoProveedor}</strong> ya
            está registrado en <strong>{revision.bloqueante.Sku}</strong> —{" "}
            {revision.bloqueante.Nombre}. Si es el mismo repuesto, usa ese producto; si no, corrige
            el código.
          </p>
        </div>
      )}
      {revision.parecidos.length > 0 && (
        <>
          <p className="mb-2 flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            ¿No es alguno de estos?
          </p>
          <ul className="mb-3 space-y-1">
            {revision.parecidos.map((p) => (
              <li key={p.Id} className="flex items-baseline gap-2">
                <Badge variant="outline" className="shrink-0 font-mono">
                  {p.Sku}
                </Badge>
                <span className="min-w-0 break-words">{p.Nombre}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onRevisar}>
          {bloquea ? "Entendido" : "Revisar"}
        </Button>
        {!bloquea && (
          <Button type="button" size="sm" onClick={onCrearIgual}>
            Es un producto nuevo, crear igual
          </Button>
        )}
      </div>
    </div>
  );
}

/* ─── Dialog: Dar de baja un producto con historial ───
   Para duplicados ya unificados: el stock se pasó al producto bueno con un
   documento y este quedó en 0. Se conserva por su kardex, pero desaparece del
   catálogo y de los selectores de todos los roles menos admin. */
function DialogBajaProducto({
  producto,
  candidatos,
  onClose,
}: {
  producto: ProductoConsolidado | null;
  candidatos: ProductoConsolidado[];
  onClose: () => void;
}) {
  const [idUnificado, setIdUnificado] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const { mutateAsync: darDeBaja, isPending } = useDarDeBajaProducto();

  useEffect(() => {
    setIdUnificado(null);
    setMotivo("");
  }, [producto]);

  const opciones = useMemo(
    () =>
      candidatos
        .filter((c) => c.IdProducto !== producto?.IdProducto && !c.DadoDeBaja)
        .map((c) => ({ value: c.IdProducto, label: `${c.Sku} — ${c.NombreProducto}` })),
    [candidatos, producto],
  );

  const confirmar = async () => {
    if (!producto) return;
    try {
      await darDeBaja({
        id: producto.IdProducto,
        data: { IdProductoUnificado: idUnificado, Motivo: motivo.trim() || undefined },
      });
      toast.success(`${producto.Sku} dado de baja: ya no aparece para los demás roles`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={!!producto} onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Dar de baja producto</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <p className="text-sm">
            <strong>{producto?.Sku}</strong> — {producto?.NombreProducto}
          </p>
          <p className="text-sm text-muted-foreground">
            Deja de aparecer en el catálogo, los saldos y los selectores de requerimientos,
            movimientos y órdenes de mantenimiento para todos los roles. Su kardex y sus documentos
            se conservan. Puedes reactivarlo desde &quot;Ver dados de baja&quot;.
          </p>
          <div className="space-y-1.5">
            <Label>
              Se unificó en <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Combobox
              opciones={opciones}
              value={idUnificado}
              onChange={setIdUnificado}
              placeholder="Producto que queda vigente"
              buscarPlaceholder="Buscar por SKU o nombre..."
              vacioTexto="No se encontraron productos."
              permitirLimpiar
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-baja">
              Motivo <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Textarea
              id="motivo-baja"
              value={motivo}
              maxLength={300}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej.: duplicado, se registró con otro nombre"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => void confirmar()}
            disabled={isPending}
          >
            {isPending ? "Dando de baja..." : "Dar de baja"}
          </Button>
        </DialogFooter>
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
      const comprimida = await comprimirImagen(archivo);
      const ruta = `${idProducto}/${Date.now()}-${comprimida.name}`;
      const { data: storageData, error: storageError } = await supabase.storage
        .from("productos")
        .upload(ruta, comprimida, {
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
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Imágenes del producto</DialogTitle>
        </DialogHeader>

        <DialogBody>
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
                  <ImagenAmpliable url={img.Url} size={72} alt={`Imagen ${img.Orden}`} />
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
                <div className="flex flex-col gap-2">
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/25 p-4 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50">
                    <ImageIcon className="h-4 w-4 shrink-0" />
                    {subiendo ? "Subiendo..." : "Agregar imagen"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleSubir}
                      disabled={subiendo}
                    />
                  </label>
                  {/* capture abre la cámara en Android/iOS. Se muestra por capacidad táctil (pointer:coarse), no por ancho de pantalla. */}
                  <label className="flex hidden cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/25 p-4 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50 [@media(pointer:coarse)]:flex">
                    <Camera className="h-4 w-4 shrink-0" />
                    {subiendo ? "Subiendo..." : "Tomar foto"}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleSubir}
                      disabled={subiendo}
                    />
                  </label>
                </div>
              )}

              {(imagenes?.length ?? 0) >= MAX_IMAGENES_PRODUCTO && (
                <p className="text-center text-xs text-muted-foreground">
                  Límite de {MAX_IMAGENES_PRODUCTO} imágenes alcanzado.
                </p>
              )}
            </div>
          )}
        </DialogBody>
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
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Kardex — {nombreProducto}</DialogTitle>
        </DialogHeader>
        <DialogBody>
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
                  <TableHead>Registro</TableHead>
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
                    <TableCell className="text-xs">{fechaCorta(fila.FechaMovimiento)}</TableCell>
                    <CeldaRegistroMovimiento
                      fechaDocumento={fila.FechaMovimiento}
                      fechaRegistro={fila.FechaRegistro}
                      registradoPor={fila.RegistradoPor}
                    />
                    <TableCell className="text-xs capitalize">{fila.TipoDocumento}</TableCell>
                    <TableCell className="text-xs">{fila.Comprobante ?? "—"}</TableCell>
                    <TableCell className="text-xs">{fila.NombreUbicacion}</TableCell>
                    <TableCell
                      className={`text-right font-medium ${
                        fila.Direccion === 1 ? "text-success" : "text-destructive"
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
        </DialogBody>
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
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Asociar categoría a tipo de equipo</DialogTitle>
          <p className="pt-1 text-sm text-muted-foreground">
            Todos los productos de la categoría elegida quedarán asociados al tipo seleccionado. Los
            productos ya asociados a ese tipo se omiten.
          </p>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1">
            <Label>Categoría</Label>
            {/* Acá la familia SÍ es una elección válida ("todos los
                consumibles"), pero tiene que verse como familia. */}
            <Combobox
              opciones={opcionesParaFiltrar(categorias)}
              value={idCategoriaSeleccionada || null}
              onChange={(v) => setIdCategoriaSeleccionada(v ?? "")}
              permitirLimpiar={false}
              placeholder="Seleccionar categoría..."
              buscarPlaceholder="Buscar categoría o familia..."
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
        </DialogBody>

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

/* Valor centinela del filtro de categoría: los productos que cuelgan de una
   FAMILIA en vez de una categoría real. No es el nombre de ninguna categoría,
   así que no puede chocar con una. */
const FILTRO_SIN_CATEGORIA = "__sin_categoria_real__";

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
  const [productoBaja, setProductoBaja] = useState<ProductoConsolidado | null>(null);
  // Solo admin: mostrar también los dados de baja (para revisarlos o reactivarlos).
  const [verBajas, setVerBajas] = useState(false);

  const { data: yo } = useYo();
  const puedeBaja = usePermiso("productoBaja");
  const {
    data: productos,
    isLoading: cargando,
    isError: error,
    refetch,
  } = useProductos({
    incluirBaja: puedeBaja && verBajas,
  });
  const puedeEscribir = usePermiso("productoEscritura");
  const { mutateAsync: eliminarProducto } = useEliminarProducto();
  const { mutateAsync: reactivarProducto } = useReactivarProducto();

  const reactivar = async (p: ProductoConsolidado) => {
    try {
      await reactivarProducto(p.IdProducto);
      toast.success(`${p.Sku} reactivado: vuelve a estar visible para todos`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  /* El catálogo con la jerarquía, para distinguir familia de categoría. Sin
     esto no hay forma de ver cuáles productos quedaron colgados del primer
     nivel, que son los que hay que repartir a mano. */
  const { data: catalogoCategorias } = useCategorias();
  const familias = useMemo(() => idsFamilias(catalogoCategorias), [catalogoCategorias]);

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

  /* Los que quedaron colgados de una familia: la cola del reparto manual.
     Se cuenta siempre, para poder mostrar el número en el filtro. */
  const cantidadSinCategoriaReal = useMemo(() => {
    if (!productos) return 0;
    return productos.filter((p) =>
      esSinCategoriaReal((p as ProductoConsolidado).IdCategoria, familias),
    ).length;
  }, [productos, familias]);

  // Filtrado en memoria: búsqueda + categoría. La búsqueda cubre nombre, SKU y
  // código del proveedor, el mismo criterio del Combobox y del buscador de saldos.
  const productosFiltrados = useMemo(() => {
    if (!productos) return [];
    return productos.filter((p) => {
      const coincideCategoria =
        categoriaFiltro === "__todas__"
          ? true
          : categoriaFiltro === FILTRO_SIN_CATEGORIA
            ? esSinCategoriaReal((p as ProductoConsolidado).IdCategoria, familias)
            : p.NombreCategoria === categoriaFiltro;
      return (
        coincideCategoria &&
        coincideBusqueda([p.NombreProducto, p.Sku, p.CodigoProductoProveedor], busqueda)
      );
    });
  }, [productos, busqueda, categoriaFiltro, familias]);

  // El tipo local del hook useProductos no incluye IdCategoria; lo casteamos
  // desde ProductoStockConsolidado que sí lo tiene (la API lo devuelve).
  const productosFiltradosConId = productosFiltrados as ProductoConsolidado[];

  /* Exportación del catálogo. Exporta lo que el usuario TIENE A LA VISTA, no
     todo el catálogo: si filtró por categoría o buscó algo, el archivo tiene que
     coincidir con la pantalla; si no, se lleva un Excel que no reconoce. Por eso
     también el nombre del archivo lleva la categoría cuando hay una elegida. */
  const datasetProductos = (): ExportDataset => {
    const sufijo =
      categoriaFiltro === "__todas__"
        ? ""
        : categoriaFiltro === FILTRO_SIN_CATEGORIA
          ? "-sin-categoria-real"
          : `-${categoriaFiltro.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}`;
    return {
      nombreArchivo: `catalogo-productos${sufijo}-${hoyLima()}`,
      nombreHoja: "Catálogo",
      columnas: [
        { key: "Sku", label: "SKU" },
        { key: "Nombre", label: "Nombre" },
        { key: "Categoria", label: "Categoría" },
        { key: "TiposEquipo", label: "Tipos de equipo" },
        { key: "Unidad", label: "Unidad" },
        { key: "StockTotal", label: "Stock total" },
        { key: "StockMinimo", label: "Stock mínimo" },
        { key: "BajoMinimo", label: "Bajo mínimo" },
        { key: "CostoPromedio", label: "Costo promedio" },
        { key: "CodigoProveedor", label: "Código proveedor" },
      ],
      filas: productosFiltrados.map((p) => ({
        Sku: p.Sku,
        Nombre: p.NombreProducto,
        Categoria: p.NombreCategoria,
        // Mismo criterio que la grilla: un producto general aplica a todo equipo.
        TiposEquipo: p.EsGeneral
          ? "General"
          : (tiposPorProducto.get(p.IdProducto)?.join(", ") ?? ""),
        Unidad: p.CodigoUnidad,
        StockTotal: p.StockTotal,
        StockMinimo: p.StockMinimo,
        BajoMinimo: p.BajoMinimo ? "Sí" : "No",
        CostoPromedio: p.CostoPromedio ?? 0,
        CodigoProveedor: p.CodigoProductoProveedor ?? "",
      })),
    };
  };

  const columnas = useMemo<ColumnaDataTable<ProductoConsolidado>[]>(
    () => [
      { id: "sku", titulo: "SKU", celda: (p) => p.Sku, className: "font-mono text-xs" },
      { id: "nombre", titulo: "Nombre", celda: (p) => p.NombreProducto, className: "font-medium" },
      {
        id: "categoria",
        titulo: "Categoría",
        celda: (p) => p.NombreCategoria,
        className: "text-sm text-muted-foreground",
        ocultarEnMovil: true,
      },
      {
        id: "tipos",
        titulo: "Tipos de equipo",
        ocultarEnMovil: true,
        celda: (p) => {
          const tiposNombres = tiposPorProducto.get(p.IdProducto);
          return (
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
          );
        },
      },
      {
        id: "stockMinimo",
        titulo: "Stock mín.",
        alineacion: "derecha",
        celda: (p) => p.StockMinimo,
        ocultarEnMovil: true,
      },
      {
        id: "stockActual",
        titulo: "Stock actual",
        alineacion: "derecha",
        celda: (p) => (
          <span className={`font-semibold ${p.BajoMinimo ? "text-warning" : ""}`}>
            {p.StockTotal}
          </span>
        ),
      },
      {
        id: "estado",
        titulo: "Estado",
        celda: (p) =>
          p.DadoDeBaja ? (
            <div className="flex flex-col items-start gap-0.5">
              <Badge variant="destructive">De baja</Badge>
              {p.SkuUnificado && (
                <span className="text-xs text-muted-foreground">→ {p.SkuUnificado}</span>
              )}
            </div>
          ) : (
            <Badge variant={p.BajoMinimo ? "warning" : "default"}>
              {p.BajoMinimo ? "Bajo mínimo" : "OK"}
            </Badge>
          ),
      },
    ],
    [tiposPorProducto],
  );

  const acciones = useMemo<AccionFila<ProductoConsolidado>[]>(
    () => [
      { label: "Ver kardex", icono: History, onClick: (p) => setProductoKardex(p) },
      {
        label: "Editar",
        icono: Pencil,
        visible: (p) => puedeEscribir && !p.DadoDeBaja,
        onClick: (p) => setEditando(p),
      },
      {
        label: "Imágenes",
        icono: ImageIcon,
        visible: (p) => puedeEscribir && !p.DadoDeBaja,
        onClick: (p) => setProductoImagenes(p),
      },
      {
        // Solo admin y solo con saldo 0: primero se pasa el stock al producto bueno.
        label: "Dar de baja",
        icono: Archive,
        variante: "destructiva",
        visible: (p) => accionesDeBaja(p, yo?.rol).darDeBaja,
        onClick: (p) => setProductoBaja(p),
      },
      {
        label: "Reactivar",
        icono: ArchiveRestore,
        visible: (p) => accionesDeBaja(p, yo?.rol).reactivar,
        onClick: (p) => void reactivar(p),
      },
      {
        label: "Eliminar",
        icono: Trash2,
        variante: "destructiva",
        visible: (p) => puedeEscribir && !p.DadoDeBaja,
        onClick: (p) => setProductoEliminar(p),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reactivar solo usa setters y la mutación estable
    [puedeEscribir, yo?.rol],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Catálogo de productos"
        descripcion="Administra el inventario de materiales"
        acciones={
          <>
            {/* Exportar no requiere permiso de escritura: quien puede ver el
                catálogo puede llevárselo. */}
            <ExportarMenu
              dataset={datasetProductos}
              tamano="default"
              disabled={!productosFiltrados.length}
            />
            {puedeEscribir && (
              <Button onClick={() => setEditando("nuevo")}>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo producto
              </Button>
            )}
          </>
        }
      />

      {/* Búsqueda + filtro por categoría + asociar por categoría */}
      <div className="flex flex-wrap gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, SKU o código de proveedor..."
            className="pl-9"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <Combobox
          className="w-full sm:w-52"
          opciones={[
            { value: "__todas__", label: "Todas las categorías" },
            /* La cola del reparto manual. Sin este filtro no había forma de
               encontrar los productos que quedaron colgados de una familia:
               aparecían desparramados entre "Repuestos", "Consumibles" y el
               resto, y nadie sabía cuáles faltaban. */
            ...(cantidadSinCategoriaReal > 0
              ? [
                  {
                    value: FILTRO_SIN_CATEGORIA,
                    label: `Sin categoría real (${cantidadSinCategoriaReal})`,
                    descripcion: "Cuelgan de una familia: hay que asignarles una categoría",
                  },
                ]
              : []),
            ...categorias.map((cat) => ({ value: cat, label: cat })),
          ]}
          value={categoriaFiltro}
          onChange={(v) => setCategoriaFiltro(v ?? "__todas__")}
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

        {puedeBaja && (
          <Button
            variant={verBajas ? "secondary" : "outline"}
            onClick={() => setVerBajas((v) => !v)}
            aria-pressed={verBajas}
          >
            <Archive className="mr-2 h-4 w-4" />
            {verBajas ? "Ocultar dados de baja" : "Ver dados de baja"}
          </Button>
        )}
      </div>

      <DataTable
        columnas={columnas}
        datos={productosFiltradosConId}
        obtenerId={(p) => p.IdProducto}
        cargando={cargando}
        error={error}
        onReintentar={() => void refetch()}
        vacio={{
          icono: Package,
          titulo: "No se encontraron productos",
          descripcion:
            busqueda || categoriaFiltro !== "__todas__"
              ? "Ajusta la búsqueda o el filtro de categoría."
              : "Registra el primer producto del catálogo.",
          accion:
            puedeEscribir && !busqueda && categoriaFiltro === "__todas__" ? (
              <Button size="sm" onClick={() => setEditando("nuevo")}>
                <Plus className="mr-2 h-4 w-4" />
                Nuevo producto
              </Button>
            ) : undefined,
        }}
        acciones={acciones}
      />

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

      <DialogBajaProducto
        producto={productoBaja}
        candidatos={(productos ?? []) as ProductoConsolidado[]}
        onClose={() => setProductoBaja(null)}
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

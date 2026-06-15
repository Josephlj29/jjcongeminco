"use client";

/**
 * app/(app)/movimientos/page.tsx — Registro de documentos de inventario
 *
 * Form organizado en secciones (Documento / Ubicaciones / Destino del consumo /
 * Detalle). El selector de producto usa ProductoCombobox (imagen + sku + stock).
 *
 * Valorización de salidas (NIC 2 / SUNAT — promedio móvil):
 * - En SALIDA, el costo por línea se muestra en SOLO LECTURA = CostoPromedio del
 *   producto (de saldos). Si no se envía CostoUnitario, la BD congela el promedio.
 * - El usuario puede abrir el historial de precios y elegir uno como OVERRIDE
 *   manual; ese valor se setea en Detalle.{i}.CostoUnitario y se manda explícito.
 *   "Volver al promedio" limpia el override (CostoUnitario = undefined).
 * - En ENTRADA, el costo es editable libremente como antes.
 *
 * Compatibilidad: en salida con placa, el toggle "Solo productos compatibles"
 * filtra el combobox a los productos asociados al tipo de equipo de la placa
 * (vía vehículo -> equipo -> tipo) MÁS los productos generales (sin asociaciones).
 */
import { useMemo, useState } from "react";
import {
  useForm,
  useFieldArray,
  useWatch,
  type Control,
  type UseFormSetValue,
  type UseFormRegister,
} from "react-hook-form";
import { usePaginacion } from "@/hooks/usePaginacion";
import { Paginacion } from "@/components/Paginacion";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, History, Info, Package } from "lucide-react";
import { toast } from "sonner";
import {
  CrearDocumentoSchema,
  TIPO_DOCUMENTO,
  type CrearDocumento,
  type ProductoStockConsolidado,
} from "@congeminco/shared";
import {
  useCrearDocumento,
  useDocumentos,
  type DocumentoResumen,
} from "@/hooks/useDocumentos";
import { useSaldos } from "@/hooks/useSaldos";
import { useUbicaciones } from "@/hooks/useCatalogo";
import { useVehiculos, useEquipos } from "@/hooks/useEquipos";
import { useAsociacionesTiposEquipo } from "@/hooks/useTiposEquipo";
import { ProductoCombobox } from "@/components/ProductoCombobox";
import { DialogHistorialPrecios } from "@/components/productos/DialogHistorialPrecios";
import { GaleriaProductoDialog } from "@/components/GaleriaProductoDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/* Labels en español para tipos de documento */
const TIPO_LABEL: Record<string, string> = {
  existencia_inicial: "Existencia inicial",
  entrada: "Entrada",
  salida: "Salida",
  transferencia: "Transferencia",
  ajuste: "Ajuste",
};

/* ── Línea de detalle (subcomponente para aislar el watch por fila) ── */
interface LineaDetalleProps {
  index: number;
  control: Control<CrearDocumento>;
  register: UseFormRegister<CrearDocumento>;
  setValue: UseFormSetValue<CrearDocumento>;
  productos: ProductoStockConsolidado[];
  esSalida: boolean;
  puedeBorrar: boolean;
  onBorrar: () => void;
  onAbrirHistorial: (idProducto: string) => void;
  onAbrirGaleria: (idProducto: string) => void;
  errorProducto?: string;
}

function LineaDetalle({
  index,
  control,
  register,
  setValue,
  productos,
  esSalida,
  puedeBorrar,
  onBorrar,
  onAbrirHistorial,
  onAbrirGaleria,
  errorProducto,
}: LineaDetalleProps) {
  const idProducto = useWatch({ control, name: `Detalle.${index}.IdProducto` });
  const costoUnitario = useWatch({
    control,
    name: `Detalle.${index}.CostoUnitario`,
  });

  const producto = useMemo(
    () => productos.find((p) => p.IdProducto === idProducto) ?? null,
    [productos, idProducto]
  );
  const costoPromedio = producto?.CostoPromedio ?? 0;
  const tieneOverride = costoUnitario !== undefined && costoUnitario !== null;

  return (
    <TableRow>
      <TableCell className="align-top">
        <ProductoCombobox
          productos={productos}
          value={idProducto ?? null}
          onChange={(v) =>
            setValue(`Detalle.${index}.IdProducto`, v ?? "", {
              shouldValidate: true,
            })
          }
        />
        {producto && (
          <button
            type="button"
            onClick={() => onAbrirGaleria(producto.IdProducto)}
            title="Ver / ampliar imágenes"
            className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            {producto.UrlImagenPrincipal ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={producto.UrlImagenPrincipal}
                alt=""
                className="h-9 w-9 rounded border object-cover"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded border bg-muted">
                <Package className="h-4 w-4" />
              </span>
            )}
            <span className="underline-offset-2 hover:underline">Ver imágenes</span>
          </button>
        )}
        {errorProducto && (
          <p className="text-xs text-destructive mt-1">{errorProducto}</p>
        )}
      </TableCell>
      <TableCell className="align-top">
        <Input
          type="number"
          min={1}
          className="h-9"
          {...register(`Detalle.${index}.Cantidad`, {
            valueAsNumber: true,
          })}
        />
      </TableCell>
      <TableCell className="align-top">
        {esSalida ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <Input
                readOnly={!tieneOverride}
                type="number"
                min={0}
                step="0.01"
                className="h-9 bg-muted/40"
                value={
                  tieneOverride
                    ? (costoUnitario as number)
                    : costoPromedio.toFixed(2)
                }
                onChange={(e) => {
                  if (tieneOverride) {
                    const v = e.target.valueAsNumber;
                    setValue(
                      `Detalle.${index}.CostoUnitario`,
                      Number.isNaN(v) ? 0 : v
                    );
                  }
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                disabled={!idProducto}
                title="Ver historial de precios"
                onClick={() => idProducto && onAbrirHistorial(idProducto)}
              >
                <History className="h-4 w-4" />
              </Button>
            </div>
            {tieneOverride ? (
              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <Badge variant="warning">Manual</Badge>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() =>
                      setValue(`Detalle.${index}.CostoUnitario`, undefined)
                    }
                  >
                    Volver al promedio
                  </Button>
                </div>
                <p className="text-[11px] leading-tight text-muted-foreground">
                  El método oficial es promedio (NIC 2); este override queda
                  registrado.
                </p>
              </div>
            ) : (
              <p className="flex items-center gap-1 text-[11px] leading-tight text-muted-foreground">
                Costo promedio móvil vigente (NIC 2/SUNAT)
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Las salidas se valorizan al costo promedio móvil del
                      producto. Si no se envía un costo, la BD congela el
                      promedio vigente al momento del movimiento.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </p>
            )}
            {idProducto && costoPromedio === 0 && !tieneOverride && (
              <p className="text-[11px] leading-tight text-amber-600">
                Producto sin compras registradas.
              </p>
            )}
          </div>
        ) : (
          <Input
            type="number"
            min={0}
            step="0.01"
            className="h-9"
            placeholder="0.00"
            {...register(`Detalle.${index}.CostoUnitario`, {
              valueAsNumber: true,
            })}
          />
        )}
      </TableCell>
      <TableCell className="align-top">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-destructive"
          onClick={onBorrar}
          disabled={!puedeBorrar}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function MovimientosPage() {
  const { mutateAsync, isPending } = useCrearDocumento();
  const { data: productos } = useSaldos();
  const { data: ubicaciones } = useUbicaciones();
  const { data: vehiculos } = useVehiculos();
  const { data: equipos } = useEquipos();
  const { data: asociaciones } = useAsociacionesTiposEquipo();
  const { data: documentos, isLoading: cargandoDocs } = useDocumentos();

  const [soloCompatibles, setSoloCompatibles] = useState(true);
  const [dialogProducto, setDialogProducto] = useState<{
    open: boolean;
    idProducto: string | null;
    linea: number;
  }>({ open: false, idProducto: null, linea: 0 });

  const [galeria, setGaleria] = useState<{ open: boolean; idProducto: string | null }>(
    { open: false, idProducto: null }
  );

  const paginacion = usePaginacion(documentos ?? [], 10);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    reset,
    formState: { errors },
  } = useForm<CrearDocumento>({
    resolver: zodResolver(CrearDocumentoSchema),
    defaultValues: {
      FechaDocumento: new Date().toISOString().split("T")[0],
      Detalle: [{ IdProducto: "", Cantidad: 1 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "Detalle",
  });
  const tipoDocumento = watch("TipoDocumento");
  const idVehiculo = watch("IdVehiculo");

  const esTransferencia = tipoDocumento === "transferencia";
  const esEntrada =
    tipoDocumento === "entrada" || tipoDocumento === "existencia_inicial";
  const esSalida = tipoDocumento === "salida";

  const todosProductos = useMemo(() => productos ?? [], [productos]);

  /* Tipo de equipo de la placa seleccionada (vehículo -> equipo -> tipo). */
  const idTipoEquipoPlaca = useMemo(() => {
    if (!idVehiculo) return null;
    const vehiculo = vehiculos?.find((v) => v.Id === idVehiculo);
    if (!vehiculo?.IdEquipo) return null;
    const equipo = equipos?.find((e) => e.Id === vehiculo.IdEquipo);
    return equipo?.IdTipoEquipo ?? null;
  }, [idVehiculo, vehiculos, equipos]);

  /* IdProducto compatibles con ese tipo de equipo (asociaciones de ese tipo). */
  const productosDelTipo = useMemo(() => {
    if (!idTipoEquipoPlaca) return new Set<string>();
    const s = new Set<string>();
    (asociaciones ?? [])
      .filter((a) => a.IdTipoEquipo === idTipoEquipoPlaca)
      .forEach((a) => s.add(a.IdProducto));
    return s;
  }, [asociaciones, idTipoEquipoPlaca]);

  /* Productos a mostrar en el combobox según el toggle. */
  const productosVisibles = useMemo(() => {
    const filtroActivo =
      esSalida && !!idVehiculo && !!idTipoEquipoPlaca && soloCompatibles;
    if (!filtroActivo) return todosProductos;
    // Compatibles = del tipo de la placa, o productos generales (EsGeneral).
    return todosProductos.filter(
      (p) => productosDelTipo.has(p.IdProducto) || p.EsGeneral
    );
  }, [
    esSalida,
    idVehiculo,
    idTipoEquipoPlaca,
    soloCompatibles,
    todosProductos,
    productosDelTipo,
  ]);

  const mostrarToggleCompatibles = esSalida && !!idVehiculo && !!idTipoEquipoPlaca;

  const onSubmit = async (data: CrearDocumento) => {
    /* En salidas sin override (CostoUnitario undefined) no se manda el costo:
       la BD congela el promedio móvil automáticamente. zodResolver ya deja el
       campo en undefined cuando el input está en solo lectura. */
    try {
      await mutateAsync(data);
      toast.success("Documento registrado correctamente");
      reset({
        FechaDocumento: new Date().toISOString().split("T")[0],
        Detalle: [{ IdProducto: "", Cantidad: 1 }],
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Movimientos</h1>
        <p className="text-muted-foreground">
          Registra entradas, salidas y transferencias de inventario
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* ── Sección: Documento ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label>Tipo de documento</Label>
                <Select
                  value={tipoDocumento ?? ""}
                  onValueChange={(v) => {
                    setValue(
                      "TipoDocumento",
                      v as CrearDocumento["TipoDocumento"],
                      { shouldValidate: true }
                    );
                    // Al cambiar el tipo, limpiar los campos que dependen de él
                    // para no arrastrar valores del documento anterior.
                    setValue("IdUbicacionOrigen", undefined);
                    setValue("IdUbicacionDestino", undefined);
                    setValue("IdVehiculo", undefined);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPO_DOCUMENTO.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TIPO_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.TipoDocumento && (
                  <p className="text-xs text-destructive">
                    {errors.TipoDocumento.message}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="FechaDocumento">Fecha</Label>
                <Input
                  id="FechaDocumento"
                  type="date"
                  {...register("FechaDocumento")}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="NumeroDocumento">N° Documento (opcional)</Label>
                <Input
                  id="NumeroDocumento"
                  placeholder="REM-0001"
                  {...register("NumeroDocumento")}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="Comprobante">Comprobante (opcional)</Label>
                <Input
                  id="Comprobante"
                  placeholder="F001-00001"
                  {...register("Comprobante")}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Sección: Ubicaciones ── */}
        {tipoDocumento && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ubicaciones</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl">
                {(esTransferencia || !esEntrada) && (
                  <div className="space-y-1">
                    <Label>Ubicación origen</Label>
                    <Select
                      value={watch("IdUbicacionOrigen") ?? ""}
                      onValueChange={(v) =>
                        setValue("IdUbicacionOrigen", v, { shouldValidate: true })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {ubicaciones?.map((u) => (
                          <SelectItem key={u.Id} value={u.Id}>
                            {u.Nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(esTransferencia || esEntrada) && (
                  <div className="space-y-1">
                    <Label>Ubicación destino</Label>
                    <Select
                      value={watch("IdUbicacionDestino") ?? ""}
                      onValueChange={(v) =>
                        setValue("IdUbicacionDestino", v, { shouldValidate: true })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {ubicaciones?.map((u) => (
                          <SelectItem key={u.Id} value={u.Id}>
                            {u.Nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Sección: Destino del consumo (placa) — solo salida ── */}
        {esSalida && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Destino del consumo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1 max-w-sm">
                <Label>
                  Placa <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={idVehiculo ?? ""}
                  onValueChange={(v) => setValue("IdVehiculo", v, { shouldValidate: true })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar placa..." />
                  </SelectTrigger>
                  <SelectContent>
                    {vehiculos?.map((v) => (
                      <SelectItem key={v.Id} value={v.Id}>
                        {v.Placa}
                        {v.Modelo ? ` — ${v.Modelo}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.IdVehiculo && (
                  <p className="text-xs text-destructive">
                    {errors.IdVehiculo.message}
                  </p>
                )}
              </div>

              {mostrarToggleCompatibles && (
                <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
                  <input
                    type="checkbox"
                    checked={soloCompatibles}
                    onChange={(e) => setSoloCompatibles(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Solo productos compatibles con esta placa
                </label>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Sección: Detalle ── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Detalle</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => append({ IdProducto: "", Cantidad: 1 })}
            >
              <Plus className="mr-1 h-3 w-3" />
              Agregar línea
            </Button>
          </CardHeader>
          <CardContent>
            <Separator className="mb-4" />
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-64">Producto</TableHead>
                    <TableHead className="w-24">Cantidad</TableHead>
                    <TableHead className="w-56">
                      {esSalida ? "Costo (valorización)" : "Costo unit. (opt.)"}
                    </TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, idx) => (
                    <LineaDetalle
                      key={field.id}
                      index={idx}
                      control={control}
                      register={register}
                      setValue={setValue}
                      productos={productosVisibles}
                      esSalida={esSalida}
                      puedeBorrar={fields.length > 1}
                      onBorrar={() => fields.length > 1 && remove(idx)}
                      onAbrirHistorial={(idProducto) =>
                        setDialogProducto({ open: true, idProducto, linea: idx })
                      }
                      onAbrirGaleria={(idProducto) =>
                        setGaleria({ open: true, idProducto })
                      }
                      errorProducto={errors.Detalle?.[idx]?.IdProducto?.message}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end mt-6">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Registrando..." : "Registrar documento"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Dialog de historial de precios (override de costo en salidas) */}
      <DialogHistorialPrecios
        idProducto={dialogProducto.idProducto}
        open={dialogProducto.open}
        onOpenChange={(open) =>
          setDialogProducto((prev) => ({ ...prev, open }))
        }
        onUsarPrecio={(costo) =>
          setValue(`Detalle.${dialogProducto.linea}.CostoUnitario`, costo)
        }
      />

      {/* Galería de imágenes del producto elegido (ampliar / carrusel) */}
      <GaleriaProductoDialog
        idProducto={galeria.idProducto}
        nombre={
          todosProductos.find((p) => p.IdProducto === galeria.idProducto)
            ?.NombreProducto
        }
        open={galeria.open}
        onClose={() => setGaleria({ open: false, idProducto: null })}
      />

      {/* Documentos recientes */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Documentos recientes</h2>
        {cargandoDocs ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : !documentos?.length ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed h-28 text-muted-foreground text-sm">
            No hay documentos registrados aún.
          </div>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>N° Documento</TableHead>
                  <TableHead>Comprobante</TableHead>
                  <TableHead>Situación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginacion.itemsPagina.map((d: DocumentoResumen) => (
                  <TableRow key={d.Id}>
                    <TableCell className="text-xs">
                      {new Date(d.FechaDocumento).toLocaleDateString("es-PE")}
                    </TableCell>
                    <TableCell className="capitalize text-xs">
                      {TIPO_LABEL[d.TipoDocumento] ?? d.TipoDocumento}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {d.NumeroDocumento ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.Comprobante ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={d.Estado ? "success" : "destructive"}>
                        {d.Estado ? "Activo" : "Anulado"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
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
      </div>
    </div>
  );
}

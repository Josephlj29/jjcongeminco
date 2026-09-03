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
import { useCallback, useMemo, useState } from "react";
import {
  useForm,
  useFieldArray,
  useWatch,
  type Control,
  type DefaultValues,
  type UseFormSetValue,
  type UseFormRegister,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, History, Info, Package, FileText, Eraser } from "lucide-react";
import { toast } from "sonner";
import {
  CrearDocumentoSchema,
  TIPO_DOCUMENTO,
  type CrearDocumento,
  type ProductoStockConsolidado,
} from "@congeminco/shared";
import { useCrearDocumento, useDocumentos, type DocumentoResumen } from "@/hooks/useDocumentos";
import { useSaldos } from "@/hooks/useSaldos";
import { useUbicaciones } from "@/hooks/useCatalogo";
import { useVehiculos, useEquipos } from "@/hooks/useEquipos";
import { useAsociacionesTiposEquipo } from "@/hooks/useTiposEquipo";
import { fechaCorta, fechaISO } from "@/lib/format";
import { useBorradorFormulario } from "@/hooks/useBorradorFormulario";
import { AvisoBorrador } from "@/components/AvisoBorrador";
import { useYo } from "@/hooks/useYo";
import { ProductoCombobox } from "@/components/ProductoCombobox";
import { VehiculoCombobox } from "@/components/VehiculoCombobox";
import { DataTable, type ColumnaDataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
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
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/* Labels en español para tipos de documento */
const TIPO_LABEL: Record<string, string> = {
  existencia_inicial: "Existencia inicial",
  entrada: "Entrada",
  salida: "Salida",
  transferencia: "Transferencia",
  ajuste: "Ajuste",
};

/* Columnas de la tabla "Documentos recientes" (solo lectura). */
const COLUMNAS_DOCUMENTOS: ColumnaDataTable<DocumentoResumen>[] = [
  {
    id: "fecha",
    titulo: "Fecha",
    celda: (d) => fechaCorta(d.FechaDocumento),
    className: "text-xs",
  },
  {
    id: "tipo",
    titulo: "Tipo",
    celda: (d) => TIPO_LABEL[d.TipoDocumento] ?? d.TipoDocumento,
    className: "text-xs capitalize",
  },
  {
    id: "numero",
    titulo: "N° Documento",
    celda: (d) => d.NumeroDocumento ?? "—",
    className: "font-mono text-xs",
  },
  {
    id: "comprobante",
    titulo: "Comprobante",
    celda: (d) => d.Comprobante ?? "—",
    className: "text-xs",
    ocultarEnMovil: true,
  },
  {
    id: "situacion",
    titulo: "Situación",
    celda: (d) => (
      <Badge variant={d.Estado ? "success" : "destructive"}>
        {d.Estado ? "Activo" : "Anulado"}
      </Badge>
    ),
  },
];

/**
 * Próximo N° de documento (preview): correlativo global con relleno (0001, 0002…).
 * Espeja al servidor (inv.FnRegistrarDocumentoInventario): MAX del correlativo
 * numérico + 1, primer libre. El servidor es la fuente de verdad y lo reconfirma
 * al guardar; esto es solo previsualización.
 */
function siguienteNumeroDocumento(numerosExistentes: (string | null)[]): string {
  const ocupados = new Set(numerosExistentes.filter((n): n is string => !!n));
  let corr = 0;
  for (const n of ocupados) {
    if (/^\d+$/.test(n)) corr = Math.max(corr, Number(n));
  }
  corr += 1;
  let candidato = String(corr).padStart(4, "0");
  while (ocupados.has(candidato)) {
    corr += 1;
    candidato = String(corr).padStart(4, "0");
  }
  return candidato;
}

/* ── Línea de detalle (subcomponente para aislar el watch por fila) ── */
interface LineaDetalleProps {
  index: number;
  control: Control<CrearDocumento>;
  register: UseFormRegister<CrearDocumento>;
  setValue: UseFormSetValue<CrearDocumento>;
  productosParaPlaca: (idVehiculo: string | undefined) => ProductoStockConsolidado[];
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
  productosParaPlaca,
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
  const idVehiculoLinea = useWatch({ control, name: `Detalle.${index}.IdVehiculo` });
  const productos = useMemo(
    () => productosParaPlaca(idVehiculoLinea ?? undefined),
    [productosParaPlaca, idVehiculoLinea],
  );

  const producto = useMemo(
    () => productos.find((p) => p.IdProducto === idProducto) ?? null,
    [productos, idProducto],
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
        {errorProducto && <p className="mt-1 text-xs text-destructive">{errorProducto}</p>}
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
                value={tieneOverride ? (costoUnitario as number) : costoPromedio.toFixed(2)}
                onChange={(e) => {
                  if (tieneOverride) {
                    const v = e.target.valueAsNumber;
                    setValue(`Detalle.${index}.CostoUnitario`, Number.isNaN(v) ? 0 : v);
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
                    onClick={() => setValue(`Detalle.${index}.CostoUnitario`, undefined)}
                  >
                    Volver al promedio
                  </Button>
                </div>
                <p className="text-[11px] leading-tight text-muted-foreground">
                  El método oficial es promedio (NIC 2); este override queda registrado.
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
                      Las salidas se valorizan al costo promedio móvil del producto. Si no se envía
                      un costo, la BD congela el promedio vigente al momento del movimiento.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </p>
            )}
            {idProducto && costoPromedio === 0 && !tieneOverride && (
              <p className="text-[11px] leading-tight text-warning">
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
      {esSalida && (
        <TableCell className="align-top">
          <VehiculoCombobox
            value={idVehiculoLinea ?? null}
            onChange={(v) =>
              setValue(`Detalle.${index}.IdVehiculo`, v ?? undefined, { shouldValidate: true })
            }
            className="h-9"
          />
        </TableCell>
      )}
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

/* Estado inicial del formulario. Única fuente de verdad para defaultValues, el
   reset tras registrar, "Limpiar todo" y el borrador: si se separan, uno queda
   desfasado. Es función porque la fecha es la de hoy. */
function documentoVacio(): DefaultValues<CrearDocumento> {
  return {
    FechaDocumento: fechaISO(new Date()),
    Detalle: [{ IdProducto: "", Cantidad: 1 }],
  };
}

export default function MovimientosPage() {
  const { data: yo } = useYo();
  const { mutateAsync, isPending } = useCrearDocumento();
  const { data: productos } = useSaldos();
  const { data: ubicaciones } = useUbicaciones();
  const { data: vehiculos } = useVehiculos();
  const { data: equipos } = useEquipos();
  const { data: asociaciones } = useAsociacionesTiposEquipo();
  const {
    data: documentos,
    isLoading: cargandoDocs,
    isError: errorDocs,
    refetch: refetchDocs,
  } = useDocumentos();

  const [soloCompatibles, setSoloCompatibles] = useState(true);
  const [dialogProducto, setDialogProducto] = useState<{
    open: boolean;
    idProducto: string | null;
    linea: number;
  }>({ open: false, idProducto: null, linea: 0 });

  const [galeria, setGaleria] = useState<{ open: boolean; idProducto: string | null }>({
    open: false,
    idProducto: null,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    reset,
    getValues,
    clearErrors,
    formState: { errors },
  } = useForm<CrearDocumento>({
    resolver: zodResolver(CrearDocumentoSchema),
    defaultValues: documentoVacio(),
  });

  /* Red de contención: un documento con muchas líneas es un rato largo de carga
     y hasta ahora se perdía entero si el navegador cerraba la pestaña. */
  const borrador = useBorradorFormulario<CrearDocumento>({
    clave: "documento",
    version: 1,
    activo: true,
    idUsuario: yo?.id,
    watch,
    getValues,
    reset,
    valoresIniciales: documentoVacio,
  });

  /* "Limpiar todo": deja el formulario como recién abierto y borra el borrador,
     para que no reaparezca al volver a entrar. */
  const limpiarTodo = () => {
    clearErrors();
    borrador.descartar();
  };

  const { fields, append, remove } = useFieldArray({
    control,
    name: "Detalle",
  });
  const tipoDocumento = watch("TipoDocumento");
  const idVehiculo = watch("IdVehiculo");
  const numeroDocPreview = siguienteNumeroDocumento(
    (documentos ?? []).map((d) => d.NumeroDocumento),
  );
  // El refine de Detalle (path:["Detalle"]) puede quedar en .message o en .root.message.
  const detalleErrorMsg =
    errors.Detalle?.message ??
    (errors.Detalle as { root?: { message?: string } } | undefined)?.root?.message;

  const esTransferencia = tipoDocumento === "transferencia";
  const esEntrada = tipoDocumento === "entrada" || tipoDocumento === "existencia_inicial";
  const esSalida = tipoDocumento === "salida";

  const todosProductos = useMemo(() => productos ?? [], [productos]);

  /* Productos compatibles con la placa de UNA línea (vehículo -> equipo -> tipo).
     Con el toggle activo, filtra a los del tipo de esa placa + los generales. */
  const productosParaPlaca = useCallback(
    (idVeh: string | undefined) => {
      if (!esSalida || !soloCompatibles || !idVeh) return todosProductos;
      const veh = vehiculos?.find((v) => v.Id === idVeh);
      const equipo = veh?.IdEquipo ? equipos?.find((e) => e.Id === veh.IdEquipo) : undefined;
      const idTipo = equipo?.IdTipoEquipo ?? null;
      if (!idTipo) return todosProductos;
      const compat = new Set<string>();
      (asociaciones ?? [])
        .filter((a) => a.IdTipoEquipo === idTipo)
        .forEach((a) => compat.add(a.IdProducto));
      return todosProductos.filter((p) => compat.has(p.IdProducto) || p.EsGeneral);
    },
    [esSalida, soloCompatibles, vehiculos, equipos, asociaciones, todosProductos],
  );

  const onSubmit = async (data: CrearDocumento) => {
    /* En salidas sin override (CostoUnitario undefined) no se manda el costo:
       la BD congela el promedio móvil automáticamente. zodResolver ya deja el
       campo en undefined cuando el input está en solo lectura. */
    // La placa por línea solo aplica a salidas. Para otros tipos la descartamos
    // para no arrastrar placas pegadas si se cambió el tipo después de elegirlas.
    const payload =
      data.TipoDocumento === "salida"
        ? data
        : {
            ...data,
            Detalle: data.Detalle.map((l) => ({
              IdProducto: l.IdProducto,
              Cantidad: l.Cantidad,
              CostoUnitario: l.CostoUnitario,
              Notas: l.Notas,
            })),
          };
    try {
      await mutateAsync(payload);
      toast.success("Documento registrado correctamente");
      // Primero se olvida el borrador: cancela el guardado con retardo pendiente,
      // que si no volvería a escribir lo que se acaba de registrar.
      borrador.olvidar();
      reset(documentoVacio());
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        titulo="Movimientos"
        descripcion="Registra entradas, salidas y transferencias de inventario"
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {borrador.restaurado && (
          <AvisoBorrador guardadoEn={borrador.guardadoEn} onDescartar={limpiarTodo} />
        )}
        {/* ── Sección: Documento ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Documento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Tipo de documento</Label>
                <Select
                  value={tipoDocumento ?? ""}
                  onValueChange={(v) => {
                    setValue("TipoDocumento", v as CrearDocumento["TipoDocumento"], {
                      shouldValidate: true,
                    });
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
                  <p className="text-xs text-destructive">{errors.TipoDocumento.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="FechaDocumento">Fecha</Label>
                <Input id="FechaDocumento" type="date" {...register("FechaDocumento")} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="NumeroDocumento">N° Documento</Label>
                <Input
                  id="NumeroDocumento"
                  readOnly
                  value={numeroDocPreview}
                  className="bg-muted font-mono"
                />
                <p className="text-[11px] leading-tight text-muted-foreground">
                  Se asigna automáticamente al guardar.
                </p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="Comprobante">Comprobante (opcional)</Label>
                <Input id="Comprobante" placeholder="F001-00001" {...register("Comprobante")} />
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
              <div className="grid max-w-2xl grid-cols-1 gap-4 md:grid-cols-2">
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

        {/* ── Sección: Destino del consumo (placa por línea) — solo salida ── */}
        {esSalida && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Destino del consumo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-56 max-w-sm flex-1 space-y-1">
                  <Label>Placa por defecto (opcional)</Label>
                  <VehiculoCombobox
                    value={idVehiculo ?? null}
                    onChange={(v) => setValue("IdVehiculo", v ?? undefined)}
                    placeholder="Seleccionar placa..."
                    detallado
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!idVehiculo}
                  onClick={() =>
                    fields.forEach((_, i) =>
                      setValue(`Detalle.${i}.IdVehiculo`, idVehiculo, {
                        shouldValidate: true,
                      }),
                    )
                  }
                >
                  Aplicar placa a todas las líneas
                </Button>
              </div>

              <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={soloCompatibles}
                  onChange={(e) => setSoloCompatibles(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                Solo productos compatibles con la placa de cada línea
              </label>
              <p className="text-xs text-muted-foreground">
                Cada línea lleva su placa destino. Elige una por defecto y aplícala a todas, o
                asigna una distinta por producto.
              </p>
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
              onClick={() => append({ IdProducto: "", Cantidad: 1, IdVehiculo: idVehiculo })}
            >
              <Plus className="mr-1 h-3 w-3" />
              Agregar línea
            </Button>
          </CardHeader>
          <CardContent>
            <Separator className="mb-4" />
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-64">Producto</TableHead>
                    <TableHead className="w-24">Cantidad</TableHead>
                    <TableHead className="w-56">
                      {esSalida ? "Costo (valorización)" : "Costo unit. (opt.)"}
                    </TableHead>
                    {esSalida && <TableHead className="w-52">Placa</TableHead>}
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
                      productosParaPlaca={productosParaPlaca}
                      esSalida={esSalida}
                      puedeBorrar={fields.length > 1}
                      onBorrar={() => fields.length > 1 && remove(idx)}
                      onAbrirHistorial={(idProducto) =>
                        setDialogProducto({ open: true, idProducto, linea: idx })
                      }
                      onAbrirGaleria={(idProducto) => setGaleria({ open: true, idProducto })}
                      errorProducto={errors.Detalle?.[idx]?.IdProducto?.message}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

            {detalleErrorMsg && <p className="mt-2 text-xs text-destructive">{detalleErrorMsg}</p>}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={limpiarTodo}
                disabled={isPending}
                className="w-full sm:w-auto"
              >
                <Eraser className="mr-2 h-4 w-4" />
                Limpiar todo
              </Button>
              <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
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
        onOpenChange={(open) => setDialogProducto((prev) => ({ ...prev, open }))}
        onUsarPrecio={(costo) => setValue(`Detalle.${dialogProducto.linea}.CostoUnitario`, costo)}
      />

      {/* Galería de imágenes del producto elegido (ampliar / carrusel) */}
      <GaleriaProductoDialog
        idProducto={galeria.idProducto}
        nombre={todosProductos.find((p) => p.IdProducto === galeria.idProducto)?.NombreProducto}
        open={galeria.open}
        onClose={() => setGaleria({ open: false, idProducto: null })}
      />

      {/* Documentos recientes */}
      <div>
        <h2 className="mb-4 text-lg font-semibold">Documentos recientes</h2>
        <DataTable
          columnas={COLUMNAS_DOCUMENTOS}
          datos={documentos}
          obtenerId={(d) => d.Id}
          cargando={cargandoDocs}
          error={errorDocs}
          onReintentar={() => void refetchDocs()}
          vacio={{
            icono: FileText,
            titulo: "No hay documentos registrados aún",
            descripcion: "Registra el primer documento con el formulario de arriba.",
          }}
        />
      </div>
    </div>
  );
}

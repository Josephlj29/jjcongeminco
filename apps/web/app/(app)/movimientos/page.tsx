"use client";

/**
 * app/(app)/movimientos/page.tsx — Registro de documentos de inventario
 *
 * Funcionalidades:
 * - Formulario para crear documento (entrada/salida/transferencia/ajuste)
 * - Líneas de detalle dinámicas (react-hook-form useFieldArray)
 * - Salida exige placa (IdVehiculo) — validación en schema
 * - Lista de documentos recientes
 */
import { useForm, useFieldArray } from "react-hook-form";
import { usePaginacion } from "@/hooks/usePaginacion";
import { Paginacion } from "@/components/Paginacion";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  CrearDocumentoSchema,
  TIPO_DOCUMENTO,
  type CrearDocumento,
} from "@congeminco/shared";
import { useCrearDocumento, useDocumentos, type DocumentoResumen } from "@/hooks/useDocumentos";
import { useProductos } from "@/hooks/useProductos";
import { useUbicaciones, useProveedores } from "@/hooks/useCatalogo";
import { useVehiculos } from "@/hooks/useEquipos";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

/* Labels en español para tipos de documento */
const TIPO_LABEL: Record<string, string> = {
  existencia_inicial: "Existencia inicial",
  entrada: "Entrada",
  salida: "Salida",
  transferencia: "Transferencia",
  ajuste: "Ajuste",
};

export default function MovimientosPage() {
  const { mutateAsync, isPending } = useCrearDocumento();
  const { data: productos } = useProductos();
  const { data: ubicaciones } = useUbicaciones();
  const { data: vehiculos } = useVehiculos();
  const { data: documentos, isLoading: cargandoDocs } =
    useDocumentos();

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

  const onSubmit = async (data: CrearDocumento) => {
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

  const esTransferencia = tipoDocumento === "transferencia";
  const esEntrada =
    tipoDocumento === "entrada" || tipoDocumento === "existencia_inicial";
  const esSalida = tipoDocumento === "salida";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Movimientos</h1>
        <p className="text-muted-foreground">
          Registrá entradas, salidas y transferencias de inventario
        </p>
      </div>

      {/* Formulario */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nuevo documento</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Cabecera */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label>Tipo de documento</Label>
                <Select
                  onValueChange={(v) =>
                    setValue(
                      "TipoDocumento",
                      v as CrearDocumento["TipoDocumento"]
                    )
                  }
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

            {/* Ubicaciones */}
            <div className="grid grid-cols-2 gap-4">
              {(esTransferencia || !esEntrada) && (
                <div className="space-y-1">
                  <Label>Ubicación origen</Label>
                  <Select
                    onValueChange={(v) => setValue("IdUbicacionOrigen", v)}
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
                    onValueChange={(v) => setValue("IdUbicacionDestino", v)}
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

            {/* Placa — obligatoria para salidas */}
            {esSalida && (
              <div className="space-y-1 max-w-sm">
                <Label>
                  Placa <span className="text-destructive">*</span>
                </Label>
                <Select onValueChange={(v) => setValue("IdVehiculo", v)}>
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
            )}

            <Separator />

            {/* Líneas de detalle */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Detalle</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ IdProducto: "", Cantidad: 1 })}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  Agregar línea
                </Button>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Producto</TableHead>
                      <TableHead className="w-28">Cantidad</TableHead>
                      <TableHead className="w-32">Costo unit. (opt.)</TableHead>
                      <TableHead className="w-12"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, idx) => (
                      <TableRow key={field.id}>
                        <TableCell>
                          <Select
                            onValueChange={(v) =>
                              setValue(`Detalle.${idx}.IdProducto`, v)
                            }
                          >
                            <SelectTrigger className="h-8">
                              <SelectValue placeholder="Buscar producto..." />
                            </SelectTrigger>
                            <SelectContent>
                              {productos?.map((p) => (
                                <SelectItem key={p.IdProducto} value={p.IdProducto}>
                                  {p.Sku} — {p.NombreProducto}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {errors.Detalle?.[idx]?.IdProducto && (
                            <p className="text-xs text-destructive mt-1">
                              {errors.Detalle[idx]?.IdProducto?.message}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={1}
                            className="h-8"
                            {...register(`Detalle.${idx}.Cantidad`, {
                              valueAsNumber: true,
                            })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="h-8"
                            placeholder="0.00"
                            {...register(`Detalle.${idx}.CostoUnitario`, {
                              valueAsNumber: true,
                            })}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => fields.length > 1 && remove(idx)}
                            disabled={fields.length === 1}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                {isPending ? "Registrando..." : "Registrar documento"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

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
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginacion.itemsPagina.map((d) => (
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

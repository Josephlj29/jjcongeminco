"use client";

/**
 * components/movimientos/DialogCorregirDocumento.tsx
 *
 * Corrige un documento de inventario YA confirmado (solo admin): el caso típico
 * es un costo o una cantidad mal cargados.
 *
 * El ledger es append-only, así que "corregir" no es un UPDATE: la BD anula el
 * documento (emitiendo su documento inverso) y registra el corregido en la misma
 * transacción, recalculando el costo promedio. En el kardex quedan los tres.
 *
 * Por eso hay cosas que NO se editan acá:
 *   - El tipo de documento: una entrada mal cargada sigue siendo una entrada.
 *   - La ubicación: mover stock de almacén es una transferencia, no una corrección.
 * Y por eso el motivo es obligatorio: no hay bitácora, el motivo es el rastro.
 *
 * Solo procede si nada de lo que movió el documento se consumió. Eso lo decide la
 * BD; el aviso que se muestra acá viene de ella (MotivoBloqueo).
 */
import { useMemo } from "react";
import { useFieldArray, useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { ProductoCombobox } from "@/components/ProductoCombobox";
import { VehiculoCombobox } from "@/components/VehiculoCombobox";
import { InputCantidad } from "@/components/InputCantidad";
import { useCorregirDocumento } from "@/hooks/useDocumentos";
import { useSaldos } from "@/hooks/useSaldos";
import { useProveedores } from "@/hooks/useProveedores";
import {
  CorregirDocumentoSchema,
  PASO_CANTIDAD,
  PASO_COSTO,
  type CorregirDocumento,
  type DocumentoInventarioDetalle,
  type ProductoStockConsolidado,
} from "@congeminco/shared";

interface Props {
  documento: DocumentoInventarioDetalle;
  onClose: () => void;
}

const TIPO_LABEL: Record<string, string> = {
  existencia_inicial: "Existencia inicial",
  entrada: "Entrada",
  salida: "Salida",
  transferencia: "Transferencia",
  ajuste: "Ajuste",
};

function LineaCorreccion({
  index,
  control,
  productos,
  esSalida,
  puedeBorrar,
  onBorrar,
  onCantidad,
  onCosto,
  onProducto,
  onPlaca,
}: {
  index: number;
  control: Control<CorregirDocumento>;
  productos: ProductoStockConsolidado[];
  esSalida: boolean;
  puedeBorrar: boolean;
  onBorrar: () => void;
  onCantidad: (n: number | null) => void;
  onCosto: (n: number | null) => void;
  onProducto: (id: string | null) => void;
  onPlaca: (id: string | null) => void;
}) {
  const idProducto = useWatch({ control, name: `Documento.Detalle.${index}.IdProducto` });
  const cantidad = useWatch({ control, name: `Documento.Detalle.${index}.Cantidad` });
  const costo = useWatch({ control, name: `Documento.Detalle.${index}.CostoUnitario` });
  const idVehiculo = useWatch({ control, name: `Documento.Detalle.${index}.IdVehiculo` });

  const producto = useMemo(
    () => productos.find((p) => p.IdProducto === idProducto) ?? null,
    [productos, idProducto],
  );

  return (
    <TableRow>
      <TableCell className="align-top">
        <ProductoCombobox productos={productos} value={idProducto ?? null} onChange={onProducto} />
      </TableCell>
      <TableCell className="align-top">
        <InputCantidad
          value={cantidad ?? null}
          onChange={onCantidad}
          unidad={producto?.CodigoUnidad}
          min={PASO_CANTIDAD}
        />
      </TableCell>
      <TableCell className="align-top">
        <Input
          type="number"
          step={PASO_COSTO}
          min={0}
          inputMode="decimal"
          value={costo ?? ""}
          onChange={(e) => onCosto(e.target.value === "" ? null : Number(e.target.value))}
          placeholder="0.0000"
        />
      </TableCell>
      {esSalida && (
        <TableCell className="align-top">
          <VehiculoCombobox value={idVehiculo ?? null} onChange={onPlaca} />
        </TableCell>
      )}
      <TableCell className="align-top">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-muted-foreground hover:text-destructive md:h-8 md:w-8"
          onClick={onBorrar}
          disabled={!puedeBorrar}
          aria-label={`Quitar línea ${index + 1}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function DialogCorregirDocumento({ documento, onClose }: Props) {
  const { data: productos } = useSaldos();
  const { data: proveedores } = useProveedores();
  const { mutateAsync, isPending } = useCorregirDocumento();

  const esSalida = documento.TipoDocumento === "salida";
  const esEntrada =
    documento.TipoDocumento === "entrada" || documento.TipoDocumento === "existencia_inicial";

  const {
    control,
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CorregirDocumento>({
    resolver: zodResolver(CorregirDocumentoSchema),
    defaultValues: {
      Motivo: "",
      Documento: {
        TipoDocumento: documento.TipoDocumento as CorregirDocumento["Documento"]["TipoDocumento"],
        FechaDocumento: documento.FechaDocumento.slice(0, 10),
        IdUbicacionOrigen: documento.IdUbicacionOrigen ?? undefined,
        IdUbicacionDestino: documento.IdUbicacionDestino ?? undefined,
        IdProveedor: documento.IdProveedor ?? undefined,
        Comprobante: documento.Comprobante ?? undefined,
        Referencia: documento.Referencia ?? undefined,
        Detalle: documento.Detalle.map((l) => ({
          IdProducto: l.IdProducto,
          Cantidad: l.Cantidad,
          CostoUnitario: l.CostoUnitario ?? undefined,
          IdVehiculo: l.IdVehiculo ?? undefined,
        })),
      },
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "Documento.Detalle" });
  // Los hooks van en el cuerpo, nunca dentro del JSX condicional del proveedor.
  const idProveedor = useWatch({ control, name: "Documento.IdProveedor" });

  const onSubmit = async (data: CorregirDocumento) => {
    try {
      const { Id } = await mutateAsync({ id: documento.Id, data });
      toast.success("Documento corregido. Quedó anulado el original y registrado el nuevo.", {
        description: `Nuevo documento ${Id.slice(0, 8)}`,
      });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo corregir el documento.");
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            Corregir documento {documento.NumeroDocumento ?? ""}
            <Badge variant="secondary">
              {TIPO_LABEL[documento.TipoDocumento] ?? documento.TipoDocumento}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Se anula este documento con su reversa y se registra el corregido, todo junto. El costo
            promedio se recalcula solo. El tipo y la ubicación no se cambian acá.
          </DialogDescription>
        </DialogHeader>

        {!documento.PuedeCorregir ? (
          <>
            <DialogBody>
              <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                <p className="font-medium">Este documento ya no se puede corregir</p>
                <p className="mt-1 text-muted-foreground">{documento.MotivoBloqueo}</p>
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Cerrar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <DialogBody className="space-y-4">
              <div className="grid grid-cols-1 gap-4 @md:grid-cols-2 @2xl:grid-cols-3">
                <div className="space-y-1">
                  <Label htmlFor="corr-fecha">Fecha</Label>
                  <Input id="corr-fecha" type="date" {...register("Documento.FechaDocumento")} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="corr-comprobante">Comprobante</Label>
                  <Input
                    id="corr-comprobante"
                    placeholder="F001-00001"
                    {...register("Documento.Comprobante")}
                  />
                </div>

                {esEntrada && (
                  <div className="space-y-1">
                    <Label>Proveedor</Label>
                    <Select
                      value={idProveedor ?? ""}
                      onValueChange={(v) =>
                        setValue("Documento.IdProveedor", v || undefined, { shouldValidate: true })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sin proveedor" />
                      </SelectTrigger>
                      <SelectContent>
                        {(proveedores ?? []).map((p) => (
                          <SelectItem key={p.Id} value={p.Id}>
                            {p.Nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1 @md:col-span-2 @2xl:col-span-3">
                  <Label htmlFor="corr-referencia">Referencia</Label>
                  <Input id="corr-referencia" {...register("Documento.Referencia")} />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-medium">Detalle</h3>
                    <p className="text-xs text-muted-foreground">
                      Corrige la cantidad o el costo de cada línea.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ IdProducto: "", Cantidad: 1 })}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar línea
                  </Button>
                </div>

                <div className="rounded-md border">
                  <Table className="min-w-[640px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-64">Producto</TableHead>
                        <TableHead className="w-32">Cantidad</TableHead>
                        <TableHead className="w-32">Costo unit.</TableHead>
                        {esSalida && <TableHead className="w-48">Placa</TableHead>}
                        <TableHead className="w-14" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fields.map((field, idx) => (
                        <LineaCorreccion
                          key={field.id}
                          index={idx}
                          control={control}
                          productos={productos ?? []}
                          esSalida={esSalida}
                          puedeBorrar={fields.length > 1}
                          onBorrar={() => remove(idx)}
                          onProducto={(id) =>
                            setValue(`Documento.Detalle.${idx}.IdProducto`, id ?? "", {
                              shouldValidate: true,
                            })
                          }
                          onCantidad={(n) =>
                            setValue(`Documento.Detalle.${idx}.Cantidad`, n ?? 0, {
                              shouldValidate: true,
                            })
                          }
                          onCosto={(n) =>
                            setValue(`Documento.Detalle.${idx}.CostoUnitario`, n ?? undefined, {
                              shouldValidate: true,
                            })
                          }
                          onPlaca={(id) =>
                            setValue(`Documento.Detalle.${idx}.IdVehiculo`, id ?? undefined, {
                              shouldValidate: true,
                            })
                          }
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {errors.Documento?.Detalle && (
                  <p className="text-xs text-destructive">
                    {errors.Documento.Detalle.message ?? "Revisa las líneas del detalle."}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="corr-motivo">Motivo de la corrección</Label>
                <Textarea
                  id="corr-motivo"
                  placeholder="Qué estaba mal (queda en las notas de ambos documentos)"
                  maxLength={300}
                  {...register("Motivo")}
                />
                {errors.Motivo && (
                  <p className="text-xs text-destructive">{errors.Motivo.message}</p>
                )}
              </div>
            </DialogBody>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Corrigiendo..." : "Guardar corrección"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

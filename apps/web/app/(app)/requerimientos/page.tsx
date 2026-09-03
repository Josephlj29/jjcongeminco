"use client";

/**
 * app/(app)/requerimientos/page.tsx — Requerimientos de materiales
 *
 * Funcionalidades:
 * - Formulario para crear requerimiento (origen: planificado / desgaste_prematuro)
 * - El destino es SIEMPRE una placa: por línea, con la de cabecera como fallback
 *   (la maquinaria sin placa de rodaje se identifica por su código interno)
 * - Cada línea es producto del catálogo O producto NUEVO no catalogado
 *   (DescripcionLibre + máx 1 foto opcional que se sube a Storage al enviar)
 *
 * Responsive: el formulario colapsa a 1 columna en móvil; el detalle de
 * materiales se presenta como una tarjeta por línea en móvil (`md:hidden`) y
 * como tabla en desktop (`hidden md:block`). Ambas escriben el mismo fieldArray.
 */
import { useState, type ChangeEvent } from "react";
import { Controller, useForm, useFieldArray, type DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Check, Copy, Eraser, ImageIcon, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  CrearRequerimientoSchema,
  ORIGEN_REQUERIMIENTO,
  ORIGEN_REQUERIMIENTO_LABEL,
  PASO_CANTIDAD,
  type CrearRequerimiento,
} from "@congeminco/shared";
import { useCrearRequerimiento } from "@/hooks/useRequerimientos";
import { useSaldos } from "@/hooks/useSaldos";
import { usePersonal } from "@/hooks/usePersonal";
import { useIsMobile } from "@/hooks/useIsMobile";
import { usePermiso, useYo } from "@/hooks/useYo";
import { useBorradorFormulario } from "@/hooks/useBorradorFormulario";
import { AvisoBorrador } from "@/components/AvisoBorrador";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { hoyLima } from "@/lib/format";
import { InputCantidad } from "@/components/InputCantidad";
import { ProductoCombobox } from "@/components/ProductoCombobox";
import { VehiculoCombobox } from "@/components/VehiculoCombobox";
import { ImagenAmpliable } from "@/components/ImagenAmpliable";
import { PageHeader } from "@/components/PageHeader";
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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/* Estado inicial del formulario. Es una función y no una constante porque
   FechaRequerimiento depende del día: una constante de módulo se congelaría en
   la fecha de la primera carga y una pestaña abierta toda la noche arrancaría
   con la fecha de ayer. La usan defaultValues, el reset tras crear y
   "Limpiar todo", así que los tres siempre coinciden. */
function requerimientoVacio(): DefaultValues<CrearRequerimiento> {
  return {
    FechaRequerimiento: hoyLima(),
    IdsPersonalSolicitante: [],
    Detalle: [{ IdProducto: "", Cantidad: 1 }],
  };
}

export default function RequerimientosPage() {
  const { mutateAsync, isPending } = useCrearRequerimiento();
  const { data: yo } = useYo();
  const { data: productos } = useSaldos();
  const { data: personal } = usePersonal();

  const puedeCrear = usePermiso("requerimientoCrear");

  // Renderizamos UNA sola presentación de las líneas (cards en móvil, tabla en
  // desktop). No con CSS `hidden`: eso dejaría montados dos <input> por campo con
  // el mismo name de RHF, y reset()/setValue solo sincroniza el último ref (el
  // oculto), dejando valores obsoletos en la vista visible. El form está detrás
  // de `puedeCrear` (query cliente que resuelve tras el mount), así que para
  // cuando aparece, isMobile ya refleja el viewport real: sin flash.
  const isMobile = useIsMobile();

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
  } = useForm<CrearRequerimiento>({
    resolver: zodResolver(CrearRequerimientoSchema),
    defaultValues: requerimientoVacio(),
  });

  /* Red de contención: lo que se está cargando sobrevive a que el navegador
     cierre o descarte la pestaña (típico en el celular de obra). Solo texto: las
     fotos son File locales y no se pueden persistir. */
  const borrador = useBorradorFormulario<CrearRequerimiento>({
    clave: "requerimiento",
    version: 1,
    activo: puedeCrear,
    idUsuario: yo?.id,
    watch,
    getValues,
    reset,
    valoresIniciales: requerimientoVacio,
  });

  const { fields, append, remove, insert } = useFieldArray({
    control,
    name: "Detalle",
  });

  /* Foto local por línea "nuevo" (máx 1). Clave = field.id del useFieldArray:
     es estable frente a insert/remove/duplicar, a diferencia del índice, así
     que la foto sigue a SU línea aunque se eliminen líneas anteriores. La URL
     es un objectURL local (preview); recién se sube a Storage en el submit. */
  const [fotos, setFotos] = useState<Record<string, { file: File; url: string }>>({});

  const agregarFoto = (fieldId: string, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    const anterior = fotos[fieldId];
    if (anterior) URL.revokeObjectURL(anterior.url);
    const url = URL.createObjectURL(file);
    setFotos((prev) => ({ ...prev, [fieldId]: { file, url } }));
  };

  const quitarFoto = (fieldId: string) => {
    const foto = fotos[fieldId];
    if (!foto) return;
    URL.revokeObjectURL(foto.url);
    setFotos((prev) => {
      const rest = { ...prev };
      delete rest[fieldId];
      return rest;
    });
  };

  /* Modo de la línea derivado de RHF (sin estado paralelo por índice): la línea
     es "nuevo" si DescripcionLibre !== undefined (al activar el modo se setea ""
     y al volver a catálogo se setea undefined). RHF mueve los valores junto con
     la fila en insert/remove, así que el modo nunca se desalinea con el índice. */
  const esLineaNueva = (idx: number) => watch(`Detalle.${idx}.DescripcionLibre`) !== undefined;

  const cambiarModoLinea = (idx: number, nuevo: boolean) => {
    if (nuevo === esLineaNueva(idx)) return;
    if (nuevo) {
      setValue(`Detalle.${idx}.IdProducto`, undefined);
      setValue(`Detalle.${idx}.DescripcionLibre`, "");
    } else {
      const fieldId = fields[idx]?.id;
      if (fieldId) quitarFoto(fieldId);
      setValue(`Detalle.${idx}.DescripcionLibre`, undefined);
      setValue(`Detalle.${idx}.UrlFotoLibre`, undefined);
      setValue(`Detalle.${idx}.IdProducto`, "");
    }
    // Los errores del modo anterior (uuid/min(3)/XOR) ya no aplican.
    clearErrors(`Detalle.${idx}`);
  };

  /* Duplicar línea: mismo producto/cantidad/notas, placa a elegir. Es el camino
     para pedir un material a VARIAS placas: una línea por placa, cada una con
     su cantidad (el ledger y los reportes atribuyen consumo por placa).
     Si la línea es "nuevo" se copia la descripción pero NO la foto: las fotos
     se indexan por field.id y la línea insertada recibe un id nuevo. */
  const duplicarLinea = (idx: number) => {
    const linea = watch(`Detalle.${idx}`);
    insert(idx + 1, { ...linea, IdVehiculo: undefined, UrlFotoLibre: undefined });
  };

  /* Eliminar línea: además de sacarla del fieldArray, libera el objectURL de su
     foto local (si tenía) para no fugar blobs. */
  const eliminarLinea = (idx: number) => {
    if (fields.length === 1) return;
    const fieldId = fields[idx]?.id;
    if (fieldId) quitarFoto(fieldId);
    remove(idx);
  };

  const origenSeleccionado = watch("Origen");
  const placaDefault = watch("IdVehiculo");
  const idsSolicitante = watch("IdsPersonalSolicitante") ?? [];

  const toggleSolicitante = (id: string) => {
    const next = idsSolicitante.includes(id)
      ? idsSolicitante.filter((x) => x !== id)
      : [...idsSolicitante, id];
    setValue("IdsPersonalSolicitante", next, { shouldValidate: true });
  };
  // El refine de Detalle (path:["Detalle"]) puede quedar en .message o en .root.message.
  const detalleErrorMsg =
    errors.Detalle?.message ??
    (errors.Detalle as { root?: { message?: string } } | undefined)?.root?.message;

  const onSubmit = async (data: CrearRequerimiento) => {
    try {
      /* Payload limpio por modo: catálogo no lleva DescripcionLibre/UrlFotoLibre;
         nuevo no lleva IdProducto (undefined — JSON lo omite, "" rompería el XOR). */
      const detalle = data.Detalle.map((l) =>
        l.DescripcionLibre !== undefined
          ? { ...l, IdProducto: undefined }
          : { ...l, DescripcionLibre: undefined, UrlFotoLibre: undefined },
      );

      /* Subir la foto local de cada línea "nuevo" ANTES del POST. Si una subida
         falla, la línea viaja sin foto (warning), no se bloquea el requerimiento. */
      for (const [i, linea] of detalle.entries()) {
        if (linea.DescripcionLibre === undefined) continue;
        const foto = fotos[fields[i]?.id ?? ""];
        if (!foto) continue;
        const supabase = crearClienteNavegador();
        const ruta = `solicitudes/${crypto.randomUUID()}-${foto.file.name}`;
        const { data: up, error } = await supabase.storage
          .from("requerimientos")
          .upload(ruta, foto.file, { upsert: false });
        if (error || !up) {
          toast.warning(`No se pudo subir la foto de la línea ${i + 1}; se envía sin foto.`);
          continue;
        }
        const { data: pub } = supabase.storage.from("requerimientos").getPublicUrl(up.path);
        linea.UrlFotoLibre = pub.publicUrl;
      }

      await mutateAsync({ ...data, Detalle: detalle });
      toast.success("Requerimiento creado correctamente");
      Object.values(fotos).forEach((f) => URL.revokeObjectURL(f.url));
      setFotos({});
      // Primero se olvida el borrador: cancela el guardado con retardo pendiente,
      // que si no volvería a escribir lo que se acaba de enviar.
      borrador.olvidar();
      reset(requerimientoVacio());
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  /* "Limpiar todo": deja el formulario como recién abierto. Además de vaciar los
     campos hay que soltar los objectURL de las fotos (si no, quedan blobs
     retenidos en memoria hasta recargar) y borrar el borrador guardado, para que
     no reaparezca al volver a entrar. */
  const limpiarTodo = () => {
    Object.values(fotos).forEach((f) => URL.revokeObjectURL(f.url));
    setFotos({});
    clearErrors();
    borrador.descartar();
  };

  /* Selector de placa por línea — reutilizado en tarjeta (móvil) y fila (desktop).
     Combobox con búsqueda (placa/modelo/equipo). `detallado` solo en móvil,
     donde el campo tiene el ancho completo de la tarjeta. */
  const renderSelectPlaca = (idx: number, detallado = false) => (
    <VehiculoCombobox
      value={watch(`Detalle.${idx}.IdVehiculo`) ?? null}
      onChange={(v) =>
        setValue(`Detalle.${idx}.IdVehiculo`, v ?? undefined, { shouldValidate: true })
      }
      detallado={detallado}
      className="h-9"
    />
  );

  /* Campo Producto por línea — reutilizado en tarjeta (móvil) y celda (desktop).
     Toggle Catálogo|Nuevo (mismo patrón visual del Stock|Compra de aprobación).
     En la TABLA el toggle va compacto e inline con el control (una sola línea,
     alturas parejas con Placa/Cantidad/Notas); en la tarjeta móvil va apilado a
     lo ancho. El combobox O el input de descripción + 1 foto opcional. */
  const renderCampoProducto = (idx: number, fieldId: string, enTabla = false) => {
    const nueva = esLineaNueva(idx);
    const foto = fotos[fieldId];
    const errLinea = errors.Detalle?.[idx];

    const toggle = (
      <div
        className={cn(
          "flex rounded-md border p-0.5 text-xs",
          enTabla && "h-9 w-fit shrink-0 items-stretch",
        )}
      >
        <button
          type="button"
          onClick={() => cambiarModoLinea(idx, false)}
          className={cn(
            "whitespace-nowrap rounded px-2.5",
            enTabla ? "" : "flex-1 py-1",
            !nueva ? "bg-primary text-primary-foreground" : "text-muted-foreground",
          )}
        >
          Catálogo
        </button>
        <button
          type="button"
          onClick={() => cambiarModoLinea(idx, true)}
          className={cn(
            "whitespace-nowrap rounded px-2.5",
            enTabla ? "" : "flex-1 py-1",
            nueva ? "bg-primary text-primary-foreground" : "text-muted-foreground",
          )}
        >
          Nuevo
        </button>
      </div>
    );

    const control = nueva ? (
      <>
        <Input
          className="h-9"
          placeholder="Describe el producto urgente..."
          {...register(`Detalle.${idx}.DescripcionLibre`)}
        />
        {foto ? (
          <div className="relative w-fit">
            {/* Miniatura ampliable; el X va como hermano absoluto (ImagenAmpliable
                renderiza un <button>: no se puede anidar otro button adentro). */}
            <ImagenAmpliable
              url={foto.url}
              size={48}
              alt="Foto del producto nuevo"
              nombre={watch(`Detalle.${idx}.DescripcionLibre`) || undefined}
            />
            <button
              type="button"
              onClick={() => quitarFoto(fieldId)}
              className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border bg-background text-muted-foreground hover:text-destructive"
              aria-label="Quitar foto"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          /* Máx 1 foto: con foto puesta, estos botones desaparecen. */
          <div className="flex gap-2">
            {/* capture abre la cámara directo en Android/iOS; en desktop no aplica. */}
            <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-muted-foreground/40 px-2.5 text-xs text-muted-foreground transition-colors hover:border-muted-foreground/70 hover:text-foreground md:hidden">
              <Camera className="h-3.5 w-3.5 shrink-0" />
              Foto
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => agregarFoto(fieldId, e)}
              />
            </label>
            <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-muted-foreground/40 px-2.5 text-xs text-muted-foreground transition-colors hover:border-muted-foreground/70 hover:text-foreground">
              <ImageIcon className="h-3.5 w-3.5 shrink-0" />
              Adjuntar foto
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => agregarFoto(fieldId, e)}
              />
            </label>
          </div>
        )}
      </>
    ) : (
      <ProductoCombobox
        productos={productos ?? []}
        value={watch(`Detalle.${idx}.IdProducto`) || null}
        onChange={(v) =>
          setValue(`Detalle.${idx}.IdProducto`, v ?? "", {
            shouldValidate: true,
          })
        }
      />
    );

    const errores = (
      <>
        {errLinea?.DescripcionLibre && (
          <p className="text-xs text-destructive">{errLinea.DescripcionLibre.message}</p>
        )}
        {/* El refine XOR del schema reporta en path IdProducto. */}
        {errLinea?.IdProducto && (
          <p className="text-xs text-destructive">{errLinea.IdProducto.message}</p>
        )}
      </>
    );

    if (enTabla) {
      // Una sola línea visual: toggle compacto + control a la misma altura que
      // el resto de la fila; la foto/errores fluyen debajo del control.
      return (
        <div className="flex items-start gap-2">
          {toggle}
          <div className="min-w-0 flex-1 space-y-2">
            {control}
            {errores}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {toggle}
        {control}
        {errores}
      </div>
    );
  };

  /* Cantidad por línea — reutilizada en tarjeta (móvil) y celda (desktop).
     Acepta fracciones y operaciones (1/4, 20/4, 1 1/2): en obra se pide "un
     cuarto de balde" y antes había que dividir con la calculadora del celular.
     El mínimo es un paso, no 1: antes el min={1} del input numérico hacía
     imposible pedir medio litro, aunque el schema y la BD lo aceptan. */
  const renderCampoCantidad = (idx: number) => {
    const errLinea = errors.Detalle?.[idx];
    const idProducto = watch(`Detalle.${idx}.IdProducto`);
    const unidad = productos?.find((p) => p.IdProducto === idProducto)?.CodigoUnidad;
    return (
      <>
        <Controller
          control={control}
          name={`Detalle.${idx}.Cantidad`}
          render={({ field: f }) => (
            <InputCantidad
              className="h-9"
              value={f.value ?? null}
              // undefined y no null: el schema pide un number, y así el mensaje
              // es "Indica la cantidad" en vez de "se esperaba number".
              onChange={(n) => f.onChange(n ?? undefined)}
              onBlur={f.onBlur}
              min={PASO_CANTIDAD}
              unidad={unidad}
            />
          )}
        />
        {errLinea?.Cantidad && (
          <p className="text-xs text-destructive">{errLinea.Cantidad.message}</p>
        )}
      </>
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        titulo="Requerimientos"
        descripcion="Crea solicitudes de materiales asociadas a una placa"
      />

      {/* Formulario (solo para roles que pueden crear) */}
      {puedeCrear && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nuevo requerimiento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {borrador.restaurado && (
              <AvisoBorrador guardadoEn={borrador.guardadoEn} onDescartar={limpiarTodo} />
            )}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
                <div className="space-y-1">
                  <Label>Origen</Label>
                  <Select
                    value={origenSeleccionado ?? ""}
                    onValueChange={(v) =>
                      setValue("Origen", v as CrearRequerimiento["Origen"], {
                        shouldValidate: true,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ORIGEN_REQUERIMIENTO.map((o) => (
                        <SelectItem key={o} value={o}>
                          {ORIGEN_REQUERIMIENTO_LABEL[o]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.Origen && (
                    <p className="text-xs text-destructive">{errors.Origen.message}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="FechaRequerimiento">Fecha</Label>
                  <Input id="FechaRequerimiento" type="date" {...register("FechaRequerimiento")} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="NumeroRequerimiento">N° Requerimiento (opcional)</Label>
                  <Input
                    id="NumeroRequerimiento"
                    placeholder="REQ-0001"
                    {...register("NumeroRequerimiento")}
                  />
                </div>
              </div>

              {/* Solicitantes (varios; mismo patrón multi-select que el
                  personal de las órdenes de mantenimiento) */}
              <div className="space-y-1">
                <Label>
                  Solicitantes{" "}
                  {idsSolicitante.length > 0 && (
                    <span className="font-normal text-muted-foreground">
                      ({idsSolicitante.length} seleccionado{idsSolicitante.length === 1 ? "" : "s"})
                    </span>
                  )}
                </Label>
                <Command className="rounded-lg border">
                  <CommandInput placeholder="Buscar personal..." />
                  <CommandList className="max-h-44">
                    <CommandEmpty>No se encontró personal.</CommandEmpty>
                    <CommandGroup>
                      {personal?.map((p) => {
                        const activo = idsSolicitante.includes(p.Id);
                        return (
                          <CommandItem
                            key={p.Id}
                            value={p.NombreCompleto}
                            onSelect={() => toggleSolicitante(p.Id)}
                            className="gap-2"
                          >
                            <span
                              className={cn(
                                "flex h-4 w-4 items-center justify-center rounded border",
                                activo
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-input",
                              )}
                            >
                              {activo && <Check className="h-3 w-3" />}
                            </span>
                            <span className="flex-1">{p.NombreCompleto}</span>
                            {p.NombreCargo && (
                              <span className="text-xs text-muted-foreground">{p.NombreCargo}</span>
                            )}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </div>

              {/* Destino: SIEMPRE por placa (una por línea, con esta como fallback).
                 El equipo dejó de pedirse: toda unidad se identifica por su placa
                 (la maquinaria sin placa de rodaje usa su código interno). */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Placa por defecto (opcional)</Label>
                  <VehiculoCombobox
                    value={placaDefault ?? null}
                    onChange={(v) => setValue("IdVehiculo", v ?? undefined)}
                    placeholder="Seleccionar placa..."
                    detallado
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!placaDefault}
                  className="w-full sm:w-auto"
                  onClick={() =>
                    fields.forEach((_, i) =>
                      setValue(`Detalle.${i}.IdVehiculo`, placaDefault, {
                        shouldValidate: true,
                      }),
                    )
                  }
                >
                  Aplicar placa a todas las líneas
                </Button>
                <p className="text-xs text-muted-foreground">
                  Cada línea puede llevar su propia placa destino, o elige un equipo como destino
                  general.
                </p>
              </div>

              <Separator />

              {/* Detalle */}
              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium">Materiales solicitados</h3>
                  <p className="text-xs text-muted-foreground">
                    ¿El mismo material para otra placa? Duplicá la línea y elegí la placa.
                  </p>
                </div>

                {/* Una sola presentación montada a la vez (ver nota de isMobile). */}
                {isMobile ? (
                  /* Móvil: una tarjeta por línea */
                  <div className="space-y-3">
                    {fields.map((field, idx) => (
                      <Card key={field.id} className="space-y-3 p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-muted-foreground">
                            Línea {idx + 1}
                          </span>
                          <div className="flex items-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 text-muted-foreground"
                              title="Duplicar línea (misma cantidad, otra placa)"
                              onClick={() => duplicarLinea(idx)}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-11 w-11 text-muted-foreground hover:text-destructive"
                              onClick={() => eliminarLinea(idx)}
                              disabled={fields.length === 1}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Producto</Label>
                          {renderCampoProducto(idx, field.id)}
                        </div>
                        {/* Placa a ancho completo: el trigger detallado muestra
                           placa + modelo/equipo, que en media tarjeta no entra. */}
                        <div className="space-y-1">
                          <Label className="text-xs">Placa</Label>
                          {renderSelectPlaca(idx, true)}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Cantidad</Label>
                            {renderCampoCantidad(idx)}
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Notas (opcional)</Label>
                            <Input
                              className="h-9"
                              placeholder="Observaciones..."
                              {...register(`Detalle.${idx}.Notas`)}
                            />
                          </div>
                        </div>
                      </Card>
                    ))}
                    {/* Agregar línea al pie: el flujo natural es terminar una
                       línea y pedir la siguiente sin volver arriba. */}
                    <button
                      type="button"
                      onClick={() =>
                        append({ IdProducto: "", Cantidad: 1, IdVehiculo: placaDefault })
                      }
                      className="flex min-h-[3rem] w-full cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/25 p-3 text-sm text-muted-foreground transition-colors hover:border-muted-foreground/50"
                    >
                      <Plus className="h-4 w-4" />
                      Agregar línea
                    </button>
                  </div>
                ) : (
                  /* Desktop: tabla */
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Producto</TableHead>
                          <TableHead className="w-48">Placa</TableHead>
                          <TableHead className="w-32">Cantidad</TableHead>
                          <TableHead className="w-48">Notas (opt.)</TableHead>
                          <TableHead className="w-20"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fields.map((field, idx) => (
                          <TableRow key={field.id}>
                            <TableCell className="min-w-64 align-top">
                              {renderCampoProducto(idx, field.id, true)}
                            </TableCell>
                            <TableCell className="align-top">{renderSelectPlaca(idx)}</TableCell>
                            <TableCell className="align-top">{renderCampoCantidad(idx)}</TableCell>
                            <TableCell className="align-top">
                              <Input
                                className="h-9"
                                placeholder="Observaciones..."
                                {...register(`Detalle.${idx}.Notas`)}
                              />
                            </TableCell>
                            <TableCell className="align-top">
                              <div className="flex h-9 items-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground"
                                  title="Duplicar línea (misma cantidad, otra placa)"
                                  onClick={() => duplicarLinea(idx)}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                  onClick={() => eliminarLinea(idx)}
                                  disabled={fields.length === 1}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {/* Agregar línea al pie: el flujo natural es terminar una
                       línea y pedir la siguiente sin volver arriba. */}
                    <button
                      type="button"
                      onClick={() =>
                        append({ IdProducto: "", Cantidad: 1, IdVehiculo: placaDefault })
                      }
                      className="flex w-full cursor-pointer items-center justify-center gap-2 border-t border-dashed p-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" />
                      Agregar línea
                    </button>
                  </div>
                )}
                {detalleErrorMsg && <p className="text-xs text-destructive">{detalleErrorMsg}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="Notas">Notas generales (opcional)</Label>
                <Input
                  id="Notas"
                  placeholder="Observaciones del requerimiento..."
                  {...register("Notas")}
                />
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
                  {isPending ? "Creando..." : "Crear requerimiento"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

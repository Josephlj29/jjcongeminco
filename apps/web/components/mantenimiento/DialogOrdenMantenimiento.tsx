"use client";

/**
 * components/mantenimiento/DialogOrdenMantenimiento.tsx
 *
 * Alta/edición de una Orden de Trabajo de Mantenimiento. La OT se registra al
 * TERMINAR el trabajo, en un solo paso: cabecera + trabajos (cada tarea con su
 * foto opcional de antes y de después) + consumo opcional de repuestos.
 *
 * ALTA: las fotos se suben a Storage ANTES del POST y los repuestos viajan dentro
 * del payload (Consumo) como BORRADOR. Toda orden nueva nace "Por aprobar", con o
 * sin repuestos (así se pueden agregar los que se olvidaron); el stock se descuenta
 * recién al APROBAR. Si falla una subida, no se crea nada.
 *
 * EDICIÓN (OT abierta o "Por aprobar" que todavía no descontó stock): mismo
 * formulario con el borrador precargado; un solo PATCH reemplaza cabecera,
 * trabajos y repuestos y la BD recalcula la situación. Una vez aprobada (stock
 * descontado) la orden ya no se edita.
 *
 * Selects controlados (value={watch}) y montaje condicional desde el padre para
 * evitar el bug de valor pegado/stale.
 */
import { useEffect, useRef, useState } from "react";
import { useForm, type DefaultValues } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, Check, Eraser } from "lucide-react";
import { toast } from "sonner";
import { hoyLima } from "@/lib/format";
import {
  CrearOrdenMantenimientoSchema,
  TIPO_MANTENIMIENTO,
  TURNO,
  type ConsumirRepuestos,
  type CrearOrdenMantenimiento,
  type OrdenMantenimientoConDetalle,
  type SituacionOrden,
} from "@congeminco/shared";
import {
  useOrdenesMantenimiento,
  useCrearOrdenMantenimiento,
  useActualizarOrdenMantenimiento,
} from "@/hooks/useOrdenesMantenimiento";
import {
  EditorConsumoRepuestos,
  CONSUMO_INICIAL,
  consumoVacio,
  validarConsumo,
  type ConsumoState,
} from "@/components/mantenimiento/EditorConsumoRepuestos";
import { FotoTrabajo, type FotoLocal } from "@/components/mantenimiento/FotoTrabajo";
import { useBorradorFormulario } from "@/hooks/useBorradorFormulario";
import { AvisoBorrador } from "@/components/AvisoBorrador";
import { useYo } from "@/hooks/useYo";
import { useVehiculos } from "@/hooks/useEquipos";
import { usePersonal } from "@/hooks/usePersonal";
import { VehiculoCombobox } from "@/components/VehiculoCombobox";
import { crearClienteNavegador } from "@/lib/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const TIPO_LABEL: Record<string, string> = {
  preventivo: "Preventivo",
  correctivo: "Correctivo",
};
const TURNO_LABEL: Record<string, string> = {
  dia: "Día",
  tarde: "Tarde",
  noche: "Noche",
};

type LadoFoto = "antes" | "despues";
const ETIQUETA_LADO: Record<LadoFoto, string> = { antes: "de antes", despues: "de después" };

/* Fila del editor de trabajos. La clave es estable (no el índice) para que la
   foto siga a SU fila al borrar otras, misma razón que el field.id de RHF en
   requerimientos. Una foto es un archivo local pendiente (preview = objectURL) o
   una URL ya subida (file = null, edición de una OT legada). */
interface TrabajoForm {
  key: string;
  descripcion: string;
  antes: FotoLocal | null;
  despues: FotoLocal | null;
}

function nuevoTrabajo(
  descripcion = "",
  urlAntes: string | null = null,
  urlDespues: string | null = null,
): TrabajoForm {
  return {
    key: crypto.randomUUID(),
    descripcion,
    antes: urlAntes ? { file: null, preview: urlAntes } : null,
    despues: urlDespues ? { file: null, preview: urlDespues } : null,
  };
}

function conFoto(t: TrabajoForm, lado: LadoFoto, foto: FotoLocal | null): TrabajoForm {
  return lado === "antes" ? { ...t, antes: foto } : { ...t, despues: foto };
}

function liberarPreview(foto: FotoLocal | null) {
  if (foto?.file) URL.revokeObjectURL(foto.preview);
}

/** Precarga el editor de repuestos con el borrador de la orden (edición). */
function consumoDesdeOrden(orden: OrdenMantenimientoConDetalle | null): ConsumoState {
  if (!orden || !orden.Repuestos.length) return { ...CONSUMO_INICIAL };
  return {
    idUbicacion: orden.IdUbicacionConsumo ?? "",
    idProveedor: orden.IdProveedorCompra ?? "",
    comprobante: orden.ComprobanteCompra ?? "",
    lineas: orden.Repuestos.map((r) => ({
      idProducto: r.IdProducto,
      cantidad: String(r.Cantidad),
      modo: r.Modo,
      costo: r.CostoUnitarioCompra === null ? "" : String(r.CostoUnitarioCompra),
    })),
  };
}

/** Sube una foto al bucket "mantenimiento" y devuelve su URL pública. */
async function subirFoto(file: File): Promise<string> {
  const supabase = crearClienteNavegador();
  const ruta = `trabajos/${crypto.randomUUID()}-${file.name}`;
  const { data, error } = await supabase.storage
    .from("mantenimiento")
    .upload(ruta, file, { upsert: false });
  if (error || !data) throw new Error(error?.message ?? "No se pudo subir la foto.");
  return supabase.storage.from("mantenimiento").getPublicUrl(data.path).data.publicUrl;
}

/**
 * Arma los trabajos del payload subiendo las fotos locales. Falla en la primera
 * subida que no funcione: todavía no se tocó la BD, así que se reintenta sin
 * dejar nada huérfano.
 */
async function armarTrabajos(filas: TrabajoForm[]): Promise<CrearOrdenMantenimiento["Trabajos"]> {
  const resultado: CrearOrdenMantenimiento["Trabajos"] = [];
  for (const [i, t] of filas.entries()) {
    const urls: { UrlFotoAntes?: string; UrlFotoDespues?: string } = {};
    for (const lado of ["antes", "despues"] as const) {
      const foto = t[lado];
      if (!foto) continue;
      let url: string;
      try {
        url = foto.file ? await subirFoto(foto.file) : foto.preview;
      } catch (e) {
        throw new Error(
          `No se pudo subir la foto ${ETIQUETA_LADO[lado]} de la tarea ${i + 1}: ${(e as Error).message}`,
        );
      }
      if (lado === "antes") urls.UrlFotoAntes = url;
      else urls.UrlFotoDespues = url;
    }
    resultado.push({ Secuencia: i + 1, Descripcion: t.descripcion, ...urls });
  }
  return resultado;
}

/**
 * Arma el N° de orden completo: PREFIJO-DDMMYYYY-PLACA-NN.
 * Espeja la lógica del servidor (inv.FnRegistrarOrdenMantenimiento): busca el
 * primer correlativo libre para esa base entre los números ya existentes. El
 * servidor sigue siendo la fuente de verdad y reconfirma el NN al guardar;
 * esto es solo la previsualización del número que se va a asignar.
 */
function armarNumeroOrden(
  tipo: string | undefined,
  fecha: string | undefined,
  placa: string | null | undefined,
  numerosExistentes: string[],
): string | null {
  if (!tipo || !fecha || !placa) return null;
  const [y, m, d] = fecha.split("-");
  if (!y || !m || !d) return null;
  const prefijo = tipo === "correctivo" ? "CORR" : "PREV";
  const placaLimpia = placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const base = `${prefijo}-${d}${m}${y}-${placaLimpia}`;

  const ocupados = new Set<number>();
  for (const numero of numerosExistentes) {
    if (!numero.startsWith(`${base}-`)) continue;
    const sufijo = Number(numero.slice(base.length + 1));
    if (Number.isInteger(sufijo) && sufijo > 0) ocupados.add(sufijo);
  }
  let correlativo = 1;
  while (ocupados.has(correlativo)) correlativo += 1;

  return `${base}-${String(correlativo).padStart(2, "0")}`;
}

/* Estado inicial del ALTA. Única fuente de verdad para defaultValues, el
   borrador y "Limpiar todo". Es función porque FechaOrden es la de hoy: una
   constante de módulo se congelaría en la fecha de la primera carga. */
function ordenVacia(): DefaultValues<CrearOrdenMantenimiento> {
  return { FechaOrden: hoyLima(), IdsPersonal: [], Trabajos: [] };
}

/* Lo que el borrador guarda además de los campos del form. Las fotos NO entran:
   son File con objectURL, que no sobreviven al cierre de la pestaña. Se guardan
   solo las descripciones de las tareas. */
interface BorradorOrden {
  trabajos: string[];
  conConsumo: boolean;
  consumo: ConsumoState;
}

export function DialogOrdenMantenimiento({
  orden,
  onClose,
  onGuardada,
}: {
  orden: OrdenMantenimientoConDetalle | null;
  onClose: () => void;
  /** Alta: situación con la que nació la orden ('consumida' o 'cerrada'). */
  onGuardada?: (situacion: SituacionOrden) => void;
}) {
  const modoEdicion = !!orden;
  const { data: yo } = useYo();
  const { mutateAsync: crear, isPending: creando } = useCrearOrdenMantenimiento();
  const { mutateAsync: actualizar, isPending: act } = useActualizarOrdenMantenimiento();
  const { data: vehiculos } = useVehiculos();
  const { data: personal } = usePersonal();
  const [subiendoFotos, setSubiendoFotos] = useState(false);
  const isPending = creando || act || subiendoFotos;

  const [trabajos, setTrabajos] = useState<TrabajoForm[]>(() =>
    orden && orden.Trabajos.length
      ? orden.Trabajos.map((t) => nuevoTrabajo(t.Descripcion, t.UrlFotoAntes, t.UrlFotoDespues))
      : [nuevoTrabajo()],
  );

  // Los previews locales son objectURLs: se liberan al quitar/reemplazar la foto y,
  // por si el diálogo se cierra a medio camino, también al desmontar.
  const trabajosRef = useRef(trabajos);
  trabajosRef.current = trabajos;
  useEffect(
    () => () => {
      for (const t of trabajosRef.current) {
        liberarPreview(t.antes);
        liberarPreview(t.despues);
      }
    },
    [],
  );

  // Borrador de repuestos (opcional). Viaja dentro del payload en el alta y en la
  // edición (reemplaza el borrador completo); el stock se descuenta al aprobar.
  // En edición se precarga desde la orden.
  const [conConsumo, setConConsumo] = useState(!!orden?.Repuestos.length);
  const [consumo, setConsumo] = useState<ConsumoState>(() => consumoDesdeOrden(orden));

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    getValues,
    clearErrors,
    formState: { errors },
  } = useForm<CrearOrdenMantenimiento>({
    resolver: zodResolver(CrearOrdenMantenimientoSchema),
    defaultValues: orden
      ? {
          NumeroOrden: orden.NumeroOrden ?? undefined,
          TipoMantenimiento: orden.TipoMantenimiento,
          FechaOrden: orden.FechaOrden.slice(0, 10),
          Turno: orden.Turno,
          Kilometraje: orden.Kilometraje ?? undefined,
          Horometro: orden.Horometro ?? undefined,
          IdVehiculo: orden.IdVehiculo,
          IdsPersonal: orden.Personales.map((p) => p.IdPersonal),
          Observaciones: orden.Observaciones ?? undefined,
          Trabajos: [],
        }
      : ordenVacia(),
  });

  /* Red de contención del ALTA: la orden es el formulario más largo del sistema
     (cabecera + tareas + repuestos) y se carga desde el celular en obra. Guarda
     también trabajos y repuestos, que viven fuera de react-hook-form; sin eso el
     borrador rescataría solo la cabecera. En edición no corre: pisaría una orden
     real con datos viejos. */
  const borrador = useBorradorFormulario<CrearOrdenMantenimiento, BorradorOrden>({
    clave: "orden-mantenimiento",
    version: 1,
    activo: !modoEdicion,
    idUsuario: yo?.id,
    watch,
    getValues,
    reset,
    valoresIniciales: ordenVacia,
    extra: { trabajos: trabajos.map((t) => t.descripcion), conConsumo, consumo },
    onRestaurarExtra: (e) => {
      setTrabajos(e.trabajos.length ? e.trabajos.map((d) => nuevoTrabajo(d)) : [nuevoTrabajo()]);
      setConConsumo(e.conConsumo);
      setConsumo(e.consumo);
    },
    // Lo que hace "no vacía" a una orden casi siempre son las tareas o los
    // repuestos, no la cabecera: por eso la detección no puede mirar solo el form.
    estaVacio: () =>
      !trabajos.some((t) => t.descripcion.trim()) &&
      consumoVacio(consumo) &&
      !getValues("IdVehiculo") &&
      !(getValues("IdsPersonal") ?? []).length &&
      !getValues("TipoMantenimiento") &&
      !getValues("Turno"),
  });

  /* "Limpiar todo": deja el formulario como recién abierto. Además de vaciar los
     campos hay que soltar los objectURL de las fotos y borrar el borrador, para
     que no reaparezca al volver a abrir el diálogo. */
  const limpiarTodo = () => {
    for (const t of trabajos) {
      liberarPreview(t.antes);
      liberarPreview(t.despues);
    }
    setTrabajos([nuevoTrabajo()]);
    setConConsumo(false);
    setConsumo({ ...CONSUMO_INICIAL });
    clearErrors();
    borrador.descartar();
  };

  const { data: ordenes } = useOrdenesMantenimiento();
  const idsPersonal = watch("IdsPersonal") ?? [];
  const placaSeleccionada = vehiculos?.find((v) => v.Id === watch("IdVehiculo"))?.Placa;
  const numerosExistentes = (ordenes ?? [])
    .map((o) => o.NumeroOrden)
    .filter((n): n is string => !!n);
  const numeroArmado = armarNumeroOrden(
    watch("TipoMantenimiento"),
    watch("FechaOrden"),
    placaSeleccionada,
    numerosExistentes,
  );
  const togglePersonal = (id: string) => {
    const next = idsPersonal.includes(id)
      ? idsPersonal.filter((x) => x !== id)
      : [...idsPersonal, id];
    setValue("IdsPersonal", next, { shouldValidate: true });
  };

  /* ── Trabajos y sus fotos ── */
  const editarDescripcion = (key: string, descripcion: string) =>
    setTrabajos((arr) => arr.map((t) => (t.key === key ? { ...t, descripcion } : t)));

  const ponerFoto = (key: string, lado: LadoFoto, file: File) => {
    liberarPreview(trabajos.find((t) => t.key === key)?.[lado] ?? null);
    const foto: FotoLocal = { file, preview: URL.createObjectURL(file) };
    setTrabajos((arr) => arr.map((t) => (t.key === key ? conFoto(t, lado, foto) : t)));
  };

  const quitarFoto = (key: string, lado: LadoFoto) => {
    liberarPreview(trabajos.find((t) => t.key === key)?.[lado] ?? null);
    setTrabajos((arr) => arr.map((t) => (t.key === key ? conFoto(t, lado, null) : t)));
  };

  const quitarTrabajo = (key: string) => {
    if (trabajos.length === 1) return;
    const t = trabajos.find((x) => x.key === key);
    liberarPreview(t?.antes ?? null);
    liberarPreview(t?.despues ?? null);
    setTrabajos((arr) => arr.filter((x) => x.key !== key));
  };

  const onSubmit = async (data: CrearOrdenMantenimiento) => {
    // 1. Trabajos: se descartan las filas vacías. Una fila con foto pero sin
    //    descripción es un error visible (si no, la foto se perdería en silencio).
    const filas = trabajos.map((t) => ({ ...t, descripcion: t.descripcion.trim() }));
    const huerfana = filas.findIndex((t) => !t.descripcion && (t.antes || t.despues));
    if (huerfana >= 0) {
      toast.error(
        `La tarea ${huerfana + 1} tiene foto pero no descripción: complétala o quita la foto.`,
      );
      return;
    }
    const activos = filas.filter((t) => t.descripcion);

    // 2. Consumo: con el checkbox activo, un consumo vacío o a medias es un error
    //    visible ANTES de tocar nada (evita OTs sin consumo "en silencio" por un
    //    typo en la cantidad).
    let consumoData: ConsumirRepuestos | null = null;
    if (conConsumo) {
      if (consumoVacio(consumo)) {
        toast.error(
          "Marcaste 'Repuestos utilizados' sin repuestos: agrega al menos uno o desmarca la opción.",
        );
        return;
      }
      consumoData = validarConsumo(consumo);
      if (!consumoData) return;
    }

    // 3. Fotos: se suben ANTES de guardar. Si una falla, se corta acá.
    let trabajosPayload: CrearOrdenMantenimiento["Trabajos"] = [];
    setSubiendoFotos(true);
    try {
      trabajosPayload = await armarTrabajos(activos);
    } catch (e) {
      toast.error((e as Error).message);
      return;
    } finally {
      setSubiendoFotos(false);
    }

    // Cabecera + trabajos + borrador de repuestos en UN solo request; la BD decide
    // la situación (toda OT nueva queda por aprobar; una abierta legada pasa a por
    // aprobar si recibe repuestos).
    const payload: CrearOrdenMantenimiento = {
      ...data,
      Trabajos: trabajosPayload,
      Consumo: consumoData ?? undefined,
    };

    try {
      if (modoEdicion) {
        const { Situacion } = await actualizar({ id: orden.Id, data: payload });
        const final: SituacionOrden = Situacion ?? orden.Situacion;
        toast.success(
          final === "consumida"
            ? "Orden actualizada. Pendiente de aprobación."
            : "Orden actualizada correctamente",
        );
        onGuardada?.(final);
      } else {
        const { Situacion } = await crear(payload);
        // Toda OT nueva nace ABIERTA (en curso); la BD es la fuente de verdad.
        const final: SituacionOrden = Situacion ?? "abierta";
        toast.success('Orden registrada y abierta. Cuando esté lista, usá "Culminar".');
        onGuardada?.(final);
      }
      for (const t of trabajos) {
        liberarPreview(t.antes);
        liberarPreview(t.despues);
      }
      // Antes de cerrar: cancela el guardado con retardo pendiente, que si no
      // volvería a escribir lo que se acaba de registrar.
      borrador.olvidar();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const textoBoton = subiendoFotos
    ? "Subiendo fotos..."
    : isPending
      ? "Guardando..."
      : modoEdicion
        ? "Guardar cambios"
        : "Registrar orden";

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      {/* max-w-4xl: adentro va la tabla de repuestos, de 5 columnas. Con 2xl no
          entraba y las celdas se comprimían hasta tapar la cantidad. */}
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {modoEdicion ? "Editar orden de trabajo" : "Nueva orden de trabajo"}
          </DialogTitle>
          <DialogDescription>
            {modoEdicion
              ? "Corrige la cabecera, las tareas y los repuestos. El stock se descuenta al aprobar."
              : "Registra el trabajo realizado: tareas con sus fotos y los repuestos usados. La orden queda abierta y se edita cuanto haga falta; recién al culminarla pasa a aprobación (o se cierra, si no lleva repuestos)."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {borrador.restaurado && (
            <AvisoBorrador guardadoEn={borrador.guardadoEn} onDescartar={limpiarTodo} />
          )}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div className="space-y-1">
              <Label>Tipo *</Label>
              <Select
                value={watch("TipoMantenimiento") ?? ""}
                onValueChange={(v) =>
                  setValue("TipoMantenimiento", v as CrearOrdenMantenimiento["TipoMantenimiento"], {
                    shouldValidate: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Preventivo / Correctivo" />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_MANTENIMIENTO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TIPO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.TipoMantenimiento && (
                <p className="text-xs text-destructive">{errors.TipoMantenimiento.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="FechaOrden">Fecha *</Label>
              <Input id="FechaOrden" type="date" {...register("FechaOrden")} />
            </div>

            <div className="space-y-1">
              <Label>Turno *</Label>
              <Select
                value={watch("Turno") ?? ""}
                onValueChange={(v) =>
                  setValue("Turno", v as CrearOrdenMantenimiento["Turno"], { shouldValidate: true })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Turno" />
                </SelectTrigger>
                <SelectContent>
                  {TURNO.map((t) => (
                    <SelectItem key={t} value={t}>
                      {TURNO_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.Turno && <p className="text-xs text-destructive">{errors.Turno.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            <div className="col-span-2 space-y-1 md:col-span-1">
              <Label>Placa *</Label>
              <VehiculoCombobox
                value={watch("IdVehiculo") ?? null}
                onChange={(v) => setValue("IdVehiculo", v ?? "", { shouldValidate: true })}
                detallado
              />
              {errors.IdVehiculo && (
                <p className="text-xs text-destructive">{errors.IdVehiculo.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="Kilometraje">Kilometraje</Label>
              <Input
                id="Kilometraje"
                type="number"
                min={0}
                step="0.01"
                placeholder="Opcional"
                {...register("Kilometraje", {
                  setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)),
                })}
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="Horometro">Horómetro</Label>
              <Input
                id="Horometro"
                type="number"
                min={0}
                step="0.01"
                placeholder="Opcional"
                {...register("Horometro", {
                  setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)),
                })}
              />
            </div>
          </div>

          {/* Personal asignado (varios; todos por igual) */}
          <div className="space-y-1">
            <Label>
              Personal asignado *{" "}
              {idsPersonal.length > 0 && (
                <span className="font-normal text-muted-foreground">
                  ({idsPersonal.length} seleccionado{idsPersonal.length === 1 ? "" : "s"})
                </span>
              )}
            </Label>
            <Command className="rounded-lg border">
              <CommandInput placeholder="Buscar personal..." />
              <CommandList className="max-h-44">
                <CommandEmpty>No se encontró personal.</CommandEmpty>
                <CommandGroup>
                  {personal?.map((p) => {
                    const activo = idsPersonal.includes(p.Id);
                    return (
                      <CommandItem
                        key={p.Id}
                        value={p.NombreCompleto}
                        onSelect={() => togglePersonal(p.Id)}
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
            {errors.IdsPersonal && (
              <p className="text-xs text-destructive">{errors.IdsPersonal.message}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label>N° Orden</Label>
            {modoEdicion ? (
              <Input readOnly className="bg-muted font-mono" {...register("NumeroOrden")} />
            ) : (
              <div className="rounded-md border bg-muted px-3 py-2 text-sm">
                {numeroArmado ? (
                  <>
                    <span className="font-mono font-medium">{numeroArmado}</span>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Se asigna automáticamente al guardar.
                    </p>
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Elige tipo, fecha y placa para ver el número.
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Trabajos realizados: cada tarea con foto opcional de antes y de después */}
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Label>Trabajos realizados</Label>
                <p className="text-xs text-muted-foreground">
                  Cada tarea puede llevar una foto de antes y una de después (opcionales).
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTrabajos((arr) => [...arr, nuevoTrabajo()])}
              >
                <Plus className="mr-1 h-3 w-3" />
                Agregar
              </Button>
            </div>
            <div className="space-y-2">
              {trabajos.map((t, i) => (
                <div key={t.key} className="space-y-2 rounded-md border p-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}</span>
                    <Input
                      value={t.descripcion}
                      placeholder="Descripción del trabajo..."
                      onChange={(e) => editarDescripcion(t.key, e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => quitarTrabajo(t.key)}
                      disabled={trabajos.length === 1}
                      aria-label="Quitar tarea"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-3 pl-7">
                    <FotoTrabajo
                      etiqueta="Antes"
                      foto={t.antes}
                      onSeleccionar={(f) => ponerFoto(t.key, "antes", f)}
                      onQuitar={() => quitarFoto(t.key, "antes")}
                      disabled={isPending}
                    />
                    <FotoTrabajo
                      etiqueta="Después"
                      foto={t.despues}
                      onSeleccionar={(f) => ponerFoto(t.key, "despues", f)}
                      onQuitar={() => quitarFoto(t.key, "despues")}
                      disabled={isPending}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="Observaciones">Observaciones</Label>
            <Input id="Observaciones" placeholder="Opcional" {...register("Observaciones")} />
          </div>

          {/* Borrador de repuestos (opcional). Editable mientras la OT siga "Por
              aprobar"; el stock se descuenta al aprobar. En edición viene
              precargado desde la orden. */}
          <div className="space-y-3 rounded-md border p-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={conConsumo}
                onChange={(e) => setConConsumo(e.target.checked)}
              />
              Repuestos utilizados (opcional)
            </label>
            {conConsumo ? (
              <EditorConsumoRepuestos estado={consumo} onChange={setConsumo} />
            ) : (
              <p className="text-xs text-muted-foreground">
                {modoEdicion
                  ? "Marca la opción para registrar o corregir los repuestos usados. El stock se descuenta al aprobar la orden."
                  : "Si se usaron repuestos, regístralos acá; el stock se descuenta al aprobar la orden. Puedes agregarlos o corregirlos después, mientras la orden siga por aprobar."}
              </p>
            )}
          </div>

          <DialogFooter>
            {!modoEdicion && (
              <Button
                type="button"
                variant="outline"
                onClick={limpiarTodo}
                disabled={isPending}
                className="sm:mr-auto"
              >
                <Eraser className="mr-2 h-4 w-4" />
                Limpiar todo
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {textoBoton}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

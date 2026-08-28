"use client";

/**
 * app/(app)/maestros/proveedores/page.tsx — ABM de proveedores
 *
 * - Lista de proveedores activos con sus cuentas bancarias (inv.V_Proveedor)
 * - Dialog crear/editar: datos del proveedor + sub-grilla de cuentas (1:N)
 * - Guardado atómico vía inv.FnGuardarProveedor (proveedor + cuentas)
 * - Acciones restringidas por rol (productoEscritura = admin, almacenero)
 */
import { useState } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, X, Truck } from "lucide-react";
import { toast } from "sonner";
import { CrearProveedorSchema, type CrearProveedor, type Proveedor } from "@congeminco/shared";
import {
  useProveedores,
  useCrearProveedor,
  useActualizarProveedor,
  useEliminarProveedor,
} from "@/hooks/useProveedores";
import { usePermiso } from "@/hooks/useYo";
import { DataTable, type ColumnaDataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { DialogEliminar } from "@/components/DialogEliminar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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

const CUENTA_VACIA = {
  Banco: "",
  TipoCuenta: "corriente" as const,
  NumeroCuenta: "",
  Cci: "",
  Moneda: "PEN" as const,
  TitularCuenta: "",
  EsPrincipal: false,
};

/* ─── Dialog: Crear / Editar proveedor ─── */
function DialogProveedor({
  proveedor,
  onClose,
}: {
  proveedor: Proveedor | null;
  onClose: () => void;
}) {
  const modoEdicion = !!proveedor;
  const { mutateAsync: crear, isPending: creando } = useCrearProveedor();
  const { mutateAsync: actualizar, isPending: actualizando } = useActualizarProveedor();
  const isPending = creando || actualizando;

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CrearProveedor>({
    resolver: zodResolver(CrearProveedorSchema),
    defaultValues: proveedor
      ? {
          Nombre: proveedor.Nombre,
          Ruc: proveedor.Ruc ?? "",
          Contacto: proveedor.Contacto ?? "",
          Telefono: proveedor.Telefono ?? "",
          Cuentas: (proveedor.Cuentas ?? []).map((c) => ({
            Id: c.Id,
            Banco: c.Banco,
            TipoCuenta: c.TipoCuenta as "corriente" | "ahorros",
            NumeroCuenta: c.NumeroCuenta,
            Cci: c.Cci ?? "",
            Moneda: c.Moneda as "PEN" | "USD",
            TitularCuenta: c.TitularCuenta ?? "",
            EsPrincipal: c.EsPrincipal,
          })),
        }
      : { Cuentas: [] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "Cuentas" });

  const onSubmit = async (data: CrearProveedor) => {
    try {
      if (modoEdicion) {
        await actualizar({ id: proveedor.Id, data });
        toast.success("Proveedor actualizado correctamente");
      } else {
        await crear(data);
        toast.success("Proveedor creado correctamente");
      }
      reset();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{modoEdicion ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="Nombre">Nombre *</Label>
            <Input id="Nombre" placeholder="Proveedor S.A." {...register("Nombre")} />
            {errors.Nombre && <p className="text-xs text-destructive">{errors.Nombre.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="Ruc">RUC</Label>
              <Input id="Ruc" placeholder="20123456789" {...register("Ruc")} />
              {errors.Ruc && <p className="text-xs text-destructive">{errors.Ruc.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="Telefono">Teléfono</Label>
              <Input id="Telefono" placeholder="+51 999 999 999" {...register("Telefono")} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="Contacto">Contacto</Label>
            <Input id="Contacto" placeholder="Nombre del contacto" {...register("Contacto")} />
          </div>

          {/* ─── Cuentas bancarias ─── */}
          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Cuentas bancarias</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ ...CUENTA_VACIA })}
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                Agregar cuenta
              </Button>
            </div>

            {fields.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">
                Sin cuentas. Agrega una si el proveedor tiene datos bancarios.
              </p>
            ) : (
              fields.map((field, i) => (
                <div key={field.id} className="relative space-y-2 rounded-md border p-3">
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
                    aria-label="Quitar cuenta"
                  >
                    <X className="h-4 w-4" />
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Banco *</Label>
                      <Input
                        placeholder="BCP, BBVA, Interbank…"
                        {...register(`Cuentas.${i}.Banco` as const)}
                      />
                      {errors.Cuentas?.[i]?.Banco && (
                        <p className="text-xs text-destructive">
                          {errors.Cuentas[i]?.Banco?.message}
                        </p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Tipo</Label>
                        <Controller
                          control={control}
                          name={`Cuentas.${i}.TipoCuenta` as const}
                          render={({ field: f }) => (
                            <Select value={f.value} onValueChange={f.onChange}>
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="corriente">Corriente</SelectItem>
                                <SelectItem value="ahorros">Ahorros</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Moneda</Label>
                        <Controller
                          control={control}
                          name={`Cuentas.${i}.Moneda` as const}
                          render={({ field: f }) => (
                            <Select value={f.value} onValueChange={f.onChange}>
                              <SelectTrigger className="h-9">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="PEN">Soles</SelectItem>
                                <SelectItem value="USD">Dólares</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">N° de cuenta *</Label>
                      <Input
                        placeholder="193-1234567-0-89"
                        {...register(`Cuentas.${i}.NumeroCuenta` as const)}
                      />
                      {errors.Cuentas?.[i]?.NumeroCuenta && (
                        <p className="text-xs text-destructive">
                          {errors.Cuentas[i]?.NumeroCuenta?.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">CCI</Label>
                      <Input
                        placeholder="002193001234567890"
                        {...register(`Cuentas.${i}.Cci` as const)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 items-end gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Titular (si difiere)</Label>
                      <Input
                        placeholder="Razón social del titular"
                        {...register(`Cuentas.${i}.TitularCuenta` as const)}
                      />
                    </div>
                    <Controller
                      control={control}
                      name={`Cuentas.${i}.EsPrincipal` as const}
                      render={({ field: f }) => (
                        <label className="flex h-9 items-center gap-2 text-sm">
                          <Checkbox checked={f.value} onCheckedChange={f.onChange} />
                          Cuenta principal
                        </label>
                      )}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : modoEdicion ? "Guardar cambios" : "Crear proveedor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const COLUMNAS: ColumnaDataTable<Proveedor>[] = [
  { id: "nombre", titulo: "Nombre", celda: (p) => p.Nombre, className: "font-medium" },
  { id: "ruc", titulo: "RUC", celda: (p) => p.Ruc ?? "—", className: "font-mono text-xs" },
  {
    id: "contacto",
    titulo: "Contacto",
    celda: (p) => p.Contacto ?? "—",
    className: "text-sm text-muted-foreground",
    ocultarEnMovil: true,
  },
  {
    id: "telefono",
    titulo: "Teléfono",
    celda: (p) => p.Telefono ?? "—",
    className: "text-sm text-muted-foreground",
    ocultarEnMovil: true,
  },
  {
    id: "cuentas",
    titulo: "Cuentas",
    celda: (p) =>
      p.Cuentas?.length ? (
        <Badge variant="secondary">{p.Cuentas.length}</Badge>
      ) : (
        <span className="text-xs text-muted-foreground">—</span>
      ),
  },
];

/* ─── Página principal ─── */
export default function ProveedoresPage() {
  const [mostrarDialog, setMostrarDialog] = useState(false);
  const [proveedorEditar, setProveedorEditar] = useState<Proveedor | null>(null);
  const [proveedorEliminar, setProveedorEliminar] = useState<Proveedor | null>(null);

  const { data: proveedores, isLoading: cargando, isError: error, refetch } = useProveedores();
  const puedeEscribir = usePermiso("productoEscritura");
  const { mutateAsync: eliminarProveedor } = useEliminarProveedor();

  const abrirNuevo = () => {
    setProveedorEditar(null);
    setMostrarDialog(true);
  };

  const cerrarDialog = () => {
    setMostrarDialog(false);
    setProveedorEditar(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Proveedores"
        descripcion="Administra los proveedores de la empresa"
        breadcrumbs={[{ label: "Maestros" }, { label: "Proveedores" }]}
        acciones={
          puedeEscribir && (
            <Button onClick={abrirNuevo}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo proveedor
            </Button>
          )
        }
      />

      <DataTable
        columnas={COLUMNAS}
        datos={proveedores}
        obtenerId={(p) => p.Id}
        cargando={cargando}
        error={error}
        onReintentar={() => void refetch()}
        vacio={{
          icono: Truck,
          titulo: "No hay proveedores registrados",
          descripcion: "Crea el primer proveedor para registrar compras.",
          accion: puedeEscribir ? (
            <Button size="sm" onClick={abrirNuevo}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo proveedor
            </Button>
          ) : undefined,
        }}
        acciones={
          puedeEscribir
            ? [
                {
                  label: "Editar",
                  icono: Pencil,
                  onClick: (p) => {
                    setProveedorEditar(p);
                    setMostrarDialog(true);
                  },
                },
                {
                  label: "Eliminar",
                  icono: Trash2,
                  variante: "destructiva",
                  onClick: (p) => setProveedorEliminar(p),
                },
              ]
            : undefined
        }
      />

      {mostrarDialog && <DialogProveedor proveedor={proveedorEditar} onClose={cerrarDialog} />}

      <DialogEliminar
        entidad="proveedor"
        id={proveedorEliminar?.Id ?? null}
        nombre={proveedorEliminar?.Nombre ?? ""}
        open={!!proveedorEliminar}
        onOpenChange={(v) => {
          if (!v) setProveedorEliminar(null);
        }}
        onConfirmar={async () => {
          if (!proveedorEliminar) return;
          try {
            await eliminarProveedor(proveedorEliminar.Id);
            toast.success("Proveedor eliminado correctamente");
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />
    </div>
  );
}

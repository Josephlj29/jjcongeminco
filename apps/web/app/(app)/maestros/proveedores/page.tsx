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
import { useForm, useFieldArray } from "react-hook-form";
import { usePaginacion } from "@/hooks/usePaginacion";
import { Paginacion } from "@/components/Paginacion";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2, X } from "lucide-react";
import { DialogEliminar } from "@/components/DialogEliminar";
import { toast } from "sonner";
import {
  CrearProveedorSchema,
  type CrearProveedor,
  type Proveedor,
  puede,
} from "@congeminco/shared";
import { useProveedores, useCrearProveedor, useActualizarProveedor, useEliminarProveedor } from "@/hooks/useProveedores";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";

/* Clase para los <select> nativos (estilo consistente con Input). */
const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

const CUENTA_VACIA = {
  Banco: "",
  TipoCuenta: "corriente" as const,
  NumeroCuenta: "",
  Cci: "",
  Moneda: "PEN" as const,
  TitularCuenta: "",
  EsPrincipal: false,
};

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

/* ─── Dialog: Crear / Editar proveedor ─── */
function DialogProveedor({
  open,
  proveedor,
  onClose,
}: {
  open: boolean;
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
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{modoEdicion ? "Editar proveedor" : "Nuevo proveedor"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="Nombre">Nombre *</Label>
            <Input id="Nombre" placeholder="Proveedor S.A." {...register("Nombre")} />
            {errors.Nombre && (
              <p className="text-xs text-destructive">{errors.Nombre.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="Ruc">RUC</Label>
              <Input id="Ruc" placeholder="20123456789" {...register("Ruc")} />
              {errors.Ruc && (
                <p className="text-xs text-destructive">{errors.Ruc.message}</p>
              )}
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
              <p className="text-xs text-muted-foreground py-2">
                Sin cuentas. Agregá una si el proveedor tiene datos bancarios.
              </p>
            ) : (
              fields.map((field, i) => (
                <div key={field.id} className="rounded-md border p-3 space-y-2 relative">
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
                        <select className={SELECT_CLASS} {...register(`Cuentas.${i}.TipoCuenta` as const)}>
                          <option value="corriente">Corriente</option>
                          <option value="ahorros">Ahorros</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Moneda</Label>
                        <select className={SELECT_CLASS} {...register(`Cuentas.${i}.Moneda` as const)}>
                          <option value="PEN">Soles</option>
                          <option value="USD">Dólares</option>
                        </select>
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

                  <div className="grid grid-cols-2 gap-2 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">Titular (si difiere)</Label>
                      <Input
                        placeholder="Razón social del titular"
                        {...register(`Cuentas.${i}.TitularCuenta` as const)}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm h-9">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        {...register(`Cuentas.${i}.EsPrincipal` as const)}
                      />
                      Cuenta principal
                    </label>
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

/* ─── Página principal ─── */
export default function ProveedoresPage() {
  const [mostrarDialog, setMostrarDialog] = useState(false);
  const [proveedorEditar, setProveedorEditar] = useState<Proveedor | null>(null);
  const [proveedorEliminar, setProveedorEliminar] = useState<Proveedor | null>(null);

  const { data: proveedores, isLoading } = useProveedores();
  const { data: yo } = useRolActual();
  const puedeEscribir = puede(yo?.rol ?? null, "productoEscritura");
  const { mutateAsync: eliminarProveedor } = useEliminarProveedor();

  const paginacion = usePaginacion(proveedores ?? [], 10);

  const abrirNuevo = () => {
    setProveedorEditar(null);
    setMostrarDialog(true);
  };

  const abrirEditar = (p: Proveedor) => {
    setProveedorEditar(p);
    setMostrarDialog(true);
  };

  const cerrarDialog = () => {
    setMostrarDialog(false);
    setProveedorEditar(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Proveedores</h1>
          <p className="text-muted-foreground">Administra los proveedores de la empresa</p>
        </div>
        {puedeEscribir && (
          <Button onClick={abrirNuevo}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo proveedor
          </Button>
        )}
      </div>

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
                <TableHead>Nombre</TableHead>
                <TableHead>RUC</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Cuentas</TableHead>
                {puedeEscribir && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {!paginacion.itemsPagina.length ? (
                <TableRow>
                  <TableCell
                    colSpan={puedeEscribir ? 6 : 5}
                    className="text-center text-muted-foreground py-10"
                  >
                    No hay proveedores registrados.
                  </TableCell>
                </TableRow>
              ) : (
                paginacion.itemsPagina.map((p) => (
                  <TableRow key={p.Id}>
                    <TableCell className="font-medium">{p.Nombre}</TableCell>
                    <TableCell className="font-mono text-xs">{p.Ruc ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.Contacto ?? "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.Telefono ?? "—"}
                    </TableCell>
                    <TableCell>
                      {p.Cuentas?.length ? (
                        <Badge variant="secondary">{p.Cuentas.length}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    {puedeEscribir && (
                      <TableCell className="text-right space-x-1">
                        <Button variant="ghost" size="sm" onClick={() => abrirEditar(p)}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setProveedorEliminar(p)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Eliminar
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
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

      <DialogProveedor
        open={mostrarDialog}
        proveedor={proveedorEditar}
        onClose={cerrarDialog}
      />

      <DialogEliminar
        entidad="proveedor"
        id={proveedorEliminar?.Id ?? null}
        nombre={proveedorEliminar?.Nombre ?? ""}
        open={!!proveedorEliminar}
        onOpenChange={(v) => { if (!v) setProveedorEliminar(null); }}
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

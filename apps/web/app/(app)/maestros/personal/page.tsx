"use client";

/**
 * app/(app)/maestros/personal/page.tsx — ABM de personal (solicitantes)
 *
 * Cada persona tiene un CARGO (FK a catálogo) y, opcionalmente, un USUARIO de
 * acceso (login). El rol de acceso vive en el usuario, no acá. Escritura: admin.
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import {
  CrearPersonalSchema,
  ActualizarPersonalSchema,
  type CrearPersonal,
  type PersonalConDetalle,
} from "@congeminco/shared";
import {
  usePersonal,
  useUsuariosAcceso,
  useCrearPersonal,
  useActualizarPersonal,
  useEliminarPersonal,
} from "@/hooks/usePersonal";
import { useCargos } from "@/hooks/useCargos";
import { usePermiso } from "@/hooks/useYo";
import { DataTable, type ColumnaDataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { DialogEliminar } from "@/components/DialogEliminar";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const SIN_USUARIO = "__none__";

function DialogPersonal({
  persona,
  onClose,
}: {
  persona: PersonalConDetalle | null;
  onClose: () => void;
}) {
  const modoEdicion = !!persona;
  const { mutateAsync: crear, isPending: creando } = useCrearPersonal();
  const { mutateAsync: actualizar, isPending: act } = useActualizarPersonal();
  const { data: cargos } = useCargos();
  const { data: usuarios } = useUsuariosAcceso();
  const isPending = creando || act;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CrearPersonal>({
    resolver: zodResolver(modoEdicion ? ActualizarPersonalSchema : CrearPersonalSchema),
    defaultValues: persona
      ? {
          NombreCompleto: persona.NombreCompleto,
          Dni: persona.Dni ?? "",
          Telefono: persona.Telefono ?? "",
          IdCargo: persona.IdCargo,
          IdUsuario: persona.IdUsuario ?? undefined,
        }
      : {},
  });

  const idCargo = watch("IdCargo");
  const idUsuario = watch("IdUsuario");

  const onSubmit = async (data: CrearPersonal) => {
    try {
      if (modoEdicion) {
        await actualizar({ id: persona.Id, data });
        toast.success("Personal actualizado correctamente");
      } else {
        await crear(data);
        toast.success("Personal creado correctamente");
      }
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{modoEdicion ? "Editar personal" : "Nuevo personal"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="NombreCompleto">Nombre completo *</Label>
            <Input id="NombreCompleto" placeholder="Juan Pérez" {...register("NombreCompleto")} />
            {errors.NombreCompleto && (
              <p className="text-xs text-destructive">{errors.NombreCompleto.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="Dni">DNI</Label>
              <Input id="Dni" placeholder="Opcional" {...register("Dni")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="Telefono">Teléfono</Label>
              <Input id="Telefono" placeholder="Opcional" {...register("Telefono")} />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Cargo *</Label>
            <Select
              value={idCargo ?? ""}
              onValueChange={(v) => setValue("IdCargo", v, { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar cargo..." />
              </SelectTrigger>
              <SelectContent>
                {cargos?.map((c) => (
                  <SelectItem key={c.Id} value={c.Id}>
                    {c.Nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.IdCargo && <p className="text-xs text-destructive">{errors.IdCargo.message}</p>}
          </div>

          <div className="space-y-1">
            <Label>Usuario de acceso (opcional)</Label>
            <Select
              value={idUsuario ?? SIN_USUARIO}
              onValueChange={(v) => setValue("IdUsuario", v === SIN_USUARIO ? null : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin login" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_USUARIO}>Sin login (solo solicitante)</SelectItem>
                {usuarios?.map((u) => (
                  <SelectItem key={u.Id} value={u.Id}>
                    {u.NombreCompleto}
                    {u.Rol ? ` · ${u.Rol}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] leading-tight text-muted-foreground">
              Vincula solo si esta persona entra al sistema; su rol de acceso sale del usuario.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : modoEdicion ? "Guardar cambios" : "Crear personal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const COLUMNAS: ColumnaDataTable<PersonalConDetalle>[] = [
  {
    id: "nombre",
    titulo: "Nombre",
    celda: (p) => p.NombreCompleto,
    className: "font-medium",
  },
  {
    id: "dni",
    titulo: "DNI",
    celda: (p) => p.Dni ?? "—",
    className: "text-sm text-muted-foreground",
    ocultarEnMovil: true,
  },
  {
    id: "cargo",
    titulo: "Cargo",
    celda: (p) => p.NombreCargo ?? "—",
    className: "text-sm",
  },
  {
    id: "acceso",
    titulo: "Acceso",
    celda: (p) =>
      p.NombreUsuario ? (
        <Badge variant="secondary">{p.NombreUsuario}</Badge>
      ) : (
        <span className="text-xs text-muted-foreground">Sin login</span>
      ),
  },
];

export default function PersonalPage() {
  const [mostrarDialog, setMostrarDialog] = useState(false);
  const [editar, setEditar] = useState<PersonalConDetalle | null>(null);
  const [eliminarP, setEliminarP] = useState<PersonalConDetalle | null>(null);

  const { data: personal, isLoading: cargando, isError: error, refetch } = usePersonal();
  const puedeEscribir = usePermiso("catalogoAdmin");
  const { mutateAsync: eliminar } = useEliminarPersonal();

  const abrirNuevo = () => {
    setEditar(null);
    setMostrarDialog(true);
  };

  const cerrar = () => {
    setMostrarDialog(false);
    setEditar(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Personal"
        descripcion="Registro del personal que solicita materiales (con su cargo)."
        breadcrumbs={[{ label: "Maestros" }, { label: "Personal" }]}
        acciones={
          puedeEscribir && (
            <Button onClick={abrirNuevo}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo personal
            </Button>
          )
        }
      />

      <DataTable
        columnas={COLUMNAS}
        datos={personal}
        obtenerId={(p) => p.Id}
        cargando={cargando}
        error={error}
        onReintentar={() => void refetch()}
        vacio={{
          icono: Users,
          titulo: "No hay personal registrado",
          descripcion: "Crea al primer personal para poder asignarlo como solicitante.",
          accion: puedeEscribir ? (
            <Button size="sm" onClick={abrirNuevo}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo personal
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
                    setEditar(p);
                    setMostrarDialog(true);
                  },
                },
                {
                  label: "Eliminar",
                  icono: Trash2,
                  variante: "destructiva",
                  onClick: (p) => setEliminarP(p),
                },
              ]
            : undefined
        }
      />

      {mostrarDialog && <DialogPersonal persona={editar} onClose={cerrar} />}

      <DialogEliminar
        entidad="personal"
        id={eliminarP?.Id ?? null}
        nombre={eliminarP?.NombreCompleto ?? ""}
        open={!!eliminarP}
        onOpenChange={(v) => {
          if (!v) setEliminarP(null);
        }}
        onConfirmar={async () => {
          if (!eliminarP) return;
          try {
            await eliminar(eliminarP.Id);
            toast.success("Personal eliminado correctamente");
          } catch (e) {
            toast.error((e as Error).message);
            throw e;
          }
        }}
      />
    </div>
  );
}

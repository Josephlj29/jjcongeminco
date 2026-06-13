"use client";

/**
 * components/DialogEliminar.tsx
 *
 * Modal reutilizable para eliminar entidades con verificación de dependencias.
 *
 * Flujo:
 *   1. Al abrirse consulta /api/dependencias/:entidad/:id
 *   2. Si puedeEliminar=true → muestra descripción de eliminación lógica + botón Eliminar
 *   3. Si puedeEliminar=false → muestra bloqueo con lista de dependencias + solo botón Cerrar
 *   4. El botón Eliminar llama onConfirmar y cierra el modal
 */
import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDependencias, type DependenciasResult } from "@/hooks/useDependencias";

/* ─── Mapeo de claves de dependencias a etiquetas legibles ─── */
const ETIQUETAS_DEPENDENCIA: Record<string, string> = {
  movimientos: "Movimientos de stock",
  detalleDocumentos: "Líneas en documentos",
  detalleRequerimientos: "Líneas en requerimientos",
  stockDisponible: "Stock disponible",
  documentos: "Documentos",
  precios: "Registros de precio",
  vehiculos: "Vehículos",
  requerimientos: "Requerimientos",
};

/** Devuelve los pares [etiqueta, valor] de dependencias con valor > 0 */
function dependenciasConDatos(
  deps: DependenciasResult
): Array<{ etiqueta: string; valor: number }> {
  return Object.entries(deps)
    .filter(([key, val]) => key !== "total" && key !== "puedeEliminar" && typeof val === "number" && val > 0)
    .map(([key, val]) => ({
      etiqueta: ETIQUETAS_DEPENDENCIA[key] ?? key,
      valor: val as number,
    }));
}

/* ─── Props ─── */
export interface DialogEliminarProps {
  /** Entidad válida para FnContarDependencias */
  entidad: string;
  /** UUID de la entidad a eliminar */
  id: string | null | undefined;
  /** Texto legible para mostrar en el modal (nombre, placa, etc.) */
  nombre: string;
  /** Callback que ejecuta la eliminación real (debe lanzar error si falla) */
  onConfirmar: () => Promise<void>;
  /** Controla la visibilidad del modal */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DialogEliminar({
  entidad,
  id,
  nombre,
  onConfirmar,
  open,
  onOpenChange,
}: DialogEliminarProps) {
  const { data: deps, isLoading, isError } = useDependencias(entidad, id, open);

  /* ─── Estado: cargando ─── */
  if (isLoading || (!deps && !isError && open)) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Verificando dependencias...</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Consultando datos enlazados a &quot;{nombre}&quot;...
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  /* ─── Estado: error al consultar ─── */
  if (isError || !deps) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>No se pudo verificar</AlertDialogTitle>
            <AlertDialogDescription>
              Ocurrió un error al consultar las dependencias. Intenta nuevamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cerrar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  /* ─── Estado: bloqueado por dependencias ─── */
  if (!deps.puedeEliminar) {
    const items = dependenciasConDatos(deps);

    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              No se puede eliminar
            </AlertDialogTitle>
            <AlertDialogDescription>
              &quot;{nombre}&quot; tiene datos enlazados que impiden su eliminación.
              Para eliminarlo, primero anula o reasigna esos registros.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {items.length > 0 && (
            <ul className="rounded-md border bg-muted/50 px-4 py-3 space-y-1 text-sm">
              {items.map(({ etiqueta, valor }) => (
                <li key={etiqueta} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{etiqueta}</span>
                  <span className="font-semibold tabular-nums">{valor}</span>
                </li>
              ))}
              <li className="flex items-center justify-between border-t pt-1 font-semibold">
                <span>Total</span>
                <span>{deps.total}</span>
              </li>
            </ul>
          )}
          <AlertDialogFooter>
            {/* Solo botón Cerrar — no se puede confirmar la eliminación */}
            <AlertDialogCancel>Entendido</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  /* ─── Estado: puede eliminar ─── */
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            ¿Eliminar?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Esto desactivará &quot;{nombre}&quot; (eliminación lógica: el registro
            deja de estar disponible pero se conserva para auditoría). ¿Confirmas?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={async (e) => {
              // Prevenimos el cierre automático de AlertDialogAction
              // para poder controlar si cerrar o no según el resultado
              e.preventDefault();
              try {
                await onConfirmar();
                onOpenChange(false);
              } catch {
                // onConfirmar ya mostró el toast de error; dejamos el modal abierto
              }
            }}
          >
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

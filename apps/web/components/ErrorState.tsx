"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  titulo?: string;
  descripcion?: string;
  /** Conectar al refetch() de useQuery. */
  onReintentar?: () => void;
  /** Altura reducida para tiles de gráficos/cards. */
  compacto?: boolean;
  className?: string;
}

/**
 * Estado de error de carga estándar (espejo visual de EmptyState).
 * Toda página/tile con useQuery debe renderizarlo en la rama isError.
 */
export function ErrorState({
  titulo = "No se pudo cargar la información",
  descripcion = "Ocurrió un error de conexión o del servidor.",
  onReintentar,
  compacto = false,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        compacto ? "py-8" : "py-16",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-destructive/10",
          compacto ? "h-10 w-10" : "h-16 w-16",
        )}
      >
        <AlertTriangle className={cn("text-destructive", compacto ? "h-5 w-5" : "h-8 w-8")} />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{titulo}</p>
        {!compacto && descripcion && (
          <p className="max-w-xs text-sm text-muted-foreground">{descripcion}</p>
        )}
      </div>
      {onReintentar && (
        <Button variant="outline" size="sm" onClick={onReintentar}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Reintentar
        </Button>
      )}
    </div>
  );
}

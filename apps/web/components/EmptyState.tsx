import * as React from "react";
import type { LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: React.ComponentType<LucideProps>;
  titulo: string;
  descripcion?: string;
  accion?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  titulo,
  descripcion,
  accion,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-16 text-center",
        className
      )}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{titulo}</p>
        {descripcion && (
          <p className="text-sm text-muted-foreground max-w-xs">{descripcion}</p>
        )}
      </div>
      {accion && <div>{accion}</div>}
    </div>
  );
}

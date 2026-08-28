"use client";

import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { porcentaje } from "@/lib/format";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  titulo: string;
  valor: string | number;
  icono: LucideIcon;
  descripcion?: string;
  /** Delta vs período anterior. positivoEsBueno=false invierte el color (ej. bajo mínimo). */
  delta?: { porcentaje: number; positivoEsBueno?: boolean };
  tono?: "default" | "warning" | "success" | "destructive";
  sparkline?: number[];
  /** Tile grande (valor text-4xl) para el KPI principal. */
  hero?: boolean;
  cargando?: boolean;
  className?: string;
}

const TONO_ICONO: Record<NonNullable<KpiCardProps["tono"]>, string> = {
  default: "text-muted-foreground",
  warning: "text-warning",
  success: "text-success",
  destructive: "text-destructive",
};

const TONO_VALOR: Record<NonNullable<KpiCardProps["tono"]>, string> = {
  default: "",
  warning: "text-warning",
  success: "text-success",
  destructive: "text-destructive",
};

function Delta({ porcentaje: pct, positivoEsBueno = true }: NonNullable<KpiCardProps["delta"]>) {
  if (!isFinite(pct) || pct === 0) {
    return <span className="text-xs text-muted-foreground">Sin cambio</span>;
  }
  const sube = pct > 0;
  const esBueno = sube === positivoEsBueno;
  const Icono = sube ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        esBueno ? "text-success" : "text-destructive",
      )}
    >
      <Icono className="h-3.5 w-3.5" />
      {porcentaje(Math.abs(pct))}
    </span>
  );
}

export function KpiCard({
  titulo,
  valor,
  icono: Icono,
  descripcion,
  delta,
  tono = "default",
  sparkline,
  hero = false,
  cargando = false,
  className,
}: KpiCardProps) {
  return (
    <Card className={cn("flex flex-col", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
        <Icono className={cn("h-4 w-4", TONO_ICONO[tono])} />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-2">
        <div>
          {cargando ? (
            <Skeleton className={hero ? "h-10 w-32" : "h-8 w-20"} />
          ) : (
            <div className={cn("font-bold", hero ? "text-4xl" : "text-2xl", TONO_VALOR[tono])}>
              {valor}
            </div>
          )}
          <div className="mt-1 flex items-center gap-2">
            {delta && !cargando && <Delta {...delta} />}
            {descripcion && <p className="text-xs text-muted-foreground">{descripcion}</p>}
          </div>
        </div>
        {hero && sparkline && sparkline.length > 1 && !cargando && <Sparkline datos={sparkline} />}
      </CardContent>
    </Card>
  );
}

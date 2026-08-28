import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  titulo: string;
  descripcion?: string;
  /** Botones a la derecha (ej. "Nuevo cargo"). En mobile caen debajo. */
  acciones?: React.ReactNode;
  /** Migas opcionales (ej. Maestros > Cargos). Sin href = miga actual. */
  breadcrumbs?: { label: string; href?: string }[];
  className?: string;
}

/** Header estándar de página. Único dueño del patrón h1 text-2xl font-bold. */
export function PageHeader({
  titulo,
  descripcion,
  acciones,
  breadcrumbs,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav
          aria-label="Migas de pan"
          className="flex items-center gap-1 text-sm text-muted-foreground"
        >
          {breadcrumbs.map((miga, i) => (
            <React.Fragment key={`${miga.label}-${i}`}>
              {i > 0 && <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
              {miga.href ? (
                <Link href={miga.href} className="transition-colors hover:text-foreground">
                  {miga.label}
                </Link>
              ) : (
                <span aria-current="page" className="text-foreground">
                  {miga.label}
                </span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
          {descripcion && <p className="text-muted-foreground">{descripcion}</p>}
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
      </div>
    </div>
  );
}

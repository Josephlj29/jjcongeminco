"use client";

import Link from "next/link";
import {
  ArrowLeftRight,
  ClipboardList,
  Hammer,
  Package,
  ClipboardCheck,
  BarChart2,
  type LucideIcon,
} from "lucide-react";
import { MODULOS, puedeVerModulo, type ModuloCode } from "@congeminco/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useYo } from "@/hooks/useYo";

interface Acceso {
  href: string;
  label: string;
  icono: LucideIcon;
  modulo: ModuloCode;
}

const ACCESOS: Acceso[] = [
  {
    href: "/movimientos",
    label: "Nuevo movimiento",
    icono: ArrowLeftRight,
    modulo: MODULOS.MOVIMIENTOS,
  },
  {
    href: "/requerimientos",
    label: "Requerimiento",
    icono: ClipboardList,
    modulo: MODULOS.REQUERIMIENTOS,
  },
  {
    href: "/mantenimiento",
    label: "Orden de trabajo",
    icono: Hammer,
    modulo: MODULOS.MANTENIMIENTO,
  },
  {
    href: "/aprobaciones",
    label: "Aprobaciones",
    icono: ClipboardCheck,
    modulo: MODULOS.APROBACIONES,
  },
  { href: "/productos", label: "Catálogo", icono: Package, modulo: MODULOS.CATALOGO },
  { href: "/reportes", label: "Reportes", icono: BarChart2, modulo: MODULOS.REPORTES },
];

export function AccesosRapidos({ className }: { className?: string }) {
  const { data: yo } = useYo();
  const visibles = ACCESOS.filter((a) => puedeVerModulo(yo?.modulos, a.modulo));
  if (!visibles.length) return null;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Accesos rápidos</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        {visibles.map((a) => {
          const Icono = a.icono;
          return (
            <Link
              key={a.href}
              href={a.href}
              className="flex items-center gap-2 rounded-md border p-3 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <Icono className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{a.label}</span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

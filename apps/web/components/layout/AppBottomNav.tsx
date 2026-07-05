"use client";

/**
 * components/layout/AppBottomNav.tsx
 *
 * Barra de navegación inferior — SOLO móvil (`md:hidden`). Da acceso con el
 * pulgar a los módulos de campo (los más usados en celular) y un botón "Más"
 * que abre el nav completo en un Sheet (reutiliza AppSidebarContent).
 *
 * El desktop sigue usando AppSidebar; esta barra no se renderiza ahí.
 * Cada acceso respeta el gating por rol (puedeVerModulo), igual que el sidebar.
 */
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  ClipboardList,
  Hammer,
  ClipboardCheck,
  Menu,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AppSidebarContent } from "@/components/layout/AppSidebar";
import { cn } from "@/lib/utils";
import { puedeVerModulo, MODULOS, type ModuloCode, type RoleCode } from "@congeminco/shared";

interface UsuarioProps {
  id: string;
  email: string | null;
  nombreCompleto: string | null;
  rol: RoleCode;
  modulos: string[];
}

interface FieldItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  modulo: ModuloCode;
}

/* Módulos de campo — orden por frecuencia de uso en celular. */
const FIELD_ITEMS: FieldItem[] = [
  { href: "/saldos", label: "Saldos", icon: Boxes, modulo: MODULOS.SALDOS },
  { href: "/requerimientos", label: "Req.", icon: ClipboardList, modulo: MODULOS.REQUERIMIENTOS },
  { href: "/mantenimiento", label: "OT", icon: Hammer, modulo: MODULOS.MANTENIMIENTO },
  { href: "/aprobaciones", label: "Aprob.", icon: ClipboardCheck, modulo: MODULOS.APROBACIONES },
];

function BottomLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-md py-1 text-[11px] font-medium transition-colors",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

export function AppBottomNav({ usuario }: { usuario: UsuarioProps }) {
  const pathname = usePathname();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const items = FIELD_ITEMS.filter((item) => puedeVerModulo(usuario.modulos, item.modulo));

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-stretch border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-1 pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Navegación de campo"
    >
      {items.map((item) => (
        <BottomLink
          key={item.href}
          href={item.href}
          label={item.label}
          icon={item.icon}
          active={pathname.startsWith(item.href)}
        />
      ))}

      {/* "Más": abre el nav completo en un Sheet */}
      <Sheet open={menuAbierto} onOpenChange={setMenuAbierto}>
        <SheetTrigger
          className="flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-md py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Más opciones"
        >
          <Menu className="h-5 w-5 shrink-0" />
          <span>Más</span>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <AppSidebarContent usuario={usuario} collapsed={false} />
        </SheetContent>
      </Sheet>
    </nav>
  );
}

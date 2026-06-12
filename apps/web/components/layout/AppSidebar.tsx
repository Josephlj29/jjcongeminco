"use client";

/**
 * components/layout/AppSidebar.tsx
 *
 * Sidebar de navegación. Client Component porque usa usePathname y estado local.
 *
 * Exporta:
 * - AppSidebar: aside completo con lógica de colapso (para desktop)
 * - AppSidebarContent: contenido puro del nav (para el Sheet mobile, siempre expandido)
 *
 * Recibe los datos del usuario como prop desde el Server Component padre
 * (app/(app)/layout.tsx), siguiendo el patrón container/presentational.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  Upload,
  ClipboardList,
  BarChart2,
  BookOpen,
  Truck,
  Warehouse,
  Wrench,
  Car,
  Boxes,
  Tags,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import type { RoleCode } from "@congeminco/shared";

interface UsuarioProps {
  id: string;
  email: string | null;
  nombreCompleto: string | null;
  rol: RoleCode;
}

interface Props {
  usuario: UsuarioProps;
}

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/saldos", label: "Saldos", icon: Boxes, exact: false },
  { href: "/productos", label: "Catálogo", icon: Package, exact: false },
  { href: "/movimientos", label: "Movimientos", icon: ArrowLeftRight, exact: false },
  { href: "/requerimientos", label: "Requerimientos", icon: ClipboardList, exact: false },
  { href: "/reportes", label: "Reportes", icon: BarChart2, exact: false },
  { href: "/importar", label: "Importar", icon: Upload, exact: false },
];

const MAESTROS_ITEMS = [
  { href: "/maestros/proveedores", label: "Proveedores", icon: Truck, exact: false },
  { href: "/maestros/almacenes", label: "Almacenes", icon: Warehouse, exact: false },
  { href: "/maestros/equipos", label: "Equipos", icon: Wrench, exact: false },
  { href: "/maestros/vehiculos", label: "Vehículos", icon: Car, exact: false },
  { href: "/maestros/tipos-equipo", label: "Tipos de equipo", icon: Tags, exact: false },
];

/** Enlace de nav individual — soporta modo colapsado con tooltip */
function NavLink({
  href,
  label,
  icon: Icon,
  exact,
  collapsed,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact: boolean;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname.startsWith(href);

  const linkClass = cn(
    "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
    collapsed ? "justify-center gap-0 w-10 h-10 px-0" : "gap-3",
    isActive
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link href={href} className={linkClass} aria-label={label}>
            <Icon className="h-4 w-4 shrink-0" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" className="ml-1">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link href={href} className={linkClass}>
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}

/** Contenido puro del sidebar — usado tanto en AppSidebar (desktop) como en Sheet (mobile) */
export function AppSidebarContent({
  usuario: _usuario,
  collapsed,
}: {
  usuario: UsuarioProps;
  collapsed: boolean;
}) {
  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
        {/* Logo / Título */}
        <div
          className={cn(
            "flex items-center gap-2 px-4 py-5",
            collapsed && "justify-center px-0"
          )}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold text-sm">
            JJ
          </div>
          {!collapsed && (
            <span className="font-semibold text-sm leading-tight">
              Congeminco
              <br />
              <span className="text-xs font-normal text-sidebar-foreground/60">
                Inventario
              </span>
            </span>
          )}
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Navegación */}
        <nav
          className={cn(
            "flex-1 overflow-y-auto py-4 space-y-1",
            collapsed ? "px-2 flex flex-col items-center" : "px-3"
          )}
        >
          {NAV_ITEMS.map(({ href, label, icon, exact }) => (
            <NavLink
              key={href}
              href={href}
              label={label}
              icon={icon}
              exact={exact}
              collapsed={collapsed}
            />
          ))}

          {/* Grupo Maestros */}
          <div className={cn("pt-4", collapsed && "w-full flex flex-col items-center")}>
            {!collapsed && (
              <div className="flex items-center gap-2 px-3 pb-1">
                <BookOpen className="h-3.5 w-3.5 text-sidebar-foreground/40" />
                <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                  Maestros
                </span>
              </div>
            )}
            {collapsed && (
              <Separator className="bg-sidebar-border mb-2 w-6" />
            )}
            {MAESTROS_ITEMS.map(({ href, label, icon, exact }) => (
              <NavLink
                key={href}
                href={href}
                label={label}
                icon={icon}
                exact={exact}
                collapsed={collapsed}
              />
            ))}
          </div>
        </nav>
      </div>
    </TooltipProvider>
  );
}

/** Sidebar de escritorio con lógica de colapso */
export function AppSidebar({ usuario }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  // Evitar hydration mismatch: leer localStorage solo en el cliente
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (stored === "true") setCollapsed(true);
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  };

  // Durante SSR y primer render de cliente usamos el estado inicial (collapsed=false)
  // para evitar hydration mismatch. mounted controla si el botón toggle es visible.

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col h-screen border-r border-sidebar-border bg-sidebar transition-all duration-300",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex-1 overflow-hidden">
        <AppSidebarContent usuario={usuario} collapsed={mounted ? collapsed : false} />
      </div>

      {/* Botón colapsar */}
      <div className={cn("px-3 py-3 border-t border-sidebar-border", collapsed && "px-2 flex justify-center")}>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCollapsed}
          className="h-8 w-8 text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
          aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </aside>
  );
}

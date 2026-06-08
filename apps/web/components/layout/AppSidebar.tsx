"use client";

/**
 * components/layout/AppSidebar.tsx
 *
 * Sidebar de navegación. Client Component porque usa usePathname y llama
 * a signOut (operación asíncrona del cliente).
 *
 * Recibe los datos del usuario como prop desde el Server Component padre
 * (app/(app)/layout.tsx), siguiendo el patrón container/presentational.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  Upload,
  LogOut,
  ClipboardList,
  BarChart2,
  BookOpen,
  Truck,
  Warehouse,
  Wrench,
  Car,
} from "lucide-react";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RoleCode } from "@congeminco/shared";

interface Props {
  usuario: {
    id: string;
    email: string | null;
    nombreCompleto: string | null;
    rol: RoleCode;
  };
}

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
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
];

export function AppSidebar({ usuario }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = crearClienteNavegador();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <aside className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Logo / Título */}
      <div className="flex items-center gap-2 px-6 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold text-sm">
          JJ
        </div>
        <span className="font-semibold text-sm leading-tight">
          Congeminco
          <br />
          <span className="text-xs font-normal text-sidebar-foreground/60">
            Inventario
          </span>
        </span>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Navegación */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
          const isActive = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}

        {/* Grupo Maestros */}
        <div className="pt-4">
          <div className="flex items-center gap-2 px-3 pb-1">
            <BookOpen className="h-3.5 w-3.5 text-sidebar-foreground/40" />
            <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40">
              Maestros
            </span>
          </div>
          {MAESTROS_ITEMS.map(({ href, label, icon: Icon, exact }) => {
            const isActive = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* Usuario + logout */}
      <div className="px-4 py-4 space-y-2">
        <div className="px-2">
          <p className="text-xs font-medium text-sidebar-foreground truncate">
            {usuario.nombreCompleto ?? usuario.email ?? "—"}
          </p>
          <p className="text-xs text-sidebar-foreground/50 capitalize">
            {usuario.rol}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
          onClick={() => void handleSignOut()}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Cerrar sesión
        </Button>
      </div>
    </aside>
  );
}

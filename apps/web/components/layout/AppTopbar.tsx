"use client";

/**
 * components/layout/AppTopbar.tsx
 *
 * Barra superior sticky. Contiene:
 * - Izquierda: botón hamburguesa (solo mobile) que abre Sheet con el sidebar + Breadcrumb
 * - Derecha: toggle de tema + menú de usuario
 *
 * Client Component: usa usePathname, useTheme, Sheet, DropdownMenu.
 */
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Menu, Sun, Moon, Monitor, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AppSidebarContent } from "@/components/layout/AppSidebar";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { RoleCode } from "@congeminco/shared";

/** Mapa de segmentos de ruta a labels legibles */
const ROUTE_LABELS: Record<string, string> = {
  "/": "Dashboard",
  "/productos": "Catálogo",
  "/movimientos": "Movimientos",
  "/requerimientos": "Requerimientos",
  "/mantenimiento": "Mantenimiento",
  "/reportes": "Reportes",
  "/importar": "Importar",
  "/saldos": "Saldos",
  "/maestros": "Maestros",
  "/maestros/proveedores": "Proveedores",
  "/maestros/almacenes": "Almacenes",
  "/maestros/equipos": "Equipos",
  "/maestros/vehiculos": "Vehículos",
  "/maestros/tipos-equipo": "Tipos de equipo",
};

interface Crumb {
  href: string;
  label: string;
}

function useBreadcrumbs(): Crumb[] {
  const pathname = usePathname();

  if (pathname === "/") {
    return [{ href: "/", label: "Dashboard" }];
  }

  const crumbs: Crumb[] = [{ href: "/", label: "Dashboard" }];
  const segments = pathname.split("/").filter(Boolean);
  let accumulated = "";

  for (const segment of segments) {
    accumulated += `/${segment}`;
    const label = ROUTE_LABELS[accumulated] ?? segment;
    crumbs.push({ href: accumulated, label });
  }

  return crumbs;
}

function getInitials(nombreCompleto: string | null, email: string | null): string {
  if (nombreCompleto) {
    const partes = nombreCompleto.trim().split(/\s+/);
    if (partes.length >= 2) {
      return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
    }
    return nombreCompleto.slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "??";
}

interface AppTopbarProps {
  usuario: {
    id: string;
    email: string | null;
    nombreCompleto: string | null;
    rol: RoleCode;
  };
}

export function AppTopbar({ usuario }: AppTopbarProps) {
  const crumbs = useBreadcrumbs();
  const { setTheme } = useTheme();
  const router = useRouter();
  const initials = getInitials(usuario.nombreCompleto, usuario.email);

  const handleSignOut = async () => {
    const supabase = crearClienteNavegador();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4">
      {/* Hamburguesa — solo mobile */}
      <Sheet>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-72">
          <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
          <AppSidebarContent usuario={usuario} collapsed={false} />
        </SheetContent>
      </Sheet>

      {/* Breadcrumb */}
      <div className="flex-1 min-w-0">
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1;
              return (
                <BreadcrumbItem key={crumb.href}>
                  {isLast ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : (
                    <>
                      <BreadcrumbLink asChild>
                        <Link href={crumb.href}>{crumb.label}</Link>
                      </BreadcrumbLink>
                      <BreadcrumbSeparator />
                    </>
                  )}
                </BreadcrumbItem>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Acciones del lado derecho */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Toggle de tema */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Cambiar tema">
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setTheme("light")}>
              <Sun className="mr-2 h-4 w-4" />
              Claro
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              <Moon className="mr-2 h-4 w-4" />
              Oscuro
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              <Monitor className="mr-2 h-4 w-4" />
              Sistema
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Menú de usuario */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Menú de usuario">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium leading-none">
                  {usuario.nombreCompleto ?? "—"}
                </p>
                <p className="text-xs leading-none text-muted-foreground">
                  {usuario.email ?? "—"}
                </p>
                <p className="text-xs leading-none text-muted-foreground capitalize mt-0.5">
                  {usuario.rol}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => void handleSignOut()}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

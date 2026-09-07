/**
 * app/(app)/layout.tsx — Layout protegido
 *
 * Server Component que verifica la sesión server-side.
 * Si no hay sesión, redirige a /login.
 *
 * Estructura:
 *   flex flex-col h-dvh
 *   ├── AppTopbar (sticky, h-14)
 *   └── div flex flex-1 overflow-hidden
 *       ├── AppSidebar (hidden hasta lg; en < lg navegan AppTopbar hamburger + AppBottomNav)
 *       └── main (scrollable, contenido de página)
 */
import { redirect } from "next/navigation";
import { obtenerUsuario } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";
import { AppBottomNav } from "@/components/layout/AppBottomNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Verificación server-side de la sesión
  let usuario;
  try {
    usuario = await obtenerUsuario();
  } catch {
    redirect("/login");
  }

  return (
    <div className="flex h-dvh flex-col">
      <AppTopbar usuario={usuario} />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar usuario={usuario} />
        <main className="flex-1 overflow-y-auto bg-background">
          {/* pb-24 solo hasta lg: el bottom-nav fijo (lg:hidden) no debe tapar el contenido. Techo de 100rem: en 1440 llena, en 1920+ centra con gutter. */}
          <div className="mx-auto w-full max-w-[100rem] px-4 pb-24 pt-6 sm:px-6 md:pt-8 lg:pb-8 xl:px-8">
            {children}
          </div>
        </main>
      </div>
      <AppBottomNav usuario={usuario} />
    </div>
  );
}

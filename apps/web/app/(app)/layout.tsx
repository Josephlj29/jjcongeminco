/**
 * app/(app)/layout.tsx — Layout protegido
 *
 * Server Component que verifica la sesión server-side.
 * Si no hay sesión, redirige a /login.
 *
 * Estructura:
 *   flex flex-col h-screen
 *   ├── AppTopbar (sticky, h-14)
 *   └── div flex flex-1 overflow-hidden
 *       ├── AppSidebar (hidden en mobile, visible en md+)
 *       └── main (scrollable, contenido de página)
 */
import { redirect } from "next/navigation";
import { obtenerUsuario } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppTopbar } from "@/components/layout/AppTopbar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Verificación server-side de la sesión
  let usuario;
  try {
    usuario = await obtenerUsuario();
  } catch {
    redirect("/login");
  }

  return (
    <div className="flex flex-col h-screen">
      <AppTopbar usuario={usuario} />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar usuario={usuario} />
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="container mx-auto px-6 py-8 max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

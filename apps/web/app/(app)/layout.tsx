/**
 * app/(app)/layout.tsx — Layout protegido
 *
 * Server Component que verifica la sesión server-side.
 * Si no hay sesión, redirige a /login.
 * Si hay sesión, renderiza el sidebar con nombre y rol del usuario.
 */
import { redirect } from "next/navigation";
import { obtenerUsuario } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/layout/AppSidebar";

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
    <div className="flex h-screen overflow-hidden">
      <AppSidebar usuario={usuario} />
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="container mx-auto px-6 py-8 max-w-7xl">{children}</div>
      </main>
    </div>
  );
}

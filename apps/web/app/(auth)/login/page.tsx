"use client";

/**
 * app/(auth)/login/page.tsx
 *
 * Página de login con Supabase Auth (email + password).
 * Client Component porque usa estado y el cliente de navegador.
 * Si ya hay sesión activa, redirige a / (manejado por el layout protegido).
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertCircle } from "lucide-react";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const LoginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres"),
});
type LoginForm = z.infer<typeof LoginSchema>;

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(LoginSchema) });

  const onSubmit = async (data: LoginForm) => {
    setError(null);
    const supabase = crearClienteNavegador();

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (authError) {
      setError(authError.message);
      return;
    }

    // Navegación dura: garantiza que el servidor lea la cookie de sesión recién escrita
    window.location.assign("/");
  };

  return (
    <div
      className={cn(
        "min-h-screen flex items-center justify-center px-4",
        "bg-gradient-to-br from-background via-muted/30 to-muted/60"
      )}
    >
      <div className="w-full max-w-sm">
        {/* Logo flotante encima de la card */}
        <div className="flex justify-center mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-xl shadow-lg shadow-primary/30">
            JJ
          </div>
        </div>

        <Card className="shadow-xl border-border/50">
          <CardHeader className="space-y-1 text-center pb-4">
            <CardTitle className="text-2xl font-bold tracking-tight">
              Bienvenido
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Sistema de inventario — JJ Congeminco
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@empresa.com"
                  autoComplete="email"
                  className={cn(errors.email && "border-destructive focus-visible:ring-destructive")}
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className={cn(errors.password && "border-destructive focus-visible:ring-destructive")}
                  {...register("password")}
                />
                {errors.password && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.password.message}
                  </p>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <p className="text-sm text-destructive leading-snug">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full font-semibold"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Ingresando..." : "Ingresar"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          JJ Congeminco © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

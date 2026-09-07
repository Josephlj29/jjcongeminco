/**
 * app/layout.tsx — Root Layout
 *
 * Monta los providers (TanStack Query) y el Toaster de Sonner.
 * No contiene lógica de autenticación — eso vive en app/(app)/layout.tsx.
 */
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Congeminco — Inventario",
  description: "Sistema de inventario JJ Congeminco",
  // Icono del acceso directo: Android toma el manifest; iOS, el apple-touch-icon.
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Congeminco",
    statusBarStyle: "default",
  },
};

/**
 * viewport-fit=cover habilita env(safe-area-inset-*) en iPhone con notch
 * (lo usa AppBottomNav). themeColor pinta la barra del navegador del color
 * de --background en cada tema.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#11151c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Las variables de fuente van en <html>: preflight de Tailwind aplica font-family ahí y
  // una var() indefinida invalida toda la declaración (caía a serif).
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body className="antialiased">
        <Providers>
          {children}
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  );
}

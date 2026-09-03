import type { MetadataRoute } from "next";

/**
 * Web App Manifest (convención de Next): habilita "Agregar a pantalla de
 * inicio" con el logo de la empresa como icono del acceso directo (Android
 * usa estos iconos; iOS usa el apple-touch-icon declarado en el layout).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Congeminco — Inventario",
    short_name: "Congeminco",
    description: "Sistema de inventario JJ Congeminco",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ea580c",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

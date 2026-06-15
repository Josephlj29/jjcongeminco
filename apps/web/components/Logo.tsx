import { cn } from "@/lib/utils";

/**
 * Logo de JJ Congeminco (SVG sin fondo, en /public/logo.svg).
 * Es una imagen estática; el color sale del propio SVG (no hereda currentColor).
 * Pensado para fondos claros (su gris y los huecos de las letras son claros).
 */
export function Logo({
  className,
  alt = "JJ Congeminco",
}: {
  className?: string;
  alt?: string;
}) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/logo.svg" alt={alt} className={cn("select-none", className)} />;
}

/**
 * components/ui/dialog.tsx — Dialog del sistema (Radix + shadcn adaptado).
 *
 * Modelo de layout: columna flex con header y footer FIJOS y un único scroll
 * vertical en <DialogBody>. El ancho lo decide la prop `size` y escala con el
 * viewport (lg/xl/2xl) para que en PC el modal aproveche la pantalla; en
 * celular todos ocupan el ancho menos 1rem por lado y nunca superan el alto
 * visible (dvh).
 *
 *   <DialogContent size="lg">
 *     <DialogHeader>…</DialogHeader>
 *     <DialogBody>…contenido que puede crecer…</DialogBody>
 *     <DialogFooter>…acciones…</DialogFooter>
 *   </DialogContent>
 *
 * Con formulario: <form className="flex min-h-0 flex-1 flex-col"> envuelve
 * DialogBody + DialogFooter para que el submit siga dentro del form.
 *
 * Regla del proyecto: NO pasar max-w-*, max-h-* ni overflow-* por className
 * (lo protege lib/responsive-guardrails.test.ts). Elegir `size` por contenido:
 *   sm   confirmaciones, 1-2 campos            md   formularios simples (default)
 *   lg   formularios con tabla o filas          xl   editores complejos (OT, kardex)
 *   full visores de imagen
 *
 * DialogBody es un `@container`: los grids internos usan `@md:grid-cols-2`
 * (ancho del dialog), no `md:` (ancho del viewport).
 */
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/** Compartido con AlertDialogContent para que ambos midan igual. */
export const dialogContentVariants = cva(
  "fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-background shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
  {
    variants: {
      size: {
        sm: "sm:max-w-md",
        md: "sm:max-w-lg lg:max-w-xl",
        lg: "sm:max-w-xl lg:max-w-3xl xl:max-w-4xl",
        xl: "sm:max-w-2xl lg:max-w-4xl xl:max-w-5xl 2xl:max-w-6xl",
        full: "sm:max-w-[min(96vw,1400px)]",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export type DialogSize = NonNullable<VariantProps<typeof dialogContentVariants>["size"]>;

/** Botón X: 36px de área táctil, arriba a la derecha, sobre el header. */
export const dialogCloseClassName =
  "absolute right-2 top-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-md opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground sm:right-3 sm:top-3";

/** Padding común de header/body/footer. El header deja lugar al botón X. */
export const dialogHeaderClassName =
  "flex shrink-0 flex-col gap-1.5 px-4 pb-3 pr-12 pt-4 text-left sm:px-6 sm:pr-14 sm:pt-6";
export const dialogBodyClassName =
  "@container min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-2 sm:px-6 sm:pb-6";
export const dialogFooterClassName =
  "flex shrink-0 flex-col-reverse gap-2 px-4 pb-4 sm:flex-row sm:justify-end sm:px-6 sm:pb-6 [&>button]:w-full sm:[&>button]:w-auto";

interface DialogContentProps
  extends
    React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof dialogContentVariants> {}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, size, children, onOpenAutoFocus, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(dialogContentVariants({ size }), className)}
      onOpenAutoFocus={(e) => {
        onOpenAutoFocus?.(e);
        // Algún hijo (ej. cmdk) hace scrollIntoView al montar y deja el body
        // scrolleado en celular: el dialog siempre abre desde arriba.
        const contenido = e.currentTarget as HTMLElement | null;
        requestAnimationFrame(() => {
          contenido?.querySelector<HTMLElement>("[data-dialog-body]")?.scrollTo({ top: 0 });
        });
      }}
      {...props}
    >
      {children}
      {/* Después de children: el foco inicial cae en el primer campo, no en la X */}
      <DialogClose className={dialogCloseClassName}>
        <X className="h-4 w-4" />
        <span className="sr-only">Cerrar</span>
      </DialogClose>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn(dialogHeaderClassName, className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

/** Único scroll vertical del dialog y raíz de container queries (`@md:`…). */
const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div data-dialog-body="" className={cn(dialogBodyClassName, className)} {...props} />
);
DialogBody.displayName = "DialogBody";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn(dialogFooterClassName, className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};

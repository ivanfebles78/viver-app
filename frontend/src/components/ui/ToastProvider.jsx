import { useCallback, useMemo, useState } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";

import { Button, cn } from "../../ui";
import { ToastContext } from "./toast-context";

/**
 * AVISOS EFÍMEROS (TOAST).
 *
 * El sistema de diseño especifica el componente —`--toast-radius`,
 * `--toast-shadow`, `--toast-width`, `--toast-duration` existen en los
 * tokens— pero el paquete todavía no lo publica. Se construye aquí contra esa
 * especificación, sobre Radix Toast, y es candidato a subir aguas arriba.
 *
 * Tres reglas del sistema que se cumplen de forma ESTRUCTURAL, no por
 * disciplina de quien lo use:
 *
 *   1. Un error NUNCA se auto-descarta. No se puede pedir lo contrario: el
 *      `duration` de un toast de error es `Infinity` y no hay prop para
 *      cambiarlo. Un mensaje de error que desaparece solo es un mensaje que
 *      alguien no llegó a leer.
 *   2. Los errores usan `role="alert"`; el resto, `role="status"`. Radix lo
 *      deriva de `type`, así que se fija por tono en lugar de dejarlo suelto.
 *   3. El auto-descarte se pausa al pasar el puntero y al recibir el foco
 *      (SC 2.2.1). Lo aporta Radix; aquí no se desactiva.
 *
 * El tono va siempre acompañado de icono y texto: el color nunca comunica solo.
 */

const TONOS = {
  success: { Icon: CheckCircle2, color: "text-[var(--status-success-fg)]" },
  warning: { Icon: AlertTriangle, color: "text-[var(--status-pending-fg)]" },
  error: { Icon: XCircle, color: "text-[var(--status-danger-fg)]" },
  info: { Icon: Info, color: "text-[var(--status-info-fg)]" },
};

export function ToastProvider({ children, duration = 6000 }) {
  const [avisos, setAvisos] = useState([]);

  const descartar = useCallback((id) => {
    setAvisos((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const emitir = useCallback((aviso) => {
    // `crypto.randomUUID` no está en todos los navegadores objetivo; un
    // contador monótono basta y no depende de la hora del sistema.
    const id = `t${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    setAvisos((prev) => [...prev, { ...aviso, id }]);
    return id;
  }, []);

  const api = useMemo(
    () => ({
      toast: emitir,
      success: (title, description) => emitir({ tone: "success", title, description }),
      info: (title, description) => emitir({ tone: "info", title, description }),
      warning: (title, description) => emitir({ tone: "warning", title, description }),
      /** Los errores persisten hasta que la persona los cierra. */
      error: (title, description) => emitir({ tone: "error", title, description }),
      dismiss: descartar,
    }),
    [emitir, descartar]
  );

  return (
    <ToastContext.Provider value={api}>
      <ToastPrimitive.Provider duration={duration} swipeDirection="right">
        {children}

        {avisos.map((a) => {
          const { Icon, color } = TONOS[a.tone] ?? TONOS.info;
          const esError = a.tone === "error";
          return (
            <ToastPrimitive.Root
              key={a.id}
              // `foreground` mapea a role="alert" en Radix; `background`, a
              // role="status".
              type={esError ? "foreground" : "background"}
              duration={esError ? Infinity : duration}
              onOpenChange={(abierto) => !abierto && descartar(a.id)}
              className={cn(
                "flex items-start gap-3 p-3",
                "rounded-[var(--toast-radius)] border border-border",
                "bg-popover text-popover-foreground shadow-[var(--toast-shadow)]",
                "data-[state=open]:animate-in data-[state=open]:fade-in-0",
                "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
                "motion-reduce:animate-none"
              )}
            >
              <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", color)} />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <ToastPrimitive.Title className="text-body-sm font-[var(--font-weight-semibold)]">
                  {a.title}
                </ToastPrimitive.Title>
                {a.description && (
                  <ToastPrimitive.Description className="text-body-sm text-muted-foreground">
                    {a.description}
                  </ToastPrimitive.Description>
                )}
              </div>
              <ToastPrimitive.Close asChild>
                <Button variant="ghost" size="icon-sm" label="Cerrar aviso" className="-my-1 -mr-1">
                  <X aria-hidden="true" className="size-4" />
                </Button>
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}

        <ToastPrimitive.Viewport
          className={cn(
            "fixed bottom-0 right-0 z-[var(--z-toast)] m-0 flex list-none flex-col gap-2 p-4",
            // A ancho completo en móvil, donde 380px se saldría de la pantalla.
            "w-full max-w-[min(var(--toast-width),calc(100vw-var(--space-8)))]",
            "outline-none"
          )}
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

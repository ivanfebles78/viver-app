import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";

import { Button, Skeleton, cn } from "../../ui";

/**
 * SISTEMA DE AVISOS EN LÍNEA.
 *
 * Cada pantalla tiene hoy su propio banner: `MessageBanner` en Pedidos,
 * Movimientos e Informes; `flashBox` en AdminUsuarios; recuadros sueltos en
 * Plataforma y Dashboard. Todos con colores en crudo, ninguno con icono y
 * ninguno anunciado a un lector de pantalla.
 *
 * Los cuatro tonos siguen la regla del sistema de diseño, que es también la
 * del encargo: verde = éxito, ámbar = advertencia, rojo = error, azul =
 * información. El tono NUNCA viaja solo: cada uno lleva icono y texto.
 */

const TONOS = {
  success: {
    Icon: CheckCircle2,
    clase: "bg-[var(--success-subtle)] border-[var(--success-subtle-border)] text-[var(--success-subtle-foreground)]",
  },
  warning: {
    Icon: AlertTriangle,
    clase: "bg-[var(--warning-subtle)] border-[var(--warning-subtle-border)] text-[var(--warning-subtle-foreground)]",
  },
  error: {
    Icon: XCircle,
    clase: "bg-[var(--destructive-subtle)] border-[var(--destructive-subtle-border)] text-[var(--destructive-subtle-foreground)]",
  },
  info: {
    Icon: Info,
    clase: "bg-[var(--info-subtle)] border-[var(--info-subtle-border)] text-[var(--info-subtle-foreground)]",
  },
};

/**
 * Aviso en línea, dentro del flujo de la página.
 *
 * `role` no es configurable por capricho: un error debe interrumpir
 * (`role="alert"`), y un éxito no (`role="status"`). Dejarlo a elección de
 * cada pantalla es cómo se acaba con errores que nadie oye y confirmaciones
 * que cortan lo que el usuario estaba leyendo.
 */
export function Alert({ tone = "info", title, children, onDismiss, dismissLabel = "Descartar aviso", className }) {
  const { Icon, clase } = TONOS[tone] ?? TONOS.info;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={cn("flex items-start gap-3 rounded-[var(--radius-lg)] border p-3", clase, className)}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title && <p className="text-body-sm font-[var(--font-weight-semibold)]">{title}</p>}
        {children && <div className="text-body-sm">{children}</div>}
      </div>
      {onDismiss && (
        <Button variant="ghost" size="icon-sm" label={dismissLabel} onClick={onDismiss} className="-my-1 -mr-1">
          <X aria-hidden="true" className="size-4" />
        </Button>
      )}
    </div>
  );
}

/**
 * Estado de carga.
 *
 * Esqueletos para contenido estructurado, que es lo que recomienda el sistema
 * de diseño: dicen QUÉ va a aparecer, mientras que un disco girando solo dice
 * "espera". El contenedor lleva `aria-busy` y el texto se anuncia una vez.
 */
export function LoadingState({ rows = 5, label = "Cargando…", className }) {
  return (
    <div aria-busy="true" className={cn("flex flex-col gap-2", className)}>
      <p className="sr-only" role="status">
        {label}
      </p>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 rounded-[var(--radius-md)]" />
      ))}
    </div>
  );
}

/**
 * Texto largo recortado, con el valor completo accesible.
 *
 * Recortar con `text-overflow` y no dejar forma de leer el resto es una
 * pérdida de información, no una decisión de maquetación. El valor íntegro
 * viaja en `title` (puntero) y en el propio contenido del elemento, así que un
 * lector de pantalla lee siempre el texto completo: el recorte es puramente
 * visual.
 */
export function Truncated({ children, className }) {
  const texto = typeof children === "string" ? children : undefined;
  return (
    <span title={texto} className={cn("block max-w-full truncate", className)}>
      {children}
    </span>
  );
}

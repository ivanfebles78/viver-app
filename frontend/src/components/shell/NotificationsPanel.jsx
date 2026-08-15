import { Bell, AlertTriangle, CircleAlert, Check } from "lucide-react";

import { Button, Sheet, SheetTrigger, SheetContent, Badge, EmptyState } from "../../ui";
import { notificationLabels as L } from "../../app/labels.es";

/**
 * Avisos del vivero: stock agotado y caducidades.
 *
 * Sustituye a la campana anterior, que era un botón de 62×62 con degradado,
 * radio 20, sombra de 34px y DOS animaciones infinitas simultáneas — la
 * campana rotando (`bellRing`) y el contador latiendo (`badgePulse`). El
 * sistema de diseño prohíbe la rotación decorativa y el escalado de entrada
 * por encima de 1.02, y ninguna de las dos respetaba `prefers-reduced-motion`.
 *
 * La señal de "hay algo sin leer" ahora la lleva un contador con etiqueta
 * textual, no el movimiento: se percibe igual de rápido, no marea a nadie y
 * sobrevive a `prefers-reduced-motion`.
 *
 * El panel es un `Sheet` de Radix, así que atrapa el foco, se cierra con
 * Escape y lo devuelve al disparador. El overlay anterior no hacía ninguna de
 * las tres cosas.
 */
export default function NotificationsPanel({ notifications, onMarkAsRead }) {
  const count = notifications.length;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon-sm" label={count > 0 ? L.unreadCount(count) : L.open}>
          <span className="relative inline-flex">
            <Bell aria-hidden="true" className="size-4" />
            {count > 0 && (
              // Punto indicador: el número exacto vive en el nombre accesible
              // del botón y en la cabecera del panel. Un dígito a 8px no se lee.
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[var(--status-danger-solid)] ring-2 ring-[var(--background)]"
              />
            )}
          </span>
        </Button>
      </SheetTrigger>

      <SheetContent side="right" title={L.title} closeLabel={L.close}>
        <div className="flex flex-col gap-3 p-4">
          {count > 0 && (
            <p className="text-body-sm text-muted-foreground">{L.unreadCount(count)}</p>
          )}

          {count === 0 ? (
            <EmptyState icon={Check} title={L.none} description={L.noneDescription} />
          ) : (
            <ul className="flex flex-col gap-2">
              {notifications.map((n) => {
                const high = n.severity === "high";
                const Icon = high ? AlertTriangle : CircleAlert;
                return (
                  <li
                    key={n.id}
                    className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-border bg-card p-3"
                  >
                    <div className="flex items-start gap-2.5">
                      <Icon
                        aria-hidden="true"
                        className={
                          high
                            ? "mt-0.5 size-4 shrink-0 text-[var(--status-danger-fg)]"
                            : "mt-0.5 size-4 shrink-0 text-[var(--status-pending-fg)]"
                        }
                      />
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* La severidad se comunica con icono + etiqueta, no
                              solo con color (WCAG 2.2 SC 1.4.1). */}
                          <Badge tone={high ? "danger" : "pending"}>
                            {high ? "Urgente" : "Atención"}
                          </Badge>
                        </div>
                        <p className="text-body-sm font-[var(--font-weight-medium)]">{n.title}</p>
                        {n.description && (
                          <p className="text-body-sm text-muted-foreground">{n.description}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="self-end"
                      onClick={() => onMarkAsRead(n.id)}
                    >
                      {L.markRead}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

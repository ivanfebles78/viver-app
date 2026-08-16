import { cn, Kpi, StatusBadge } from "../../ui";

/**
 * FILA DE INDICADORES.
 *
 * El sistema de diseño resolvió explícitamente esta tensión (§10, contradicción
 * C8 de la v1.0): los indicadores son superficies SIN borde y SIN sombra,
 * separadas por reglas y espacio — no tarjetas flotantes. Cuatro rectángulos
 * redondeados con sombra uno al lado del otro es justo el patrón que hace que
 * un panel parezca generado.
 *
 * Antes, cada métrica del panel era su propia tarjeta con radio 16 y sombra de
 * 24px. Aquí comparten una sola superficie y se separan con una línea de 1px.
 *
 * `Kpi` de DevCon8 no admite estado semántico, y no se toca el paquete
 * vendorizado para añadírselo: se compone al lado. El estado solo aparece
 * cuando SIGNIFICA algo — «2 productos por reponer» merece atención; «332
 * unidades en stock» no significa nada por sí solo, y teñirlo sería ruido.
 */

export function KpiRow({ children, className }) {
  return (
    <div
      className={cn(
        // Las reglas de separación son el borde del contenedor y los divisores
        // internos; ninguna celda tiene borde propio.
        "grid grid-cols-1 gap-px rounded-[var(--radius-lg)] border border-border bg-border",
        "sm:grid-cols-2 lg:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * Un indicador.
 *
 * @param {string}  label   Etiqueta corta.
 * @param {string}  value   Valor ya formateado según la configuración regional.
 * @param {string}  hint    Qué mide exactamente. No es decoración: sin esto,
 *                          "332" no dice si son unidades, lotes o productos.
 * @param {object}  status  { status, label } de `app/estado.js`, solo cuando el
 *                          valor exige una lectura semántica.
 */
export function KpiCell({ label, value, hint, status, className }) {
  return (
    <div className={cn("flex flex-col gap-2 bg-card p-[var(--card-padding)]", className)}>
      <Kpi label={label} value={value} />
      <div className="flex flex-wrap items-center gap-2">
        {hint && <span className="text-caption text-muted-foreground">{hint}</span>}
        {status && <StatusBadge status={status.status} label={status.label} />}
      </div>
    </div>
  );
}

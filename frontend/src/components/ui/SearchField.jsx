import { useId } from "react";
import { Search, X } from "lucide-react";

import { Button, cn } from "../../ui";

/**
 * CAMPO DE BÚSQUEDA.
 *
 * Seis pantallas de ViverApp tienen una caja de búsqueda, y las seis la
 * escriben a mano con un `placeholder` haciendo de etiqueta. Un placeholder
 * desaparece al escribir: quien vuelve al campo ya no sabe qué buscaba, y para
 * un lector de pantalla el campo no tiene nombre.
 *
 * Aquí la etiqueta existe siempre y se oculta a la vista con `hideLabel`
 * cuando el contexto ya la explica — que es lo que permite el sistema de
 * diseño, frente a no tenerla.
 *
 * No usa `Field` porque necesita el icono y el botón de limpiar DENTRO del
 * marco del control, y `Field` compone en vertical. Replica su contrato
 * accesible: label asociada por `htmlFor`/`id`.
 */
export default function SearchField({
  value,
  onChange,
  label = "Buscar",
  placeholder,
  hideLabel = true,
  /** Texto del botón de limpiar; también su nombre accesible. */
  clearLabel = "Limpiar la búsqueda",
  className,
  ...rest
}) {
  const reactId = useId();
  const id = "s" + reactId.replace(/:/g, "");
  const tieneValor = String(value ?? "").length > 0;

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label
        htmlFor={id}
        className={cn(
          "text-label font-[var(--font-weight-medium)] text-foreground",
          hideLabel && "sr-only"
        )}
      >
        {label}
      </label>

      <div className="relative flex items-center">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 size-4 text-[var(--input-placeholder)]"
        />
        <input
          id={id}
          type="search"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn(
            "h-[var(--input-height)] w-full min-w-0",
            "bg-[var(--input-background)] text-[var(--input-fg)]",
            "rounded-[var(--input-radius)] border border-[var(--input)]",
            // Espacio a la izquierda para el icono y a la derecha para el botón
            // de limpiar, para que el texto nunca quede debajo de ninguno.
            "pl-9 pr-9 text-body",
            "transition-colors duration-[var(--duration-fast)]",
            "placeholder:text-[var(--input-placeholder)]",
            "hover:border-[var(--input-border-hover)]",
            "outline-none focus-visible:outline-[length:var(--focus-ring-width)]",
            "focus-visible:outline-solid focus-visible:outline-ring",
            "focus-visible:outline-offset-[var(--focus-ring-offset)]",
            "focus-visible:border-[var(--input-border-focus)]",
            // El aspa nativa de Chrome duplicaría nuestro botón de limpiar.
            "[&::-webkit-search-cancel-button]:appearance-none"
          )}
          {...rest}
        />
        {tieneValor && (
          <Button
            variant="ghost"
            size="icon-sm"
            label={clearLabel}
            onClick={() => onChange("")}
            className="absolute right-1"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

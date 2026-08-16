import { Field, Select } from "../../ui";

/**
 * SELECTOR CON ETIQUETA Y OPCIÓN «TODOS».
 *
 * Existe por una restricción real de Radix: `Select.Item` **no admite
 * `value=""`**, porque la cadena vacía está reservada para «limpiar la
 * selección». Un filtro, en cambio, necesita justo eso: un valor neutro que
 * signifique «no filtres por esto».
 *
 * La solución de cada pantalla sería inventarse un centinela distinto. Esto lo
 * unifica: fuera se trabaja con `""` —que es lo que espera la lógica de
 * filtrado— y aquí dentro se traduce a un centinela y de vuelta. Quien lo usa
 * no tiene que saber que existe.
 *
 * Lo usan Movimientos (5 filtros) e Informes. Vive en el nivel compartido, no
 * duplicado en cada pantalla.
 */

/**
 * Centinela interno. Empieza por `__` para no chocar con ningún valor real:
 * las zonas son «3a», los tipos «entrada», los orígenes «Vivero»…
 */
const TODOS = "__todos__";

/**
 * @param {string}  label       Etiqueta visible.
 * @param {string}  value       Valor actual. `""` significa «todos».
 * @param {Function} onChange   Recibe el valor nuevo, con `""` para «todos».
 * @param {Array}   options     `[{ value, label }]`. No incluyas la de «todos».
 * @param {string}  allLabel    Texto de la opción neutra. `null` la quita.
 */
export default function SelectField({
  label,
  value,
  onChange,
  options = [],
  allLabel = "Todos",
  placeholder,
  description,
  required,
  error,
  className,
}) {
  const conTodos =
    allLabel === null ? options : [{ value: TODOS, label: allLabel }, ...options];

  return (
    <Field
      label={label}
      description={description}
      required={required}
      error={error}
      className={className}
    >
      <Select
        value={value === "" || value == null ? (allLabel === null ? undefined : TODOS) : String(value)}
        onValueChange={(v) => onChange(v === TODOS ? "" : v)}
        options={conTodos}
        placeholder={placeholder}
      />
    </Field>
  );
}

export { TODOS as SELECT_TODOS };

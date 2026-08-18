import { Badge } from "../../ui";
import { definicionTipoMovimiento } from "./movementType";

/**
 * Tipo de movimiento, distinguible de un vistazo.
 *
 * DEFECTO QUE CORRIGE — los cuatro tipos se veían IGUALES, y no por poco:
 *
 * La tabla los pintaba con `<StatusBadge status="success" | "danger" | "info" |
 * "warning" />`. Pero `StatusBadge` no recibe un TONO, recibe un ESTADO del
 * vocabulario del sistema (`draft`, `pending`, `approved`, `rejected`…), y
 * resuelve con `STATUS_DEFINITIONS[status] ?? STATUS_DEFINITIONS[Status.DRAFT]`.
 * Ninguno de esos cuatro valores es un estado válido, así que los cuatro caían
 * en el MISMO `draft`: mismo gris neutro y el mismo icono `CircleDashed`. Lo
 * único que los distinguía era el texto. La caída silenciosa lo ocultaba: no
 * había error en consola, solo cuatro insignias idénticas.
 *
 * Un tipo de movimiento no es un estado de flujo de trabajo, es metadato — que
 * es justo para lo que el sistema publica `Badge`, y `Badge` sí acepta un tono.
 *
 * Con eso, la diferencia va por TRES canales en vez de por ninguno:
 *
 *   1. FORMA — icono direccional propio de cada tipo, que es lo que el ojo
 *      capta antes de leer.
 *   2. TEXTO — la etiqueta explícita se mantiene; el icono se AÑADE, no
 *      sustituye.
 *   3. TONO — el que se pretendía desde el principio, ahora aplicado de verdad.
 *
 * No se tiñe la fila entera ni se introduce ningún color en crudo.
 */
export default function MovementTypeBadge({ tipo, label }) {
  const { icono: Icono, tono } = definicionTipoMovimiento(tipo);

  return (
    <Badge tone={tono} className="gap-1.5">
      {/*
       * `aria-hidden`: el icono refuerza al texto que va al lado. Sin esto, un
       * lector de pantalla anunciaría el tipo dos veces.
       */}
      <Icono aria-hidden="true" className="size-3.5 shrink-0" />
      <span>{label}</span>
    </Badge>
  );
}

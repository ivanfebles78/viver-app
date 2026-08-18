import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Undo2, CircleDashed } from "lucide-react";

/**
 * Icono y tono de cada tipo de movimiento.
 *
 * Vive aparte del componente para que `MovementTypeBadge.jsx` exporte SOLO un
 * componente (requisito de Fast Refresh) y para que las pruebas puedan
 * comprobar el mapa sin montar React.
 *
 * La dirección del icono codifica el sentido real del material:
 *
 *   Entrada     ↓ hacia una línea   el material ENTRA al vivero
 *   Salida      ↑ desde una línea   el material SALE del vivero
 *   Traslado    ⇄ doble sentido     se mueve DENTRO del vivero
 *   Devolución  ↩ vuelta atrás      regresa lo que había salido
 */
export const TIPOS_MOVIMIENTO = {
  entrada: { icono: ArrowDownToLine, tono: "success", nombreIcono: "ArrowDownToLine" },
  salida: { icono: ArrowUpFromLine, tono: "danger", nombreIcono: "ArrowUpFromLine" },
  traslado_interno: { icono: ArrowLeftRight, tono: "info", nombreIcono: "ArrowLeftRight" },
  devolucion: { icono: Undo2, tono: "pending", nombreIcono: "Undo2" },
};

/**
 * Caída segura para un tipo desconocido, ausente o corrupto.
 *
 * No se parece a ninguno de los cuatro válidos: un dato roto tiene que NOTARSE,
 * no disfrazarse de movimiento correcto.
 */
export const TIPO_MOVIMIENTO_DESCONOCIDO = {
  icono: CircleDashed,
  tono: "neutral",
  nombreIcono: "CircleDashed",
};

/** Definición (icono + tono) de un tipo, con caída segura. */
export function definicionTipoMovimiento(tipo) {
  return TIPOS_MOVIMIENTO[String(tipo ?? "").toLowerCase()] || TIPO_MOVIMIENTO_DESCONOCIDO;
}

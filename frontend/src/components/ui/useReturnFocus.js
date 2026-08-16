import { useEffect, useRef } from "react";

/**
 * DEVUELVE EL FOCO AL CERRAR UN DIÁLOGO CONTROLADO.
 *
 * Radix devuelve el foco automáticamente cuando el diálogo se abre desde su
 * `DialogTrigger`: es ese componente el que recuerda quién tenía el foco.
 *
 * Un diálogo CONTROLADO por estado —`<Dialog open={modal === "edit">}`— no
 * tiene disparador que recordar, así que al cerrarse el foco cae al `<body>`.
 * Para quien navega con teclado eso significa volver al principio del
 * documento y tener que recorrer toda la página otra vez (SC 2.4.3).
 *
 * Y el diálogo controlado no es un capricho: la pantalla de usuarios abre el
 * de edición desde un elemento de menú que se desmonta al elegirlo, de modo
 * que no existe un disparador persistente al que Radix pueda volver.
 *
 * Este hook guarda quién tenía el foco justo antes de abrir y se lo devuelve
 * al cerrar, comprobando que ese elemento siga en el documento — si la fila se
 * ha ido tras borrarla, forzar el foco sobre un nodo huérfano no haría nada.
 */
export function useReturnFocus(open) {
  const previo = useRef(null);

  useEffect(() => {
    if (open) {
      previo.current = document.activeElement;
      return;
    }

    const destino = previo.current;
    previo.current = null;
    if (!destino || typeof destino.focus !== "function") return;
    if (!document.body.contains(destino)) return;

    // En el siguiente fotograma: Radix aún está desmontando el diálogo y
    // moviendo el foco, y hacerlo ahora mismo se pisaría con esa limpieza.
    const id = requestAnimationFrame(() => destino.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);
}

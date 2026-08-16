import { useCallback, useState } from "react";

import { AlertDialog, AlertDialogContent } from "../../ui";

/**
 * CONFIRMACIÓN DE ACCIONES CON CONSECUENCIAS.
 *
 * Sustituye a `window.confirm()`. La auditoría marcó los 18 diálogos nativos
 * como riesgo CRÍTICO por una razón concreta de control de flujo:
 *
 *     if (!window.confirm("¿Seguro?")) return;   // bloqueante
 *     await borrar();
 *
 * `window.confirm` BLOQUEA y devuelve un booleano, así que la guarda funciona
 * en una sola línea. Un diálogo de React no bloquea: si alguien lo sustituye
 * sin darle la vuelta al flujo, la acción se ejecuta ANTES de que el usuario
 * responda — y en una pantalla que borra usuarios y restaura copias de
 * seguridad, eso destruye datos.
 *
 * Este hook mantiene el orden de escritura del original a base de una promesa:
 *
 *     if (!(await confirmar({ … }))) return;
 *     await borrar();
 *
 * Se lee igual que antes, pero espera de verdad a la respuesta. La promesa se
 * resuelve `false` al cancelar y al cerrar con Escape, de modo que el camino
 * por defecto nunca es "sí".
 */
export function useConfirm() {
  const [estado, setEstado] = useState(null);

  const confirmar = useCallback((opciones) => {
    return new Promise((resolve) => {
      setEstado({ ...opciones, resolve });
    });
  }, []);

  const responder = useCallback(
    (valor) => {
      setEstado((actual) => {
        actual?.resolve(valor);
        return null;
      });
    },
    []
  );

  const dialogo = estado ? (
    <AlertDialog
      open
      onOpenChange={(abierto) => {
        // Cerrar sin elegir —Escape, clic fuera— es SIEMPRE "no".
        if (!abierto) responder(false);
      }}
    >
      <AlertDialogContent
        title={estado.title}
        description={estado.description}
        confirmLabel={estado.confirmLabel || "Confirmar"}
        cancelLabel={estado.cancelLabel || "Cancelar"}
        // El rojo solo cuando la acción destruye de verdad. Un reenvío de
        // invitación se confirma, pero no es una destrucción.
        destructive={Boolean(estado.destructive)}
        onConfirm={() => responder(true)}
      >
        {estado.children}
      </AlertDialogContent>
    </AlertDialog>
  ) : null;

  return { confirmar, dialogo };
}

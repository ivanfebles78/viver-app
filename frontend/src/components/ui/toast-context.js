import { createContext, useContext } from "react";

/**
 * Contexto de avisos efímeros, separado del componente proveedor.
 *
 * Vive aparte por dos razones. La práctica: un fichero que exporta un
 * componente Y un hook rompe la recarga en caliente de Vite, porque el
 * refresco rápido solo funciona cuando un módulo exporta únicamente
 * componentes. La de diseño: al `ToastProvider` lo monta el shell una sola
 * vez, mientras que `useToast` lo consumen las pantallas — son dos públicos
 * distintos.
 */
export const ToastContext = createContext(null);

/** Acceso al emisor de avisos. Lanza si falta el proveedor, en vez de fallar en silencio. */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}

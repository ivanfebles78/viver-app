import React, { useEffect, useState } from "react";
import { getClientes, getActiveClienteId, setActiveClienteId } from "../../api/api";
import { Alert } from "../ui/feedback";

// Nombre corto: quita el prefijo "Ayuntamiento de/del " (redundante, ya que el
// selector lleva la etiqueta "Ayuntamiento" encima).
function shortInst(nombre) {
  if (!nombre) return "";
  return nombre.replace(/^Ayuntamiento\s+(de\s+la\s+|de\s+|del\s+|de\s+las\s+|de\s+los\s+)?/i, "").trim() || nombre;
}

/**
 * Selector de ayuntamiento para el super-admin GLOBAL.
 *
 * Solo se muestra al rol 'admin' (es_admin_global). Al elegir un ayuntamiento
 * se guarda su id en localStorage (lo enviará api.js como cabecera
 * X-Cliente-Id en cada petición) y se recarga la app para que todas las
 * pantallas muestren los datos de ese ayuntamiento.
 *
 * Para el resto de roles este componente no se renderiza: quedan atados a su
 * propio ayuntamiento en el backend.
 */
export default function ClienteSelector({ visible }) {
  const [clientes, setClientes] = useState([]);
  const [activo, setActivo] = useState(getActiveClienteId());
  const [error, setError] = useState("");

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getClientes();
        if (cancelled) return;
        setClientes(Array.isArray(data) ? data : []);
        // NO auto-seleccionamos ninguno: el superadmin no está asociado a ningún
        // ayuntamiento. Arranca en "Todos" (vista global) y entra en uno solo si
        // lo elige aquí o pulsa "Entrar" en el panel de plataforma.
      } catch {
        // El motivo concreto no aporta nada al usuario: el aviso es el mismo.
        if (!cancelled) setError("No se pudieron cargar los ayuntamientos");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  if (!visible) return null;

  const onChange = (e) => {
    const val = e.target.value;
    setActivo(val);
    // val === "" => sin ayuntamiento activo (vista de todos / plataforma).
    setActiveClienteId(val === "" ? null : val);
    // Recargamos para refrescar todos los datos con el nuevo ámbito.
    window.location.reload();
  };

  return (
    <div className="mb-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-3">
      {/*
        Era un `div` suelto que sólo PARECÍA una etiqueta: el `select` no tenía
        nombre accesible y un lector anunciaba «cuadro combinado» sin decir de
        qué — siendo el control más consecuente del shell para un super-admin.
        Sigue siendo un `label for` real; lo que cambia aquí es el estilo.
      */}
      <label
        htmlFor="selector-ayuntamiento"
        className="mb-1 block text-caption uppercase text-muted-foreground"
      >
        Ayuntamiento
      </label>
      <select
        id="selector-ayuntamiento"
        value={activo || ""}
        onChange={onChange}
        className="h-[var(--control-height-md)] w-full min-w-0 cursor-pointer rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 outline-none focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring"
      >
        <option value="">Todos los ayuntamientos</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {shortInst(c.nombre)}
          </option>
        ))}
      </select>
      {error ? (
        <div className="mt-2">
          {/* `Alert` en tono error ya lleva `role="alert"`: si falla la carga,
              el usuario de lector no puede quedarse con un desplegable vacío. */}
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
    </div>
  );
}

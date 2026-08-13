import React, { useEffect, useState } from "react";
import { getClientes, getActiveClienteId, setActiveClienteId } from "../../api/api";

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
      } catch (e) {
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
    <div
      style={{
        marginBottom: 14,
        padding: "10px 12px",
        borderRadius: 12,
        background: "#ecfdf5",
        border: "1px solid #a7f3d0",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 800,
          color: "#047857",
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginBottom: 6,
        }}
      >
        Ayuntamiento
      </div>
      <select
        value={activo || ""}
        onChange={onChange}
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid #6ee7b7",
          background: "#fff",
          color: "#065f46",
          fontWeight: 700,
          fontSize: 14,
          cursor: "pointer",
        }}
      >
        <option value="">Todos los ayuntamientos</option>
        {clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {shortInst(c.nombre)}
          </option>
        ))}
      </select>
      {error && (
        <div style={{ marginTop: 6, fontSize: 12, color: "#b91c1c" }}>{error}</div>
      )}
    </div>
  );
}

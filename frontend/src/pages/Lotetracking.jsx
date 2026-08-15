import { useState } from "react";
import { getLote } from "../api/api";
import { formatFechaHoraCanaria } from "../utils/fecha";

export default function Lotetracking() {
  const [uuid, setUuid] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [buscando, setBuscando] = useState(false);

  const buscar = async () => {
    const termino = uuid.trim();
    if (!termino) {
      setError("Introduce el UUID del lote que quieres consultar.");
      setData(null);
      return;
    }
    // Antes esta pantalla llamaba a `axios.get()` sobre el axios crudo en lugar
    // del cliente configurado. Eso significaba: sin baseURL, sin cabecera
    // Authorization y sin X-Cliente-Id — es decir, sin sesión y sin contexto de
    // ayuntamiento — además de saltarse el manejo de 401. `getLote` pasa por el
    // interceptor y recupera las tres cosas.
    try {
      setBuscando(true);
      setError("");
      setData(await getLote(termino));
    } catch (e) {
      const status = e?.response?.status;
      setError(
        status === 404
          ? "No se encontró ningún lote con ese UUID. Revisa que esté copiado completo."
          : e?.response?.data?.detail || "No se pudo consultar el lote. Inténtalo de nuevo."
      );
      setData(null);
    } finally {
      setBuscando(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>Seguimiento de Lote</h1>

      {/* BUSCADOR */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <input
          value={uuid}
          onChange={(e) => setUuid(e.target.value)}
          placeholder="Introduce UUID..."
          style={{
            padding: 10,
            width: 400,
            borderRadius: 8,
            border: "1px solid #ccc",
          }}
        />
        <button onClick={buscar} disabled={buscando}>
          {buscando ? "Buscando…" : "Buscar"}
        </button>
      </div>

      {error && (
        <p role="alert" style={{ color: "red" }}>
          {error}
        </p>
      )}

      {/* RESULTADO */}
      {data && (
        <div>
          <h2>UUID: {data.uuid}</h2>
          <p>Cantidad inicial: {data.cantidad_inicial}</p>

          {/* TIMELINE */}
          <div style={{ marginTop: 30 }}>
            {data.movimientos.map((m, i) => (
              <div
                key={i}
                style={{
                  marginBottom: 20,
                  padding: 16,
                  borderRadius: 12,
                  background: "#f5f7fa",
                  border: "1px solid #e5e7eb",
                }}
              >
                <strong>
                  {formatFechaHoraCanaria(m.fecha)}
                </strong>

                <div style={{ marginTop: 8 }}>
                  <p>
                    {m.origen} → {m.destino}
                  </p>

                  <p>
                    Zona: {m.zona_origen || "-"} → {m.zona_destino || "-"}
                  </p>

                  <p>
                    Tamaño: {m.tamano_origen || "-"} → {m.tamano_destino || "-"}
                  </p>

                  <p>
                    Cantidad: <strong>{m.cantidad}</strong>
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
import { useState } from "react";
import axios from "axios";
import { formatFechaHoraCanaria } from "../utils/fecha";

export default function Lotetracking() {
  const [uuid, setUuid] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  const buscar = async () => {
    try {
      setError("");
      const res = await axios.get(`/lotes/${uuid}`);
      setData(res.data);
    } catch (e) {
      setError("No se encontró el lote");
      setData(null);
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
        <button onClick={buscar}>Buscar</button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

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
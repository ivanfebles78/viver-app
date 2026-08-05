import React, { useEffect, useMemo, useState, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import { getPedidos, aprobarPedido, denegarPedido, decidirPedido, descargarPedidoPdf } from "../api/api";
import { formatUsername } from "../utils/format";
import { formatCantidad } from "../utils/numero";

// Per-item state pill colour map.  Mirrors the global `badge()` helper
// but tuned for the smaller inline pills inside the items table.
const itemBadge = (estadoItem) => {
  const e = String(estadoItem || "RESERVA").toUpperCase();
  const base = {
    display: "inline-flex",
    alignItems: "center",
    padding: "3px 8px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 11,
    letterSpacing: ".02em",
    border: "1px solid rgba(15,23,42,0.08)",
  };
  if (e === "APROBADO") return { ...base, background: "rgba(16,185,129,0.14)", color: "#065f46", borderColor: "rgba(16,185,129,0.30)" };
  if (e === "DENEGADO") return { ...base, background: "rgba(239,68,68,0.12)",  color: "#991b1b", borderColor: "rgba(239,68,68,0.30)" };
  // RESERVA — neutral amber
  return { ...base, background: "rgba(245,158,11,0.12)", color: "#92400e", borderColor: "rgba(245,158,11,0.30)" };
};
const itemEstado = (it) => String(it?.estado_item || "RESERVA").toUpperCase();

const ESTADO_FILTERS = [
  { value: "TODOS", label: "Todos" },
  { value: "PENDIENTES", label: "Pendientes (Reserva + Parcial)" },
  { value: "RESERVA", label: "Reserva" },
  { value: "APROBADO_PARCIAL", label: "Aprobado parcial" },
  { value: "APROBADO", label: "Aprobado" },
  { value: "DENEGADO", label: "Denegado" },
  { value: "SERVIDO", label: "Servido" },
  { value: "CANCELADO", label: "Cancelado" },
  { value: "CADUCADO", label: "Caducado" },
];

// States where a manager can still take row/item-level actions because at
// least one item is still in RESERVA.  Mirrors backend DECIDABLE_STATES.
const DECIDABLE_FRONTEND = new Set(["RESERVA", "APROBADO_PARCIAL"]);

const safeArray = (x) => (Array.isArray(x) ? x : []);

const fmtFechaES = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
};

const dateInputValue = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const estadoNormalizado = (estado) => String(estado || "").trim().toUpperCase();

const badge = (estado) => {
  const e = estadoNormalizado(estado);
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
    border: "1px solid rgba(15,23,42,0.08)",
    minWidth: 108,
  };

  if (e === "APROBADO") return { ...base, background: "rgba(16,185,129,0.12)", color: "#065f46" };
  if (e === "APROBADO_PARCIAL") return { ...base, background: "rgba(20,184,166,0.14)", color: "#115e59", borderColor: "rgba(20,184,166,0.28)" };
  if (e === "DENEGADO") return { ...base, background: "rgba(239,68,68,0.10)", color: "#991b1b" };
  if (e === "SERVIDO") return { ...base, background: "rgba(59,130,246,0.10)", color: "#1e3a8a" };
  if (e === "CANCELADO") return { ...base, background: "rgba(148,163,184,0.20)", color: "#334155" };
  if (e === "CADUCADO") return { ...base, background: "rgba(100,116,139,0.18)", color: "#475569" };
  return { ...base, background: "rgba(245,158,11,0.12)", color: "#92400e" };
};

// Pretty label for the badge — APROBADO_PARCIAL is otherwise unreadable.
const estadoLabel = (estado) => {
  const e = estadoNormalizado(estado);
  if (e === "APROBADO_PARCIAL") return "APROBADO PARCIAL";
  return e || "—";
};

function thStyle() {
  return {
    textAlign: "left",
    padding: "12px 12px",
    color: "#334155",
    fontWeight: 900,
    fontSize: 13,
    borderBottom: "1px solid rgba(15,23,42,0.10)",
  };
}

function tdStyle() {
  return {
    padding: "14px 12px",
    verticalAlign: "top",
    color: "#0f172a",
    fontWeight: 700,
  };
}

function filterControlStyle() {
  return {
    width: "100%",
    height: 48,
    minHeight: 48,
    maxHeight: 48,
    padding: "0 14px",
    borderRadius: 14,
    border: "2px solid #334155",
    background: "#f8fafc",
    fontWeight: 700,
    fontSize: 14,
    lineHeight: "48px",
    color: "#0f172a",
    boxSizing: "border-box",
    outline: "none",
    margin: 0,
    display: "block",
  };
}

function filterSelectStyle() {
  return {
    ...filterControlStyle(),
    appearance: "none",
    WebkitAppearance: "none",
    MozAppearance: "none",
    lineHeight: "normal",
    backgroundImage:
      "linear-gradient(45deg, transparent 50%, #334155 50%), linear-gradient(135deg, #334155 50%, transparent 50%)",
    backgroundPosition:
      "calc(100% - 18px) calc(50% - 3px), calc(100% - 12px) calc(50% - 3px)",
    backgroundSize: "6px 6px, 6px 6px",
    backgroundRepeat: "no-repeat",
    paddingRight: 34,
  };
}

function filterFieldStyle() {
  return {
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    alignSelf: "start",
    minWidth: 0,
  };
}

function filterLabelStyle() {
  return {
    fontSize: 12,
    fontWeight: 900,
    color: "#64748b",
    marginBottom: 6,
    lineHeight: "16px",
    minHeight: 16,
    textTransform: "uppercase",
    letterSpacing: 0.2,
  };
}

// Colores intensos y distintos por destino, para diferenciarlos bien.
const DESTINO_COLORS = [
  { bg: "#1e3a8a", fg: "#ffffff" }, // azul
  { bg: "#065f46", fg: "#ffffff" }, // verde
  { bg: "#9a3412", fg: "#ffffff" }, // naranja oscuro
  { bg: "#6b21a8", fg: "#ffffff" }, // morado
  { bg: "#155e75", fg: "#ffffff" }, // cyan oscuro
  { bg: "#9f1239", fg: "#ffffff" }, // rojo/rosa
  { bg: "#3f6212", fg: "#ffffff" }, // oliva
  { bg: "#854d0e", fg: "#ffffff" }, // ámbar oscuro
  { bg: "#5b21b6", fg: "#ffffff" }, // violeta
  { bg: "#0f766e", fg: "#ffffff" }, // teal
];
const destinoColorAt = (i) => DESTINO_COLORS[((i % DESTINO_COLORS.length) + DESTINO_COLORS.length) % DESTINO_COLORS.length];

function DetallePedidoModal({ pedido, onClose, canApprove = false, onPedidoUpdated, onMessage }) {
  // Pending decisions: { [item.id]: "aprobar" | "denegar" }.  Lives only
  // in the modal — nothing hits the DB until the manager presses
  // "Confirmar decisiones".  Closing the modal discards them.
  const [pendingDecisions, setPendingDecisions] = useState({});
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Destinos colapsados (por texto de destino) para poder plegar/desplegar.
  const [colapsados, setColapsados] = useState({});
  const toggleColapsado = (dst) => setColapsados((p) => ({ ...p, [dst]: !p[dst] }));

  // Reset local state whenever a different pedido is opened.
  useEffect(() => {
    setPendingDecisions({});
    setMotivo("");
  }, [pedido?.id]);

  if (!pedido) return null;

  const fmtFecha = (v) => {
    if (!v) return "—";
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(d);
  };

  const items = safeArray(pedido.items);
  const hasApproved = items.some((it) => {
    const st = itemEstado(it);
    return st === "APROBADO" || st === "SERVIDO";
  });
  // Show the PDF button in any decided state — APROBADO, APROBADO_PARCIAL,
  // SERVIDO and DENEGADO.  Even fully-denied pedidos have audit value
  // (motivo de denegación + line detail).  Blocked only for pristine
  // RESERVA / pedidos with no decision recorded yet.
  const estadoNormPedido = String(pedido.estado || "RESERVA").toUpperCase();
  const canShowPdf =
    estadoNormPedido === "APROBADO" ||
    estadoNormPedido === "APROBADO_PARCIAL" ||
    estadoNormPedido === "SERVIDO" ||
    estadoNormPedido === "DENEGADO" ||
    hasApproved;

  // Items still in RESERVA — these are the ones the manager must decide on.
  const reservaItems     = items.filter((it) => itemEstado(it) === "RESERVA");
  const pendingCount     = reservaItems.length;
  const decidedLocalCount = reservaItems.filter((it) => pendingDecisions[it.id]).length;
  const allDecided       = pendingCount > 0 && decidedLocalCount === pendingCount;
  const anyDenied        = reservaItems.some((it) => pendingDecisions[it.id] === "denegar");

  const setDecision = (itemId, decision) => {
    setPendingDecisions((prev) => ({ ...prev, [itemId]: decision }));
  };

  const submitDecisions = async () => {
    if (!allDecided || submitting) return;
    const approved_item_ids = [];
    const denied_item_ids   = [];
    for (const it of reservaItems) {
      if (pendingDecisions[it.id] === "aprobar") approved_item_ids.push(it.id);
      else if (pendingDecisions[it.id] === "denegar") denied_item_ids.push(it.id);
    }
    setSubmitting(true);
    try {
      const updated = await decidirPedido(pedido.id, {
        approved_item_ids,
        denied_item_ids,
        motivo_denegacion: denied_item_ids.length ? (motivo.trim() || null) : null,
      });
      if (onPedidoUpdated) onPedidoUpdated(updated);
      if (onMessage) {
        const parts = [];
        if (approved_item_ids.length) parts.push(`${approved_item_ids.length} aprobado(s)`);
        if (denied_item_ids.length)   parts.push(`${denied_item_ids.length} denegado(s)`);
        // Surface any email-delivery warnings returned by the backend
        // (e.g. solicitante / técnico / proveedor without email).
        const warns = Array.isArray(updated?.email_warnings) ? updated.email_warnings : [];
        const base = `Pedido #${pedido.id}: ${parts.join(" · ")}.`;
        onMessage(warns.length ? `${base} Aviso: ${warns.join(" · ")}` : base);
      }
      setPendingDecisions({});
      setMotivo("");
    } catch (e) {
      if (onMessage) {
        onMessage(e?.response?.data?.detail || e?.message || "Error aplicando las decisiones");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const downloadPdf = async () => {
    try {
      await descargarPedidoPdf(pedido.id);
    } catch (e) {
      if (onMessage) {
        onMessage(e?.response?.data?.detail || e?.message || "Error descargando el PDF");
      }
    }
  };
  const solicitante =
    formatUsername(
      pedido?.solicitante_username || pedido?.solicitante || pedido?.created_by || pedido?.usuario || ""
    ) || "—";

  const destinoDeItem = (it) =>
    [it?.distrito_destino, it?.barrio_destino, it?.direccion_destino].filter(Boolean).join(" · ");

  const destino =
    pedido?.tipo === "reposicion"
      ? "Vivero"
      : [pedido?.distrito_destino, pedido?.barrio_destino, pedido?.direccion_destino]
          .filter(Boolean)
          .join(" · ") || "—";

  // ¿El pedido reparte material en varios destinos distintos?
  const destinosUnicos = Array.from(
    new Set(items.map(destinoDeItem).filter(Boolean))
  );
  const variosDestinos = pedido?.tipo !== "reposicion" && destinosUnicos.length > 1;

  // Agrupa las líneas por destino (en orden de aparición) para mostrarlas
  // agrupadas visualmente, manteniendo la decisión por línea.
  const gruposDestino = (() => {
    const order = [];
    const map = new Map();
    for (const it of items) {
      const dst = destinoDeItem(it) || destino;
      if (!map.has(dst)) {
        map.set(dst, []);
        order.push(dst);
      }
      map.get(dst).push(it);
    }
    return order.map((dst) => ({ destino: dst, items: map.get(dst) }));
  })();

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,6,23,0.55)",
        zIndex: 1400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(880px, 96vw)",
          maxHeight: "90vh",
          overflow: "hidden",
          background: "white",
          borderRadius: 24,
          boxShadow: "0 30px 80px rgba(2,6,23,0.35)",
          display: "grid",
          gridTemplateRows: "auto 1fr auto",
        }}
      >
        <div style={{ padding: "20px 22px", borderBottom: "1px solid rgba(15,23,42,0.08)", display: "flex", justifyContent: "space-between", alignItems: "start", gap: 14 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 900, color: "#0f172a" }}>
              Detalle del pedido #{pedido.id}
            </div>
            <div style={{ marginTop: 6, color: "#64748b", fontWeight: 700 }}>
              <span
                style={{
                  display: "inline-flex",
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 900,
                  background: pedido.tipo === "reposicion" ? "rgba(245,158,11,0.12)" : "rgba(59,130,246,0.10)",
                  color: pedido.tipo === "reposicion" ? "#92400e" : "#1e3a8a",
                  border: "1px solid rgba(15,23,42,0.08)",
                  marginRight: 8,
                }}
              >
                {pedido.tipo === "reposicion" ? "Reposición" : "Salida"}
              </span>
              <span style={badge(pedido.estado)}>{estadoLabel(pedido.estado)}</span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              padding: "10px 16px",
              borderRadius: 14,
              fontWeight: 900,
              cursor: "pointer",
              background: "#f59e0b",
              color: "#111827",
              border: "2px solid #000",
              boxShadow: "0 8px 18px rgba(0,0,0,0.18)",
            }}
          >
            Cerrar
          </button>
        </div>

        <div style={{ padding: "16px 22px", overflow: "auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <div style={{ padding: 12, borderRadius: 12, background: "#f8fafc", border: "1px solid rgba(15,23,42,0.06)" }}>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>Fecha creación</div>
              <div style={{ marginTop: 4, fontWeight: 900, color: "#0f172a" }}>{fmtFecha(pedido.created_at)}</div>
            </div>
            <div style={{ padding: 12, borderRadius: 12, background: "#f8fafc", border: "1px solid rgba(15,23,42,0.06)" }}>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>Solicitante</div>
              <div style={{ marginTop: 4, fontWeight: 900, color: "#0f172a" }}>{solicitante}</div>
            </div>
            <div style={{ gridColumn: "span 2", padding: 12, borderRadius: 12, background: "#f8fafc", border: "1px solid rgba(15,23,42,0.06)" }}>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 900, textTransform: "uppercase" }}>Destino</div>
              <div style={{ marginTop: 4, fontWeight: 900, color: "#0f172a" }}>
                {variosDestinos ? `${destinosUnicos.length} destinos (productos agrupados abajo)` : destino}
              </div>
            </div>
            {pedido.nota ? (
              <div style={{ gridColumn: "span 2", padding: 12, borderRadius: 12, background: "#fffbeb", border: "1px solid rgba(245,158,11,0.25)" }}>
                <div style={{ fontSize: 12, color: "#92400e", fontWeight: 900, textTransform: "uppercase" }}>Nota</div>
                <div style={{ marginTop: 4, fontWeight: 700, color: "#0f172a" }}>{pedido.nota}</div>
              </div>
            ) : null}
          </div>

          <div style={{ fontSize: 16, fontWeight: 900, color: "#0f172a", marginBottom: 8 }}>
            Productos del pedido ({items.length})
          </div>

          {items.length === 0 ? (
            <div style={{ color: "#64748b", fontWeight: 700 }}>Este pedido no tiene líneas.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th style={thStyle()}>Producto</th>
                    <th style={thStyle()}>Tamaño</th>
                    <th style={thStyle()}>Cantidad</th>
                    <th style={thStyle()}>Servido</th>
                    <th style={thStyle()}>Pendiente</th>
                    <th style={thStyle()}>Estado</th>
                    {canApprove ? <th style={thStyle()}>Acción</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {gruposDestino.map((grupo, gIdx) => {
                  const col = destinoColorAt(gIdx);
                  const colapsado = !!colapsados[grupo.destino];
                  return (
                  <React.Fragment key={grupo.destino}>
                    <tr>
                      <td
                        colSpan={canApprove ? 7 : 6}
                        onClick={() => toggleColapsado(grupo.destino)}
                        style={{ background: col.bg, color: col.fg, padding: "10px 12px", fontWeight: 900, fontSize: 13, cursor: "pointer", borderTop: "3px solid rgba(0,0,0,0.12)" }}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 11 }}>{colapsado ? "▶" : "▼"}</span>
                          📍 {grupo.destino}
                          <span style={{ opacity: 0.85, fontWeight: 700 }}>({grupo.items.length})</span>
                        </span>
                      </td>
                    </tr>
                    {!colapsado && grupo.items.map((it, idx) => {
                    const cantidad = Number(it.cantidad || 0);
                    const servida = Number(it.cantidad_servida || 0);
                    const pendiente = Math.max(cantidad - servida, 0);
                    const estIt = itemEstado(it);
                    const isReserva = estIt === "RESERVA";
                    const rowMuted = !isReserva
                      ? { background: estIt === "DENEGADO" ? "rgba(239,68,68,0.04)" : "rgba(16,185,129,0.04)", opacity: estIt === "DENEGADO" ? 0.7 : 1 }
                      : null;
                    const productoLabel =
                      it.producto_nombre_cientifico ||
                      it.producto_nombre ||
                      it.producto_nombre_natural ||
                      `Producto #${it.producto_id}`;
                    return (
                      <tr key={it.id || `${grupo.destino}-${idx}`} style={{ borderTop: "1px solid rgba(15,23,42,0.06)", ...rowMuted }}>
                        <td style={{ ...tdStyle(), textDecoration: estIt === "DENEGADO" ? "line-through" : "none" }}>
                          {productoLabel}
                        </td>
                        <td style={tdStyle()}>{it.tamano || "—"}</td>
                        <td style={{ ...tdStyle(), fontWeight: 900 }}>{formatCantidad(cantidad) || "0"}</td>
                        <td style={{ ...tdStyle(), color: "#065f46", fontWeight: 900 }}>{formatCantidad(servida) || "0"}</td>
                        <td style={{ ...tdStyle(), color: pendiente > 0 ? "#92400e" : "#64748b", fontWeight: 900 }}>
                          {formatCantidad(pendiente) || "0"}
                        </td>
                        <td style={tdStyle()}>
                          <span style={itemBadge(estIt)}>
                            {estIt === "APROBADO" ? "✓ Aprobado" : estIt === "DENEGADO" ? "✗ Denegado" : "⏳ Pendiente"}
                          </span>
                        </td>
                        {canApprove ? (
                          <td style={tdStyle()}>
                            {isReserva ? (
                              (() => {
                                // Toggle pair: clicking a button marks the
                                // pending decision locally; no API call yet.
                                // The selected option is highlighted.
                                const decision = pendingDecisions[it.id]; // undefined | "aprobar" | "denegar"
                                const baseBtn = {
                                  padding: "6px 10px",
                                  borderRadius: 8,
                                  fontWeight: 900,
                                  fontSize: 12,
                                  cursor: submitting ? "wait" : "pointer",
                                  transition: "background .15s, border-color .15s, box-shadow .15s",
                                };
                                const aprobarStyle = {
                                  ...baseBtn,
                                  border: decision === "aprobar"
                                    ? "1px solid #10b981"
                                    : "1px solid rgba(16,185,129,0.30)",
                                  background: decision === "aprobar"
                                    ? "rgba(16,185,129,0.25)"
                                    : "rgba(16,185,129,0.08)",
                                  color: "#065f46",
                                  boxShadow: decision === "aprobar"
                                    ? "0 0 0 2px rgba(16,185,129,0.18)"
                                    : "none",
                                };
                                const denegarStyle = {
                                  ...baseBtn,
                                  border: decision === "denegar"
                                    ? "1px solid #ef4444"
                                    : "1px solid rgba(239,68,68,0.25)",
                                  background: decision === "denegar"
                                    ? "rgba(239,68,68,0.20)"
                                    : "rgba(239,68,68,0.06)",
                                  color: "#991b1b",
                                  boxShadow: decision === "denegar"
                                    ? "0 0 0 2px rgba(239,68,68,0.18)"
                                    : "none",
                                };
                                return (
                                  <div style={{ display: "flex", gap: 6 }}>
                                    <button
                                      type="button"
                                      disabled={submitting}
                                      onClick={() => setDecision(it.id, "aprobar")}
                                      style={aprobarStyle}
                                      title="Marcar este item como aprobado (no se aplica hasta confirmar)"
                                    >
                                      {decision === "aprobar" ? "✓ Aprobar" : "Aprobar"}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={submitting}
                                      onClick={() => setDecision(it.id, "denegar")}
                                      style={denegarStyle}
                                      title="Marcar este item como denegado (no se aplica hasta confirmar)"
                                    >
                                      {decision === "denegar" ? "✗ Denegar" : "Denegar"}
                                    </button>
                                  </div>
                                );
                              })()
                            ) : (
                              <span style={{ color: "#64748b", fontSize: 12, fontStyle: "italic" }}>—</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                    })}
                  </React.Fragment>
                  );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer: two distinct modes.
            (a) There are still RESERVA items AND the user can approve →
                show the batch-decision UI: motivo input + Confirmar.
            (b) Otherwise → show the PDF download (when applicable). */}
        {canApprove && pendingCount > 0 ? (
          <div
            style={{
              padding: "14px 22px",
              borderTop: "1px solid rgba(15,23,42,0.08)",
              background: "#f8fafc",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div
              style={{
                fontSize: 13,
                color: allDecided ? "#065f46" : "#92400e",
                fontWeight: 800,
              }}
            >
              {allDecided
                ? `Listo: ${decidedLocalCount} de ${pendingCount} items decididos. Pulsa "Confirmar decisiones" para aplicar.`
                : `Decide TODOS los items antes de confirmar (${decidedLocalCount}/${pendingCount} hechos). No se puede dejar nada pendiente.`}
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              {anyDenied ? (
                <input
                  type="text"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  disabled={submitting}
                  placeholder="Motivo de denegación (opcional)"
                  style={{
                    flex: 1,
                    minWidth: 220,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(15,23,42,0.12)",
                    background: "white",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#0f172a",
                  }}
                />
              ) : (
                <span style={{ flex: 1 }} />
              )}

              <button
                type="button"
                disabled={!allDecided || submitting}
                onClick={submitDecisions}
                style={{
                  padding: "10px 18px",
                  borderRadius: 12,
                  border: "1px solid " + (allDecided ? "#0f766e" : "rgba(15,23,42,0.12)"),
                  background: allDecided ? "#0f766e" : "rgba(148,163,184,0.30)",
                  color: allDecided ? "white" : "#64748b",
                  fontWeight: 900,
                  cursor: !allDecided || submitting ? "not-allowed" : "pointer",
                  fontSize: 13,
                  letterSpacing: ".02em",
                  whiteSpace: "nowrap",
                }}
              >
                {submitting ? "Aplicando…" : "Confirmar decisiones"}
              </button>

              {canShowPdf ? (
                <button
                  type="button"
                  onClick={downloadPdf}
                  style={{
                    padding: "10px 16px",
                    borderRadius: 12,
                    border: "1px solid rgba(59,130,246,0.30)",
                    background: "rgba(59,130,246,0.08)",
                    color: "#1d4ed8",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  PDF
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: "14px 22px",
              borderTop: "1px solid rgba(15,23,42,0.08)",
              background: "#f8fafc",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>
              {estadoNormPedido === "DENEGADO"
                ? "Pedido denegado. El PDF contiene el detalle y motivo de denegación."
                : hasApproved
                ? "Hay items aprobados disponibles en el PDF."
                : "Sin decisión registrada todavía."}
            </div>
            {canShowPdf ? (
              <button
                type="button"
                onClick={downloadPdf}
                style={{
                  padding: "10px 16px",
                  borderRadius: 12,
                  border: "1px solid rgba(59,130,246,0.30)",
                  background: "rgba(59,130,246,0.08)",
                  color: "#1d4ed8",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Descargar PDF
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBanner({ msg, onClose }) {
  if (!msg) return null;

  return (
    <div
      style={{
        marginTop: 12,
        padding: "12px 14px",
        borderRadius: 14,
        border: "1px solid rgba(16,185,129,0.25)",
        background: "rgba(16,185,129,0.08)",
        color: "#065f46",
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <span>{msg}</span>

      <button
        onClick={onClose}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          fontSize: 18,
          fontWeight: 900,
          color: "#065f46",
          lineHeight: 1,
        }}
        aria-label="Cerrar mensaje"
        title="Cerrar"
      >
        ×
      </button>
    </div>
  );
}

export default function Aprobaciones() {
  const { me } = useOutletContext();
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // Por defecto se muestran TODOS los pedidos, para que tras aprobar/denegar el
  // pedido decidido siga visible en la lista (no desaparezca del filtro).
  const [estadoFiltro, setEstadoFiltro] = useState("TODOS");
  const [idFiltro, setIdFiltro] = useState("");
  const [fechaFiltro, setFechaFiltro] = useState("");
  const [solicitanteFiltro, setSolicitanteFiltro] = useState("");
  const [textoFiltro, setTextoFiltro] = useState("");
  const [detallePedido, setDetallePedido] = useState(null);

  const msgTimerRef = useRef(null);

  const clearMsgTimer = () => {
    if (msgTimerRef.current) {
      clearTimeout(msgTimerRef.current);
      msgTimerRef.current = null;
    }
  };

  const closeMessage = () => {
    clearMsgTimer();
    setMsg("");
  };

  const showTimedMessage = (text) => {
    clearMsgTimer();
    setMsg(text);

    msgTimerRef.current = setTimeout(() => {
      setMsg("");
      msgTimerRef.current = null;
    }, 3000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const data = await getPedidos();
      setPedidos(safeArray(data));
    } catch (e) {
      showTimedMessage(e?.response?.data?.detail || e?.message || "Error cargando aprobaciones");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();

    return () => {
      clearMsgTimer();
    };
  }, []);

  const solicitanteFromPedido = (p) =>
    formatUsername(
      p?.solicitante_username || p?.solicitante || p?.created_by || p?.usuario || p?.username || ""
    ) || "—";

  const pedidosFiltrados = useMemo(() => {
    const texto = textoFiltro.trim().toLowerCase();

    return pedidos
      .slice()
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .filter((p) => {
        const idOk = !idFiltro || String(p.id).includes(String(idFiltro).trim());
        const estadoNorm = estadoNormalizado(p?.estado);
        const estadoOk =
          estadoFiltro === "TODOS"
            ? true
            : estadoFiltro === "PENDIENTES"
            ? DECIDABLE_FRONTEND.has(estadoNorm)
            : estadoNorm === estadoFiltro;
        const fechaOk = !fechaFiltro || dateInputValue(p?.created_at) === fechaFiltro;

        const solicitante = solicitanteFromPedido(p).toLowerCase();
        const solicitanteOk =
          !solicitanteFiltro || solicitante.includes(solicitanteFiltro.trim().toLowerCase());

        const detalle = safeArray(p.items)
          .map((it) => `${it.producto_id} ${it.tamano || ""} ${it.cantidad || ""}`.toLowerCase())
          .join(" ");

        const textoOk =
          !texto ||
          String(p.id).toLowerCase().includes(texto) ||
          solicitante.includes(texto) ||
          estadoNormalizado(p?.estado).toLowerCase().includes(texto) ||
          detalle.includes(texto);

        return idOk && estadoOk && fechaOk && solicitanteOk && textoOk;
      });
  }, [pedidos, estadoFiltro, idFiltro, fechaFiltro, solicitanteFiltro, textoFiltro]);

  // Helper to format the post-action message with optional email warnings
  // returned by the backend (e.g. solicitante without email registered).
  const messageWithWarnings = (base, updated) => {
    const warns = Array.isArray(updated?.email_warnings) ? updated.email_warnings : [];
    return warns.length ? `${base} Aviso: ${warns.join(" · ")}` : base;
  };

  const aprobar = async (id) => {
    try {
      const updated = await aprobarPedido(id, {});
      await load();
      showTimedMessage(messageWithWarnings(`Pedido #${id} aprobado.`, updated));
    } catch (e) {
      showTimedMessage(e?.response?.data?.detail || e?.message || "Error aprobando pedido");
    }
  };

  const denegar = async (id) => {
    try {
      const updated = await denegarPedido(id, {});
      await load();
      showTimedMessage(messageWithWarnings(`Pedido #${id} denegado.`, updated));
    } catch (e) {
      showTimedMessage(e?.response?.data?.detail || e?.message || "Error denegando pedido");
    }
  };

  const role = me?.rol || me?.role;
  const canApprove = role === "admin" || role === "manager";

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 44, margin: 0, fontWeight: 900, color: "#0f172a" }}>Aprobaciones</h1>
        <div style={{ fontWeight: 800, color: "#64748b" }}>
          Usuario: <span style={{ color: "#0f172a" }}>{me?.username || "—"}</span> · Rol:{" "}
          <span style={{ color: "#0f172a" }}>{role || "—"}</span>
        </div>
      </div>

      <MessageBanner msg={msg} onClose={closeMessage} />

      <div
        style={{
          marginTop: 16,
          background: "white",
          border: "1px solid rgba(15,23,42,0.06)",
          borderRadius: 18,
          boxShadow: "0 10px 30px rgba(2,6,23,0.06)",
          padding: 16,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", marginBottom: 14 }}>
          Lista de aprobaciones
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "minmax(140px, 160px) minmax(190px, 220px) minmax(170px, 190px) minmax(180px, 220px) minmax(260px, 1fr)",
            gap: 14,
            marginBottom: 18,
            alignItems: "start",
          }}
        >
          <div style={filterFieldStyle()}>
            <div style={filterLabelStyle()}>ID</div>
            <input
              placeholder="Filtrar por ID"
              value={idFiltro}
              onChange={(e) => setIdFiltro(e.target.value)}
              style={filterControlStyle()}
            />
          </div>

          <div style={filterFieldStyle()}>
            <div style={filterLabelStyle()}>Tipo de reserva</div>
            <select
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value)}
              style={filterSelectStyle()}
            >
              {ESTADO_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          <div style={filterFieldStyle()}>
            <div style={filterLabelStyle()}>Fecha</div>
            <input
              type="date"
              value={fechaFiltro}
              onChange={(e) => setFechaFiltro(e.target.value)}
              style={filterControlStyle()}
            />
          </div>

          <div style={filterFieldStyle()}>
            <div style={filterLabelStyle()}>Solicitante</div>
            <input
              placeholder="Solicitante"
              value={solicitanteFiltro}
              onChange={(e) => setSolicitanteFiltro(e.target.value)}
              style={filterControlStyle()}
            />
          </div>

          <div style={filterFieldStyle()}>
            <div style={filterLabelStyle()}>Texto</div>
            <input
              placeholder="Buscar texto en detalle, estado, ID..."
              value={textoFiltro}
              onChange={(e) => setTextoFiltro(e.target.value)}
              style={filterControlStyle()}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ color: "#64748b", fontWeight: 800 }}>Cargando…</div>
        ) : pedidosFiltrados.length === 0 ? (
          <div style={{ color: "#64748b", fontWeight: 800 }}>No hay pedidos para los filtros seleccionados.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 10px", minWidth: 980 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={thStyle()}>ID</th>
                  <th style={thStyle()}>Tipo</th>
                  <th style={thStyle()}>Fecha</th>
                  <th style={thStyle()}>Solicitante</th>
                  <th style={thStyle()}>Estado</th>
                  <th style={thStyle()}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidosFiltrados.map((p) => {
                  const estado = p.estado || "RESERVA";
                  // Row-level Aprobar / Denegar shortcuts only show when:
                  //   1) pedido is in RESERVA (no decision taken yet — once
                  //      ANY decision exists, state is final), AND
                  //   2) the pedido has exactly ONE item.  Multi-item pedidos
                  //      must be decided through the detail modal so the
                  //      manager can pick per-item which lines to approve and
                  //      which to deny.  Otherwise the row-level shortcut
                  //      would force "approve all" or "deny all" and the
                  //      partial-approval workflow becomes inaccessible.
                  const itemCount = safeArray(p?.items).length;
                  const editable =
                    estadoNormalizado(estado) === "RESERVA" && itemCount === 1;

                  return (
                    <tr
                      key={p.id}
                      style={{
                        background: "white",
                        boxShadow: "0 6px 18px rgba(2,6,23,0.05)",
                      }}
                    >
                      <td
                        style={{
                          ...tdStyle(),
                          borderTop: "1px solid rgba(15,23,42,0.10)",
                          borderBottom: "1px solid rgba(15,23,42,0.10)",
                          borderLeft: "1px solid rgba(15,23,42,0.10)",
                          borderTopLeftRadius: 14,
                          borderBottomLeftRadius: 14,
                        }}
                      >
                        #{p.id}
                      </td>

                      <td style={{ ...tdStyle(), borderTop: "1px solid rgba(15,23,42,0.10)", borderBottom: "1px solid rgba(15,23,42,0.10)" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 900,
                            background: (p.tipo === "reposicion") ? "rgba(245,158,11,0.12)" : "rgba(59,130,246,0.10)",
                            color: (p.tipo === "reposicion") ? "#92400e" : "#1e3a8a",
                            border: "1px solid rgba(15,23,42,0.08)",
                          }}
                        >
                          {p.tipo === "reposicion" ? "Reposición" : "Salida"}
                        </span>
                      </td>

                      <td style={{ ...tdStyle(), borderTop: "1px solid rgba(15,23,42,0.10)", borderBottom: "1px solid rgba(15,23,42,0.10)" }}>
                        {fmtFechaES(p.created_at)}
                      </td>

                      <td style={{ ...tdStyle(), borderTop: "1px solid rgba(15,23,42,0.10)", borderBottom: "1px solid rgba(15,23,42,0.10)" }}>
                        {solicitanteFromPedido(p)}
                      </td>

                      <td style={{ ...tdStyle(), borderTop: "1px solid rgba(15,23,42,0.10)", borderBottom: "1px solid rgba(15,23,42,0.10)" }}>
                        <span style={badge(estado)}>{estadoLabel(estado)}</span>
                      </td>

                      <td
                        style={{
                          ...tdStyle(),
                          borderTop: "1px solid rgba(15,23,42,0.10)",
                          borderBottom: "1px solid rgba(15,23,42,0.10)",
                          borderRight: "1px solid rgba(15,23,42,0.10)",
                          borderTopRightRadius: 14,
                          borderBottomRightRadius: 14,
                        }}
                      >
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {canApprove && editable ? (
                            <>
                              <button
                                onClick={() => aprobar(p.id)}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: "1px solid rgba(16,185,129,0.35)",
                                  background: "rgba(16,185,129,0.10)",
                                  color: "#065f46",
                                  fontWeight: 900,
                                  cursor: "pointer",
                                }}
                              >
                                Aprobar
                              </button>

                              <button
                                onClick={() => denegar(p.id)}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: "1px solid rgba(239,68,68,0.25)",
                                  background: "rgba(239,68,68,0.08)",
                                  color: "#991b1b",
                                  fontWeight: 900,
                                  cursor: "pointer",
                                }}
                              >
                                Denegar
                              </button>
                            </>
                          ) : null}

                          <button
                            onClick={() => setDetallePedido(p)}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 10,
                              border: "1px solid rgba(59,130,246,0.30)",
                              background: "rgba(59,130,246,0.08)",
                              color: "#1d4ed8",
                              fontWeight: 900,
                              cursor: "pointer",
                            }}
                            title="Ver detalle del pedido"
                          >
                            Detalle pedido
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DetallePedidoModal
        pedido={detallePedido}
        onClose={() => setDetallePedido(null)}
        canApprove={canApprove}
        onPedidoUpdated={(updated) => {
          // Keep the modal in sync with the freshly-returned pedido and
          // refresh the parent list so the table reflects the new state.
          setDetallePedido(updated);
          load();
        }}
        onMessage={(text) => showTimedMessage(text)}
      />
    </div>
  );
}
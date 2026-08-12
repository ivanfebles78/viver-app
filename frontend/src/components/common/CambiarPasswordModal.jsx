import React, { useState } from "react";
import { changePassword } from "../../api/api";

/**
 * Modal de "Cambiar mi contraseña" (self-service, para cualquier usuario
 * logueado). No depende del correo: pide la contraseña actual + la nueva.
 */
export default function CambiarPasswordModal({ open, onClose }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  if (!open) return null;

  const reset = () => {
    setActual(""); setNueva(""); setRepetir(""); setError(""); setOk(false); setBusy(false);
  };
  const cerrar = () => { reset(); onClose(); };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (nueva.length < 8) {
      setError("La nueva contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (nueva !== repetir) {
      setError("La nueva contraseña y su repetición no coinciden.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(actual, nueva);
      setOk(true);
      setActual(""); setNueva(""); setRepetir("");
    } catch (err) {
      setError(err?.response?.data?.detail || "No se pudo cambiar la contraseña.");
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    border: "1px solid #cbd5e1", fontSize: 14, boxSizing: "border-box",
  };
  const labelStyle = { fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 };

  return (
    <div
      onClick={cerrar}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 16, padding: 22, width: "100%", maxWidth: 420,
          boxShadow: "0 24px 60px rgba(2,6,23,0.30)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#0f172a" }}>Cambiar mi contraseña</h2>
          <button onClick={cerrar} style={{ border: "none", background: "transparent", fontSize: 22, cursor: "pointer", color: "#64748b", lineHeight: 1 }} aria-label="Cerrar">×</button>
        </div>

        {ok ? (
          <>
            <div style={{ padding: "12px 14px", borderRadius: 10, background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46", fontWeight: 600, marginTop: 8 }}>
              ✅ Contraseña actualizada correctamente.
            </div>
            <div style={{ marginTop: 16, textAlign: "right" }}>
              <button onClick={cerrar} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "#059669", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
                Hecho
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 8 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>Contraseña actual</span>
              <input type="password" value={actual} onChange={(e) => setActual(e.target.value)} style={inputStyle} autoComplete="current-password" required />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>Nueva contraseña</span>
              <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} style={inputStyle} autoComplete="new-password" required />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={labelStyle}>Repetir nueva contraseña</span>
              <input type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} style={inputStyle} autoComplete="new-password" required />
            </label>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Mínimo 8 caracteres.</div>

            {error && (
              <div style={{ padding: "10px 12px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontWeight: 600 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
              <button type="button" onClick={cerrar} disabled={busy} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #cbd5e1", background: "#fff", fontWeight: 700, cursor: "pointer", color: "#334155" }}>
                Cancelar
              </button>
              <button type="submit" disabled={busy} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "#059669", color: "#fff", fontWeight: 800, cursor: busy ? "default" : "pointer", opacity: busy ? 0.7 : 1 }}>
                {busy ? "Guardando…" : "Cambiar contraseña"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

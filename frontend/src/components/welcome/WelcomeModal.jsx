import React, { useEffect, useState } from "react";

// Recursos enlazados desde el modal. Reemplaza estas rutas cuando subas
// los archivos definitivos:
//   - PDF: colócalo en `frontend/public/guia-viverapp.pdf` para que se sirva
//     directamente desde la raíz.
//   - Video: pega la URL pública (YouTube, Vimeo, etc.) en VIDEO_URL.
const PDF_URL = "/guia-viverapp.pdf";
const VIDEO_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"; // placeholder

// Keys de localStorage para recordar la preferencia del usuario.
export const WELCOME_SEEN_KEY = "viverapp_welcome_seen";
export const WELCOME_SHOW_ON_START_KEY = "viverapp_welcome_show_on_start";

/**
 * Lee de localStorage si el usuario quiere que el modal aparezca al iniciar.
 * Por defecto (sin valor en storage) devuelve false: solo se muestra la
 * primera vez y luego queda silenciado.
 */
export function shouldShowWelcomeOnStart() {
  try {
    if (window.localStorage.getItem(WELCOME_SEEN_KEY) !== "true") return true; // primera vez
    return window.localStorage.getItem(WELCOME_SHOW_ON_START_KEY) === "true";
  } catch {
    return true;
  }
}

export default function WelcomeModal({ open, onClose }) {
  const [showOnStart, setShowOnStart] = useState(false);

  // Sincroniza el checkbox con lo que hubiera guardado el usuario en una
  // visita anterior (si reabre el modal desde el botón "?" esperamos ver
  // su preferencia previa, no resetearla a false).
  useEffect(() => {
    if (!open) return;
    try {
      setShowOnStart(
        window.localStorage.getItem(WELCOME_SHOW_ON_START_KEY) === "true"
      );
    } catch {
      setShowOnStart(false);
    }
  }, [open]);

  const handleClose = () => {
    try {
      window.localStorage.setItem(WELCOME_SEEN_KEY, "true");
      window.localStorage.setItem(
        WELCOME_SHOW_ON_START_KEY,
        showOnStart ? "true" : "false"
      );
    } catch {
      // noop: en navegadores sin localStorage simplemente perdemos la
      // preferencia, pero el modal se cierra igualmente.
    }
    onClose?.();
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,6,23,0.55)",
        backdropFilter: "blur(4px)",
        zIndex: 1400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        style={{
          width: "min(680px, 96vw)",
          maxHeight: "92vh",
          overflowY: "auto",
          background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
          borderRadius: 24,
          boxShadow: "0 30px 80px rgba(2,6,23,0.35)",
          border: "1px solid rgba(15,23,42,0.10)",
          padding: 32,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div
            style={{
              fontSize: 36,
              fontWeight: 900,
              color: "#0f172a",
              letterSpacing: "-0.02em",
              marginBottom: 6,
            }}
          >
            Bienvenido a ViverApp 🌱
          </div>
          <div style={{ color: "#64748b", fontWeight: 700 }}>
            Gestión del vivero municipal de Santa Cruz de Tenerife
          </div>
        </div>

        <div
          style={{
            background: "rgba(16,185,129,0.06)",
            border: "1px solid rgba(16,185,129,0.22)",
            borderRadius: 16,
            padding: 18,
            marginBottom: 18,
            color: "#0f172a",
            fontWeight: 600,
            lineHeight: 1.55,
          }}
        >
          ViverApp te permite llevar el control del inventario del vivero:
          registrar entradas y salidas de plantas, fitosanitarios,
          fertilizantes, áridos, material vegetal y ferretería; gestionar
          pedidos internos y externos; ver el stock distribuido por zonas
          del mapa; y mantener trazabilidad por lote y caducidad.
        </div>

        <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
          <a
            href={PDF_URL}
            target="_blank"
            rel="noopener noreferrer"
            download
            style={resourceLinkStyle("#1d4ed8", "rgba(59,130,246,0.10)", "rgba(59,130,246,0.28)")}
          >
            <span style={{ fontSize: 22 }}>📄</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, color: "#0f172a" }}>
                Guía de uso (PDF)
              </div>
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>
                Descarga el manual completo con capturas y ejemplos.
              </div>
            </div>
            <span style={{ fontWeight: 900, color: "#1d4ed8" }}>Descargar →</span>
          </a>

          <a
            href={VIDEO_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={resourceLinkStyle("#b45309", "rgba(245,158,11,0.10)", "rgba(245,158,11,0.30)")}
          >
            <span style={{ fontSize: 22 }}>🎬</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 900, color: "#0f172a" }}>
                Vídeo explicativo
              </div>
              <div style={{ fontSize: 13, color: "#64748b", fontWeight: 700 }}>
                Tutorial paso a paso para empezar en pocos minutos.
              </div>
            </div>
            <span style={{ fontWeight: 900, color: "#b45309" }}>Ver →</span>
          </a>
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderRadius: 14,
            border: "1px solid rgba(15,23,42,0.10)",
            background: "rgba(255,255,255,0.7)",
            cursor: "pointer",
            userSelect: "none",
            color: "#0f172a",
            fontWeight: 700,
            marginBottom: 18,
          }}
        >
          <input
            type="checkbox"
            checked={showOnStart}
            onChange={(e) => setShowOnStart(e.target.checked)}
            style={{
              width: 18,
              height: 18,
              accentColor: "#10b981",
              cursor: "pointer",
            }}
          />
          <span>Mostrar al iniciar</span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#64748b", fontWeight: 600 }}>
            (también puedes reabrirlo desde el botón ? de la cabecera)
          </span>
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={handleClose}
            style={{
              padding: "12px 24px",
              borderRadius: 14,
              border: "1px solid rgba(16,185,129,0.35)",
              background: "linear-gradient(90deg, #10b981 0%, #06b6d4 100%)",
              color: "white",
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 12px 24px rgba(6,182,212,0.22)",
              fontSize: 15,
            }}
          >
            Empezar a usar ViverApp
          </button>
        </div>
      </div>
    </div>
  );
}

function resourceLinkStyle(color, bg, border) {
  return {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 18px",
    borderRadius: 16,
    border: `1px solid ${border}`,
    background: bg,
    color,
    textDecoration: "none",
    transition: "transform 0.15s ease, box-shadow 0.15s ease",
    boxShadow: "0 4px 12px rgba(2,6,23,0.04)",
  };
}

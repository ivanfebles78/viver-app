import React, { useState } from "react";
import { usePlantImage } from "../utils/plantImages";

// Muestra la imagen de una planta (si existe) en un modal. Reutilizable en la
// tabla de productos y en el selector de producto del modal de movimientos.
//
// Variantes:
//   - "link":   envuelve `children` (el nombre del producto) como enlace
//               clicable. Si no hay imagen, renderiza el nombre tal cual.
//   - "button": botón grande "🖼️ Ver imagen". Si no hay imagen, no renderiza
//               nada.
//   - "icon":   solo el icono 🖼️. Si no hay imagen, no renderiza nada.
//
// Props:
//   - nombreCientifico: usado para localizar la imagen (slug).
//   - nombreNatural: solo para el título del modal.
//   - stopPropagation: evita disparar el onClick de la fila contenedora.
export default function VerPlanta({
  nombreCientifico,
  nombreNatural,
  variant = "icon",
  stopPropagation = true,
  children,
}) {
  const url = usePlantImage(nombreCientifico);
  const [open, setOpen] = useState(false);

  const titulo = nombreCientifico || nombreNatural || "Planta";

  const handleOpen = (e) => {
    if (stopPropagation && e) e.stopPropagation();
    setOpen(true);
  };
  const handleClose = (e) => {
    if (stopPropagation && e) e.stopPropagation();
    setOpen(false);
  };

  const modal = open && (
    <div
      onClick={handleClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(2,6,23,0.65)",
        backdropFilter: "blur(4px)",
        zIndex: 1400,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: "min(760px, 96vw)",
          maxHeight: "92vh",
          background: "#fff",
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(2,6,23,0.45)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 18px",
            borderBottom: "1px solid rgba(15,23,42,0.08)",
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontStyle: "italic", color: "#0f172a" }}>{titulo}</div>
            {nombreNatural && nombreNatural !== titulo && (
              <div style={{ color: "#64748b", fontWeight: 700, fontSize: 13 }}>{nombreNatural}</div>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            style={{
              padding: "7px 14px",
              borderRadius: 10,
              border: "1px solid rgba(15,23,42,0.14)",
              background: "#f8fafc",
              color: "#334155",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Cerrar
          </button>
        </div>
        <div
          style={{
            padding: 16,
            background: "#0f172a",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "auto",
          }}
        >
          <img
            src={url}
            alt={titulo}
            style={{ maxWidth: "100%", maxHeight: "78vh", borderRadius: 10, display: "block" }}
          />
        </div>
      </div>
    </div>
  );

  // Modo enlace: el propio nombre del producto es clicable cuando hay imagen.
  if (variant === "link") {
    if (!url) return <>{children}</>;
    return (
      <>
        <span
          role="button"
          tabIndex={0}
          onClick={handleOpen}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleOpen(e);
            }
          }}
          title="Ver imagen de la planta"
          style={{
            color: "#047857",
            cursor: "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 3,
            textDecorationThickness: 2,
          }}
        >
          {children}
        </span>
        {modal}
      </>
    );
  }

  // Variantes con botón: si no hay imagen, no se muestra nada.
  if (!url) return null;

  const isButton = variant === "button";
  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title="Ver imagen de la planta"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: isButton ? "8px 14px" : "4px 8px",
          borderRadius: 10,
          border: "1px solid rgba(16,185,129,0.35)",
          background: "rgba(16,185,129,0.12)",
          color: "#065f46",
          fontWeight: 900,
          fontSize: isButton ? 13 : 12,
          cursor: "pointer",
          lineHeight: 1,
          whiteSpace: "nowrap",
        }}
      >
        🖼️{isButton ? " Ver imagen" : ""}
      </button>
      {modal}
    </>
  );
}

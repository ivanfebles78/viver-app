import React, { useEffect, useMemo, useRef, useState } from "react";
import { parsePoints, pointsToString } from "./zonesStorage";

const MIN_VERTICES = 3;

// Paleta de colores para nuevas zonas (mismo registro visual que las existentes).
const DEFAULT_COLOR_PALETTE = [
  "#F4E2C1", "#E87B69", "#9FD486", "#BFD9EA", "#F5D547",
  "#F08A80", "#F3CF39", "#A7D98C", "#9ECBE2", "#F3E0BD",
  "#F7E85B", "#6BAED6", "#4E8BC5", "#E56F61", "#C77DBA",
];

const pickRandomColor = () =>
  DEFAULT_COLOR_PALETTE[Math.floor(Math.random() * DEFAULT_COLOR_PALETTE.length)];

// Polígono cuadrado por defecto al crear una zona nueva (centro del mapa).
const defaultNewZonaPoints = () => [
  [950, 600],
  [1100, 600],
  [1100, 750],
  [950, 750],
];

export default function ZoneEditor({ zonas, onSave, onCancel, saving = false }) {
  const [editedZonas, setEditedZonas] = useState(() =>
    zonas.map((z) => ({ ...z, _points: parsePoints(z.puntos) }))
  );
  const [selectedId, setSelectedId] = useState(zonas[0]?.id ?? null);
  const [drag, setDrag] = useState(null);
  const svgRef = useRef(null);

  const selectedZona = useMemo(
    () => editedZonas.find((z) => z.id === selectedId) || null,
    [editedZonas, selectedId]
  );

  const getSVGPoint = (clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const transformed = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: transformed.x, y: transformed.y };
  };

  const handleMouseMove = (e) => {
    if (!drag) return;
    const { x, y } = getSVGPoint(e.clientX, e.clientY);
    setEditedZonas((prev) =>
      prev.map((z) => {
        if (z.id !== drag.zonaId) return z;
        if (drag.type === "vertex") {
          const newPoints = z._points.map((p, i) =>
            i === drag.idx ? [x, y] : p
          );
          return { ...z, _points: newPoints };
        }
        if (drag.type === "zona") {
          const dx = x - drag.lastX;
          const dy = y - drag.lastY;
          return {
            ...z,
            _points: z._points.map(([px, py]) => [px + dx, py + dy]),
          };
        }
        return z;
      })
    );
    if (drag.type === "zona") {
      setDrag({ ...drag, lastX: x, lastY: y });
    }
  };

  const endDrag = () => setDrag(null);

  const startVertexDrag = (e, zonaId, idx) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setDrag({ type: "vertex", zonaId, idx });
  };

  const startZonaDrag = (e, zonaId) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const { x, y } = getSVGPoint(e.clientX, e.clientY);
    setDrag({ type: "zona", zonaId, lastX: x, lastY: y });
  };

  const deleteVertex = (e, zonaId, idx) => {
    e.preventDefault();
    e.stopPropagation();
    setEditedZonas((prev) =>
      prev.map((z) => {
        if (z.id !== zonaId) return z;
        if (z._points.length <= MIN_VERTICES) return z;
        return { ...z, _points: z._points.filter((_, i) => i !== idx) };
      })
    );
  };

  const insertVertex = (e, zonaId, edgeIdx) => {
    e.stopPropagation();
    setEditedZonas((prev) =>
      prev.map((z) => {
        if (z.id !== zonaId) return z;
        const next = (edgeIdx + 1) % z._points.length;
        const [x1, y1] = z._points[edgeIdx];
        const [x2, y2] = z._points[next];
        const mid = [(x1 + x2) / 2, (y1 + y2) / 2];
        const newPoints = [
          ...z._points.slice(0, edgeIdx + 1),
          mid,
          ...z._points.slice(edgeIdx + 1),
        ];
        return { ...z, _points: newPoints };
      })
    );
  };

  const handleSave = () => {
    const out = editedZonas.map(({ _points, ...rest }) => ({
      ...rest,
      puntos: pointsToString(_points),
    }));
    onSave(out);
  };

  const handleResetZona = () => {
    if (!selectedZona) return;
    const original = zonas.find((z) => z.id === selectedZona.id);
    if (!original) return;
    setEditedZonas((prev) =>
      prev.map((z) =>
        z.id === selectedZona.id
          ? { ...z, _points: parsePoints(original.puntos) }
          : z
      )
    );
  };

  const handleAddZona = () => {
    const raw = window.prompt(
      "Identificador de la nueva zona (ej: 13, 3c, 10c). " +
        "Le añadiremos automáticamente el prefijo 'zona-'."
    );
    if (raw === null) return;
    const cleaned = raw.trim().toLowerCase().replace(/\s+/g, "");
    if (!cleaned) {
      window.alert("Identificador vacío. Operación cancelada.");
      return;
    }
    // Normalizamos cualquier variante: "zona-9b", "zona9b", "9b", "ZONA_9B"
    // se convierten todas a apiId="9b" / fullId="zona-9b". Sin esto,
    // tecleando "zona9b" se acababa creando "zona-zona9b" (doble prefijo).
    const apiId = cleaned.replace(/^zona[-_]?/i, "");
    if (!apiId) {
      window.alert("Identificador inválido. Operación cancelada.");
      return;
    }
    const fullId = `zona-${apiId}`;

    if (editedZonas.some((z) => z.id === fullId)) {
      window.alert(`Ya existe una zona con id "${fullId}".`);
      return;
    }
    if (!/^[a-z0-9-]+$/.test(apiId)) {
      window.alert(
        "El identificador solo puede contener letras (a-z), números y guiones."
      );
      return;
    }

    const newZona = {
      id: fullId,
      apiId,
      nombre: `Zona ${apiId}`,
      color: pickRandomColor(),
      _points: defaultNewZonaPoints(),
    };
    setEditedZonas((prev) => [...prev, newZona]);
    setSelectedId(fullId);
  };

  const handleDeleteZona = () => {
    if (!selectedZona) return;
    const ok = window.confirm(
      `¿Eliminar la zona "${selectedZona.nombre}" del mapa?\n\n` +
        "La zona se quitará del listado y dejará de aparecer en el plano. " +
        "El borrado no se aplica hasta que pulses \"Guardar cambios\". " +
        "Si tienes inventario asociado a esta zona en la base de datos, esos " +
        "registros NO se borran (siguen existiendo bajo el nombre antiguo)."
    );
    if (!ok) return;
    setEditedZonas((prev) => {
      const next = prev.filter((z) => z.id !== selectedZona.id);
      const fallbackId = next[0]?.id ?? null;
      setSelectedId(fallbackId);
      return next;
    });
  };

  const updateSelectedZonaMeta = (field, value) => {
    if (!selectedZona) return;
    setEditedZonas((prev) =>
      prev.map((z) => (z.id === selectedZona.id ? { ...z, [field]: value } : z))
    );
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="zone-editor">
      <div className="zone-editor-toolbar">
        <label className="zone-editor-field">
          <span>Zona:</span>
          <select
            value={selectedId || ""}
            onChange={(e) => setSelectedId(e.target.value || null)}
          >
            <option value="">— Selecciona una zona —</option>
            {editedZonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nombre} ({z._points.length} pts)
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={handleAddZona}
          className="zone-editor-btn-secondary"
          title="Crear una nueva zona con un cuadrado en el centro del plano"
        >
          + Añadir zona
        </button>

        <button
          type="button"
          onClick={handleDeleteZona}
          disabled={!selectedZona}
          className="zone-editor-btn-danger"
          title="Eliminar la zona seleccionada del mapa"
        >
          Eliminar zona
        </button>

        <button
          type="button"
          onClick={handleResetZona}
          disabled={!selectedZona}
          className="zone-editor-btn-secondary"
          title="Restaurar puntos originales de esta zona"
        >
          Restaurar zona
        </button>

        <span className="zone-editor-help">
          Arrastra los puntos blancos · Click en un + verde para insertar punto
          · Click derecho en un punto para borrarlo · Arrastra el cuerpo para
          mover toda la zona
        </span>

        <button
          type="button"
          onClick={handleSave}
          className="zone-editor-btn-save"
          disabled={saving}
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="zone-editor-btn-cancel"
          disabled={saving}
        >
          Cancelar
        </button>
      </div>

      {selectedZona && (
        <div className="zone-editor-meta-row">
          <label className="zone-editor-field">
            <span>Nombre:</span>
            <input
              type="text"
              value={selectedZona.nombre}
              onChange={(e) => updateSelectedZonaMeta("nombre", e.target.value)}
              maxLength={100}
            />
          </label>
          <label className="zone-editor-field">
            <span>Color:</span>
            <input
              type="color"
              value={selectedZona.color || "#cccccc"}
              onChange={(e) => updateSelectedZonaMeta("color", e.target.value)}
              style={{
                width: 40,
                height: 32,
                padding: 0,
                border: "1px solid #d6d3d1",
                borderRadius: 6,
                background: "#fff",
                cursor: "pointer",
              }}
            />
          </label>
          <span className="zone-editor-help" style={{ flex: 1 }}>
            ID: <code>{selectedZona.id}</code> · apiId:{" "}
            <code>{selectedZona.apiId || selectedZona.id}</code>
          </span>
        </div>
      )}

      <div className="vivero-map-wrapper zone-editor-canvas">
        <img
          src="/mapa-vivero.png"
          alt="Mapa del vivero"
          className="vivero-map-image"
        />
        <svg
          ref={svgRef}
          className="vivero-map-overlay"
          viewBox="0 0 2048 1365"
          preserveAspectRatio="xMidYMid meet"
          onMouseMove={handleMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          style={{ pointerEvents: "all" }}
        >
          {editedZonas.map((z) => {
            const isSelected = z.id === selectedId;
            const pointsStr = z._points
              .map(([x, y]) => `${x},${y}`)
              .join(" ");
            return (
              <g key={z.id} style={{ "--zona-color": z.color }}>
                <polygon
                  points={pointsStr}
                  className={`zona-clickable ${
                    isSelected ? "zona-editing" : "zona-dim"
                  }`}
                  onMouseDown={(e) =>
                    isSelected ? startZonaDrag(e, z.id) : undefined
                  }
                  onClick={(e) => {
                    if (!isSelected) {
                      e.stopPropagation();
                      setSelectedId(z.id);
                    }
                  }}
                >
                  <title>{z.nombre}</title>
                </polygon>
              </g>
            );
          })}

          {selectedZona &&
            selectedZona._points.map(([x, y], i) => {
              const next =
                (i + 1) % selectedZona._points.length;
              const [nx, ny] = selectedZona._points[next];
              const mx = (x + nx) / 2;
              const my = (y + ny) / 2;
              return (
                <g key={`handles-${i}`}>
                  <circle
                    cx={mx}
                    cy={my}
                    r={10}
                    className="zona-add-handle"
                    onClick={(e) => insertVertex(e, selectedZona.id, i)}
                  >
                    <title>Insertar punto aquí</title>
                  </circle>
                </g>
              );
            })}

          {selectedZona &&
            selectedZona._points.map(([x, y], i) => (
              <g key={`vertex-${i}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={14}
                  className="zona-vertex-handle"
                  onMouseDown={(e) =>
                    startVertexDrag(e, selectedZona.id, i)
                  }
                  onContextMenu={(e) =>
                    deleteVertex(e, selectedZona.id, i)
                  }
                >
                  <title>
                    Punto {i + 1} ({Math.round(x)}, {Math.round(y)}) · Arrastra
                    para mover · Click derecho para borrar
                  </title>
                </circle>
                <text
                  x={x}
                  y={y - 20}
                  className="zona-vertex-label"
                  textAnchor="middle"
                >
                  {i + 1}
                </text>
              </g>
            ))}
        </svg>
      </div>
    </div>
  );
}

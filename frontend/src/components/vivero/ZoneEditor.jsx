import { useEffect, useMemo, useRef, useState } from "react";

import { Button, Dialog, DialogContent } from "../../ui";
import { Alert } from "../ui/feedback";
import { useConfirm } from "../ui/ConfirmDialog";
import { parsePoints, pointsToString } from "./zonesStorage";
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  PALETA_ZONAS,
  construirZonaNueva,
  desplazarPoligono,
  insertarVertice,
  moverVertice,
  quitarVertice,
  validarNuevoId,
} from "./zonas.logic";

/*
 * EDITOR DE ZONAS DEL VIVERO.
 *
 * Las reglas de validación viven en `zonas.logic.js` y están fijadas por
 * `zonas.logic.test.js` contra una copia literal de main; el comportamiento de
 * la pantalla, por `ZoneEditor.test.jsx`.
 *
 * Comportamiento documentado en `docs/mapa-vivero-behaviour.md`.
 */

/** Cuánto mueve una pulsación de flecha, en unidades del plano. */
const PASO_TECLADO = 10;
const PASO_TECLADO_FINO = 1;

const pickRandomColor = () => PALETA_ZONAS[Math.floor(Math.random() * PALETA_ZONAS.length)];

export default function ZoneEditor({ zonas, onSave, onCancel, saving = false }) {
  const [editedZonas, setEditedZonas] = useState(() =>
    zonas.map((z) => ({ ...z, _points: parsePoints(z.puntos) }))
  );
  const [selectedId, setSelectedId] = useState(zonas[0]?.id ?? null);
  const [drag, setDrag] = useState(null);
  const svgRef = useRef(null);

  // Alta de zona: sustituye al `window.prompt` + cuatro `window.alert`.
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [altaValor, setAltaValor] = useState("");
  const [altaError, setAltaError] = useState("");

  const { confirmar, dialogo: dialogoConfirmacion } = useConfirm();

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

  const actualizarPuntos = (zonaId, fn) =>
    setEditedZonas((prev) => prev.map((z) => (z.id === zonaId ? { ...z, _points: fn(z._points) } : z)));

  const handleMouseMove = (e) => {
    if (!drag) return;
    const { x, y } = getSVGPoint(e.clientX, e.clientY);
    if (drag.type === "vertex") {
      actualizarPuntos(drag.zonaId, (pts) => moverVertice(pts, drag.idx, x, y));
    } else if (drag.type === "zona") {
      actualizarPuntos(drag.zonaId, (pts) => desplazarPoligono(pts, x - drag.lastX, y - drag.lastY));
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
    actualizarPuntos(zonaId, (pts) => quitarVertice(pts, idx));
  };

  const insertVertex = (e, zonaId, edgeIdx) => {
    e.stopPropagation();
    actualizarPuntos(zonaId, (pts) => insertarVertice(pts, edgeIdx));
  };

  /*
   * OPERACIÓN POR TECLADO — no existía.
   *
   * El editor entero era sólo ratón: arrastrar vértices y click derecho para
   * borrarlos. Un vértice no se podía ni enfocar. Ahora cada vértice es un
   * control enfocable: las flechas lo mueven (con Mayús, paso fino) y Supr lo
   * borra, respetando el mismo mínimo de tres puntos que el click derecho.
   */
  const onVertexKeyDown = (e, zonaId, idx) => {
    const paso = e.shiftKey ? PASO_TECLADO_FINO : PASO_TECLADO;
    const delta = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] }[e.key];

    if (delta) {
      e.preventDefault();
      actualizarPuntos(zonaId, (pts) => {
        const [x, y] = pts[idx];
        return moverVertice(pts, idx, x + delta[0], y + delta[1]);
      });
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      actualizarPuntos(zonaId, (pts) => quitarVertice(pts, idx));
    }
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
    actualizarPuntos(selectedZona.id, () => parsePoints(original.puntos));
  };

  /* ── Alta de zona ────────────────────────────────────────────────────── */

  const abrirAlta = () => {
    setAltaValor("");
    setAltaError("");
    setAltaAbierta(true);
  };

  const cerrarAlta = () => {
    setAltaAbierta(false);
    setAltaError("");
  };

  /**
   * Confirma el alta.
   *
   * Las seis ramas y su ORDEN los decide `validarNuevoId`; aquí sólo se pinta
   * el resultado. El error se muestra DENTRO del diálogo y éste sigue abierto,
   * para poder corregir sin volver a empezar — con `window.alert` había que
   * reabrir el prompt y teclearlo todo otra vez.
   */
  const confirmarAlta = (e) => {
    e?.preventDefault?.();
    const r = validarNuevoId(altaValor, editedZonas);
    if (!r.ok) {
      setAltaError(r.error);
      return;
    }
    const nueva = construirZonaNueva(r.apiId, r.fullId, pickRandomColor());
    setEditedZonas((prev) => [...prev, nueva]);
    setSelectedId(r.fullId);
    setAltaAbierta(false);
    setAltaError("");
  };

  const handleDeleteZona = async () => {
    if (!selectedZona) return;
    const ok = await confirmar({
      title: `¿Eliminar la zona «${selectedZona.nombre}»?`,
      description:
        "La zona se quitará del listado y dejará de aparecer en el plano. El borrado no se aplica " +
        'hasta que pulses «Guardar cambios». Si tienes inventario asociado a esta zona en la base de ' +
        "datos, esos registros NO se borran: siguen existiendo bajo el nombre antiguo.",
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!ok) return;

    setEditedZonas((prev) => {
      const next = prev.filter((z) => z.id !== selectedZona.id);
      setSelectedId(next[0]?.id ?? null);
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
      // Con un diálogo abierto, Escape le pertenece a él: cerrar el editor
      // entero por debajo perdería el trabajo sin avisar.
      if (e.key === "Escape" && !altaAbierta) onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, altaAbierta]);

  const claseControl =
    "h-[var(--control-height-md)] min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 outline-none focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor="zone-editor-zona" className="text-caption uppercase text-muted-foreground">
            Zona
          </label>
          <select
            id="zone-editor-zona"
            value={selectedId || ""}
            onChange={(e) => setSelectedId(e.target.value || null)}
            className={claseControl}
          >
            <option value="">— Selecciona una zona —</option>
            {editedZonas.map((z) => (
              <option key={z.id} value={z.id}>
                {z.nombre} ({z._points.length} pts)
              </option>
            ))}
          </select>
        </div>

        <Button type="button" variant="secondary" onClick={abrirAlta} title="Crear una nueva zona con un cuadrado en el centro del plano">
          Añadir zona
        </Button>
        <Button type="button" variant="destructive" onClick={handleDeleteZona} disabled={!selectedZona}>
          Eliminar zona
        </Button>
        <Button type="button" variant="secondary" onClick={handleResetZona} disabled={!selectedZona} title="Restaurar puntos originales de esta zona">
          Restaurar zona
        </Button>

        <span className="ms-auto flex gap-2">
          <Button type="button" variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
        </span>
      </div>

      <p className="text-body-sm text-muted-foreground">
        Arrastra los puntos blancos, o enfócalos con el tabulador y muévelos con las flechas
        (Mayús para el paso fino, Supr para borrarlos). Pulsa un «+» para insertar un punto y
        arrastra el cuerpo para mover la zona entera.
      </p>

      {selectedZona ? (
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor="zone-editor-nombre" className="text-caption uppercase text-muted-foreground">
              Nombre
            </label>
            <input
              id="zone-editor-nombre"
              type="text"
              value={selectedZona.nombre}
              onChange={(e) => updateSelectedZonaMeta("nombre", e.target.value)}
              maxLength={100}
              className={claseControl}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            {/*
             * El color de zona es un DATO, no un token: se persiste en el
             * servidor y es lo que hace reconocible el plano frente al impreso
             * que maneja el personal del vivero.
             */}
            <label htmlFor="zone-editor-color" className="text-caption uppercase text-muted-foreground">
              Color
            </label>
            <input
              id="zone-editor-color"
              type="color"
              value={selectedZona.color || "#cccccc"}
              onChange={(e) => updateSelectedZonaMeta("color", e.target.value)}
              className="h-[var(--control-height-md)] w-12 cursor-pointer rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-1"
            />
          </div>
          <p className="text-body-sm text-muted-foreground">
            ID: <code>{selectedZona.id}</code> · apiId:{" "}
            <code>{selectedZona.apiId || selectedZona.id}</code>
          </p>
        </div>
      ) : null}

      <div className="vivero-map-wrapper zone-editor-canvas">
        {/* `alt=""`: el nombre lo da el `role="application"` del SVG de encima. */}
        <img src="/mapa-vivero.png" alt="" className="vivero-map-image" />
        <svg
          ref={svgRef}
          className="vivero-map-overlay"
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          onMouseMove={handleMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          role="application"
          aria-label="Editor de polígonos de zona sobre el plano del vivero"
          style={{ pointerEvents: "all" }}
        >
          {editedZonas.map((z) => {
            const isSelected = z.id === selectedId;
            const pointsStr = z._points.map(([x, y]) => `${x},${y}`).join(" ");
            return (
              <g key={z.id} style={{ "--zona-color": z.color }}>
                <polygon
                  points={pointsStr}
                  className={`zona-clickable ${isSelected ? "zona-editing" : "zona-dim"}`}
                  tabIndex={0}
                  role="button"
                  aria-pressed={isSelected}
                  aria-label={`Zona ${z.nombre}`}
                  onMouseDown={(e) => (isSelected ? startZonaDrag(e, z.id) : undefined)}
                  onClick={(e) => {
                    if (!isSelected) {
                      e.stopPropagation();
                      setSelectedId(z.id);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedId(z.id);
                    }
                  }}
                >
                  <title>{z.nombre}</title>
                </polygon>
              </g>
            );
          })}

          {selectedZona?._points.map(([x, y], i) => {
            const next = (i + 1) % selectedZona._points.length;
            const [nx, ny] = selectedZona._points[next];
            return (
              <circle
                key={`add-${i}`}
                cx={(x + nx) / 2}
                cy={(y + ny) / 2}
                r={10}
                className="zona-add-handle"
                tabIndex={0}
                role="button"
                aria-label={`Insertar punto entre ${i + 1} y ${next + 1}`}
                onClick={(e) => insertVertex(e, selectedZona.id, i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    insertVertex(e, selectedZona.id, i);
                  }
                }}
              >
                <title>Insertar punto aquí</title>
              </circle>
            );
          })}

          {selectedZona?._points.map(([x, y], i) => (
            <g key={`vertex-${i}`}>
              <circle
                cx={x}
                cy={y}
                r={14}
                className="zona-vertex-handle"
                tabIndex={0}
                role="button"
                aria-label={`Punto ${i + 1} de ${selectedZona.nombre}, en ${Math.round(x)}, ${Math.round(y)}`}
                onMouseDown={(e) => startVertexDrag(e, selectedZona.id, i)}
                onContextMenu={(e) => deleteVertex(e, selectedZona.id, i)}
                onKeyDown={(e) => onVertexKeyDown(e, selectedZona.id, i)}
              >
                <title>
                  Punto {i + 1} ({Math.round(x)}, {Math.round(y)}) · Arrastra o usa las flechas ·
                  Supr para borrar
                </title>
              </circle>
              <text x={x} y={y - 20} className="zona-vertex-label" textAnchor="middle">
                {i + 1}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Alta de zona: sustituye al `window.prompt` y a sus cuatro `window.alert`. */}
      <Dialog open={altaAbierta} onOpenChange={(abierto) => !abierto && cerrarAlta()}>
        <DialogContent
          title="Añadir una zona"
          description="Se creará un cuadrado en el centro del plano que podrás mover y ajustar."
          closeLabel="Cerrar"
          size="sm"
        >
          <form onSubmit={confirmarAlta} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="zone-editor-nuevo-id" className="text-caption uppercase text-muted-foreground">
                Identificador
              </label>
              <input
                id="zone-editor-nuevo-id"
                type="text"
                value={altaValor}
                onChange={(e) => {
                  setAltaValor(e.target.value);
                  // El error se limpia al escribir: mantenerlo mientras se
                  // corrige es ruido que contradice lo que se está tecleando.
                  if (altaError) setAltaError("");
                }}
                autoFocus
                aria-describedby="zone-editor-nuevo-id-ayuda"
                className={`${claseControl} w-full`}
              />
              <p id="zone-editor-nuevo-id-ayuda" className="text-body-sm text-muted-foreground">
                Por ejemplo 13, 3c o 10c. Se le añade el prefijo «zona-»
                automáticamente; letras, números y guiones.
              </p>
            </div>

            {altaError ? <Alert tone="error">{altaError}</Alert> : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={cerrarAlta}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary">
                Crear zona
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {dialogoConfirmacion}
    </div>
  );
}

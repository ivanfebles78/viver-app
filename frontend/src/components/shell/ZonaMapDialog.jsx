import React, { useEffect, useMemo, useState } from "react";

import { getZonaItems, marcarZonaInterna } from "../../api/api";
import { Button, Dialog, DialogContent, Skeleton } from "../../ui";
import mapaVivero from "../../assets/mapa-vivero.png";
import "../vivero/MapaVivero.css";
import zonasDefault from "../vivero/zonasConfig";
import ZoneEditor from "../vivero/ZoneEditor";
import { loadZonasFromServer, saveZonasToServer } from "../vivero/zonesStorage";
import { formatCantidad } from "../../utils/numero";
import { Alert } from "../ui/feedback";
import { MAP_HEIGHT, MAP_WIDTH, resolveZoneApiId } from "../vivero/zonas.logic";

/**
 * MAPA DEL VIVERO — consulta de inventario por zona.
 *
 * Extraído de `layout/Layout.jsx@main` (líneas 933–1417). El CONTENIDO interno
 * se conserva tal cual: la migración visual de esta pantalla pertenece a la
 * fase del Vivero, no a la del shell, y reescribirla aquí mezclaría dos
 * trabajos con riesgos distintos.
 *
 * Lo que sí cambia es el CONTENEDOR. Antes era un `<div position:fixed>` que no
 * atrapaba el foco, no respondía a Escape y no lo devolvía al abrirse y
 * cerrarse — es decir, un usuario de teclado quedaba tabulando por detrás del
 * modal sin saberlo. Ahora es un `Dialog` de Radix, que hace las tres cosas.
 */

// Flip to true to re-enable the in-app zone editor (button + drag UI).
const ENABLE_ZONE_EDITOR = true;

/*
 * NOTA: aquí vivía getZoneAliases(), que en main estaba definida y no se
 * llamaba desde ningún sitio. Se deja fuera al extraer en lugar de arrastrar
 * codigo muerto a un fichero nuevo. La resolucion real del identificador de
 * zona la hace resolveZoneApiId(), mas abajo.
 */

function ZonePanelLoading() {
  return (
    <div style={{ marginTop: 18, display: "grid", gap: 12 }}>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          style={{
            padding: 14,
            borderRadius: 16,
            border: "1px solid rgba(15,23,42,0.08)",
            background: "rgba(248,250,252,0.72)",
          }}
        >
          <div style={{ height: 14, width: "62%", borderRadius: 999, background: "rgba(148,163,184,0.26)", marginBottom: 10 }} />
          <div style={{ height: 12, width: "84%", borderRadius: 999, background: "rgba(148,163,184,0.20)", marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ height: 26, width: 82, borderRadius: 999, background: "rgba(6,182,212,0.12)" }} />
            <span style={{ height: 26, width: 72, borderRadius: 999, background: "rgba(6,182,212,0.10)" }} />
            <span style={{ height: 26, width: 94, borderRadius: 999, background: "rgba(6,182,212,0.08)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}



/** Cuántos productos de la zona se muestran por tanda ("Mostrar más"). */
const ZONA_ITEMS_STEP = 8;

function ZonaMapModal({ open, onClose, isAdmin = false }) {
  const [selectedZone, setSelectedZone] = useState(null);
  const [zonaData, setZonaData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [zonaError, setZonaError] = useState("");
  const [internaBusy, setInternaBusy] = useState(false);
  // Nº de productos visibles (paginación "Mostrar más"). Se reinicia al cambiar
  // de zona.
  const [visibleCount, setVisibleCount] = useState(ZONA_ITEMS_STEP);
  useEffect(() => {
    setVisibleCount(ZONA_ITEMS_STEP);
  }, [selectedZone]);

  // Arrancamos con los defaults estáticos para pintar instantáneamente.
  // El useEffect refresca desde el servidor cuando el modal se abre.
  const [zonas, setZonas] = useState(zonasDefault);
  const [editMode, setEditMode] = useState(false);
  const [savingZonas, setSavingZonas] = useState(false);

  const canEdit = ENABLE_ZONE_EDITOR && isAdmin;

  const zonePolygons = useMemo(
    () => (Array.isArray(zonas) ? zonas.filter((z) => !z.disabled) : []),
    [zonas]
  );

  // Cuando se abre el modal, recarga las zonas desde el servidor.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    loadZonasFromServer().then((data) => {
      if (!cancelled) setZonas(data);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleEditorSave = async (updatedZonas) => {
    setSavingZonas(true);
    try {
      const saved = await saveZonasToServer(updatedZonas);
      setZonas(Array.isArray(saved) && saved.length > 0 ? saved : updatedZonas);
      setEditMode(false);
    } catch (err) {
      console.error("Error guardando zonas en servidor:", err);
      // Antes era un `window.alert`: bloqueaba el hilo y no dejaba rastro, así
      // que al aceptarlo el usuario no sabía si sus cambios seguían ahí.
      setZonaError(
        "No se pudo guardar la configuración de zonas en el servidor. " +
          "Revisa la conexión y vuelve a intentarlo."
      );
    } finally {
      setSavingZonas(false);
    }
  };

  const selectedZoneLabel =
    zonePolygons.find((z) => String(z.id) === String(selectedZone))?.nombre ||
    (selectedZone ? `Zona ${String(selectedZone).toUpperCase()}` : "Selecciona una zona");

  /*
   * La resolución del identificador de zona vive en `zonas.logic.js`, fijada
   * por equivalencia contra esta misma implementación: cuatro vías, de más
   * fiable a menos, empezando por la geometría. El ORDEN es el contrato.
   */

  const loadZone = async (zone) => {
    setSelectedZone(zone?.id);
    setZonaError("");
    setLoading(true);
    setZonaData(null);

    const zoneId = resolveZoneApiId(zone);
    try {
      const data = await getZonaItems(zoneId);
      setZonaData({ ...(data || {}), _resolvedZone: zoneId });
    } catch (e) {
      setZonaData(null);
      setZonaError(
        e?.response?.data?.detail || e?.message || "No se pudo cargar el stock de la zona"
      );
    } finally {
      setLoading(false);
    }
  };

  // Marcar/desmarcar como interna la zona actual (solo admin).
  const handleMarcarInterna = async (checked) => {
    const zid = zonaData?._resolvedZone;
    if (!zid) return;
    setInternaBusy(true);
    setZonaError("");
    try {
      await marcarZonaInterna(zid, checked);
      const data = await getZonaItems(zid);
      setZonaData({ ...(data || {}), _resolvedZone: zid });
      try { window.dispatchEvent(new Event("vivero:data-changed")); } catch { /* noop */ }
    } catch (e) {
      setZonaError(e?.response?.data?.detail || e?.message || "No se pudo actualizar la zona.");
    } finally {
      setInternaBusy(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setSelectedZone(null);
      setZonaData(null);
      setZonaError("");
      setLoading(false);
    }
  }, [open]);

  // El editor de zonas ocupa toda la superficie: se presenta como su propio
  // diálogo en lugar de anidarse dentro del anterior.
  if (editMode && canEdit) {
    return (
      <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
        <DialogContent
          title="Editar zonas del vivero"
          description="Arrastra los vértices para ajustar cada zona sobre el plano."
          closeLabel="Cerrar"
          size="lg"
          /* El sistema define --modal-width-xl (960px) pero DialogContent solo
             expone sm/md/lg. Se toma el token sancionado en lugar de inventar
             un ancho: un plano con su panel de inventario al lado no cabe en
             los 760px de `lg`. */
          className="max-w-[var(--modal-width-xl)]"
        >
          <div className="max-h-[75dvh] overflow-auto p-4">
            <ZoneEditor
              zonas={zonas}
              onSave={handleEditorSave}
              onCancel={() => setEditMode(false)}
              saving={savingZonas}
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        title="Mapa del vivero"
        description="Selecciona una zona del plano para consultar sus productos, cantidades y tamaños."
        closeLabel="Cerrar"
        size="lg"
        className="max-w-[var(--modal-width-xl)]"
      >
        {/* Una sola columna por debajo de lg: en un portátil pequeño o una
            tablet, dos columnas dejaban el panel de inventario en 200px. */}
        <div className="grid max-h-[75dvh] min-h-0 grid-cols-1 overflow-y-auto lg:grid-cols-[1.45fr_0.8fr] lg:overflow-hidden">
          <div className="min-h-0 overflow-y-auto border-b border-border p-4 lg:border-b-0 lg:border-r">
            {canEdit && (
              <div className="mb-3 flex justify-end">
                <Button variant="secondary" size="sm" onClick={() => setEditMode(true)}>
                  Editar zonas
                </Button>
              </div>
            )}

          {/*
            DEFECTOS CORREGIDOS EN EL PLANO:
              · Los polígonos eran `<polygon onClick>` sin `tabIndex`, sin rol y
                sin manejador de teclado: el mapa era inalcanzable sin ratón.
              · No tenían `<title>` ni etiqueta, así que tampoco tenían nombre
                accesible: un lector de pantalla no podía nombrar ninguna zona.
              · El relleno era transparente salvo la seleccionada, y la
                selección se comunicaba SÓLO con color.

            Ahora cada zona lleva su color de datos —igual que en el mapa de la
            página del vivero, para que los dos planos se lean igual—, es
            enfocable, tiene nombre, y la selección va además por `aria-pressed`
            y por un trazo notablemente más grueso.
          */}
          <div className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]"
            style={{ aspectRatio: `${MAP_WIDTH} / ${MAP_HEIGHT}` }}
          >
            {/*
              `alt=""` deliberado: el nombre lo da el `role="group"` del SVG que
              va justo encima («Plano del vivero: elige una zona…»), y cada zona
              es un botón con su propia etiqueta. Poner también un alt aquí haría
              que el lector anunciara el plano dos veces seguidas.
            */}
            <img
              src={mapaVivero}
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
            />

            <svg
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              preserveAspectRatio="xMidYMid meet"
              className="absolute inset-0 h-full w-full"
              role="group"
              aria-label="Plano del vivero: elige una zona para ver su inventario"
            >
              {zonePolygons.map((z) => {
                const activa = selectedZone === z.id;
                const nombre = z.nombre || `Zona ${z.apiId || z.id}`;
                return (
                  <polygon
                    key={z.id}
                    points={z.puntos}
                    className={`zona-clickable${activa ? " zona-editing" : ""}`}
                    style={{ "--zona-color": z.color }}
                    tabIndex={0}
                    role="button"
                    aria-pressed={activa}
                    aria-label={`Consultar inventario de ${nombre}`}
                    onClick={() => loadZone(z)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        loadZone(z);
                      }
                    }}
                  >
                    <title>{nombre}</title>
                  </polygon>
                );
              })}
            </svg>
          </div>
        </div>

        <div style={{ padding: 20, overflowY: "auto", minHeight: 0, maxHeight: "86vh" }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#0f172a" }}>
            {selectedZone ? selectedZoneLabel : "Selecciona una zona"}
          </div>

          {selectedZone && !loading && !zonaError && zonaData?.items?.length ? (
            <div style={{ marginTop: 2, fontSize: 14, fontWeight: 800, color: "#1e3a8a" }}>
              {zonaData.items.length} {zonaData.items.length === 1 ? "producto" : "productos"} en esta zona
            </div>
          ) : null}

          {isAdmin && selectedZone && !loading && !zonaError && zonaData?.items?.length ? (
            <label
              style={{
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(15,23,42,0.12)",
                background: zonaData.todos_internos ? "rgba(239,68,68,0.06)" : "#f8fafc",
                cursor: internaBusy ? "wait" : "pointer",
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              <input
                type="checkbox"
                checked={!!zonaData.todos_internos}
                disabled={internaBusy}
                onChange={(e) => handleMarcarInterna(e.target.checked)}
                style={{ width: 18, height: 18, cursor: internaBusy ? "wait" : "pointer" }}
              />
              <span>
                Marcar zona como interna
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginTop: 2 }}>
                  {internaBusy
                    ? "Actualizando…"
                    : "Si está marcada, todos los productos de esta zona son internos y la empresa externa no los ve ni los puede pedir."}
                </div>
              </span>
            </label>
          ) : null}

          {!selectedZone ? (
            <div style={{ marginTop: 12, color: "#64748b", fontWeight: 700 }}>
              Selecciona una zona del mapa para consultar su inventario.
            </div>
          ) : loading ? (
            <ZonePanelLoading />
          ) : zonaError ? (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 14,
                border: "1px solid rgba(239,68,68,0.25)",
                background: "rgba(239,68,68,0.08)",
                color: "#991b1b",
                fontWeight: 800,
              }}
            >
              {zonaError}
            </div>
          ) : !zonaData?.items?.length ? (
            <div
              style={{
                marginTop: 12,
                color: "#92400e",
                fontWeight: 800,
                background: "rgba(245,158,11,0.10)",
                border: "1px solid rgba(245,158,11,0.25)",
                borderRadius: 12,
                padding: 12,
              }}
            >
              No se encontraron productos para esta zona con el identificador consultado.
              {zonaData?._resolvedZone ? ` Consulta usada: ${zonaData._resolvedZone}` : ""}
            </div>
          ) : (
            <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              {zonaData.items.slice(0, visibleCount).map((item, idx) => (
                <div
                  key={`${item.producto_id || item.nombre_cientifico || "item"}-${idx}`}
                  style={{
                    padding: 14,
                    borderRadius: 16,
                    border: "1px solid rgba(15,23,42,0.08)",
                    background: "rgba(248,250,252,0.72)",
                  }}
                >
                  <div style={{ fontWeight: 900, color: "#0f172a" }}>
                    {item.nombre_cientifico || item.nombre_natural || "Producto"}
                  </div>

                  <div style={{ marginTop: 4, color: "#64748b", fontWeight: 700 }}>
                    {item.nombre_natural || "—"}
                    {item.categoria ? ` · ${item.categoria}` : ""}
                    {item.subcategoria ? ` · ${item.subcategoria}` : ""}
                  </div>

                  <div style={{ marginTop: 8, fontWeight: 900, color: "#0f172a" }}>
                    Cantidad total: {formatCantidad(item.cantidad ?? 0) || "0"}
                  </div>

                  <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {(item.tamanos || []).length === 0 ? (
                      <span style={{ color: "#64748b", fontWeight: 700 }}>Sin detalle por tamaño</span>
                    ) : (
                      item.tamanos.map((t, tIdx) => (
                        <span
                          key={`${item.producto_id || item.nombre_cientifico || "item"}-${t.tamano || tIdx}`}
                          style={{
                            padding: "6px 10px",
                            borderRadius: 999,
                            background: "rgba(6,182,212,0.10)",
                            border: "1px solid rgba(6,182,212,0.18)",
                            color: "#0f172a",
                            fontWeight: 900,
                            fontSize: 12,
                          }}
                        >
                          {t.tamano}: {formatCantidad(t.cantidad)}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}

              {zonaData.items.length > visibleCount && (
                <button
                  type="button"
                  onClick={() => setVisibleCount((c) => c + ZONA_ITEMS_STEP)}
                  style={{
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "1px dashed rgba(6,182,212,0.5)",
                    background: "rgba(6,182,212,0.06)",
                    color: "#0e7490",
                    fontWeight: 900,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  Mostrar más ({zonaData.items.length - visibleCount} restantes)
                </button>
              )}
              {visibleCount > ZONA_ITEMS_STEP && (
                <button
                  type="button"
                  onClick={() => setVisibleCount(ZONA_ITEMS_STEP)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: "#fff",
                    color: "#475569",
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Mostrar menos
                </button>
              )}
            </div>
          )}
        </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ZonaMapModal;

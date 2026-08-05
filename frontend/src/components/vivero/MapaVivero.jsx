import React, { useEffect, useState } from "react";
import "./MapaVivero.css";
import useMapaDebug from "./useMapaDebug";
import { getMe, getZonaItems, fetchMapaImagenUrl, uploadMapaImagen } from "../../api/api";
import zonasDefault from "./zonasConfig";
import ZoneEditor from "./ZoneEditor";
import { loadZonasFromServer, saveZonasToServer } from "./zonesStorage";
import { formatCantidad } from "../../utils/numero";
import { getZonaDisplayName } from "../../utils/zonas";

const DEBUG_MAPA = false;
// Cinturón de seguridad: si está en false, el editor está oculto para todos
// (incluso admins). Para deshabilitar la funcionalidad por completo, ponerlo
// a false y desplegar.
const ENABLE_ZONE_EDITOR = false;

const readUserFromStorage = () => {
  try {
    return JSON.parse(window.localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
};

export default function MapaVivero() {
  // zonas siempre arrancan con el fichero estático para que la primera pintura
  // sea instantánea. El useEffect de abajo refresca desde el servidor.
  const [zonas, setZonas] = useState(zonasDefault);
  const [editMode, setEditMode] = useState(false);
  const [savingZonas, setSavingZonas] = useState(false);

  const [me, setMe] = useState(() => readUserFromStorage());

  const [zonaSeleccionada, setZonaSeleccionada] = useState(null);
  const [zonaData, setZonaData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const debugClick = useMapaDebug();

  // Imagen del mapa DEL AYUNTAMIENTO ACTIVO (servida por el backend desde la
  // BD). Si el ayuntamiento aún no tiene mapa propio, caemos al PNG estático.
  const [mapaUrl, setMapaUrl] = useState(null);
  const [subiendoMapa, setSubiendoMapa] = useState(false);

  const cargarMapa = React.useCallback(() => {
    let objectUrl = null;
    fetchMapaImagenUrl()
      .then((url) => {
        objectUrl = url;
        setMapaUrl(url);
      })
      .catch(() => setMapaUrl(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, []);

  useEffect(() => cargarMapa(), [cargarMapa]);

  // Carga inicial desde servidor (con fallback al fichero si falla).
  useEffect(() => {
    let cancelled = false;
    loadZonasFromServer().then((data) => {
      if (!cancelled) setZonas(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Verificar rol del usuario actual.
  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((data) => {
        if (!cancelled) setMe(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const userRole = (me?.rol || me?.role || "").toString().trim().toLowerCase();
  const isAdmin = userRole === "admin" || userRole === "admin_vivero";
  const canEdit = ENABLE_ZONE_EDITOR && isAdmin;
  // Subir/cambiar la imagen del mapa del vivero: admin, admin_vivero y manager.
  const canManageMapa = ["admin", "admin_vivero", "manager"].includes(userRole);

  const handleSubirMapa = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // permite volver a subir el mismo fichero
    if (!file) return;
    setSubiendoMapa(true);
    setError("");
    try {
      await uploadMapaImagen(file);
      cargarMapa();
    } catch (err) {
      setError(
        err?.response?.data?.detail || "No se pudo subir la imagen del mapa."
      );
    } finally {
      setSubiendoMapa(false);
    }
  };

  const handleZonaClick = async (zona) => {
    setZonaSeleccionada(zona);
    setZonaData(null);
    setError("");
    setLoading(true);

    try {
      const data = await getZonaItems(zona.apiId || zona.id);
      setZonaData(data);
    } catch (err) {
      console.error(err);
      setError("No se pudo cargar la información de esta zona.");
    } finally {
      setLoading(false);
    }
  };

  const cerrarModal = () => {
    setZonaSeleccionada(null);
    setZonaData(null);
    setError("");
    setLoading(false);
  };

  const handleEditorSave = async (updatedZonas) => {
    setSavingZonas(true);
    try {
      const saved = await saveZonasToServer(updatedZonas);
      setZonas(Array.isArray(saved) && saved.length > 0 ? saved : updatedZonas);
      setEditMode(false);
    } catch (err) {
      console.error("Error guardando zonas en servidor:", err);
      window.alert(
        "No se pudo guardar la configuración de zonas en el servidor. " +
          "Revisa la conexión y vuelve a intentarlo."
      );
    } finally {
      setSavingZonas(false);
    }
  };

  const items = zonaData?.items || zonaData?.productos || [];
  // Nº de productos DIFERENTES en la zona (una misma especie en varios tamaños
  // cuenta como un solo producto).
  const numProductosDistintos = new Set(
    items
      .map((i) => String(i.nombre_cientifico || i.cientifico || i.producto || "").trim().toLowerCase())
      .filter(Boolean)
  ).size;

  if (editMode && canEdit) {
    return (
      <ZoneEditor
        zonas={zonas}
        onSave={handleEditorSave}
        onCancel={() => setEditMode(false)}
        saving={savingZonas}
      />
    );
  }

  return (
    <>
      {(canEdit || canManageMapa) && (
        <div className="vivero-admin-bar">
          {canEdit && (
            <button
              type="button"
              className="vivero-admin-btn"
              onClick={() => setEditMode(true)}
            >
              Editar zonas
            </button>
          )}
          {canManageMapa && (
            <label className="vivero-admin-btn" style={{ cursor: "pointer" }}>
              {subiendoMapa ? "Subiendo…" : (mapaUrl ? "Cambiar mapa" : "Subir mapa")}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleSubirMapa}
                disabled={subiendoMapa}
                style={{ display: "none" }}
              />
            </label>
          )}
        </div>
      )}

      {error && (
        <div style={{ margin: "6px 0", color: "#b91c1c", fontWeight: 700 }}>
          {error}
        </div>
      )}

      <div className="vivero-map-wrapper">
        <img
          src={mapaUrl || "/mapa-vivero.png"}
          alt="Mapa del vivero"
          className="vivero-map-image"
        />

        <svg
          className="vivero-map-overlay"
          viewBox="0 0 2048 1365"
          preserveAspectRatio="xMidYMid meet"
          onClick={DEBUG_MAPA ? debugClick : undefined}
          style={DEBUG_MAPA ? { pointerEvents: "all" } : undefined}
        >
          {DEBUG_MAPA && (
            <rect x="0" y="0" width="2048" height="1365" fill="transparent" />
          )}
          {zonas.map((zona) => (
            <polygon
              key={zona.id}
              points={zona.puntos}
              className="zona-clickable"
              style={{ "--zona-color": zona.color }}
              onClick={() => handleZonaClick(zona)}
            >
              <title>{getZonaDisplayName(zona.nombre || zona.apiId || zona.id)}</title>
            </polygon>
          ))}
        </svg>

      </div>

      {/* Modal de zona: overlay AUTÓNOMO (fuera del wrapper del mapa, que tiene
          overflow:hidden). Cabecera y botón fijos; la lista de especies hace
          scroll dentro del modal aunque haya muchas. */}
      {zonaSeleccionada && (
        <div
          onClick={cerrarModal}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            zIndex: 3000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 14,
              width: "min(560px, 96vw)",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 18px 50px rgba(0,0,0,0.28)",
            }}
          >
            {/* Cabecera fija */}
            <div style={{ padding: "18px 20px 10px", borderBottom: "1px solid rgba(15,23,42,0.08)" }}>
              <h2 style={{ margin: 0, fontSize: 20 }}>
                {getZonaDisplayName(zonaSeleccionada.nombre || zonaSeleccionada.apiId || zonaSeleccionada.id)}
              </h2>
              {!loading && !error && items.length > 0 && (
                <div style={{ fontSize: 13, color: "#1e3a8a", fontWeight: 800, marginTop: 4 }}>
                  {numProductosDistintos} {numProductosDistintos === 1 ? "producto diferente" : "productos diferentes"}
                  {items.length !== numProductosDistintos ? ` · ${items.length} líneas` : ""}
                </div>
              )}
            </div>

            {/* Cuerpo con scroll */}
            <div style={{ padding: "12px 20px", overflowY: "auto", flex: 1 }}>
              {loading && <p>Cargando información...</p>}
              {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
              {!loading && !error && items.length === 0 && (
                <p>No hay stock registrado en esta zona.</p>
              )}
              {!loading && !error && items.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {items.map((item, index) => (
                    <div key={index} className="zona-item">
                      <strong>
                        {item.nombre_cientifico || item.cientifico || item.producto || "Producto"}
                      </strong>
                      <br />
                      Cantidad: {formatCantidad(item.cantidad || item.total || 0) || "0"}
                      {item.tamano && (
                        <>
                          <br />
                          Tamaño: {item.tamano}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pie fijo */}
            <div style={{ padding: "10px 20px 16px", borderTop: "1px solid rgba(15,23,42,0.08)", textAlign: "right" }}>
              <button onClick={cerrarModal}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

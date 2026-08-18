import React, { useEffect, useState } from "react";
import "./MapaVivero.css";
import useMapaDebug from "./useMapaDebug";
import { getMe, getZonaItems, fetchMapaImagenUrl, uploadMapaImagen } from "../../api/api";
import zonasDefault from "./zonasConfig";
import ZoneEditor from "./ZoneEditor";
import { loadZonasFromServer, saveZonasToServer } from "./zonesStorage";
import { formatCantidad } from "../../utils/numero";
import { getZonaDisplayName } from "../../utils/zonas";
import { Button, Dialog, DialogContent } from "../../ui";
import { Alert } from "../ui/feedback";
import { contarProductosDistintos, nombreItem } from "./zonas.logic";

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
      // Antes era un `window.alert`: bloqueaba el hilo y no dejaba rastro en la
      // pantalla, así que al aceptarlo el usuario se quedaba sin saber si sus
      // cambios seguían ahí. Ahora es un aviso persistente con rol ARIA.
      setError(
        "No se pudo guardar la configuración de zonas en el servidor. " +
          "Revisa la conexión y vuelve a intentarlo."
      );
    } finally {
      setSavingZonas(false);
    }
  };

  const items = zonaData?.items || zonaData?.productos || [];
  // Nº de productos DIFERENTES: una misma especie en varios tamaños cuenta como
  // un solo producto. La regla vive en `zonas.logic.js`, fijada por equivalencia.
  const numProductosDistintos = contarProductosDistintos(items);

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

      {/*
        El mismo `error` alimenta este aviso y el del diálogo de zona. Con el
        diálogo abierto se veía DOS VECES el mismo mensaje, uno detrás del otro.
        Aquí se muestra sólo cuando no hay diálogo: dentro, el usuario ya lo
        tiene delante.
      */}
      {error && !zonaSeleccionada ? (
        <Alert tone="error" onDismiss={() => setError("")}>
          {error}
        </Alert>
      ) : null}

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
          {/*
            DEFECTO CORREGIDO: los polígonos eran `<polygon onClick>` sin
            `tabIndex`, sin rol y sin manejador de teclado, así que el mapa
            entero era inalcanzable sin ratón. Ahora cada zona es un control
            con nombre accesible, enfocable y activable con Enter o Espacio.
          */}
          {zonas.map((zona) => {
            const nombre = getZonaDisplayName(zona.nombre || zona.apiId || zona.id);
            return (
              <polygon
                key={zona.id}
                points={zona.puntos}
                className="zona-clickable"
                style={{ "--zona-color": zona.color }}
                tabIndex={0}
                role="button"
                aria-label={`Consultar inventario de ${nombre}`}
                onClick={() => handleZonaClick(zona)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleZonaClick(zona);
                  }
                }}
              >
                <title>{nombre}</title>
              </polygon>
            );
          })}
        </svg>

      </div>

      {/* Modal de zona: overlay AUTÓNOMO (fuera del wrapper del mapa, que tiene
          overflow:hidden). Cabecera y botón fijos; la lista de especies hace
          scroll dentro del modal aunque haya muchas. */}
      {/*
        DEFECTO CORREGIDO: era un `div position:fixed` hecho a mano, sin trampa
        de foco, sin cierre con Escape y sin devolver el foco al cerrarse — un
        usuario de teclado se quedaba tabulando por detrás del modal.
      */}
      <Dialog
        open={!!zonaSeleccionada}
        onOpenChange={(abierto) => !abierto && cerrarModal()}
      >
        {zonaSeleccionada ? (
          <DialogContent
            title={getZonaDisplayName(
              zonaSeleccionada.nombre || zonaSeleccionada.apiId || zonaSeleccionada.id
            )}
            description="Inventario registrado en esta zona del vivero."
            closeLabel="Cerrar"
            size="md"
          >
            <div className="flex max-h-[70dvh] min-w-0 flex-col gap-3 overflow-y-auto">
              {!loading && !error && items.length > 0 ? (
                <p className="text-body-sm text-muted-foreground">
                  {numProductosDistintos}{" "}
                  {numProductosDistintos === 1 ? "producto diferente" : "productos diferentes"}
                  {items.length !== numProductosDistintos ? ` · ${items.length} líneas` : ""}
                </p>
              ) : null}

              {loading ? <p className="text-muted-foreground">Cargando información…</p> : null}
              {error ? <Alert tone="error">{error}</Alert> : null}
              {!loading && !error && items.length === 0 ? (
                <p className="text-muted-foreground">No hay stock registrado en esta zona.</p>
              ) : null}

              {!loading && !error && items.length > 0 ? (
                <ul className="flex list-none flex-col gap-2 p-0">
                  {items.map((item, index) => (
                    <li key={index} className="zona-item">
                      <span className="font-[var(--font-weight-medium)]">{nombreItem(item)}</span>
                      <span className="mt-1 block text-body-sm text-muted-foreground">
                        Cantidad: {formatCantidad(item.cantidad || item.total || 0) || "0"}
                        {item.tamano ? ` · Tamaño: ${item.tamano}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="flex justify-end">
                <Button type="button" variant="secondary" onClick={cerrarModal}>
                  Cerrar
                </Button>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}

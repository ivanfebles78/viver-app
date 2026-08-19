import React, { useEffect, useMemo, useState } from "react";

import { getZonaItems, marcarZonaInterna } from "../../api/api";
import { Badge, Button, Dialog, DialogContent, Skeleton } from "../../ui";
import { useConfirm } from "../ui/ConfirmDialog";
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
  /*
   * Esqueleto de carga. Antes eran barras con `rgba` a mano; ahora usa el
   * `Skeleton` del sistema, que además respeta `prefers-reduced-motion`.
   *
   * `aria-busy` + `role="status"`: sin esto, un lector de pantalla no anuncia
   * que se está cargando y el panel parece simplemente vacío.
   */
  return (
    <div className="mt-3 flex flex-col gap-3" role="status" aria-busy="true">
      <span className="sr-only">Cargando el inventario de la zona…</span>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3"
        >
          <Skeleton className="h-3.5 w-3/5" />
          <Skeleton className="h-3 w-4/5" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-6 w-24" />
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
  const { confirmar, dialogo: dialogoConfirmacion } = useConfirm();
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

    /*
     * Cambia la VISIBILIDAD de todos los productos de la zona para la empresa
     * externa. Es una acción de permisos: se espera la confirmación antes de
     * tocar el backend. Si se cancela, la casilla vuelve sola a su sitio,
     * porque su valor lo manda `zonaData.todos_internos`, no el clic.
     */
    const ok = await confirmar({
      title: checked ? "¿Marcar la zona como interna?" : "¿Quitar la marca de zona interna?",
      description: checked
        ? `Todos los productos de «${selectedZoneLabel}» pasarán a ser internos: la empresa externa dejará de verlos y no podrá pedirlos.`
        : `Los productos de «${selectedZoneLabel}» dejarán de ser internos: la empresa externa volverá a verlos y podrá pedirlos.`,
      confirmLabel: checked ? "Marcar como interna" : "Quitar la marca",
      destructive: checked,
    });
    if (!ok) return;

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
            tablet, dos columnas dejaban el panel de inventario en 200px.

            `lg:grid-rows-[minmax(0,1fr)]` NO es decorativo. Sin él la fila se
            dimensiona por su contenido, las columnas se estiran hasta esa
            altura, y su `overflow-y: auto` no llega a activarse nunca porque su
            altura ya es la de su contenido. Con `overflow-hidden` en la rejilla,
            todo lo que sobrepasaba el alto máximo quedaba RECORTADO y fuera del
            alcance: con 60 productos, el panel medía 1572px dentro de una caja
            de 600px y el botón «Mostrar más» caía a 1649px, fuera de la
            ventana. `minmax(0, …)` es lo que permite que la fila baje del
            tamaño de su contenido; `1fr` sola tiene un mínimo automático de
            `auto` y no encogería. */}
        <div className="grid max-h-[75dvh] min-h-0 grid-cols-1 overflow-y-auto lg:grid-cols-[1.45fr_0.8fr] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
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

        {/*
          Tres franjas: cabecera, lista y acciones. La lista es lo único que se
          desplaza. Antes se desplazaba el panel ENTERO, de modo que el nombre
          de la zona y el botón «Mostrar más» se iban con él; con una zona
          grande había que recorrer todo el inventario para volver a leer de qué
          zona era, y las acciones quedaban al final de un recorrido largo.
        */}
        <div className="flex min-h-0 flex-col p-4">
          <div className="shrink-0">
            <h3 className="text-h3 font-[var(--font-weight-semibold)]">
              {selectedZone ? selectedZoneLabel : "Selecciona una zona"}
            </h3>

            {selectedZone && !loading && !zonaError && zonaData?.items?.length ? (
              <p className="text-body-sm text-muted-foreground">
                {zonaData.items.length}{" "}
                {zonaData.items.length === 1 ? "producto" : "productos"} en esta zona
              </p>
            ) : null}
          </div>

          {/*
            MARCAR ZONA COMO INTERNA — acción de PERMISOS.
            Esconde todos los productos de la zona a la empresa externa. Antes
            se disparaba con un simple clic en la casilla, sin confirmación de
            ningún tipo. Ahora pasa por `useConfirm`, esperado, y la casilla
            sigue reflejando el estado del SERVIDOR: si se cancela, no se mueve.
          */}
          {isAdmin && selectedZone && !loading && !zonaError && zonaData?.items?.length ? (
            <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-3">
              <label htmlFor="zona-interna" className="flex items-start gap-3">
                <input
                  id="zona-interna"
                  type="checkbox"
                  checked={!!zonaData.todos_internos}
                  disabled={internaBusy}
                  onChange={(e) => handleMarcarInterna(e.target.checked)}
                  className="mt-0.5 size-4 shrink-0"
                />
                <span className="min-w-0">
                  <span className="font-[var(--font-weight-medium)]">Marcar zona como interna</span>
                  <span className="mt-1 block text-body-sm text-muted-foreground">
                    {internaBusy
                      ? "Actualizando…"
                      : "Si está marcada, todos los productos de esta zona son internos y la empresa externa no los ve ni los puede pedir."}
                  </span>
                </span>
              </label>
            </div>
          ) : null}

          {!selectedZone ? (
            <p className="mt-3 text-muted-foreground">
              Selecciona una zona del mapa para consultar su inventario.
            </p>
          ) : loading ? (
            <ZonePanelLoading />
          ) : zonaError ? (
            <div className="mt-3">
              <Alert tone="error">{zonaError}</Alert>
            </div>
          ) : !zonaData?.items?.length ? (
            <div className="mt-3">
              {/*
                El identificador consultado se sigue mostrando a propósito: la
                config del servidor puede traer ids corruptos, y saber con qué
                se preguntó es lo que permite darse cuenta.
              */}
              <Alert tone="warning">
                No se encontraron productos para esta zona con el identificador consultado.
                {zonaData?._resolvedZone ? ` Consulta usada: ${zonaData._resolvedZone}` : ""}
              </Alert>
            </div>
          ) : (
            /* `min-h-0` en los dos: sin él, el mínimo automático de un
               elemento flexible es el tamaño de su contenido, y ni el contenedor
               ni la lista bajarían del alto del inventario — que es la misma
               trampa que tenía la rejilla. */
            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
              <ul className="m-0 flex min-h-0 flex-1 list-none flex-col gap-3 overflow-y-auto p-0">
                {zonaData.items.slice(0, visibleCount).map((item, idx) => (
                  <li
                    key={`${item.producto_id || item.nombre_cientifico || "item"}-${idx}`}
                    className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3"
                  >
                    <p className="break-words [overflow-wrap:anywhere] font-[var(--font-weight-medium)]">
                      {item.nombre_cientifico || item.nombre_natural || "Producto"}
                    </p>
                    <p className="text-body-sm text-muted-foreground">
                      {item.nombre_natural || "—"}
                      {item.categoria ? ` · ${item.categoria}` : ""}
                      {item.subcategoria ? ` · ${item.subcategoria}` : ""}
                    </p>
                    <p className="tabular mt-2 font-[var(--font-weight-medium)]">
                      Cantidad total: {formatCantidad(item.cantidad ?? 0) || "0"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(item.tamanos || []).length === 0 ? (
                        <span className="text-body-sm text-muted-foreground">
                          Sin detalle por tamaño
                        </span>
                      ) : (
                        item.tamanos.map((t, tIdx) => (
                          <Badge
                            key={`${item.producto_id || item.nombre_cientifico || "item"}-${t.tamano || tIdx}`}
                            tone="info"
                          >
                            {t.tamano}: {formatCantidad(t.cantidad)}
                          </Badge>
                        ))
                      )}
                    </div>
                  </li>
                ))}
              </ul>

              {/* Las acciones quedan ancladas debajo de la lista: son la forma
                  de traer el resto del inventario, así que tenerlas al final de
                  un desplazamiento largo era justo lo contrario de lo útil. */}
              {zonaData.items.length > visibleCount || visibleCount > ZONA_ITEMS_STEP ? (
                <div className="flex shrink-0 flex-col gap-3">
                  {zonaData.items.length > visibleCount ? (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setVisibleCount((c) => c + ZONA_ITEMS_STEP)}
                    >
                      Mostrar más ({zonaData.items.length - visibleCount} restantes)
                    </Button>
                  ) : null}
                  {visibleCount > ZONA_ITEMS_STEP ? (
                    <Button type="button" variant="ghost" onClick={() => setVisibleCount(ZONA_ITEMS_STEP)}>
                      Mostrar menos
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
        </div>
        {dialogoConfirmacion}
      </DialogContent>
    </Dialog>
  );
}

export default ZonaMapModal;

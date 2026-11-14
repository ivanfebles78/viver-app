import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Plus, Trash2, Save } from "lucide-react";

import {
  getPackComplementos,
  getProductos,
  crearPackLinea,
  actualizarPackLinea,
  eliminarPackLinea,
} from "../api/api";
import { Button, Card, Field, Input, PageHeader } from "../ui";
import { Alert } from "../components/ui/feedback";
import { useConfirm } from "../components/ui/ConfirmDialog";
import { formatCantidad } from "../utils/numero";

/*
 * PACK DE COMPLEMENTOS DE ÁRBOL — editor por AYUNTAMIENTO.
 *
 * El admin/manager define qué complementos (ferretería: tutores, travesaños,
 * clavos, cinta, hebillas…) y cuántos POR ÁRBOL se ofrecen al añadir un árbol a
 * un pedido. Antes estaba hardcodeado; ahora es configurable y propio de cada
 * ayuntamiento. La detección de "árbol" sigue siendo por subcategoría.
 */

const nombreProd = (p) =>
  p?.nombre_cientifico || p?.producto_nombre_cientifico || p?.nombre || p?.nombre_natural || `Producto #${p?.id}`;

const numCtrl =
  "h-[var(--control-height-sm)] w-24 min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-right tabular text-body-sm outline-none focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring";
const txtCtrl =
  "h-[var(--control-height-sm)] w-28 min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-body-sm outline-none focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring";
const selCtrl =
  "h-[var(--control-height-md)] w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-body-sm outline-none focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring";

export default function PackComplementos() {
  const { me } = useOutletContext() || {};
  const [lineas, setLineas] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState(null);
  // Edición local por línea (cantidad/tamaño) + marca de cambios.
  const [edit, setEdit] = useState({}); // { [id]: { cantidad, tamano, dirty } }
  // Alta de línea.
  const [buscar, setBuscar] = useState("");
  const [nuevoProd, setNuevoProd] = useState("");
  const [nuevaCant, setNuevaCant] = useState("");
  const [nuevoTam, setNuevoTam] = useState("");
  const [creando, setCreando] = useState(false);
  const { confirmar, dialogo } = useConfirm();

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [pack, prods] = await Promise.all([getPackComplementos(), getProductos()]);
      const ls = Array.isArray(pack?.lineas) ? pack.lineas : [];
      setLineas(ls);
      setProductos(Array.isArray(prods) ? prods : []);
      setEdit(
        Object.fromEntries(
          ls.map((l) => [l.id, { cantidad: String(l.cantidad_por_arbol ?? ""), tamano: l.tamano || "", dirty: false }])
        )
      );
    } catch (e) {
      setError(e?.response?.data?.detail || "No se pudo cargar el pack de complementos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga única al montar
  }, []);

  const productosOrden = useMemo(
    () => [...productos].sort((a, b) => String(nombreProd(a)).localeCompare(String(nombreProd(b)), "es")),
    [productos]
  );
  const productosFiltrados = useMemo(() => {
    const t = buscar.trim().toLowerCase();
    if (!t) return productosOrden;
    return productosOrden.filter(
      (p) =>
        String(nombreProd(p)).toLowerCase().includes(t) ||
        String(p?.nombre_natural || "").toLowerCase().includes(t) ||
        String(p?.sku || "").toLowerCase().includes(t)
    );
  }, [productosOrden, buscar]);

  const setCampo = (id, campo, valor) =>
    setEdit((m) => ({ ...m, [id]: { ...m[id], [campo]: valor, dirty: true } }));

  const guardar = async (linea) => {
    const e = edit[linea.id] || {};
    const cant = Number(String(e.cantidad ?? "").replace(",", "."));
    if (!cant || cant <= 0) {
      setError("La cantidad por árbol debe ser mayor que 0.");
      return;
    }
    setBusyId(linea.id);
    setError("");
    setMsg("");
    try {
      await actualizarPackLinea(linea.id, { cantidad_por_arbol: cant, tamano: (e.tamano || "").trim() || null });
      setEdit((m) => ({ ...m, [linea.id]: { ...m[linea.id], dirty: false } }));
      setMsg("Línea guardada.");
    } catch (err) {
      setError(err?.response?.data?.detail || "No se pudo guardar la línea.");
    } finally {
      setBusyId(null);
    }
  };

  const borrar = async (linea) => {
    const ok = await confirmar({
      title: `¿Quitar «${linea.producto_nombre}» del pack?`,
      description: "Solo afecta a este ayuntamiento.",
      confirmLabel: "Quitar",
      destructive: true,
    });
    if (!ok) return;
    setBusyId(linea.id);
    setError("");
    try {
      await eliminarPackLinea(linea.id);
      await load();
      setMsg("Complemento quitado del pack.");
    } catch (err) {
      setError(err?.response?.data?.detail || "No se pudo quitar la línea.");
    } finally {
      setBusyId(null);
    }
  };

  const crear = async () => {
    const pid = Number(nuevoProd);
    const cant = Number(String(nuevaCant).replace(",", "."));
    if (!pid) {
      setError("Elige un producto complemento.");
      return;
    }
    if (!cant || cant <= 0) {
      setError("Indica una cantidad por árbol mayor que 0.");
      return;
    }
    setCreando(true);
    setError("");
    setMsg("");
    try {
      await crearPackLinea({ producto_id: pid, cantidad_por_arbol: cant, tamano: nuevoTam.trim() || null });
      setNuevoProd("");
      setNuevaCant("");
      setNuevoTam("");
      setBuscar("");
      await load();
      setMsg("Complemento añadido al pack.");
    } catch (err) {
      setError(err?.response?.data?.detail || "No se pudo añadir el complemento.");
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Pack de complementos de árbol"
        description="Define qué complementos y cuántos POR ÁRBOL se ofrecen al añadir un árbol a un pedido. Es propio de este ayuntamiento."
      />

      {msg ? (
        <Alert tone="success" onDismiss={() => setMsg("")}>
          {msg}
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="error" onDismiss={() => setError("")}>
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : (
        <>
          <Card className="flex flex-col gap-3 p-[var(--card-padding)]">
            <div className="text-body font-[var(--font-weight-semibold)]">Añadir complemento</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto_auto]">
              <div className="flex min-w-0 flex-col gap-1">
                <Field label="Producto complemento">
                  <Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar por nombre o SKU…" />
                </Field>
                <select
                  value={nuevoProd}
                  onChange={(e) => setNuevoProd(e.target.value)}
                  aria-label="Producto complemento a añadir"
                  className={selCtrl}
                >
                  <option value="">Elige el producto…</option>
                  {productosFiltrados.slice(0, 200).map((p) => (
                    <option key={p.id} value={p.id}>
                      {nombreProd(p)}
                      {p.sku ? ` · ${p.sku}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <Field label="Por árbol">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={nuevaCant}
                  onChange={(e) => setNuevaCant(e.target.value)}
                  aria-label="Cantidad por árbol"
                  className={numCtrl}
                />
              </Field>
              <Field label="Tamaño (opcional)">
                <input
                  value={nuevoTam}
                  onChange={(e) => setNuevoTam(e.target.value)}
                  placeholder="Ej.: 2,4"
                  aria-label="Tamaño del complemento"
                  className={txtCtrl}
                />
              </Field>
              <div className="flex items-end">
                <Button type="button" variant="primary" onClick={crear} loading={creando}>
                  <Plus className="size-4" aria-hidden="true" />
                  Añadir
                </Button>
              </div>
            </div>
          </Card>

          {lineas.length === 0 ? (
            <p className="text-muted-foreground">
              El pack está vacío. Añade los complementos que quieras ofrecer por cada árbol.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)]">
              <table className="w-full border-collapse">
                <caption className="sr-only">Complementos del pack de árbol, con su cantidad por árbol.</caption>
                <thead>
                  <tr className="bg-[var(--muted)]">
                    <th scope="col" className="p-3 text-left text-caption font-[var(--font-weight-semibold)]">Complemento</th>
                    <th scope="col" className="p-3 text-left text-caption font-[var(--font-weight-semibold)]">Tamaño</th>
                    <th scope="col" className="p-3 text-right text-caption font-[var(--font-weight-semibold)]">Por árbol</th>
                    <th scope="col" className="p-3 text-right text-caption font-[var(--font-weight-semibold)]">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l) => {
                    const e = edit[l.id] || {};
                    return (
                      <tr key={l.id} className="border-t border-[var(--border)]">
                        <td className="p-3">
                          <div className="font-[var(--font-weight-medium)]">{l.producto_nombre}</div>
                          <div className="text-caption text-muted-foreground">
                            {l.producto_subcategoria || "—"}
                            {l.producto_sku ? ` · ${l.producto_sku}` : ""}
                          </div>
                        </td>
                        <td className="p-3">
                          <input
                            value={e.tamano ?? ""}
                            onChange={(ev) => setCampo(l.id, "tamano", ev.target.value)}
                            placeholder="—"
                            aria-label={`Tamaño de ${l.producto_nombre}`}
                            className={txtCtrl}
                          />
                        </td>
                        <td className="p-3 text-right">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={e.cantidad ?? ""}
                            onChange={(ev) => setCampo(l.id, "cantidad", ev.target.value)}
                            aria-label={`Cantidad por árbol de ${l.producto_nombre}`}
                            className={numCtrl}
                          />
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="primary"
                              onClick={() => guardar(l)}
                              disabled={!e.dirty || busyId === l.id}
                              loading={busyId === l.id}
                            >
                              <Save className="size-3.5" aria-hidden="true" />
                              Guardar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={() => borrar(l)}
                              disabled={busyId === l.id}
                            >
                              <Trash2 className="size-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-body-sm text-muted-foreground">
            Al añadir un árbol a un pedido (producto cuya subcategoría es «Árbol»), se ofrecerá este pack con{" "}
            <span className="tabular">{formatCantidad(1)}</span>× la cantidad por árbol indicada, comprobando que hay
            existencias.
          </p>
        </>
      )}

      {dialogo}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Pencil, Trash2, Plus, Check, X } from "lucide-react";

import { Button, Dialog, DialogContent } from "../../ui";
import { Alert } from "../ui/feedback";
import {
  getCategorias,
  createCategoria,
  renameCategoria,
  deleteCategoria,
  createSubcategoria,
  renameSubcategoria,
  deleteSubcategoria,
} from "../../api/api";

/**
 * GESTIÓN DEL CATÁLOGO DE CATEGORÍAS Y SUBCATEGORÍAS (admin/superadmin).
 *
 * Añadir, renombrar y eliminar. Al renombrar, el backend propaga el cambio a
 * los productos que la usan; al eliminar una que está en uso, el backend
 * responde 409 y aquí se muestra el motivo. Cada operación devuelve el catálogo
 * completo actualizado.
 */
export default function CategoriasModal({ open, onClose, onChanged }) {
  const [catalogo, setCatalogo] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [nuevaSubPorCat, setNuevaSubPorCat] = useState({}); // { [catId]: valor }
  const [edit, setEdit] = useState(null); // { kind: "cat"|"sub", id, valor }

  const cargar = () => {
    setLoading(true);
    setError("");
    getCategorias()
      .then((data) => setCatalogo(data))
      .catch((e) => setError(e?.response?.data?.detail || "No se pudo cargar el catálogo."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (open) {
      setEdit(null);
      setNuevaCategoria("");
      setNuevaSubPorCat({});
      cargar();
    }
  }, [open]);

  // Envuelve una mutación: actualiza el catálogo devuelto y avisa al padre.
  const ejecutar = async (fn) => {
    setBusy(true);
    setError("");
    try {
      const data = await fn();
      if (Array.isArray(data)) setCatalogo(data);
      onChanged?.();
    } catch (e) {
      setError(e?.response?.data?.detail || "No se pudo completar la operación.");
    } finally {
      setBusy(false);
    }
  };

  const anadirCategoria = async (e) => {
    e.preventDefault();
    const n = nuevaCategoria.trim();
    if (!n) return;
    await ejecutar(() => createCategoria(n));
    setNuevaCategoria("");
  };

  const anadirSub = async (catId) => {
    const n = (nuevaSubPorCat[catId] || "").trim();
    if (!n) return;
    await ejecutar(() => createSubcategoria(catId, n));
    setNuevaSubPorCat((m) => ({ ...m, [catId]: "" }));
  };

  const guardarEdit = async () => {
    const n = (edit?.valor || "").trim();
    if (!n) return;
    const { kind, id } = edit;
    await ejecutar(() => (kind === "cat" ? renameCategoria(id, n) : renameSubcategoria(id, n)));
    setEdit(null);
  };

  const controlCls =
    "h-[var(--control-height-sm)] min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-body-sm outline-none focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring";

  const enEdicion = (kind, id) => edit && edit.kind === kind && edit.id === id;

  return (
    <Dialog open={open} onOpenChange={(a) => !a && onClose()}>
      <DialogContent
        title="Categorías y subcategorías"
        description="Gestiona el catálogo que se usa al clasificar los productos. Al renombrar, se actualiza en los productos que la usan."
        closeLabel="Cerrar"
        size="md"
      >
        <div className="flex max-h-[70dvh] flex-col gap-3 overflow-y-auto">
          {error ? (
            <Alert tone="error" onDismiss={() => setError("")}>
              {error}
            </Alert>
          ) : null}

          {/* Añadir categoría */}
          <form onSubmit={anadirCategoria} className="flex flex-wrap items-center gap-2">
            <input
              value={nuevaCategoria}
              onChange={(e) => setNuevaCategoria(e.target.value)}
              placeholder="Nueva categoría"
              aria-label="Nueva categoría"
              className={`${controlCls} flex-1`}
            />
            <Button type="submit" variant="secondary" size="sm" disabled={busy || !nuevaCategoria.trim()}>
              <Plus aria-hidden="true" className="size-4" />
              Añadir categoría
            </Button>
          </form>

          {loading ? (
            <p className="text-muted-foreground">Cargando…</p>
          ) : catalogo.length === 0 ? (
            <p className="text-muted-foreground">Aún no hay categorías. Añade la primera arriba.</p>
          ) : (
            <ul className="flex list-none flex-col gap-3 p-0">
              {catalogo.map((cat) => (
                <li
                  key={cat.id}
                  className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3"
                >
                  {/* Cabecera de categoría */}
                  <div className="flex flex-wrap items-center gap-2">
                    {enEdicion("cat", cat.id) ? (
                      <>
                        <input
                          value={edit.valor}
                          onChange={(e) => setEdit((s) => ({ ...s, valor: e.target.value }))}
                          aria-label={`Nuevo nombre de ${cat.nombre}`}
                          autoFocus
                          className={`${controlCls} flex-1`}
                        />
                        <Button type="button" variant="primary" size="sm" onClick={guardarEdit} disabled={busy}>
                          <Check aria-hidden="true" className="size-4" /> Guardar
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={() => setEdit(null)} disabled={busy}>
                          <X aria-hidden="true" className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 font-[var(--font-weight-semibold)]">{cat.nombre}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEdit({ kind: "cat", id: cat.id, valor: cat.nombre })}
                          disabled={busy}
                        >
                          <Pencil aria-hidden="true" className="size-4" /> Renombrar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => ejecutar(() => deleteCategoria(cat.id))}
                          disabled={busy}
                        >
                          <Trash2 aria-hidden="true" className="size-4" /> Eliminar
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Subcategorías */}
                  <ul className="mt-2 flex list-none flex-col gap-1.5 border-l border-[var(--border)] pl-3">
                    {cat.subcategorias.length === 0 ? (
                      <li className="text-body-sm text-muted-foreground">Sin subcategorías</li>
                    ) : (
                      cat.subcategorias.map((sub) => (
                        <li key={sub.id} className="flex flex-wrap items-center gap-2">
                          {enEdicion("sub", sub.id) ? (
                            <>
                              <input
                                value={edit.valor}
                                onChange={(e) => setEdit((s) => ({ ...s, valor: e.target.value }))}
                                aria-label={`Nuevo nombre de ${sub.nombre}`}
                                autoFocus
                                className={`${controlCls} flex-1`}
                              />
                              <Button type="button" variant="primary" size="sm" onClick={guardarEdit} disabled={busy}>
                                <Check aria-hidden="true" className="size-4" />
                              </Button>
                              <Button type="button" variant="ghost" size="sm" onClick={() => setEdit(null)} disabled={busy}>
                                <X aria-hidden="true" className="size-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <span className="flex-1 text-body-sm">{sub.nombre}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setEdit({ kind: "sub", id: sub.id, valor: sub.nombre })}
                                disabled={busy}
                                aria-label={`Renombrar ${sub.nombre}`}
                              >
                                <Pencil aria-hidden="true" className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => ejecutar(() => deleteSubcategoria(sub.id))}
                                disabled={busy}
                                aria-label={`Eliminar ${sub.nombre}`}
                              >
                                <Trash2 aria-hidden="true" className="size-4" />
                              </Button>
                            </>
                          )}
                        </li>
                      ))
                    )}

                    {/* Añadir subcategoría */}
                    <li className="mt-1 flex flex-wrap items-center gap-2">
                      <input
                        value={nuevaSubPorCat[cat.id] || ""}
                        onChange={(e) => setNuevaSubPorCat((m) => ({ ...m, [cat.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            anadirSub(cat.id);
                          }
                        }}
                        placeholder="Nueva subcategoría"
                        aria-label={`Nueva subcategoría en ${cat.nombre}`}
                        className={`${controlCls} flex-1`}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => anadirSub(cat.id)}
                        disabled={busy || !(nuevaSubPorCat[cat.id] || "").trim()}
                      >
                        <Plus aria-hidden="true" className="size-4" /> Añadir
                      </Button>
                    </li>
                  </ul>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-end pt-1">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useRef, useState } from "react";
import { ImageUp } from "lucide-react";

import { Button, Dialog, DialogContent } from "../../ui";
import { Alert } from "../ui/feedback";
import {
  getMiAyuntamiento,
  updateMiAyuntamiento,
  fetchLogoImagenUrl,
  uploadLogoImagen,
  deleteLogoImagen,
} from "../../api/api";

/**
 * AJUSTES DEL AYUNTAMIENTO — logo y nombre usados en los informes.
 *
 * Disponible para la administración del ayuntamiento (admin/admin_vivero) y para
 * el superadmin sobre el ayuntamiento que tenga seleccionado. El logo se guarda
 * en la BD (como el mapa); el nombre es el del propio ayuntamiento.
 */
export default function AjustesAyuntamientoModal({ open, onClose }) {
  const [nombre, setNombre] = useState("");
  const [nombreOriginal, setNombreOriginal] = useState("");
  const [tieneLogo, setTieneLogo] = useState(false);
  const [logoUrl, setLogoUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false); // guardando nombre
  const [subiendo, setSubiendo] = useState(false); // subiendo/quitando logo
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  // Object URL vivo del logo: revocado antes de sustituirlo y al desmontar.
  const logoUrlRef = useRef(null);
  const fileInputRef = useRef(null);

  const cargarLogo = () => {
    fetchLogoImagenUrl()
      .then((url) => {
        if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
        logoUrlRef.current = url;
        setLogoUrl(url);
        setTieneLogo(!!url);
      })
      .catch(() => {
        if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
        logoUrlRef.current = null;
        setLogoUrl(null);
        setTieneLogo(false);
      });
  };

  useEffect(() => {
    if (!open) return;
    setError("");
    setOk("");
    setLoading(true);
    getMiAyuntamiento()
      .then((c) => {
        setNombre(c.nombre || "");
        setNombreOriginal(c.nombre || "");
        setTieneLogo(!!c.tiene_logo);
      })
      .catch((e) =>
        setError(e?.response?.data?.detail || "No se pudo cargar el ayuntamiento.")
      )
      .finally(() => setLoading(false));
    cargarLogo();
  }, [open]);

  useEffect(
    () => () => {
      if (logoUrlRef.current) URL.revokeObjectURL(logoUrlRef.current);
    },
    []
  );

  const cerrar = () => {
    setError("");
    setOk("");
    onClose();
  };

  const guardarNombre = async (e) => {
    e.preventDefault();
    const n = nombre.trim();
    if (!n) {
      setError("El nombre no puede estar vacío.");
      return;
    }
    setBusy(true);
    setError("");
    setOk("");
    try {
      await updateMiAyuntamiento(n);
      setNombreOriginal(n);
      setOk("Nombre actualizado. Aparecerá en los informes.");
    } catch (err) {
      setError(err?.response?.data?.detail || "No se pudo guardar el nombre.");
    } finally {
      setBusy(false);
    }
  };

  const subirLogo = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSubiendo(true);
    setError("");
    setOk("");
    try {
      await uploadLogoImagen(file);
      cargarLogo();
      setOk("Logo actualizado. Aparecerá en los informes.");
    } catch (err) {
      setError(err?.response?.data?.detail || "No se pudo subir el logo.");
    } finally {
      setSubiendo(false);
    }
  };

  const quitarLogo = async () => {
    setSubiendo(true);
    setError("");
    setOk("");
    try {
      await deleteLogoImagen();
      if (logoUrlRef.current) {
        URL.revokeObjectURL(logoUrlRef.current);
        logoUrlRef.current = null;
      }
      setLogoUrl(null);
      setTieneLogo(false);
      setOk("Logo eliminado. Los informes usarán el logo genérico.");
    } catch (err) {
      setError(err?.response?.data?.detail || "No se pudo quitar el logo.");
    } finally {
      setSubiendo(false);
    }
  };

  const campoClase =
    "h-[var(--control-height-md)] min-w-0 flex-1 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 outline-none focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring";

  return (
    <Dialog open={open} onOpenChange={(abierto) => !abierto && cerrar()}>
      <DialogContent
        title="Ajustes del ayuntamiento"
        description="El logo y el nombre se usan en la cabecera de todos los informes."
        closeLabel="Cerrar"
        size="md"
      >
        <div className="flex flex-col gap-4">
          {loading ? (
            <p className="text-muted-foreground">Cargando…</p>
          ) : (
            <>
              <form onSubmit={guardarNombre} className="flex flex-col gap-1">
                <label htmlFor="ajustes-nombre" className="text-caption uppercase text-muted-foreground">
                  Nombre del ayuntamiento
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="ajustes-nombre"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    maxLength={150}
                    className={campoClase}
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={busy || nombre.trim() === nombreOriginal.trim() || !nombre.trim()}
                  >
                    {busy ? "Guardando…" : "Guardar nombre"}
                  </Button>
                </div>
              </form>

              <div className="flex flex-col gap-2">
                <span className="text-caption uppercase text-muted-foreground">Logo (para los informes)</span>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]">
                    {logoUrl ? (
                      <img
                        src={logoUrl}
                        alt="Logo del ayuntamiento"
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="px-1 text-center text-caption text-muted-foreground">Sin logo</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={subiendo}
                    >
                      <ImageUp aria-hidden="true" className="size-4" />
                      {subiendo ? "Subiendo…" : tieneLogo ? "Cambiar logo" : "Subir logo"}
                    </Button>
                    {tieneLogo && (
                      <Button type="button" variant="ghost" size="sm" onClick={quitarLogo} disabled={subiendo}>
                        Quitar logo
                      </Button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={subirLogo}
                      disabled={subiendo}
                      aria-hidden="true"
                      tabIndex={-1}
                      className="sr-only"
                    />
                  </div>
                </div>
                <p className="text-body-sm text-muted-foreground">
                  PNG, JPG, WEBP o GIF (máx. 8&nbsp;MB). Si no hay logo, los informes usan el genérico de ViverApp.
                </p>
              </div>

              {error ? (
                <Alert tone="error" onDismiss={() => setError("")}>
                  {error}
                </Alert>
              ) : null}
              {ok ? (
                <Alert tone="success" onDismiss={() => setOk("")}>
                  {ok}
                </Alert>
              ) : null}
            </>
          )}

          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={cerrar}>
              Cerrar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

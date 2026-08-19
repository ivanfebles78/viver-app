import { useState } from "react";

import { changePassword } from "../../api/api";
import { Button, Dialog, DialogContent } from "../../ui";
import { Alert } from "../ui/feedback";

/**
 * CAMBIAR MI CONTRASEÑA — autoservicio para cualquier usuario con sesión.
 *
 * No depende del correo: pide la contraseña actual más la nueva.
 *
 * Es el único punto de la aplicación donde el usuario teclea su contraseña
 * actual. Su comportamiento —qué se valida, en qué orden, qué se envía y qué
 * NO puede salir de aquí— está fijado por `CambiarPasswordModal.test.jsx`, y
 * la migración no relaja ninguna de esas comprobaciones.
 *
 * Detalles que son seguridad, no estilo:
 *   · Los tres campos son `type="password"` con el `autocomplete` que espera un
 *     gestor de contraseñas (`current-password` / `new-password`).
 *   · Nada se escribe en atributos del DOM: el valor vive en la propiedad.
 *   · Al cerrar se vacían los tres campos, se abra luego o no.
 *   · El botón se bloquea durante el envío: un doble clic mandaría una segunda
 *     petición con la contraseña «actual» ya caducada.
 */

const LONGITUD_MINIMA = 8;

export default function CambiarPasswordModal({ open, onClose }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  const reset = () => {
    setActual("");
    setNueva("");
    setRepetir("");
    setError("");
    setOk(false);
    setBusy(false);
  };

  const cerrar = () => {
    reset();
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");

    // EL ORDEN IMPORTA: con una nueva corta Y distinta de su repetición, el
    // aviso es el de la longitud. Es lo que hacía main.
    if (nueva.length < LONGITUD_MINIMA) {
      setError(`La nueva contraseña debe tener al menos ${LONGITUD_MINIMA} caracteres.`);
      return;
    }
    if (nueva !== repetir) {
      setError("La nueva contraseña y su repetición no coinciden.");
      return;
    }

    setBusy(true);
    try {
      await changePassword(actual, nueva);
      setOk(true);
      // Se vacían en cuanto dejan de ser necesarias, sin esperar al cierre.
      setActual("");
      setNueva("");
      setRepetir("");
    } catch (err) {
      setError(err?.response?.data?.detail || "No se pudo cambiar la contraseña.");
    } finally {
      setBusy(false);
    }
  };

  const clase =
    "h-[var(--control-height-md)] w-full min-w-0 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 outline-none focus-visible:outline-[length:var(--focus-ring-width)] focus-visible:outline-solid focus-visible:outline-ring";

  const campo = (id, label, valor, setValor, autoComplete, ayudaId) => (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-caption uppercase text-muted-foreground">
        {label}
      </label>
      <input
        id={id}
        type="password"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        autoComplete={autoComplete}
        aria-describedby={ayudaId}
        required
        className={clase}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(abierto) => !abierto && cerrar()}>
      <DialogContent
        title="Cambiar mi contraseña"
        description="Necesitas tu contraseña actual para poder cambiarla."
        closeLabel="Cerrar"
        size="sm"
      >
        {ok ? (
          <div className="flex flex-col gap-3">
            <Alert tone="success">Contraseña actualizada correctamente.</Alert>
            <div className="flex justify-end">
              <Button type="button" variant="primary" onClick={cerrar}>
                Hecho
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            {campo("pwd-actual", "Contraseña actual", actual, setActual, "current-password")}
            {campo(
              "pwd-nueva",
              "Nueva contraseña",
              nueva,
              setNueva,
              "new-password",
              "pwd-requisitos"
            )}
            {campo(
              "pwd-repetir",
              "Repetir nueva contraseña",
              repetir,
              setRepetir,
              "new-password",
              "pwd-requisitos"
            )}

            {/* El requisito se anuncia ANTES de fallar, no sólo al fallar. */}
            <p id="pwd-requisitos" className="text-body-sm text-muted-foreground">
              Mínimo {LONGITUD_MINIMA} caracteres.
            </p>

            {error ? <Alert tone="error">{error}</Alert> : null}

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" onClick={cerrar} disabled={busy}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={busy}>
                {busy ? "Guardando…" : "Cambiar contraseña"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

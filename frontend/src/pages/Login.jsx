import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Sprout } from "lucide-react";

import { login, requestPasswordReset } from "../api/api";
import {
  Button,
  Card,
  Dialog,
  DialogContent,
  Field,
  Input,
  Spinner,
} from "../ui";
import { Alert } from "../components/ui/feedback";
import { FormActions } from "../components/ui/layout";
import { useReturnFocus } from "../components/ui/useReturnFocus";
import viveroImg from "../assets/landing.png";

/*
 * ENTRADA A VIVERAPP.
 *
 * El COMPORTAMIENTO de autenticación es idéntico al anterior, línea por línea:
 * mismo `login()`, misma navegación a /dashboard tras 500 ms, mismo
 * `formatError`, y el restablecimiento sigue respondiendo lo mismo tanto si la
 * cuenta existe como si no — que es deliberado, para no revelar qué usuarios
 * hay dados de alta.
 *
 * Lo que cambia es la presentación. Se va:
 *
 *   - `Login.css`, cuyos selectores de elemento desnudos se filtraban a las 13
 *     rutas de la aplicación (corregido en la Fase 0, eliminado aquí).
 *   - El botón con degradado verde→cian. El verde es un ESTADO en este sistema,
 *     nunca una acción; entrar es la acción primaria y por tanto azul.
 *   - La rejilla fija `460px 1fr`, que hacía la pantalla inusable por debajo de
 *     ~700px, y el `white-space: nowrap` del texto sobre la imagen.
 *   - El logotipo flotando en bucle infinito y el splash con `backdrop-filter`.
 *
 * No se declara ninguna certificación ni conformidad: la pantalla dice qué es
 * el producto y de quién es el vivero, nada más.
 */

function formatError(err) {
  const detail = err?.response?.data?.detail;

  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        if (typeof d === "string") return d;
        if (d?.msg) return d.msg;
        return JSON.stringify(d);
      })
      .join(" | ");
  }

  if (detail && typeof detail === "object") {
    return detail.msg || JSON.stringify(detail);
  }

  return detail || err?.message || "No se pudo iniciar sesión";
}

/* ── Restablecer contraseña ─────────────────────────────────────────────── */

function ForgotForm({ onClose }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setErrorMsg("");
    if (!username.trim() || !email.trim()) {
      setErrorMsg("Rellena ambos campos.");
      return;
    }
    if (!email.includes("@")) {
      setErrorMsg("Escribe un email con arroba, por ejemplo nombre@dominio.es.");
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset(username.trim(), email.trim());
      setDone(true);
    } catch {
      // Misma respuesta haya o no cuenta: revelar la diferencia permitiría
      // averiguar qué usuarios existen. Comportamiento previo, se conserva.
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-muted-foreground">
          Si los datos coinciden con una cuenta válida, recibirás un email con
          instrucciones para restablecer tu contraseña en los próximos minutos.
          Revisa también la carpeta de spam.
        </p>
        <FormActions>
          <Button variant="primary" onClick={onClose}>
            Entendido
          </Button>
        </FormActions>
      </div>
    );
  }

  return (
    /*
     * `noValidate` deliberado, y SOLO en este formulario.
     *
     * main declaraba `required` en ambos campos Y comprobaba lo mismo en JS
     * con mensajes escritos en español. Los `required` nativos se disparaban
     * primero, así que esos mensajes no llegaban a verse nunca: código muerto
     * heredado. Al desactivar la validación nativa aquí, la comprobación que ya
     * existía pasa a ser la única, con mensaje propio y anunciado en un
     * `role="alert"`.
     *
     * Las condiciones que bloquean el envío son exactamente las mismas, así que
     * al backend le llega lo mismo que antes; solo cambia cómo se comunica.
     *
     * El formulario de ENTRADA no lleva `noValidate`: allí el `required` nativo
     * es la única barrera y quitarlo permitiría enviar credenciales vacías.
     */
    <form onSubmit={submit} noValidate className="flex flex-col gap-[var(--form-field-gap)]">
      <p className="text-body-sm text-muted-foreground">
        Indica tu usuario y el email asociado a la cuenta. Te enviaremos un
        enlace para definir una contraseña nueva.
      </p>

      {errorMsg && <Alert tone="error">{errorMsg}</Alert>}

      <Field label="Usuario" required>
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
        />
      </Field>

      <Field label="Email" required>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </Field>

      <FormActions>
        <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" loading={submitting}>
          Enviar enlace
        </Button>
      </FormActions>
    </form>
  );
}

/* ── Pantalla ───────────────────────────────────────────────────────────── */

export default function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  const navTimeoutRef = useRef(null);
  useReturnFocus(forgotOpen);

  useEffect(() => () => clearTimeout(navTimeoutRef.current), []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      setLoading(true);
      await login(username, password);
      // Misma espera de 500 ms que antes: da tiempo a que el token quede
      // escrito antes de que el guard de ruta lo lea.
      navTimeoutRef.current = setTimeout(() => navigate("/dashboard"), 500);
    } catch (err) {
      setLoading(false);
      setError(formatError(err));
    }
  };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      {/*
        Dos columnas solo a partir de lg. Por debajo, la imagen desaparece —no
        se encoge— y el formulario ocupa el ancho: en un móvil, una foto
        decorativa compite con el único trabajo de esta pantalla.
      */}
      <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-[minmax(0,480px)_1fr]">
        <main className="flex flex-col justify-center px-4 py-10 sm:px-8 lg:px-12">
          <div className="mx-auto flex w-full max-w-[var(--content-form-max)] flex-col gap-8">
            <header className="flex flex-col gap-2">
              <span className="flex items-center gap-2.5">
                <Sprout aria-hidden="true" className="size-7 text-primary" />
                <span className="text-h3 font-[var(--font-weight-semibold)]">ViverApp</span>
              </span>
              <h1 className="text-h4 font-[var(--font-weight-semibold)]">
                Gestión del vivero municipal
              </h1>
              <p className="text-body-sm text-muted-foreground">
                Accede con las credenciales que te haya facilitado tu ayuntamiento.
              </p>
            </header>

            <Card className="p-[var(--card-padding)]">
              <form onSubmit={handleSubmit} className="flex flex-col gap-[var(--form-field-gap)]">
                {/*
                  role="alert" no está de adorno: si el error solo se pintara,
                  quien usa lector de pantalla se quedaría esperando sin saber
                  que la contraseña estaba mal.
                */}
                {error && <Alert tone="error">{error}</Alert>}

                <Field label="Usuario" required>
                  <Input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    // `username` permite que el gestor de contraseñas reconozca
                    // el campo y ofrezca las credenciales guardadas.
                    autoComplete="username"
                    autoFocus
                  />
                </Field>

                <Field label="Contraseña" required>
                  <div className="relative flex items-center">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      className="pr-11"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      label={showPassword ? "Ocultar la contraseña" : "Mostrar la contraseña"}
                      // aria-pressed comunica el estado del conmutador; el
                      // icono por sí solo no dice si está activo.
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-1"
                    >
                      {showPassword ? (
                        <EyeOff aria-hidden="true" className="size-4" />
                      ) : (
                        <Eye aria-hidden="true" className="size-4" />
                      )}
                    </Button>
                  </div>
                </Field>

                <Button type="submit" variant="primary" fullWidth loading={loading}>
                  {loading ? "Entrando…" : "Entrar"}
                </Button>

                <div className="flex justify-center">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setForgotOpen(true)}>
                    ¿Has olvidado tu contraseña?
                  </Button>
                </div>
              </form>
            </Card>

            {loading && (
              <p role="status" className="flex items-center justify-center gap-2 text-body-sm text-muted-foreground">
                <Spinner className="size-4" />
                Comprobando las credenciales…
              </p>
            )}
          </div>
        </main>

        {/*
          La imagen es decorativa: no aporta información que no esté en el
          texto, así que va con alt vacío y oculta bajo lg.
        */}
        <aside aria-hidden="true" className="relative hidden lg:block">
          {/*
            `object-contain`, no `object-cover`.

            El archivo no es una fotografía: es una composición de marketing con
            el logotipo centrado. `object-cover` lo recorta por los lados y el
            logotipo queda partido —se lee «…rApp»—, que se ve roto, no
            recortado. Y el recorte es horizontal, así que `object-position` no
            lo arregla: el texto está en el centro, se mueva hacia donde se
            mueva.

            Con `contain` la composición se ve entera a cualquier proporción. El
            fondo va en color de superficie para que el espacio sobrante no
            parezca un hueco.
          */}
          <img
            src={viveroImg}
            alt=""
            className="absolute inset-0 size-full bg-muted object-contain"
          />
        </aside>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent title="Restablecer la contraseña" closeLabel="Cerrar" size="sm">
          <ForgotForm onClose={() => setForgotOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

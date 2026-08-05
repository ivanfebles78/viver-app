"""
Servicio de email para ViverApp.

Drivers soportados:
  - "console" (default): imprime el email en stdout.
  - "resend": API HTTPS de Resend (https://resend.com).
      EMAIL_DRIVER=resend, RESEND_API_KEY=..., EMAIL_FROM=...
  - "brevo":  API HTTPS de Brevo  (https://brevo.com).
      EMAIL_DRIVER=brevo,  BREVO_API_KEY=...,  EMAIL_FROM=...
  - "smtp":   SMTP nativo (Office 365, Gmail, cualquier servidor).
      EMAIL_DRIVER=smtp, SMTP_HOST=..., SMTP_PORT=587,
      SMTP_USERNAME=..., SMTP_PASSWORD=..., SMTP_USE_TLS=true,
      EMAIL_FROM=...
      (Para Office 365: SMTP_HOST=smtp.office365.com, puerto 587, TLS=true.
       El admin del tenant tiene que habilitar 'Authenticated SMTP' en
       el buzón; si hay MFA, usar una App Password.)

Adjuntos (attachments):
  Los 4 drivers aceptan adjuntos como tuplas
  `(filename, content_bytes, mime_type)`.

Plantillas:
  - send_invitation_email / send_reset_password_email / send_unlock_email
  - send_pedido_creado_a_manager
  - send_pedido_decidido_a_solicitante
  - send_pedido_decidido_a_tecnico
  - send_pedido_reposicion_decidido_a_proveedor
"""

from __future__ import annotations

import base64
import json
import os
import re
import smtplib
import socket
import urllib.error
import urllib.request
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from typing import Iterable, List, Optional, Tuple


# A single attachment is (filename, content_bytes, mime_type).
Attachment = Tuple[str, bytes, str]


def _env(name: str, default: str = "") -> str:
    return (os.getenv(name) or default).strip()


def _frontend_url() -> str:
    return _env("FRONTEND_URL", "http://localhost:5173").rstrip("/")


def _email_from() -> str:
    return _env("EMAIL_FROM", "ViverApp <onboarding@resend.dev>")


def _parse_email_from() -> Tuple[str, str]:
    """
    Convierte 'ViverApp <noreply@dominio.com>' en ('ViverApp', 'noreply@dominio.com').
    Si solo viene el email crudo, devuelve nombre = 'ViverApp' por defecto.
    """
    raw = _email_from()
    m = re.match(r"^\s*(.+?)\s*<\s*([^>]+)\s*>\s*$", raw)
    if m:
        return m.group(1).strip().strip('"'), m.group(2).strip()
    # Solo email
    if "@" in raw:
        return "ViverApp", raw.strip()
    # Fallback
    return "ViverApp", "noreply@example.com"


def _driver() -> str:
    return _env("EMAIL_DRIVER", "console").lower()


# ----------------------------------------------------------------------------
# Drivers
# ----------------------------------------------------------------------------

def _send_console(*, to: str, subject: str, html: str, text: str,
                  attachments: Optional[List[Attachment]] = None) -> None:
    print("=" * 72)
    print(f"[email:console] To:      {to}")
    print(f"[email:console] From:    {_email_from()}")
    print(f"[email:console] Subject: {subject}")
    if attachments:
        for fn, body, mime in attachments:
            print(f"[email:console] Attach:  {fn} ({len(body)} bytes, {mime})")
    print("-" * 72)
    print(text)
    print("=" * 72, flush=True)


def _send_resend(*, to: str, subject: str, html: str, text: str,
                 attachments: Optional[List[Attachment]] = None,
                 strict: bool = False) -> None:
    api_key = _env("RESEND_API_KEY")
    if not api_key:
        if strict:
            raise RuntimeError("Driver resend pero RESEND_API_KEY no está configurada.")
        # Sin API key, caemos a consola para no perder el mensaje
        print(
            "[email:resend] WARNING: RESEND_API_KEY no configurada. "
            "Cayendo a driver consola."
        )
        _send_console(to=to, subject=subject, html=html, text=text, attachments=attachments)
        return

    payload = {
        "from": _email_from(),
        "to": [to],
        "subject": subject,
        "html": html,
        "text": text,
    }
    if attachments:
        # Resend espera attachments como base64 en el campo "content".
        # https://resend.com/docs/api-reference/emails/send-email
        payload["attachments"] = [
            {
                "filename": fn,
                "content": base64.b64encode(body).decode("ascii"),
                # Resend infiere el content_type del filename si no se pasa;
                # lo enviamos explícito por claridad y consistencia.
                "content_type": mime,
            }
            for (fn, body, mime) in attachments
        ]
    data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        url="https://api.resend.com/emails",
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            # User-Agent explícito: el default de urllib lo bloquea Cloudflare (error 1010).
            "User-Agent": "ViverApp/1.0 (+https://github.com/) python-urllib",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status >= 400:
                body = resp.read().decode("utf-8", errors="replace")
                print(f"[email:resend] HTTP {resp.status}: {body}")
                if strict:
                    raise RuntimeError(f"Resend rechazó el envío (HTTP {resp.status}): {body}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        print(f"[email:resend] ERROR HTTP {e.code}: {body}")
        if strict:
            raise RuntimeError(f"Resend rechazó el envío (HTTP {e.code}): {body}")
        # No relanzamos: el flujo de admin no debería romperse porque falle el email.
        # El admin puede usar "Reenviar invitación" si hace falta.
    except RuntimeError:
        raise
    except Exception as e:  # noqa: BLE001
        print(f"[email:resend] ERROR: {e}")
        if strict:
            raise RuntimeError(f"Error al enviar por Resend: {type(e).__name__}: {e}")


def _send_brevo(*, to: str, subject: str, html: str, text: str,
                attachments: Optional[List[Attachment]] = None,
                strict: bool = False) -> None:
    api_key = _env("BREVO_API_KEY")
    if not api_key:
        if strict:
            raise RuntimeError("Driver brevo pero BREVO_API_KEY no está configurada.")
        print(
            "[email:brevo] WARNING: BREVO_API_KEY no configurada. "
            "Cayendo a driver consola."
        )
        _send_console(to=to, subject=subject, html=html, text=text, attachments=attachments)
        return

    sender_name, sender_email = _parse_email_from()

    payload = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": to}],
        "subject": subject,
        "htmlContent": html,
        "textContent": text,
    }
    if attachments:
        # Brevo: array de objetos con name + content (base64).
        # https://developers.brevo.com/reference/sendtransacemail
        payload["attachment"] = [
            {
                "name": fn,
                "content": base64.b64encode(body).decode("ascii"),
            }
            for (fn, body, _mime) in attachments
        ]
    data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        url="https://api.brevo.com/v3/smtp/email",
        data=data,
        method="POST",
        headers={
            "api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
            # User-Agent explícito por si Cloudflare bloquea el default de urllib.
            "User-Agent": "ViverApp/1.0 (+https://github.com/) python-urllib",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status >= 400:
                body = resp.read().decode("utf-8", errors="replace")
                print(f"[email:brevo] HTTP {resp.status}: {body}")
                if strict:
                    raise RuntimeError(f"Brevo rechazó el envío (HTTP {resp.status}): {body}")
            else:
                # Brevo responde 201 con un messageId al aceptar el envío.
                body = resp.read().decode("utf-8", errors="replace")
                print(f"[email:brevo] OK {resp.status}: {body}")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace") if e.fp else ""
        print(f"[email:brevo] ERROR HTTP {e.code}: {body}")
        if strict:
            raise RuntimeError(f"Brevo rechazó el envío (HTTP {e.code}): {body}")
    except RuntimeError:
        raise
    except Exception as e:  # noqa: BLE001
        print(f"[email:brevo] ERROR: {e}")
        if strict:
            raise RuntimeError(f"Error al enviar por Brevo: {type(e).__name__}: {e}")


def _send_smtp(*, to: str, subject: str, html: str, text: str,
               attachments: Optional[List[Attachment]] = None,
               strict: bool = False) -> None:
    """
    Send via plain SMTP (e.g. Office 365 on smtp.office365.com:587).
    Uses STARTTLS by default — Office 365 requires it.

    Env vars:
        SMTP_HOST       (required)
        SMTP_PORT       (default 587)
        SMTP_USERNAME   (required — auth)
        SMTP_PASSWORD   (required — auth; use App Password if MFA)
        SMTP_USE_TLS    (default "true" → STARTTLS on the connection)
        SMTP_USE_SSL    (default "false" → set "true" for implicit TLS on 465)
        EMAIL_FROM      (must match SMTP_USERNAME or be one of its
                         allowed aliases — Office 365 rejects sends from
                         other addresses).
    """
    host = _env("SMTP_HOST")
    port_str = _env("SMTP_PORT", "587")
    username = _env("SMTP_USERNAME")
    password = _env("SMTP_PASSWORD")
    use_tls = _env("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes", "y")
    use_ssl = _env("SMTP_USE_SSL", "false").lower() in ("1", "true", "yes", "y")

    if not host or not username or not password:
        if strict:
            raise RuntimeError("Driver smtp pero faltan SMTP_HOST / SMTP_USERNAME / SMTP_PASSWORD.")
        print(
            "[email:smtp] WARNING: SMTP_HOST/SMTP_USERNAME/SMTP_PASSWORD "
            "no configurados.  Cayendo a driver consola."
        )
        _send_console(to=to, subject=subject, html=html, text=text, attachments=attachments)
        return

    try:
        port = int(port_str)
    except (TypeError, ValueError):
        port = 587

    sender_name, sender_email = _parse_email_from()
    # Office 365 rechaza FROM distinto del usuario autenticado.  Lo
    # corregimos silenciosamente para evitar 550 5.7.1 si el operador
    # configuró EMAIL_FROM con otro dominio por error.
    if sender_email.lower() != username.lower():
        sender_email = username

    # MIME tree:
    #   multipart/mixed
    #     multipart/alternative
    #       text/plain
    #       text/html
    #     [attachments]
    msg = MIMEMultipart("mixed")
    msg["From"] = formataddr((sender_name or "ViverApp", sender_email))
    msg["To"] = to
    msg["Subject"] = subject
    msg["Reply-To"] = sender_email

    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(text or "", "plain", "utf-8"))
    alt.attach(MIMEText(html or "", "html", "utf-8"))
    msg.attach(alt)

    for fn, body, mime in (attachments or []):
        maintype, _, subtype = (mime or "application/octet-stream").partition("/")
        if not subtype:
            maintype, subtype = "application", "octet-stream"
        part = MIMEBase(maintype, subtype)
        part.set_payload(body)
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f'attachment; filename="{fn}"')
        msg.attach(part)

    try:
        if use_ssl:
            # Implicit TLS (port 465).  Not the Office 365 case but
            # supported for completeness with other providers.
            server = smtplib.SMTP_SSL(host, port, timeout=20)
        else:
            # Forzamos IPv4: en algunos entornos (p.ej. Railway) el contenedor
            # no tiene ruta IPv6 y la conexión falla con errno 101 "Network is
            # unreachable" al intentar el registro AAAA del servidor SMTP.
            server = smtplib.SMTP(timeout=20)
            try:
                ipv4 = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)[0][4][0]
            except Exception:  # noqa: BLE001
                ipv4 = host
            server.connect(ipv4, port)
            # El nombre real (no la IP) para SNI y validación de certificado en STARTTLS.
            server._host = host
        with server:
            server.ehlo()
            if use_tls and not use_ssl:
                server.starttls()
                server.ehlo()
            server.login(username, password)
            server.send_message(msg, from_addr=sender_email, to_addrs=[to])
        print(f"[email:smtp] OK sent to {to}", flush=True)
    except smtplib.SMTPAuthenticationError as e:
        print(
            f"[email:smtp] ERROR auth {e.smtp_code}: {e.smtp_error!r}.  "
            "Para Office 365, asegúrate de que SMTP AUTH esté habilitado "
            "para el buzón y, si hay MFA, usa una App Password.",
            flush=True,
        )
        if strict:
            raise RuntimeError(
                f"SMTP autenticación fallida ({e.smtp_code}): {e.smtp_error!r}. "
                "Revisa SMTP_USERNAME/SMTP_PASSWORD (usa App Password si hay MFA)."
            )
    except smtplib.SMTPRecipientsRefused as e:
        print(f"[email:smtp] ERROR recipient refused: {e.recipients!r}", flush=True)
        if strict:
            raise RuntimeError(f"SMTP destinatario rechazado: {e.recipients!r}")
    except smtplib.SMTPSenderRefused as e:
        print(
            f"[email:smtp] ERROR sender refused {e.smtp_code}: {e.smtp_error!r}.  "
            "Office 365 sólo permite enviar desde EMAIL_FROM = SMTP_USERNAME "
            "o un alias autorizado del mismo buzón.",
            flush=True,
        )
        if strict:
            raise RuntimeError(
                f"SMTP remitente rechazado ({e.smtp_code}): {e.smtp_error!r}. "
                "EMAIL_FROM debe coincidir con SMTP_USERNAME o un alias autorizado."
            )
    except smtplib.SMTPException as e:
        print(f"[email:smtp] ERROR SMTP: {type(e).__name__}: {e}", flush=True)
        if strict:
            raise RuntimeError(f"Error SMTP: {type(e).__name__}: {e}")
    except Exception as e:  # noqa: BLE001
        print(f"[email:smtp] ERROR: {type(e).__name__}: {e}", flush=True)
        if strict:
            raise RuntimeError(f"Error al enviar por SMTP: {type(e).__name__}: {e}")


def _send_disabled(*, to: str, subject: str, html: str, text: str,
                   attachments: Optional[List[Attachment]] = None) -> None:
    """Driver no-op: silenciosamente descarta el email.  Útil para
    desactivar el envío sin tener que tocar el código — basta con poner
    EMAIL_DRIVER=disabled en Railway.  No imprime nada para no saturar
    los logs."""
    # Intencionalmente vacío.  No print, no nada.
    return


def _dispatch(*, to: str, subject: str, html: str, text: str,
              attachments: Optional[List[Attachment]] = None,
              strict: bool = False) -> None:
    """Envía por el driver activo. Con strict=True lanza una excepción con el
    motivo real del fallo (para el diagnóstico), en vez de tragarlo."""
    driver = _driver()
    if driver == "disabled":
        if strict:
            raise RuntimeError("EMAIL_DRIVER=disabled: el envío de correos está desactivado.")
        _send_disabled(to=to, subject=subject, html=html, text=text, attachments=attachments)
    elif driver == "resend":
        _send_resend(to=to, subject=subject, html=html, text=text, attachments=attachments, strict=strict)
    elif driver == "brevo":
        _send_brevo(to=to, subject=subject, html=html, text=text, attachments=attachments, strict=strict)
    elif driver == "smtp":
        _send_smtp(to=to, subject=subject, html=html, text=text, attachments=attachments, strict=strict)
    else:
        if strict:
            raise RuntimeError(
                f"EMAIL_DRIVER='{driver or 'console'}': no se envían correos reales, solo se "
                "imprimen en el log. Configura EMAIL_DRIVER=resend/brevo/smtp y sus claves en Railway."
            )
        _send_console(to=to, subject=subject, html=html, text=text, attachments=attachments)


def _dispatch_many(*, recipients: Iterable[str], subject: str, html: str, text: str,
                   attachments: Optional[List[Attachment]] = None) -> None:
    """Send the same email to each recipient.  Empty/duplicate/None entries
    are skipped silently so callers can pass mixed lists from the DB
    without sanitising first."""
    seen = set()
    for to in recipients:
        if not to:
            continue
        to = to.strip()
        if not to or to.lower() in seen:
            continue
        seen.add(to.lower())
        _dispatch(to=to, subject=subject, html=html, text=text, attachments=attachments)


# ----------------------------------------------------------------------------
# Plantillas
# ----------------------------------------------------------------------------

def _wrap_html(title: str, body_html: str, button_label: str, button_url: str, footer: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="margin:0;padding:0;background:#f5f5f4;font-family:Arial,sans-serif;color:#10231a;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border:1px solid rgba(15,23,42,0.08);border-radius:16px;overflow:hidden;">
        <tr><td style="background:#0f5132;padding:24px 32px;">
          <div style="color:#ffffff;font-size:14px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
            ViverApp
          </div>
          <div style="color:#dcfce7;font-size:12px;margin-top:4px;">
            Ayuntamiento de Santa Cruz de Tenerife
          </div>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 16px;color:#10231a;font-size:22px;">{title}</h1>
          <div style="font-size:15px;line-height:1.55;color:#3f4c46;">
            {body_html}
          </div>
          <div style="margin:32px 0;text-align:center;">
            <a href="{button_url}"
               style="display:inline-block;padding:14px 28px;background:#0f5132;color:#ffffff;
                      text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;">
              {button_label}
            </a>
          </div>
          <p style="margin:24px 0 0;font-size:12px;color:#64748b;">
            Si el botón no funciona, copia este enlace en tu navegador:<br>
            <span style="word-break:break-all;color:#0f5132;">{button_url}</span>
          </p>
          <p style="margin:16px 0 0;font-size:12px;color:#64748b;">
            Este enlace caduca en <strong>24 horas</strong> y solo puede usarse una vez.
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px;background:#f8fafc;border-top:1px solid rgba(15,23,42,0.06);
                       font-size:12px;color:#64748b;">
          {footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _wrap_text(intro: str, button_url: str, outro: str) -> str:
    return (
        f"{intro}\n\n"
        f"{button_url}\n\n"
        f"{outro}\n\n"
        "Este enlace caduca en 24 horas y solo puede usarse una vez.\n"
        "— ViverApp · Ayuntamiento de Santa Cruz de Tenerife\n"
    )


def send_invitation_email(*, to: str, username: str, token: str) -> None:
    url = f"{_frontend_url()}/activar/{token}"
    subject = "ViverApp · Activa tu cuenta"
    html = _wrap_html(
        title="Activa tu cuenta de ViverApp",
        body_html=(
            f"Hola <strong>{username}</strong>,<br><br>"
            "Un administrador ha creado una cuenta para ti en ViverApp. "
            "Para activarla y definir tu contraseña, pulsa el botón inferior."
        ),
        button_label="Activar cuenta",
        button_url=url,
        footer="Si no esperabas este mensaje, contacta con el administrador del sistema.",
    )
    text = _wrap_text(
        intro=(
            f"Hola {username},\n\n"
            "Un administrador ha creado una cuenta para ti en ViverApp.\n"
            "Para activarla y definir tu contraseña, abre este enlace:"
        ),
        button_url=url,
        outro="Si no esperabas este mensaje, contacta con el administrador del sistema.",
    )
    _dispatch(to=to, subject=subject, html=html, text=text)


def send_reset_password_email(*, to: str, username: str, token: str) -> None:
    url = f"{_frontend_url()}/reset-password/{token}"
    subject = "Reset Password"
    html = _wrap_html(
        title="Restablece tu contraseña",
        body_html=(
            f"Hola <strong>{username}</strong>,<br><br>"
            "Un administrador ha solicitado el restablecimiento de tu contraseña en ViverApp.<br>"
            "Pulsa el botón inferior para definir una nueva."
        ),
        button_label="Restablecer contraseña",
        button_url=url,
        footer="Si no has pedido este cambio, contacta inmediatamente con el administrador.",
    )
    text = _wrap_text(
        intro=(
            f"Hola {username},\n\n"
            "Un administrador ha solicitado el restablecimiento de tu contraseña.\n"
            "Para definir una nueva contraseña, abre este enlace:"
        ),
        button_url=url,
        outro="Si no has pedido este cambio, contacta inmediatamente con el administrador.",
    )
    _dispatch(to=to, subject=subject, html=html, text=text)


def config_status() -> dict:
    """Estado de la configuración de correo SIN exponer secretos. Sirve para que
    un admin verifique desde la app qué driver está activo y si las variables
    necesarias están presentes (solo booleanos para las claves/contraseñas)."""
    def _has(name: str) -> bool:
        return bool(_env(name))

    driver = _driver()
    status = {
        "driver": driver,
        "email_from": _email_from(),
        "frontend_url": _frontend_url(),
        "resend_api_key_set": _has("RESEND_API_KEY"),
        "brevo_api_key_set": _has("BREVO_API_KEY"),
        "smtp_host": _env("SMTP_HOST") or None,
        "smtp_port": _env("SMTP_PORT", "587"),
        "smtp_username_set": _has("SMTP_USERNAME"),
        "smtp_password_set": _has("SMTP_PASSWORD"),
        "smtp_use_tls": _env("SMTP_USE_TLS", "true"),
        "smtp_use_ssl": _env("SMTP_USE_SSL", "false"),
    }
    # Aviso legible si el driver no enviará realmente correos.
    if driver == "console":
        status["aviso"] = "EMAIL_DRIVER=console (por defecto): los correos NO se envían, solo se imprimen en el log. Configura resend/brevo/smtp en Railway."
    elif driver == "disabled":
        status["aviso"] = "EMAIL_DRIVER=disabled: el envío de correos está desactivado."
    elif driver == "resend" and not status["resend_api_key_set"]:
        status["aviso"] = "Driver resend pero falta RESEND_API_KEY."
    elif driver == "brevo" and not status["brevo_api_key_set"]:
        status["aviso"] = "Driver brevo pero falta BREVO_API_KEY."
    elif driver == "smtp" and not (status["smtp_host"] and status["smtp_username_set"] and status["smtp_password_set"]):
        status["aviso"] = "Driver smtp pero faltan SMTP_HOST/SMTP_USERNAME/SMTP_PASSWORD."
    else:
        status["aviso"] = None
    return status


def send_test_email(*, to: str) -> None:
    """Envía un correo de prueba para verificar la configuración."""
    url = _frontend_url()
    _dispatch(
        to=to,
        subject="Prueba de correo · ViverApp",
        html=_wrap_html(
            title="Prueba de correo",
            body_html=(
                "Este es un correo de prueba de <strong>ViverApp</strong>.<br>"
                "Si lo recibes, el envío de correos (incluido el de restablecer "
                "contraseña) está configurado correctamente."
            ),
            button_label="Abrir ViverApp",
            button_url=url,
            footer="Puedes ignorar este mensaje.",
        ),
        text=(
            "Correo de prueba de ViverApp.\n"
            "Si lo recibes, el envío de correos está configurado correctamente.\n"
            f"{url}"
        ),
        strict=True,
    )


def send_unlock_email(*, to: str, username: str, token: str) -> None:
    url = f"{_frontend_url()}/desbloquear/{token}"
    subject = "Desbloqueo de cuenta"
    html = _wrap_html(
        title="Tu cuenta ha sido desbloqueada",
        body_html=(
            f"Hola <strong>{username}</strong>,<br><br>"
            "Un administrador ha desbloqueado tu cuenta en ViverApp tras el bloqueo "
            "por intentos fallidos. Para reactivarla, define una nueva contraseña."
        ),
        button_label="Definir nueva contraseña",
        button_url=url,
        footer="Si no has solicitado este desbloqueo, contacta con el administrador.",
    )
    text = _wrap_text(
        intro=(
            f"Hola {username},\n\n"
            "Un administrador ha desbloqueado tu cuenta en ViverApp.\n"
            "Para reactivarla, define una nueva contraseña en este enlace:"
        ),
        button_url=url,
        outro="Si no has solicitado este desbloqueo, contacta con el administrador.",
    )
    _dispatch(to=to, subject=subject, html=html, text=text)


# ----------------------------------------------------------------------------
# Plantillas de pedidos
# ----------------------------------------------------------------------------

def _fmt_destino_pedido(pedido) -> str:
    tipo = (getattr(pedido, "tipo", None) or "salida").strip().lower()
    if tipo == "reposicion":
        return "Vivero (reposición)"
    partes = [
        getattr(pedido, "distrito_destino", "") or "",
        getattr(pedido, "barrio_destino", "") or "",
        getattr(pedido, "direccion_destino", "") or "",
    ]
    return " · ".join(p for p in partes if p) or "—"


def _resumen_items_html(pedido) -> str:
    items = getattr(pedido, "items", []) or []
    if not items:
        return "<em>Pedido sin líneas.</em>"
    rows = []
    for it in items:
        prod = getattr(it, "producto", None)
        nombre = (getattr(prod, "nombre_cientifico", None)
                  or getattr(prod, "nombre_natural", None)
                  or f"#{getattr(it, 'producto_id', '?')}")
        tam = getattr(it, "tamano", None) or "—"
        cant = getattr(it, "cantidad", 0)
        est = (str(getattr(it, "estado_item", None) or "RESERVA").upper())
        marker = {"APROBADO": "✓", "DENEGADO": "✗", "SERVIDO": "✓"}.get(est, "·")
        rows.append(
            f"<tr><td style='padding:4px 8px;border-bottom:1px solid #eee'>{marker}</td>"
            f"<td style='padding:4px 8px;border-bottom:1px solid #eee'>{nombre}</td>"
            f"<td style='padding:4px 8px;border-bottom:1px solid #eee;text-align:center'>{tam}</td>"
            f"<td style='padding:4px 8px;border-bottom:1px solid #eee;text-align:right'>{cant}</td></tr>"
        )
    return (
        "<table style='border-collapse:collapse;width:100%;font-size:13px;'>"
        + "<thead><tr style='background:#f1f5f9'>"
        + "<th style='padding:4px 8px;text-align:left'></th>"
        + "<th style='padding:4px 8px;text-align:left'>Producto</th>"
        + "<th style='padding:4px 8px;text-align:center'>Tamaño</th>"
        + "<th style='padding:4px 8px;text-align:right'>Cantidad</th>"
        + "</tr></thead><tbody>"
        + "".join(rows) + "</tbody></table>"
    )


def _resumen_items_text(pedido) -> str:
    items = getattr(pedido, "items", []) or []
    if not items:
        return "(Pedido sin líneas)"
    lines = []
    for it in items:
        prod = getattr(it, "producto", None)
        nombre = (getattr(prod, "nombre_cientifico", None)
                  or getattr(prod, "nombre_natural", None)
                  or f"#{getattr(it, 'producto_id', '?')}")
        tam = getattr(it, "tamano", None) or "—"
        cant = getattr(it, "cantidad", 0)
        est = (str(getattr(it, "estado_item", None) or "RESERVA").upper())
        marker = {"APROBADO": "[OK]", "DENEGADO": "[X]", "SERVIDO": "[OK]"}.get(est, "[ ]")
        lines.append(f"  {marker} {nombre} · {tam} · {cant}")
    return "\n".join(lines)


def _pedido_pdf_attachment(pdf_bytes: Optional[bytes], pedido_id) -> Optional[List[Attachment]]:
    if not pdf_bytes:
        return None
    return [(f"pedido_{pedido_id}.pdf", pdf_bytes, "application/pdf")]


def send_pedido_creado_a_manager(
    *, recipients: Iterable[str], pedido, pdf_bytes: Optional[bytes] = None
) -> None:
    """Pedido recién creado → notificar a los managers para que decidan."""
    pedido_id = getattr(pedido, "id", "?")
    tipo = (getattr(pedido, "tipo", None) or "salida").strip().lower()
    tipo_label = "reposición" if tipo == "reposicion" else "salida"
    solicitante = getattr(pedido, "solicitante_username", "") or "—"
    destino = _fmt_destino_pedido(pedido)
    n_items = len(getattr(pedido, "items", []) or [])

    subject = f"[ViverApp] Nuevo pedido de {tipo_label} #{pedido_id} pendiente de decisión"
    body_html = (
        f"Hola,<br><br>"
        f"Se ha creado un nuevo pedido de <strong>{tipo_label}</strong> que requiere tu decisión.<br><br>"
        f"<strong>Pedido:</strong> #{pedido_id}<br>"
        f"<strong>Solicitante:</strong> {solicitante}<br>"
        f"<strong>Destino:</strong> {destino}<br>"
        f"<strong>Líneas:</strong> {n_items}<br><br>"
        f"{_resumen_items_html(pedido)}<br><br>"
        f"Tienes el PDF adjunto con el detalle completo."
    )
    url = f"{_frontend_url()}/aprobaciones"
    html = _wrap_html(
        title=f"Nuevo pedido pendiente — #{pedido_id}",
        body_html=body_html,
        button_label="Abrir Aprobaciones",
        button_url=url,
        footer="Recibes este aviso porque tu rol es Manager en ViverApp.",
    )
    text = (
        f"Nuevo pedido de {tipo_label} pendiente de decisión.\n\n"
        f"Pedido:      #{pedido_id}\n"
        f"Solicitante: {solicitante}\n"
        f"Destino:     {destino}\n"
        f"Líneas:      {n_items}\n\n"
        f"{_resumen_items_text(pedido)}\n\n"
        f"Abre Aprobaciones: {url}\n"
    )
    _dispatch_many(
        recipients=recipients,
        subject=subject,
        html=html,
        text=text,
        attachments=_pedido_pdf_attachment(pdf_bytes, pedido_id),
    )


def send_pedido_decidido_a_solicitante(
    *, recipients: Iterable[str], pedido, pdf_bytes: Optional[bytes] = None
) -> None:
    """Pedido decidido → notificar al solicitante con el resultado."""
    pedido_id = getattr(pedido, "id", "?")
    estado = (getattr(pedido, "estado", None) or "").upper()
    motivo = (getattr(pedido, "motivo_denegacion", None) or "").strip()
    estado_label = {
        "APROBADO": "Aprobado",
        "APROBADO_PARCIAL": "Aprobado parcialmente",
        "DENEGADO": "Denegado",
    }.get(estado, estado.title() or "Decidido")

    subject = f"[ViverApp] Tu pedido #{pedido_id} ha sido {estado_label.lower()}"
    motivo_block = (
        f"<p><strong>Motivo de denegación:</strong><br>{motivo}</p>"
        if motivo and estado in ("DENEGADO", "APROBADO_PARCIAL") else ""
    )
    body_html = (
        f"Hola,<br><br>"
        f"Tu pedido <strong>#{pedido_id}</strong> ha sido "
        f"<strong>{estado_label}</strong>.<br><br>"
        f"{_resumen_items_html(pedido)}"
        f"{motivo_block}"
        f"<br>Tienes el PDF oficial adjunto con todo el detalle."
    )
    url = f"{_frontend_url()}/pedidos"
    html = _wrap_html(
        title=f"Pedido #{pedido_id}: {estado_label}",
        body_html=body_html,
        button_label="Ver mis pedidos",
        button_url=url,
        footer="Recibes este aviso porque eres el solicitante de este pedido.",
    )
    text = (
        f"Tu pedido #{pedido_id} ha sido {estado_label.lower()}.\n\n"
        f"{_resumen_items_text(pedido)}\n\n"
        + (f"Motivo de denegación: {motivo}\n\n" if motivo and estado in ("DENEGADO", "APROBADO_PARCIAL") else "")
        + f"Ver pedidos: {url}\n"
    )
    _dispatch_many(
        recipients=recipients,
        subject=subject,
        html=html,
        text=text,
        attachments=_pedido_pdf_attachment(pdf_bytes, pedido_id),
    )


def send_pedido_decidido_a_tecnico(
    *, recipients: Iterable[str], pedido, pdf_bytes: Optional[bytes] = None
) -> None:
    """Pedido decidido → FYI a los técnicos del vivero."""
    pedido_id = getattr(pedido, "id", "?")
    estado = (getattr(pedido, "estado", None) or "").upper()
    estado_label = {
        "APROBADO": "Aprobado",
        "APROBADO_PARCIAL": "Aprobado parcialmente",
        "DENEGADO": "Denegado",
    }.get(estado, estado.title() or "Decidido")
    solicitante = getattr(pedido, "solicitante_username", "") or "—"
    destino = _fmt_destino_pedido(pedido)

    subject = f"[ViverApp] FYI — Pedido #{pedido_id} {estado_label.lower()}"
    body_html = (
        f"Hola,<br><br>"
        f"El pedido <strong>#{pedido_id}</strong> ha sido <strong>{estado_label}</strong> "
        f"por el manager.<br><br>"
        f"<strong>Solicitante:</strong> {solicitante}<br>"
        f"<strong>Destino:</strong> {destino}<br><br>"
        f"{_resumen_items_html(pedido)}<br><br>"
        f"Detalle completo en el PDF adjunto."
    )
    url = f"{_frontend_url()}/pedidos"
    html = _wrap_html(
        title=f"FYI — Pedido #{pedido_id}: {estado_label}",
        body_html=body_html,
        button_label="Ver pedidos",
        button_url=url,
        footer="Recibes este aviso como técnico del vivero.",
    )
    text = (
        f"FYI: Pedido #{pedido_id} {estado_label.lower()} por el manager.\n\n"
        f"Solicitante: {solicitante}\n"
        f"Destino:     {destino}\n\n"
        f"{_resumen_items_text(pedido)}\n\n"
        f"Ver pedidos: {url}\n"
    )
    _dispatch_many(
        recipients=recipients,
        subject=subject,
        html=html,
        text=text,
        attachments=_pedido_pdf_attachment(pdf_bytes, pedido_id),
    )


def send_pedido_reposicion_decidido_a_proveedor(
    *, recipients: Iterable[str], pedido, pdf_bytes: Optional[bytes] = None
) -> None:
    """Pedido de reposición aprobado/aprobado_parcial → al proveedor con el PDF
    YA filtrado a solo las líneas que tiene que servir.  El caller pasa el
    `pdf_bytes` generado con `viewer_role='proveedor'`."""
    pedido_id = getattr(pedido, "id", "?")
    estado = (getattr(pedido, "estado", None) or "").upper()
    # Para el proveedor "aprobado parcial" significa que el manager rechazó
    # alguna línea — desde su POV solo ve lo que tiene que servir.
    estado_label = "Aprobado"

    subject = f"[ViverApp] Nuevo pedido de reposición #{pedido_id} para servir"
    body_html = (
        f"Hola,<br><br>"
        f"Tenemos un nuevo pedido de reposición <strong>#{pedido_id}</strong> "
        f"que ha sido <strong>{estado_label}</strong>.<br><br>"
        f"El PDF adjunto contiene las líneas que debes servir."
        f"<br>(Si el manager hubiera rechazado alguna línea del pedido original, "
        f"no aparece en el PDF — solo ves lo que sí tienes que entregar.)"
    )
    url = f"{_frontend_url()}/pedidos"
    html = _wrap_html(
        title=f"Pedido de reposición #{pedido_id} — para servir",
        body_html=body_html,
        button_label="Ver pedido",
        button_url=url,
        footer="Recibes este aviso porque eres proveedor del vivero.",
    )
    text = (
        f"Nuevo pedido de reposición #{pedido_id} aprobado.\n\n"
        f"El PDF adjunto contiene las líneas que debes servir.\n"
        f"Ver pedido: {url}\n"
    )
    _dispatch_many(
        recipients=recipients,
        subject=subject,
        html=html,
        text=text,
        attachments=_pedido_pdf_attachment(pdf_bytes, pedido_id),
    )


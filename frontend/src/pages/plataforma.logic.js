/**
 * LÓGICA DE PLATAFORMA.
 *
 * Extraída de `Plataforma.jsx@607552d` **sin cambiar una regla**. Aquí vive lo
 * que decide cuánto paga cada ayuntamiento, cómo se da de alta uno nuevo y qué
 * se envía al backend.
 *
 * `plataforma.equivalence.test.js` la compara con una copia literal de main.
 */

/* ── Formato ───────────────────────────────────────────────────────────── */

export const money = (n) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n || 0);

/* ── Slug ──────────────────────────────────────────────────────────────── */

/**
 * Slug a partir del nombre del ayuntamiento.
 *
 * Minúsculas, sin diacríticos, todo lo que no sea `a-z0-9` a guiones y sin
 * guiones sueltos en los extremos.
 */
export function slugify(nombre) {
  return String(nombre ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Nuevo estado del formulario al teclear el nombre.
 *
 * El slug se autocompleta SOLO mientras el usuario no lo haya tocado. Se
 * detecta comparando el slug actual con el último autogenerado: si difieren,
 * manda el del usuario y no se vuelve a pisar.
 */
export function aplicarNombre(form, nombre) {
  const autoSlug = slugify(nombre);
  const slugTouched = form.slug && form.slug !== form._autoSlug;
  return { ...form, nombre, slug: slugTouched ? form.slug : autoSlug, _autoSlug: autoSlug };
}

/* ── Alta de ayuntamiento ──────────────────────────────────────────────── */

/**
 * Payload de alta.
 *
 * Los opcionales vacíos viajan como `null`, no como `""`: el backend distingue
 * «sin dato» de «cadena vacía». `_autoSlug` es estado interno de la interfaz y
 * NO puede colarse en el envío.
 */
export function construirPayloadEnroll(form) {
  return {
    nombre: form.nombre,
    slug: form.slug,
    cif: form.cif || null,
    direccion: form.direccion || null,
    email_contacto: form.email_contacto || null,
    telefono: form.telefono || null,
    admin_username: form.admin_username,
    admin_email: form.admin_email,
    admin_rol: form.admin_rol,
  };
}

/** Mensaje tras dar de alta, con el aviso si el correo de invitación falló. */
export function mensajeAlta(res) {
  const base = `Ayuntamiento "${res?.cliente?.nombre}" (id ${res?.cliente?.id}) creado. `;
  return res?.email_invitacion_enviado
    ? `${base}Se envió invitación a ${res?.admin?.email}.`
    : `${base}Aviso: no se pudo enviar el email de invitación a ${res?.admin?.email} (revisa la config de correo).`;
}

/* ── Cuota ─────────────────────────────────────────────────────────────── */

export const CUOTA_INVALIDA =
  "Introduce una cuota válida (número ≥ 0) o vacío para la cuota por defecto.";

/**
 * Interpreta lo que se ha escrito en el editor de cuota.
 *
 * Reglas que NO son cosméticas:
 *   - Vacío significa «cuota por defecto de la plataforma» y viaja como `null`.
 *     No es lo mismo que 0, que significa «gratis».
 *   - Se acepta la coma decimal española.
 *   - Un negativo o un no-número se rechaza SIN llamar al backend.
 */
export function parsearCuota(value) {
  const raw = String(value ?? "").trim().replace(",", ".");
  const num = raw === "" ? null : Number(raw);
  if (num !== null && (Number.isNaN(num) || num < 0)) {
    return { valida: false, num: null, error: CUOTA_INVALIDA };
  }
  return { valida: true, num, error: null };
}

/** Payload de actualización de cuota. `set_cuota` siempre viaja en true. */
export function construirPayloadCuota(num) {
  return { set_cuota: true, cuota_mensual: num };
}

/* ── KPIs ──────────────────────────────────────────────────────────────── */

export function construirKpis(resumen) {
  return [
    {
      k: "Ayuntamientos",
      v: resumen?.ayuntamientos_total,
      sub: `${resumen?.ayuntamientos_activos ?? 0} activos`,
    },
    { k: "Usuarios", v: resumen?.usuarios_total },
    { k: "Productos", v: resumen?.productos_total },
    { k: "Pedidos", v: resumen?.pedidos_total },
    { k: "Movimientos", v: resumen?.movimientos_total },
  ];
}

/* ── Importación ───────────────────────────────────────────────────────── */

export const CONFIRMAR_IMPORT_TITULO = "¿Importar la copia de seguridad?";

export const CONFIRMAR_IMPORT_TEXTO =
  "Vas a importar los datos de la copia de seguridad a este ayuntamiento. " +
  "Los datos actuales pueden verse sobrescritos y la operación no se puede deshacer.";

/** Informe de la importación, una línea por colección. */
export function resumenImportacion(res) {
  const r = res?.importado || {};
  return Object.entries(r).map(([k, v]) => `${k}: ${v}`);
}

/* ── Gráfica ───────────────────────────────────────────────────────────── */

export const CHART = { W: 640, H: 220, P: 34 };

/**
 * Geometría de la línea de altas acumuladas.
 *
 * `maxY` nunca baja de 1 para no dividir entre cero cuando aún no hay altas.
 */
export function geometriaEvolucion(data) {
  const { W, H, P } = CHART;
  const pts = (Array.isArray(data) ? data : []).map((d) => ({ x: d.mes, y: d.acumulado }));
  if (pts.length === 0) return null;

  const maxY = Math.max(1, ...pts.map((p) => p.y));
  const stepX = pts.length > 1 ? (W - 2 * P) / (pts.length - 1) : 0;
  const px = (i) => P + i * stepX;
  const py = (v) => H - P - (v / maxY) * (H - 2 * P);
  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${px(i)} ${py(p.y)}`).join(" ");
  const areaPath = `${linePath} L ${px(pts.length - 1)} ${H - P} L ${px(0)} ${H - P} Z`;

  return { pts, maxY, px, py, linePath, areaPath };
}

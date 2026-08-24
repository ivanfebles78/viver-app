/**
 * LÓGICA DE PRODUCTOS.
 *
 * Extraída de `Productos.jsx@a4137ad` **sin cambiar una regla**. Aquí vive lo
 * que decide qué productos se ven, quién puede gestionarlos y qué payload se
 * envía al crear o editar — es decir, lo que un rediseño no puede alterar.
 *
 * `productos.equivalence.test.js` la compara con una copia literal de main.
 */

/* ── Constantes de dominio ─────────────────────────────────────────────── */

export const TAMANOS = ["Semillero", "M12", "M20", "M35"];

/** Roles que pueden abrir la gestión de productos (alta, edición y baja). */
export const ROLES_GESTION = ["admin", "manager", "tecnico"];

/** Roles que pueden marcar un producto como interno. */
export const ROLES_MARCAR_INTERNO = ["admin", "manager"];

/* ── Utilidades ────────────────────────────────────────────────────────── */

/**
 * Mensaje de error legible a partir de una respuesta del backend.
 *
 * El caso 422 con `detail` en array es el de FastAPI validando el cuerpo: se
 * aplana a «campo: motivo» separado por barras, porque si no el usuario ve
 * `[object Object]`.
 */
export function fmtErr(e) {
  const status = e?.response?.status;
  const data = e?.response?.data;
  if (status === 422 && Array.isArray(data?.detail)) {
    return data.detail.map((d) => `${(d.loc || []).join(".")}: ${d.msg}`).join(" | ");
  }
  return data?.detail || e?.message || "Error";
}

/** Normaliza para comparar: recorta y pasa a minúsculas. */
export function norm(s) {
  return String(s ?? "").trim().toLowerCase();
}

/**
 * Nombre científico, ESTRICTO.
 *
 * Sin respaldo a `nombre_natural` a propósito: la columna se llama «Nombre
 * científico» y debe mostrar eso o nada. Un respaldo silencioso haría creer
 * que un producto tiene nombre científico cuando no lo tiene.
 */
export function productScientificName(producto) {
  return producto?.nombre_cientifico || "-";
}

export function productCommonName(producto) {
  return producto?.nombre_natural || "-";
}

/* ── Permisos ──────────────────────────────────────────────────────────── */

export const puedeGestionar = (rol) => ROLES_GESTION.includes(rol);
export const puedeMarcarInterno = (rol) => ROLES_MARCAR_INTERNO.includes(rol);

/**
 * ¿Puede este rol pedir más unidades de un producto?
 *
 * Cualquier rol identificado salvo `empresa_externa`, que pide por otra vía.
 * Ojo al primer término: sin rol NO se puede, así que un usuario sin sesión
 * resuelta falla cerrado.
 */
export const puedePedirMas = (rol) => !!rol && rol !== "empresa_externa";

/* ── Catálogo ──────────────────────────────────────────────────────────── */

/** Categorías presentes en el catálogo, ordenadas. */
export function categoriasDe(productos) {
  const set = new Set();
  for (const p of productos || []) {
    const c = (p.categoria || "").trim();
    if (c) set.add(c);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}

/** Subcategorías de una categoría (o de todas si es «ALL»). */
export function subcategoriasDe(productos, categoriaSel) {
  const set = new Set();
  for (const p of productos || []) {
    const c = (p.categoria || "").trim();
    const s = (p.subcategoria || "").trim();
    if (!s) continue;
    if (categoriaSel !== "ALL" && c !== categoriaSel) continue;
    set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}

/**
 * Filtra el catálogo.
 *
 * `idsConImagen` es un `Set`; se pasa desde fuera porque quien sabe qué
 * plantas tienen foto es un hook aparte.
 */
export function filtrarProductos(productos, { q = "", categoria = "ALL", subcategoria = "ALL", soloConImagen = false, idsConImagen = new Set() }) {
  const qn = norm(q);

  return (productos || []).filter((p) => {
    const c = (p.categoria || "").trim();
    const s = (p.subcategoria || "").trim();

    const okCat = categoria === "ALL" || c === categoria;
    const okSub = subcategoria === "ALL" || s === subcategoria;
    const okImg = !soloConImagen || idsConImagen.has(p.id);

    if (!okCat || !okSub || !okImg) return false;
    if (!qn) return true;

    // La búsqueda cubre los dos nombres, el campo `nombre` heredado, y la
    // clasificación: así se encuentra «palmeras» igual que «Phoenix».
    return (
      norm(p.nombre_cientifico).includes(qn) ||
      norm(p.nombre_natural).includes(qn) ||
      norm(p.nombre).includes(qn) ||
      norm(p.categoria).includes(qn) ||
      norm(p.subcategoria).includes(qn)
    );
  });
}

/* ── Alta y edición ────────────────────────────────────────────────────── */

/**
 * Valida el formulario de alta.
 *
 * Devuelve el mensaje de error o `null`. Tres campos obligatorios: sin nombre
 * científico, categoría y subcategoría el producto no es clasificable, y el
 * inventario se organiza por esa clasificación.
 */
export function validarNuevoProducto(nuevo) {
  if (
    !String(nuevo?.nombre_cientifico || "").trim() ||
    !String(nuevo?.categoria || "").trim() ||
    !String(nuevo?.subcategoria || "").trim()
  ) {
    return "Nombre científico, categoría y subcategoría son obligatorios.";
  }
  return null;
}

/**
 * Payload de creación, tal y como lo construía main.
 *
 * Detalles que NO son cosméticos:
 *   - `nombre_natural` vacío va como `null`, no como cadena vacía.
 *   - `stock_minimo` cae a 0 si no es un número.
 *   - `precio` vacío va como `null`: un precio 0 significa «gratis», no
 *     «sin precio», y el informe de costes los distingue.
 */
export function construirPayloadNuevo(nuevo) {
  return {
    nombre_cientifico: String(nuevo.nombre_cientifico).trim(),
    nombre_natural: String(nuevo.nombre_natural || "").trim() || null,
    categoria: String(nuevo.categoria).trim(),
    subcategoria: String(nuevo.subcategoria).trim(),
    stock_minimo: Number(nuevo.stock_minimo) || 0,
    es_interno: !!nuevo.es_interno,
    precio: nuevo.precio === "" || nuevo.precio == null ? null : Number(nuevo.precio),
  };
}

/* ── Exportación a CSV ─────────────────────────────────────────────────── */

/**
 * Cabeceras del CSV de productos.
 *
 * Es un CONTRATO: el fichero se abre en Excel y la gente lo tiene enlazado en
 * hojas de cálculo. Reordenar o renombrar una columna rompe esas hojas en
 * silencio. `productos.export.contract.test.js` lo fija.
 */
export const CSV_HEADERS = [
  "Nombre científico",
  "Nombre común",
  "Categoría",
  "Subcategoría",
  "Stock",
  "Stock mínimo",
  "Precio (€)",
  "Interno",
];

/**
 * Escapa un valor para CSV separado por punto y coma.
 *
 * Punto y coma, no coma: es lo que espera Excel en configuración regional
 * española, donde la coma es el separador decimal.
 */
export function escaparCsv(v) {
  const s = String(v ?? "");
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Una fila del CSV, en el orden de `CSV_HEADERS`. */
export function filaCsv(p) {
  return [
    p.nombre_cientifico || "",
    p.nombre_natural || "",
    p.categoria || "",
    p.subcategoria || "",
    p.stock ?? "",
    p.stock_minimo === null || p.stock_minimo === undefined ? "" : p.stock_minimo,
    // Coma decimal: en Excel con configuración española, un punto se
    // interpretaría como separador de miles y 12.50 se leería como 1250.
    p.precio === null || p.precio === undefined ? "" : Number(p.precio).toFixed(2).replace(".", ","),
    p.es_interno ? "Sí" : "No",
  ].map(escaparCsv);
}

/** CSV completo, con salto de línea CRLF, que es lo que espera Excel. */
export function construirCsvProductos(productos) {
  const lista = Array.isArray(productos) ? productos : [];
  const lineas = lista.map((p) => filaCsv(p).join(";"));
  return [CSV_HEADERS.map(escaparCsv).join(";"), ...lineas].join("\r\n");
}

/** Nombre del fichero descargado. */
export const CSV_FILENAME = "productos_vivero.csv";

/* ── Existencias: stock, reservado y disponible ─────────────────────────── */

/**
 * LAS TRES CIFRAS DE UN PRODUCTO.
 *
 * `stock` son las existencias físicas registradas. `reservado` es la parte de
 * esas existencias ya comprometida por pedidos de salida vivos. `disponible`
 * es lo que de verdad se puede pedir o asignar.
 *
 * Las tres las calcula el BACKEND y aquí no se recalcula ninguna: hacerlo
 * crearía una segunda fuente de verdad que se desviaría el día que cambie una
 * regla de negocio. Esta función sólo decide cómo se PRESENTAN.
 *
 * ── Por qué `disponible` no siempre es `stock − reservado` ────────────────
 *
 * Porque el vivero tiene existencias que están pero todavía no sirven:
 *
 *   · el semillero nunca se puede pedir;
 *   · un árbol o una palmera sólo cuentan en M35, y un arbusto en M20 o M35;
 *   · las entradas con fecha de disponibilidad futura están madurando.
 *
 * Un drago con 8 unidades en M20 tiene stock 8, reservado 0 y disponible 0, y
 * las tres cifras son correctas. Enseñar `stock − reservado` ahí diría 8 y
 * sería una promesa falsa: nadie puede pedir esas ocho.
 *
 * Por eso se muestra el `disponible` autoritativo Y se explica el desajuste
 * cuando lo hay, en vez de esconderlo. Un número que no cuadra sin explicación
 * se lee como un error de la aplicación.
 */
export function existenciasDe(producto) {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const stock = num(producto?.stock);
  const reservado = num(producto?.reservado);
  const disponible = num(producto?.disponible);

  /*
   * La diferencia entre lo que quedaría al restar y lo que de verdad se puede
   * servir. Positiva = hay existencias retenidas por reglas del vivero.
   */
  const noServible = stock - reservado - disponible;

  return {
    stock,
    reservado,
    disponible,
    /*
     * Lo que se PINTA. Nunca negativo: «-15 disponibles» no significa nada para
     * quien gestiona un vivero y parece un fallo de la aplicación.
     *
     * Recortar aquí NO esconde el problema, y ésa es la diferencia con un
     * `Math.max(0, …)` puesto de tapadillo: el recorte es sólo de presentación
     * y la causa se sigue anunciando con `inconsistente`, que la fila muestra
     * con texto. Se protege la lectura y se deja el defecto a la vista.
     */
    disponibleMostrado: Math.max(0, disponible),
    // Con tolerancia: son decimales (Numeric(12,3)) y comparar con === sobre
    // flotantes marca desajustes de 0,0000001 que no existen.
    cuadra: Math.abs(noServible) < 0.001,
    noServible: noServible > 0.001 ? noServible : 0,
    /*
     * RESERVADO > STOCK no debería ocurrir nunca: el alta de pedido comprueba
     * `stock − reservado` antes de aceptar. Si aparece, es una inconsistencia
     * de datos y NO se disimula recortando a cero en silencio — se marca para
     * que se vea y se investigue.
     */
    inconsistente: reservado > stock + 0.001,
  };
}

/**
 * Qué se le cuenta a quien lee la tabla cuando las cifras no cuadran.
 *
 * Devuelve `null` cuando no hay nada que explicar, para no meter ruido en las
 * filas normales — que son la mayoría.
 */
export function explicacionDisponible(ex) {
  if (ex.inconsistente) {
    return "Hay más unidades reservadas que existencias registradas. Revisa el inventario de este producto.";
  }
  if (ex.noServible > 0) {
    return "Hay existencias que aún no se pueden servir: semillero, tamaño insuficiente para su tipo de planta, o entradas con fecha de disponibilidad futura.";
  }
  return null;
}

import { Status } from "../ui";

/**
 * ESTADOS DE NEGOCIO → SISTEMA DE ESTADOS DE DEVCON8.
 *
 * ViverApp tiene cuatro vocabularios de estado distintos, y hasta ahora cada
 * pantalla se pintaba los suyos con colores en crudo: `badge(estado)` en
 * Pedidos, `STATUS_STYLES` en AdminUsuarios, `tipoTextStyle` y
 * `prestamoTextStyle` en Movimientos, `pedidoGroupColor` en Dashboard. Cuatro
 * paletas para el mismo concepto, y ninguna con icono.
 *
 * Este módulo es la única traducción. Se mantiene el NOMBRE de negocio —
 * "APROBADO_PARCIAL" sigue diciendo "Aprobado parcial" — y solo se traduce el
 * TONO al sistema de ocho tonos de DevCon8. Ese sistema aporta el icono, de
 * modo que el estado nunca depende del color (SC 1.4.1).
 *
 * No importa React: son datos de entrada y datos de salida, y por eso se puede
 * probar directamente.
 */

/**
 * Estados de PEDIDO.
 *
 * Sobre la elección de tonos:
 *   - RESERVA es el estado en que un pedido espera decisión → `pending`, el
 *     tono de espera, no el de advertencia. Un pedido pendiente no es un
 *     problema. Coincide con el ámbar que ya usaba `badge()`.
 *   - APROBADO_PARCIAL no es un fallo ni un éxito: el gestor aprobó unas
 *     líneas y denegó otras, y el pedido sigue vivo → `in_progress` (teal),
 *     que es justo el color que tenía antes.
 *   - SERVIDO pasa de azul a verde. Es el único cambio de significado
 *     deliberado: servido es el final CORRECTO del flujo, y el azul lo
 *     presentaba como mera información.
 *
 * DIVERGENCIA CONSCIENTE CON EL PAQUETE: `Status.CANCELLED` tiene tono
 * `danger` aguas arriba. Aquí NO se usa para CANCELADO ni CADUCADO, porque en
 * ViverApp ninguno de los dos es un error:
 *
 *   - CANCELADO lo cancela normalmente quien lo pidió. Es un final ordinario.
 *   - CADUCADO simplemente venció; nadie lo denegó.
 *
 * Ambos eran grises en `badge()`, y el rojo está reservado a error y
 * destrucción. Teñirlos de rojo los confundiría con DENEGADO, que sí es una
 * decisión en contra. Se mapean a tonos neutros conservando su etiqueta.
 */
const PEDIDO = {
  RESERVA: { status: Status.PENDING, label: "Reserva" },
  PENDIENTE: { status: Status.PENDING, label: "Pendiente" },
  APROBADO: { status: Status.APPROVED, label: "Aprobado" },
  APROBADO_PARCIAL: { status: Status.IN_PROGRESS, label: "Aprobado parcial" },
  SERVIDO: { status: Status.COMPLETED, label: "Servido" },
  DENEGADO: { status: Status.REJECTED, label: "Denegado" },
  CANCELADO: { status: Status.INACTIVE, label: "Cancelado" },
  CADUCADO: { status: Status.ARCHIVED, label: "Caducado" },
};

/** Estados de CUENTA DE USUARIO (pantalla de administración). */
const USUARIO = {
  activo: { status: Status.ACTIVE, label: "Activo" },
  pendiente: { status: Status.PENDING, label: "Pendiente" },
  inactivo: { status: Status.INACTIVE, label: "Inactivo" },
  // Bloqueado es lo más cercano a un fallo que tiene una cuenta: el usuario no
  // puede entrar hasta que un administrador actúe.
  bloqueado: { status: Status.REJECTED, label: "Bloqueado" },
};

/** Estados de CADUCIDAD de lote / existencias. */
const CADUCIDAD = {
  vigente: { status: Status.ACTIVE, label: "Vigente" },
  proximo_a_caducar: { status: Status.PENDING, label: "Próximo a caducar" },
  caducado: { status: Status.REJECTED, label: "Caducado" },
  sin_fecha: { status: Status.DRAFT, label: "Sin fecha" },
};

/**
 * Estados de EXISTENCIAS de un producto (informe de existencias).
 *
 * «Bajo stock» es `pending`, no `rejected`: un producto por debajo del mínimo
 * exige actuar, pero no es un error ni un rechazo — el rojo está reservado a
 * eso. «Agotado» sí es `rejected`: ya no se puede servir.
 */
const STOCK = {
  con_stock: { status: Status.ACTIVE, label: "Con stock" },
  bajo_stock: { status: Status.PENDING, label: "Bajo stock" },
  agotado: { status: Status.REJECTED, label: "Agotado" },
};

/** Normaliza una clave de estado: sin espacios, sin tildes, en minúsculas. */
function normalizar(valor) {
  return String(valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s-]+/g, "_");
}

/**
 * Índice normalizado de un vocabulario, construido una sola vez.
 *
 * Se normalizan también las CLAVES, no solo el valor de entrada. Sin eso, un
 * vocabulario con claves en mayúsculas (los estados de pedido llegan así del
 * backend) nunca casaría con la misma cadena escrita en minúsculas y con
 * espacios — que es como aparece en filtros y en datos de prueba.
 */
function indexar(vocabulario) {
  const indice = new Map();
  for (const [clave, definicion] of Object.entries(vocabulario)) {
    indice.set(normalizar(clave), definicion);
  }
  return indice;
}

const INDICES = new WeakMap();

/**
 * Resuelve un estado de negocio contra un vocabulario.
 *
 * Un valor desconocido NO se inventa un tono: cae en `draft` (neutro) y
 * conserva el texto original. Así, si el backend añade mañana un estado, la
 * interfaz lo muestra tal cual en lugar de teñirlo de un color que se ha
 * elegido por accidente.
 */
function resolver(vocabulario, valor) {
  let indice = INDICES.get(vocabulario);
  if (!indice) {
    indice = indexar(vocabulario);
    INDICES.set(vocabulario, indice);
  }

  const encontrado = indice.get(normalizar(valor));
  if (encontrado) return encontrado;

  return { status: Status.DRAFT, label: String(valor ?? "").trim() || "—" };
}

export const estadoPedido = (valor) => resolver(PEDIDO, valor);
export const estadoUsuario = (valor) => resolver(USUARIO, valor);
export const estadoCaducidad = (valor) => resolver(CADUCIDAD, valor);
export const estadoStock = (valor) => resolver(STOCK, valor);

/** Vocabularios expuestos para pruebas y para poblar filtros. */
export const VOCABULARIOS = Object.freeze({
  STOCK,
  pedido: PEDIDO,
  usuario: USUARIO,
  caducidad: CADUCIDAD,
});

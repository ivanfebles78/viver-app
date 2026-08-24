// Resolución de imágenes de plantas alojadas por nombre en una carpeta estática.
//
// Convención: las imágenes viven en `public/imagenes/plantas/` y el nombre de
// fichero se deriva del nombre científico normalizado a un "slug":
//   "Quercus ilex"      → /imagenes/plantas/quercus-ilex.jpg
//   "Phoenix canariensis" → /imagenes/plantas/phoenix-canariensis.png
//
// Como es una carpeta estática no podemos listar su contenido desde el
// navegador, así que comprobamos la disponibilidad intentando cargar la
// imagen (probe). El resultado se cachea por slug para no repetir peticiones
// aunque el producto aparezca en muchas filas.

import { useEffect, useMemo, useState } from "react";

const BASE = "/imagenes/plantas/";
// Extensiones que se prueban, en orden. Nos quedamos con la primera que cargue.
// Las fotos reales (jpg/png) tienen prioridad sobre los SVG de ejemplo.
const EXTS = ["jpg", "jpeg", "png", "webp", "svg"];

export function plantSlug(nombreCientifico) {
  return (nombreCientifico || "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // todo lo no alfanumérico → guion
    .replace(/^-+|-+$/g, ""); // sin guiones sobrantes en los extremos
}

/**
 * NOMBRES CANDIDATOS PARA UNA MISMA PLANTA, del más fiel al más tolerante.
 *
 * El emparejamiento era un `slug` exacto del nombre científico, y eso deja
 * fuera casi todo: de 496 productos del catálogo real sólo 41 encontraban su
 * foto —un 8 %— mientras 121 de las 158 fotos del repositorio no las usaba
 * nadie. No faltaban fotos: no se encontraban.
 *
 * La causa está en cómo se escriben los nombres en el catálogo:
 *
 *   Acacia?cyclops (acacia  majorera)        carácter suelto, paréntesis, doble espacio
 *   Acokanthera oblongifolia ( laurel toxico  paréntesis sin cerrar
 *   Delonix Regia "flavida"                   comillas y mayúscula arbitraria
 *   Dracaena fragans sp                       sufijo de indeterminación
 *
 * Se prueban tres formas, en orden, y se usa la primera que exista:
 *
 *   1. El nombre tal cual. Si alguien subió `delonix-regia-flavida.jpeg`, esa
 *      foto es más específica y debe ganar.
 *   2. El nombre limpio: sin paréntesis —abiertos o cerrados— y sin los
 *      sufijos de indeterminación. Las comillas y los caracteres sueltos NO
 *      se tocan aquí: `plantSlug` ya los convierte en guiones y los colapsa,
 *      así que una limpieza extra sería una línea que aparenta trabajar sin
 *      hacer nada — lo comprobé mutándola y ninguna prueba se enteraba.
 *   3. Sólo género y especie. `Acalypha wilkesiana` acepta así la foto de
 *      `acalypha-wilkesiana-hoffmannii`, que es un cultivar de la misma especie.
 *
 * El paso 3 es deliberadamente el último: es el único que puede enseñar la foto
 * de un cultivar distinto. Para una planta ornamental de vivero eso es aceptable
 * —se reconoce igual— y es mucho mejor que no enseñar nada; pero si existe la
 * foto exacta, gana la exacta.
 *
 * Medido sobre el catálogo real: la cobertura pasa de 41 a 64 productos.
 */
export function nombresCandidatos(nombreCientifico) {
  const crudo = (nombreCientifico || "").toString();
  const exacto = plantSlug(crudo);
  if (!exacto) return [];

  const limpio = plantSlug(
    crudo
      // Paréntesis, se cierren o no: casi siempre son el nombre común.
      .replace(/\(.*?\)|\(.*$/g, " ")
      // `sp`, `spp` y `var` marcan indeterminación, no forman parte del nombre.
      .replace(/\b(spp?|var|cv)\b\.?/gi, " ")
  );

  const generoEspecie = limpio.split("-").slice(0, 2).join("-");

  // Sin repetidos y sin vacíos, conservando el orden de preferencia.
  return [...new Set([exacto, limpio, generoEspecie])].filter(Boolean);
}

const cache = new Map(); // slug -> Promise<string|null>

function probe(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

// Devuelve una promesa con la URL de la imagen disponible, o null si no existe.
export function resolvePlantImage(nombreCientifico) {
  const candidatos = nombresCandidatos(nombreCientifico);
  if (candidatos.length === 0) return Promise.resolve(null);

  // La caché va por el nombre de entrada, no por candidato: dos plantas
  // distintas pueden compartir el mismo género y especie y aun así preferir
  // ficheros distintos.
  const clave = candidatos[0];
  if (cache.has(clave)) return cache.get(clave);

  const p = (async () => {
    for (const slug of candidatos) {
      for (const ext of EXTS) {
        const url = `${BASE}${slug}.${ext}`;
        if (await probe(url)) return url;
      }
    }
    return null;
  })();
  cache.set(clave, p);
  return p;
}

// Hook: devuelve la URL de la imagen si está disponible, o null (mientras
// carga o si no existe). Usar para decidir si se muestra el botón "Ver".
export function usePlantImage(nombreCientifico) {
  /*
   * Se guarda el NOMBRE junto a la URL, y la URL efectiva se deriva al pintar.
   *
   * Antes el efecto hacía `setUrl(null)` antes de pedir la imagen, para que al
   * cambiar de planta no se viera un instante la foto de la anterior. Eso es un
   * `setState` en cascada en cada cambio; guardando a qué planta pertenece lo
   * resuelto, la foto vieja se descarta al comparar, sin repintar de más.
   */
  const [resuelto, setResuelto] = useState({ nombre: null, url: null });
  const url = resuelto.nombre === nombreCientifico ? resuelto.url : null;

  useEffect(() => {
    let active = true;
    resolvePlantImage(nombreCientifico).then((u) => {
      if (active) setResuelto({ nombre: nombreCientifico, url: u });
    });
    return () => {
      active = false;
    };
  }, [nombreCientifico]);
  return url;
}

// Hook: dada una lista de productos, sondea sus imágenes (reutilizando la
// caché) y devuelve un Set con los ids de los que SÍ tienen imagen. El Set se
// va rellenando a medida que cada probe resuelve, así el filtro reacciona en
// cuanto hay resultados sin esperar a sondear todo el catálogo.
export function usePlantsWithImage(productos) {
  /*
   * `lista` se memoiza: sin esto, el `[]` del caso «no es un array» se crea
   * nuevo en cada render y arrastra consigo a `sig` y al efecto que depende de
   * él, que acabaría sondeando el catálogo entero una y otra vez.
   */
  const lista = useMemo(() => (Array.isArray(productos) ? productos : []), [productos]);
  const sig = useMemo(
    () => lista.map((p) => `${p.id}:${p.nombre_cientifico || ""}`).join("|"),
    [lista]
  );
  const [ids, setIds] = useState(() => new Set());
  useEffect(() => {
    let active = true;
    setIds(new Set());
    lista.forEach((p) => {
      resolvePlantImage(p.nombre_cientifico).then((url) => {
        if (active && url) {
          setIds((prev) => {
            if (prev.has(p.id)) return prev;
            const next = new Set(prev);
            next.add(p.id);
            return next;
          });
        }
      });
    });
    return () => {
      active = false;
    };
    /*
     * Se depende de `sig`, no de `lista`. Es deliberado: `sig` es la firma de
     * id y nombre científico del catálogo, que es LO ÚNICO de lo que depende el
     * sondeo. `lista` cambia de identidad en cada recarga aunque traiga los
     * mismos productos, y volver a sondear el catálogo entero por eso sería
     * visible: el filtro se vaciaría y se volvería a llenar.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se depende de la firma del catálogo, no de la identidad de `lista`, que cambia en cada recarga
  }, [sig]);
  return ids;
}

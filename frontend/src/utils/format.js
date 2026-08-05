// Formateo de nombres de usuario para visualización.
//
// El usuario en BD se almacena como lo creó el admin (normalmente minúsculas:
// "medina", "ivan.febles", "juan-perez"). Para mostrarlo en la interfaz
// queremos que aparezca con la primera letra en mayúscula:
//   medina         -> Medina
//   ivan febles    -> Ivan Febles
//   miriam.gomez   -> Miriam.Gomez
//   juan-perez     -> Juan-Perez
//   MEDINA         -> Medina
//
// El valor original se sigue usando para login, JWT, lookups, etc.
// Esto es PURO display.

export function formatUsername(username) {
  if (!username || typeof username !== "string") return "";

  // Dividimos preservando los separadores (espacio, punto, guion, underscore)
  // para reensamblar con el mismo formato.
  return username
    .trim()
    .split(/(\s+|[._-])/)
    .map((part) => {
      if (!part) return part;
      if (/^[\s._-]+$/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
}

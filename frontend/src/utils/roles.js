// Rol EFECTIVO para el control de acceso de la interfaz.
//
// `superadmin` (dueño de la plataforma) y `admin_vivero` (admin del vivero de un
// ayuntamiento) se comportan como `admin` a efectos de qué puede ver/hacer en
// las páginas. El aislamiento por ayuntamiento lo garantiza el backend; aquí solo
// decidimos permisos de UI. Cualquier otro rol se devuelve tal cual.
//
// Acepta el objeto `me` (con .rol/.role) o directamente una cadena de rol.
export function rolEfectivo(meOrRol) {
  const raw = (
    typeof meOrRol === "string" ? meOrRol : meOrRol?.rol || meOrRol?.role || ""
  )
    .toString()
    .trim()
    .toLowerCase();
  if (raw === "superadmin" || raw === "admin_vivero") return "admin";
  return raw;
}

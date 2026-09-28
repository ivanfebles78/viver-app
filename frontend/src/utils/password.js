/**
 * Política de contraseñas fuertes para las contraseñas que se fijan mediante un
 * enlace con token (restablecer contraseña, activar cuenta, desbloquear).
 *
 * Debe coincidir EXACTAMENTE con la validación del backend
 * (`_validate_strong_password_or_400` en main.py): mínimo 8 caracteres con al
 * menos una mayúscula, una minúscula, un número y un símbolo. La validación de
 * cliente es solo para dar respuesta inmediata; el backend es la autoridad.
 */

export const PASSWORD_POLICY_TEXT =
  "Mínimo 8 caracteres, con una mayúscula, una minúscula, un número y un símbolo.";

export const PASSWORD_MIN_LENGTH = 8;

/**
 * Valida una contraseña contra la política fuerte.
 * @returns {string|null} mensaje de error, o null si es válida.
 */
export function validateStrongPassword(pwd) {
  const value = String(pwd ?? "");
  if (value.length < PASSWORD_MIN_LENGTH) {
    return "La contraseña debe tener al menos 8 caracteres.";
  }
  const tieneMin = /[a-z]/.test(value);
  const tieneMay = /[A-Z]/.test(value);
  const tieneNum = /[0-9]/.test(value);
  // Símbolo = cualquier carácter que no sea letra ni número (coincide con el
  // criterio del backend: `not c.isalnum()`).
  const tieneSim = /[^A-Za-z0-9]/.test(value);
  if (!(tieneMin && tieneMay && tieneNum && tieneSim)) {
    return "La contraseña debe incluir una mayúscula, una minúscula, un número y un símbolo.";
  }
  return null;
}

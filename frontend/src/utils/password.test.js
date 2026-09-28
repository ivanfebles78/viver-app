import { describe, it, expect } from "vitest";

import { validateStrongPassword, PASSWORD_MIN_LENGTH } from "./password";

describe("validateStrongPassword", () => {
  it("acepta una contraseña que cumple toda la política", () => {
    expect(validateStrongPassword("Vivero2026!")).toBeNull();
    expect(validateStrongPassword("Abcd123!")).toBeNull(); // exactamente 8, límite inclusivo
  });

  it("rechaza por longitud menor de 8", () => {
    expect(validateStrongPassword("Ab1!")).toMatch(/al menos 8/i);
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  it("rechaza si falta la mayúscula", () => {
    expect(validateStrongPassword("vivero2026!")).toMatch(/mayúscula|minúscula|número|símbolo/i);
  });

  it("rechaza si falta la minúscula", () => {
    expect(validateStrongPassword("VIVERO2026!")).not.toBeNull();
  });

  it("rechaza si falta el número", () => {
    expect(validateStrongPassword("ViveroApp!")).not.toBeNull();
  });

  it("rechaza si falta el símbolo", () => {
    expect(validateStrongPassword("Vivero2026")).not.toBeNull();
  });

  it("trata undefined/null como inválidos, sin lanzar", () => {
    expect(validateStrongPassword(undefined)).not.toBeNull();
    expect(validateStrongPassword(null)).not.toBeNull();
  });
});

-- =========================================================================
-- Crear el usuario de prueba `proveedor1` con rol "proveedor".
-- Contraseña: Test1234   (bcrypt hash generado con passlib)
-- =========================================================================
-- Ejecutar en Railway → PostgreSQL → Query. Idempotente: si el usuario
-- ya existe, se actualiza su rol y hash a estos valores.
-- =========================================================================

INSERT INTO usuarios (username, email, password_hash, status, rol, created_at, updated_at)
VALUES (
    'proveedor1',
    'proveedor1@example.com',
    '$2b$12$XQh0NwvGCkoJbPNG0QKI3.GlNr5xtZ6egCtFt9NMAfyT8DUlB0QLO',
    'activo',
    'proveedor',
    NOW(),
    NOW()
)
ON CONFLICT (username) DO UPDATE
SET password_hash = EXCLUDED.password_hash,
    rol           = EXCLUDED.rol,
    status        = 'activo',
    updated_at    = NOW();

-- Verificación
SELECT id, username, rol, status FROM usuarios WHERE username = 'proveedor1';

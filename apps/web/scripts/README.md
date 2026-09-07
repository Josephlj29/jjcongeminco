# scripts/

## responsive-shots.mts — matriz de screenshots responsive

Herramienta de revisión visual a demanda (no corre en CI). Con el dev server
levantado (`pnpm --filter web dev`), toma capturas full-page de las pantallas
clave en 8 anchos (360, 390, 768, 1024, 1280, 1440, 1920, 2560) y abre los
modales principales (nuevo producto, kardex, nueva orden, aprobar, nuevo
proveedor).

```bash
# 1) credenciales de un usuario de prueba en apps/web/.env.local
E2E_EMAIL=usuario@prueba.com
E2E_PASSWORD=********

# 2) correr (todos los anchos, o un subconjunto)
pnpm --filter web shots
VIEWPORTS=390,1440 pnpm --filter web shots
```

Salida: `apps/web/.responsive-shots/<ancho>x<alto>/<ruta>[--<modal>].png` y un
`resumen.md` con fallos y errores de consola. Ambas carpetas (`.responsive-shots/`,
`.auth/`) están en `.gitignore`.

Requiere Node ≥ 22.18 (ejecuta `.mts` sin flags). Chromium: `pnpm --filter web exec playwright install chromium`.

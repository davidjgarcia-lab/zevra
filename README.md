# ZEVRA

App web instalable (PWA) para Android e iPhone, publicada en Netlify desde este repositorio.

- `/` — la app.
- `/instalar` — página para compartir: explica cómo instalarla en cada móvil.

## Archivos
| Archivo | Para qué sirve |
|---|---|
| `index.html` | La app completa (React compilado). |
| `manifest.webmanifest` | Nombre, colores e iconos de la app instalada. |
| `sw.js` | Service worker: hace la app instalable y abre sin conexión. |
| `install.js` | Aviso «Instala ZEVRA» (botón nativo en Android, pasos de Safari en iPhone). |
| `instalar.html` | Página de descarga. |
| `icons/` | Iconos PNG/SVG (incluye el de iOS y el adaptable de Android). |
| `netlify.toml` | Publicación desde la raíz y permisos de cámara/micrófono. |

Al subir un cambio, cambia `VERSION` en `sw.js` para que los móviles descarguen la versión nueva.

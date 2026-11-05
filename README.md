# ZEVRA

App de videollamadas y chat entre personas adultas verificadas con DNI.
Funciona como **app web instalable** (Android e iPhone, desde el enlace de Netlify) y como **app nativa de Android (APK)** con bloqueo de capturas de pantalla.

| Función | Cómo funciona |
|---|---|
| Acceso con Google o email | Supabase Auth. El acceso con Apple se ha eliminado. |
| Verificación de edad con DNI | La app lee en el móvil la zona MRZ del reverso del DNI, comprueba sus dígitos de control y extrae la fecha de nacimiento. Rechaza a menores y DNIs caducados. Solo se guarda la fecha y una huella cifrada del nº (impide cuentas duplicadas). La foto no sale del móvil. |
| Videollamadas y voz | WebRTC (PeerJS) con emparejamiento en Supabase. Modos Social, Voz e Íntima (con consentimiento, cámara apagada al empezar e imagen desenfocada). |
| Puntuación de respeto | Tras una llamada de **4 minutos o más**, cada persona puede valorar a la otra de 1 a 5 (anónimo, durante 7 días). La base de datos impide valorar llamadas más cortas o valorar dos veces. |
| Fotos públicas y privadas | Las privadas solo las ve quien tú apruebas. Los demás ven un candado y pueden pedir acceso; tú apruebas, rechazas o retiras el permiso. |
| Chat | Solo con personas con las que ya has conectado. Fotos que se autodestruyen **10 s** después de abrirlas y vídeos que se eliminan **al terminar de verlos**. Se ven una sola vez y se borran del servidor. |
| Capturas de pantalla | **APK de Android:** bloqueadas (salen en negro). **iPhone / navegador:** el sistema no permite bloquearlas; se oculta el contenido al salir de la app y se pone una marca de agua con el alias de quien mira. |

---

## Puesta en marcha (una sola vez)

### 1. Supabase (servidor y base de datos)
1. Crea una cuenta en <https://supabase.com> y un proyecto nuevo (región *West EU*).
2. **SQL Editor › New query**: pega el contenido de [`supabase/schema.sql`](supabase/schema.sql) y pulsa **Run**.
3. **Authentication › URL Configuration**
   - *Site URL*: la dirección de Netlify, p. ej. `https://zevra.netlify.app`
   - *Redirect URLs*: añade esa misma dirección y `com.zevra.app://auth` (para la app de Android).
4. **Project Settings › API**: copia la *Project URL* y la clave *anon public*.

### 2. Acceso con Google
1. En <https://console.cloud.google.com>: **APIs y servicios › Pantalla de consentimiento de OAuth** (tipo *Externo*), y después **Credenciales › Crear credenciales › ID de cliente de OAuth › Aplicación web**.
2. En *URI de redireccionamiento autorizados* pon: `https://TU-PROYECTO.supabase.co/auth/v1/callback`
3. En Supabase, **Authentication › Providers › Google**: actívalo y pega el *Client ID* y el *Client Secret*.

### 3. Netlify (app web)
> La URL y la clave pública del proyecto ya están puestas en `src/config.ts`; las variables de entorno solo hacen falta si cambias de proyecto.

1. (Opcional) **Site configuration › Environment variables**: añade
   - `VITE_SUPABASE_URL` = Project URL de Supabase
   - `VITE_SUPABASE_ANON_KEY` = clave anon public
2. **Deploys › Trigger deploy**. `netlify.toml` ya indica cómo compilar (`npm run build`, carpeta `dist`).
3. Enlace para compartir: `https://TU-SITIO.netlify.app/instalar`

### 4. Servidor TURN (imprescindible para llamadas con datos móviles)
Con 4G/5G los móviles no pueden conectarse directamente y la imagen se queda en negro sin un servidor TURN.
1. Crea una cuenta gratis en <https://dash.cloudflare.com> (1.000 GB/mes gratis).
2. Menú **Realtime** (o **Calls**) › **TURN Server** › **Create** › nombre `zevra`.
3. Copia el **Turn Token ID** y el **API Token**.
4. En Supabase › SQL Editor ejecuta `supabase/upgrade-03.sql` (si no lo has hecho) y después:
   ```sql
   select public.set_turn_config('TURN_TOKEN_ID', 'API_TOKEN');
   ```
La clave queda guardada en la base de datos (nunca llega a los móviles); Supabase genera credenciales temporales para cada usuario.

### 5. GitHub Actions (APK de Android)
En **Settings › Secrets and variables › Actions** del repositorio, crea:
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`.
Con cada cambio en `main` se compila el APK y se publica en **Releases**, con un enlace fijo de descarga:
`https://github.com/davidjgarcia-lab/zevra/releases/latest/download/zevra.apk`

> Guarda el archivo de firma (`.keystore`) y sus contraseñas fuera del repositorio. Sin ellos no podrás publicar actualizaciones que se instalen encima de la versión anterior.

---

## Tienda (códigos de descuento)
Las ofertas se gestionan en la tabla `shop_offers` (Supabase › Table Editor o SQL Editor):
```sql
insert into public.shop_offers (brand, title, description, discount, code, url, category, expires_at)
values ('Nombre de la marca', '20 % en toda la tienda', 'Envío discreto', '-20 %', 'ZEVRA20', 'https://marca.com', 'Juguetes', '2026-12-31');
```
Para ocultar una oferta: `update public.shop_offers set active = false where code = 'ZEVRA20';`

## Showroom (directos)
Quien activa «Aparecer en el Showroom» en su perfil puede emitir en directo. Cada espectador se conecta directamente con quien emite, así que el límite es de **8 espectadores a la vez** (`MAX_VIEWERS` en `src/screens/Showroom.tsx`). Para cientos de espectadores habría que pasar a un servidor de difusión (Cloudflare Realtime SFU).

## Desarrollo
```bash
npm install
cp .env.example .env     # rellena con los datos de Supabase
npm run dev              # app en http://localhost:5173
npm test                 # pruebas del lector de DNI
npm run build            # compilación para Netlify (carpeta dist)
npm run android:sync     # copia la app al proyecto Android (abrir android/ con Android Studio)
```

## Estructura
- `src/screens/` — pantallas (acceso, verificación DNI, inicio, llamada, chat, perfil).
- `src/lib/mrz.ts` — lectura y validación de la MRZ del DNI · `src/lib/ocr.ts` — OCR en el móvil (tesseract, sin CDN).
- `src/lib/protect.tsx` — medidas contra capturas en web · `android/.../MainActivity.java` — bloqueo real (`FLAG_SECURE`).
- `supabase/schema.sql` — tablas, reglas de seguridad (RLS), almacenamiento y funciones.

## Límites conocidos
- **Verificación de edad:** se hace en el móvil y comprueba la autenticidad de los datos (dígitos de control), pero no es una verificación biométrica. Para cumplir normativa estricta, conecta un proveedor acreditado (Veriff, Didit, Onfido…) en `verify_age`.
- **iPhone:** iOS no permite a ninguna app web bloquear capturas. Para bloquearlas habría que publicar una app nativa en la App Store (cuenta de desarrollador de Apple, 99 €/año).
- **Llamadas:** la señalización usa el servidor gratuito de PeerJS; el vídeo necesita el TURN de Cloudflare (paso 4).
- **Capturas en iPhone y navegadores:** no se pueden bloquear ni detectar desde la web. En la app de Android se bloquean y, en Android 14+, se avisa a la otra persona del intento.

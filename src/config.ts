// Datos públicos del proyecto de Supabase (la "anon key" está pensada para ir en la app).
// Se rellenan con variables de entorno en Netlify / GitHub, o directamente aquí.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const CONFIGURED = /^https:\/\/.+/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20;

// Esquema de enlace profundo de la app Android (vuelta del login con Google)
export const NATIVE_SCHEME = 'com.zevra.app';
export const NATIVE_REDIRECT = `${NATIVE_SCHEME}://auth`;

// Llamadas: segundos mínimos para poder valorar el respeto
export const RATE_MIN_SECONDS = 240;
// Fotos efímeras del chat: segundos visibles
export const EPHEMERAL_PHOTO_SECONDS = 10;

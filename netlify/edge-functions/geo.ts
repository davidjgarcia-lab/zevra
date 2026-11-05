// Devuelve el país desde el que se conecta el móvil (según su IP), para sugerirlo en el perfil.
// No guarda nada: solo responde con el código ISO del país.
export default (_req: Request, context: { geo?: { country?: { code?: string } } }) =>
  new Response(JSON.stringify({ country: context.geo?.country?.code ?? null }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' },
  });

export const config = { path: '/api/geo' };

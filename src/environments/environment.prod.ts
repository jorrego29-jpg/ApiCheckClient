// Producción: Vercel sirve el cliente y reenvía /api al backend NestJS (rewrite en vercel.json),
// así que ambos comparten origen y no hace falta CORS.
export const environment = {
  production: true,
  apiUrl: '/api',
};

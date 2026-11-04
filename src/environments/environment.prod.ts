// Producción: el servidor (Caddy, ver deploy/ en el repo del backend) sirve el cliente y reenvía /api
// al backend NestJS, así que ambos comparten origen y no hace falta CORS.
export const environment = {
  production: true,
  apiUrl: '/api',
};

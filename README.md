# APICheck — Cliente

Interfaz web de **APICheck**, una aplicación tipo Postman para probar servicios **REST** y **SOAP**. Se conecta a la API del repo [ApiCheck](https://github.com/jorrego29-jpg/ApiCheck).

## Qué permite

- Organizar el trabajo en **workspaces**, con **colecciones**, carpetas y peticiones.
- Editar y enviar peticiones **REST** (método, URL, parámetros, headers, cuerpo y autenticación) y **SOAP** (carga del WSDL, elección de operación, envelope, SOAPAction).
- Usar **variables** `{{nombre}}` en cualquier campo, con **entornos** y variables globales por workspace.
- Ver la respuesta: estado, tiempo, tamaño, headers y cuerpo (JSON y XML con formato y color).
- Consultar el **historial** de ejecuciones, filtrarlo por la petición abierta y reabrir una ejecución en su pestaña.

## Stack

- [Angular](https://angular.dev) 21: componentes standalone, signals y sin Zone.js
- [PrimeNG](https://primeng.org) 21 y CodeMirror 6 para los editores
- Vitest con jsdom para las pruebas

## Requisitos

- Node.js 22 o superior
- La API de APICheck corriendo en `http://localhost:3000` (ver el README de ese repo)

## Puesta en marcha

```bash
npm install
npm start        # http://localhost:4200
```

En desarrollo `proxy.conf.json` redirige `/api/*` a `http://localhost:3000`, así que no hace falta configurar CORS.

## Scripts

| Comando | Qué hace |
| --- | --- |
| `npm start` | Servidor de desarrollo con recarga |
| `npm test` | Pruebas unitarias (Vitest); `npm test -- --no-watch` para una sola pasada |
| `npm run build` | Compilación de producción en `dist/ApiCheckClient21/browser` |

## Estructura

```text
src/app/
  core/          api (clientes HTTP), models, state (stores con signals), requests,
                 variables, history, notifications e interceptores
  features/      collections, editor (REST y SOAP), environments, response, history
  layout/        shell, panel lateral y selectores de workspace y entorno
  shared/        componentes reutilizables (editor de código, tabla clave-valor, diálogos…)
src/environments/  environment.ts (desarrollo, apiUrl '/api') y environment.prod.ts
```

## CI y despliegue

- **GitHub Actions** (`.github/workflows/ci-cd.yml`) ejecuta las pruebas y la compilación en cada push y PR a `main` y `develop`.
- **Vercel** despliega con su integración de GitHub (producción desde `main`, previews en PR). `vercel.json` fija la carpeta de salida y reenvía `/api/*` al backend, así que el navegador solo habla con un origen. Antes de desplegar, cambia el destino del rewrite (`https://backend.example.com`) por el dominio del backend. Los pasos completos están en `DESPLIEGUE.md` del repo [ApiCheck](https://github.com/jorrego29-jpg/ApiCheck).

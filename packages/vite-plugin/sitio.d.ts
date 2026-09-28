/**
 * Lo que una ruta de `src/routes/` puede importar del sitio.
 */

/**
 * Lo que lanza `load()` cuando lo pedido no existe: en desarrollo y en modo
 * `server`, el sitio responde con la página 404.
 */
export function notFound(): Error;

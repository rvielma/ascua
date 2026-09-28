/**
 * Lo que una ruta de `src/rutas/` puede importar del sitio.
 */

/**
 * Lo que lanza `cargar()` cuando lo pedido no existe: en desarrollo y en modo
 * servidor, el sitio responde con la página 404.
 */
export function noExiste(): Error;

/**
 * Los textos del kit, en español y en inglés.
 *
 * Hay dos públicos y cada uno elige su idioma por su lado:
 *
 * - **Quien usa el sitio** —los mensajes de validación de `field`, el cuerpo de
 *   un 403 o un 405— lee el idioma del sitio: `site: { lang: "en" }`. El plugin
 *   lo deja en `globalThis` porque en desarrollo Vite carga para las rutas otra
 *   copia de este módulo, y las dos tienen que verlo.
 * - **Quien lo desarrolla** —un error de build, el resumen del final— lee la
 *   variable de entorno `LANG`, como cualquier herramienta de línea de comandos.
 *
 * Sin indicación, español.
 */

const ES = {
  // Validación de `field`.
  obligatorio: "Obligatorio",
  alMenos: (n) => `Al menos ${n} caracteres`,
  comoMucho: (n) => `Como mucho ${n} caracteres`,
  formato: "No tiene el formato pedido",
  correo: "No es un correo válido",
  numero: "No es un número",
  entero: "Tiene que ser un número entero",
  minimo: (n) => `Como mínimo ${n}`,
  maximo: (n) => `Como máximo ${n}`,
  opcion: "Opción no válida",
  // Respuestas.
  noExiste: "No existe",
  sinFormularios: "Esta página no recibe formularios",
  otroOrigen: "Formulario enviado desde otro origen",
  otroOrigenPeticion: "Petición enviada desde otro origen",
  sinAccion: (nombre) => `No hay ninguna acción «${nombre}»`,
  ilegible: "El formulario no se pudo leer",
  metodo: "Método no permitido",
  demasiado: "Demasiado grande",
  interno: "Error interno",
  enArchivo: (archivo) => `en ${archivo}`,
  // Para quien desarrolla.
  restoAlFinal: (archivo) => `${archivo}: [...rest] solo puede ir al final`,
  mismaUrl: (a, b, url) => `${a} y ${b} dan la misma URL: ${url}`,
  sinSecreto: "ascua: las cookies firmadas necesitan la variable de entorno ASCUA_SECRET, de 32 caracteres o más",
  sinPaths: (archivo) => `${archivo}: una ruta variable necesita export function paths(), que diga qué páginas generar`,
  pathsNoLista: (archivo) => `${archivo}: paths() tiene que devolver una lista`,
  modo: (valor) => `ascua: site.mode es "static" o "server", no ${valor}`,
  servidorEn: (ruta) => `ascua: servidor en ${ruta}`,
  sinRutas: (dir) => `ascua: no hay rutas en ${dir}/`,
  accionesSinServidor: (archivo) =>
    `${archivo}: las acciones necesitan un servidor que las reciba; usa site: { mode: "server" }`,
  middlewareSinServidor: (archivo) =>
    `${archivo}: un middleware necesita un servidor que reciba las peticiones; usa site: { mode: "server" }`,
  construido: (paginas, archivos, dir) =>
    `ascua: ${paginas} ${paginas === 1 ? "página" : "páginas"}${archivos ? ` y ${archivos} ${archivos === 1 ? "archivo" : "archivos"}` : ""} en ${dir}/`,
  faltaParametro: (nombre, ruta) => `falta el parámetro «${nombre}» para ${ruta}`,
  faltaDefault: (ruta) => `${ruta}: falta export default`,
  faltaComponente: (camino) => `${camino}: falta el componente de la página (export default)`,
  metodosSinServidor: (archivo) =>
    `${archivo}: GET, POST, PUT… necesitan un servidor que reciba las peticiones; usa site: { mode: "server" }`,
  sinResponse: (metodo, camino) => `${camino}: ${metodo} tiene que devolver un Response (por ejemplo, Response.json(datos))`,
};

const EN = {
  obligatorio: "Required",
  alMenos: (n) => `At least ${n} characters`,
  comoMucho: (n) => `At most ${n} characters`,
  formato: "Does not match the expected format",
  correo: "Not a valid email",
  numero: "Not a number",
  entero: "Must be a whole number",
  minimo: (n) => `At least ${n}`,
  maximo: (n) => `At most ${n}`,
  opcion: "Not a valid option",
  noExiste: "Not found",
  sinFormularios: "This page does not accept forms",
  otroOrigen: "Form sent from another origin",
  otroOrigenPeticion: "Request sent from another origin",
  sinAccion: (nombre) => `There is no action "${nombre}"`,
  ilegible: "The form could not be read",
  metodo: "Method not allowed",
  demasiado: "Too large",
  interno: "Internal error",
  enArchivo: (archivo) => `in ${archivo}`,
  restoAlFinal: (archivo) => `${archivo}: [...rest] can only go last`,
  mismaUrl: (a, b, url) => `${a} and ${b} have the same URL: ${url}`,
  sinSecreto: "ascua: signed cookies need the ASCUA_SECRET environment variable, 32 characters or more",
  sinPaths: (archivo) => `${archivo}: a variable route needs export function paths(), saying which pages to generate`,
  pathsNoLista: (archivo) => `${archivo}: paths() has to return a list`,
  modo: (valor) => `ascua: site.mode is "static" or "server", not ${valor}`,
  servidorEn: (ruta) => `ascua: server at ${ruta}`,
  sinRutas: (dir) => `ascua: no routes in ${dir}/`,
  accionesSinServidor: (archivo) =>
    `${archivo}: actions need a server to receive them; use site: { mode: "server" }`,
  middlewareSinServidor: (archivo) =>
    `${archivo}: middleware needs a server to receive requests; use site: { mode: "server" }`,
  construido: (paginas, archivos, dir) =>
    `ascua: ${paginas} ${paginas === 1 ? "page" : "pages"}${archivos ? ` and ${archivos} ${archivos === 1 ? "file" : "files"}` : ""} in ${dir}/`,
  faltaParametro: (nombre, ruta) => `missing param "${nombre}" for ${ruta}`,
  faltaDefault: (ruta) => `${ruta}: missing export default`,
  faltaComponente: (camino) => `${camino}: missing the page component (export default)`,
  metodosSinServidor: (archivo) =>
    `${archivo}: GET, POST, PUT… need a server to receive requests; use site: { mode: "server" }`,
  sinResponse: (metodo, camino) => `${camino}: ${metodo} must return a Response (for example, Response.json(data))`,
};

const MENSAJES = { es: ES, en: EN };

/** Los textos para quien usa el sitio, en el idioma de `site.lang`. */
export const paraUsuario = () => (globalThis.__ascuaLang === "en" ? EN : ES);

/** Fija el idioma del sitio. Lo llaman el plugin y el servidor construido. */
export function fijarIdioma(idioma) {
  globalThis.__ascuaLang = idioma === "en" ? "en" : "es";
}

/** El idioma de quien desarrolla, de `LANG`: `"es"` o `"en"`. */
export function idiomaDeDesarrollo() {
  const env = globalThis.process?.env ?? {};
  const lang = env.LC_ALL || env.LC_MESSAGES || env.LANG || "";
  return lang && !/^es/i.test(lang) && !/^(C|POSIX)(\.|$)/.test(lang) ? "en" : "es";
}

/** Los textos para quien desarrolla, en el idioma de `LANG`. */
export const paraDesarrollo = () => MENSAJES[idiomaDeDesarrollo()];

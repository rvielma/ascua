/**
 * Lo que comparten el plugin (build y desarrollo) y el servidor que genera
 * la fase 3: encajar una URL con una ruta, renderizar una página y meterla en
 * el esqueleto. Sin `fs` ni Vite: el servidor lo lleva dentro de su bundle.
 */

export const ISLA = "data-ascua-island";

/**
 * Lo que lanza `cargar()` cuando lo pedido no existe: el sitio responde con la
 * página 404 en vez de con un error.
 *
 * ```ts
 * import { noExiste } from "vite-plugin-ascua/sitio";
 *
 * export async function cargar({ id }: { id: string }) {
 *   const pedido = await buscarPedido(id);
 *   if (!pedido) throw noExiste();
 *   return pedido;
 * }
 * ```
 */
export function noExiste() {
  const error = new Error("no existe");
  error.name = "NoExiste";
  // Una marca y no `instanceof`: el servidor puede llevar dentro su propia
  // copia de este módulo.
  error.ascuaNoExiste = true;
  return error;
}

export const esNoExiste = (error) => error?.ascuaNoExiste === true;
export const HUECO = "<!--ascua-->";

export const ESQUELETO = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title></title>
  </head>
  <body>
    ${HUECO}
  </body>
</html>
`;

/** Los tipos de lo que sirve un sitio: rutas que no son HTML y archivos. */
export const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
  ".webmanifest": "application/manifest+json",
};

export const tipoDe = (nombre) => TIPOS[/\.[a-z0-9]+$/i.exec(nombre)?.[0]?.toLowerCase() ?? ""] ?? "application/octet-stream";

/**
 * @typedef {object} Ruta
 * @property {string[]} segmentos  `["pedidos", ":id"]`; vacío para `/`. `*resto`
 *   atrapa lo que queda de la URL: `[...resto].ts`.
 * @property {boolean} es404
 * @property {boolean} archivo    `busqueda.js.ts`: no es una página, es ese archivo.
 */

/** ¿Encaja `camino` con la ruta? Devuelve los parámetros, o `null`. */
export function encajar(ruta, camino) {
  if (ruta.es404) return null;
  let partes;
  try {
    partes = camino.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }
  const resto = ruta.segmentos.at(-1)?.startsWith("*");
  if (resto ? partes.length < ruta.segmentos.length : partes.length !== ruta.segmentos.length) return null;
  const parametros = {};
  for (let i = 0; i < ruta.segmentos.length; i++) {
    const segmento = ruta.segmentos[i];
    if (segmento.startsWith("*")) {
      parametros[segmento.slice(1)] = partes.slice(i).join("/");
      break;
    }
    if (segmento.startsWith(":")) parametros[segmento.slice(1)] = partes[i];
    else if (segmento !== partes[i]) return null;
  }
  return parametros;
}

/** La primera ruta que encaja, o la 404. */
export function buscar(rutas, camino) {
  for (const ruta of rutas) {
    const parametros = encajar(ruta, camino);
    if (parametros) return { ruta, parametros, estado: 200 };
  }
  const noEncontrada = rutas.find((r) => r.es404);
  return noEncontrada ? { ruta: noEncontrada, parametros: {}, estado: 404 } : null;
}

export const esVariable = (ruta) => ruta.segmentos.some((s) => s.startsWith(":") || s.startsWith("*"));

/** `/pedidos/:id` con `{ id: "7" }` → `/pedidos/7`. */
export function caminoDe(ruta, parametros) {
  if (ruta.es404) return "/404";
  const partes = ruta.segmentos.map((s) => {
    if (!s.startsWith(":") && !s.startsWith("*")) return s;
    const valor = parametros[s.slice(1)];
    if (valor === undefined || valor === null || valor === "") {
      throw new Error(`falta el parámetro «${s.slice(1)}» para /${ruta.segmentos.join("/")}`);
    }
    // El resto puede traer barras: cada trozo se codifica por separado.
    return s.startsWith("*")
      ? String(valor).split("/").filter(Boolean).map(encodeURIComponent).join("/")
      : encodeURIComponent(String(valor));
  });
  return `/${partes.join("/")}`;
}

const escapar = (texto) =>
  String(texto).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Mete una página en el esqueleto. */
export function componer(esqueleto, { html, css, titulo, descripcion, cabeza: extra, script, hojas = [] }) {
  let salida = esqueleto;
  // Con funciones y no con texto: `replace` interpreta `$&` en el reemplazo.
  if (titulo !== undefined && titulo !== null) {
    salida = /<title>[\s\S]*?<\/title>/.test(salida)
      ? salida.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapar(titulo)}</title>`)
      : salida.replace("</head>", () => `  <title>${escapar(titulo)}</title>\n  </head>`);
  }

  const cabeza = [
    descripcion ? `<meta name="description" content="${escapar(descripcion)}">` : "",
    // `cabeza` es HTML tal cual, como lo escribió la ruta.
    extra ? String(extra).trim() : "",
    ...hojas.map((h) => `<link rel="stylesheet" href="${h}">`),
    css ? `<style>${css}</style>` : "",
  ].filter(Boolean);
  if (cabeza.length) salida = salida.replace("</head>", () => `  ${cabeza.join("\n    ")}\n  </head>`);

  salida = salida.includes(HUECO)
    ? salida.replace(HUECO, () => html)
    : salida.replace(/<body[^>]*>/, (apertura) => `${apertura}\n${html}`);

  if (script) salida = salida.replace("</body>", () => `  <script type="module" src="${script}"></script>\n  </body>`);
  return salida;
}

/** Lo que recibe la página, su título y su descripción: parámetros y datos. */
async function propsDe(modulo, parametros, contexto) {
  if (typeof modulo.cargar !== "function") return { ...parametros };
  return { ...parametros, datos: await modulo.cargar({ ...parametros }, contexto) };
}

const valorDe = (campo, props) => (typeof campo === "function" ? campo(props) : campo);

/**
 * Una ruta, ya con su módulo cargado, a lo que se sirve.
 *
 * `marcos` van del de fuera al de dentro: el de la raíz envuelve al de la
 * carpeta, que envuelve a la página.
 *
 * `ascua` son `renderToString`, `collectStyles` y `append`: vienen de fuera
 * para que en el build sean los del servidor de Vite —los mismos con los que
 * se registraron los estilos— y en el servidor, los de su bundle.
 *
 * @returns {Promise<{ tipo: string, cuerpo: string | Uint8Array, conIslas?: boolean, html?: string, css?: string, titulo?: string, descripcion?: string }>}
 */
export async function renderizar({ ruta, modulo, marcos = [], parametros, camino, ascua, contexto = {} }) {
  const props = await propsDe(modulo, parametros, contexto);

  if (ruta.archivo) {
    if (typeof modulo.default !== "function") throw new Error(`/${ruta.segmentos.join("/")}: falta export default`);
    const cuerpo = await modulo.default(props);
    return { tipo: tipoDe(ruta.segmentos.at(-1)), cuerpo };
  }

  if (typeof modulo.default !== "function") {
    throw new Error(`${camino}: falta el componente de la página (export default)`);
  }
  const envolver = (i) =>
    i === marcos.length
      ? modulo.default(props)
      : marcos[i]({ ruta: camino, parametros, children: (padre) => ascua.append(padre, envolver(i + 1)) });
  const html = ascua.renderToString(() => envolver(0));
  return {
    tipo: TIPOS[".html"],
    html,
    css: ascua.collectStyles(html),
    titulo: valorDe(modulo.titulo, props),
    descripcion: valorDe(modulo.descripcion, props),
    cabeza: valorDe(modulo.cabeza, props),
    conIslas: html.includes(ISLA),
  };
}

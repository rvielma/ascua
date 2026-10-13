/**
 * Lo que comparten el plugin (build y desarrollo) y el servidor que genera
 * la fase 3: encajar una URL con una ruta, renderizar una página y meterla en
 * el esqueleto. Sin `fs` ni Vite: el servidor lo lleva dentro de su bundle.
 */

import { checkOrigin, contentSecurityPolicy, createCookies, securityHeaders } from "ascua-security";

import { paraDesarrollo, paraUsuario } from "./mensajes.js";

// Para el servidor construido, que lleva este módulo dentro y no ve el otro.
export { fijarIdioma, paraDesarrollo, paraUsuario } from "./mensajes.js";

export const ISLA = "data-ascua-island";
/**
 * La cabecera con la que `enhance()` pide el resultado de una acción en JSON
 * en vez de la página entera. Debe coincidir con la de `form.js`.
 */
export const CABECERA_ACCION = "x-ascua-action";
/** El `id` del `<script type="application/json">` con las islas de una página. */
export const LISTA = "ascua-islands";

/** Los nombres de las islas que hay en un HTML ya renderizado. */
export function islasEn(html) {
  const nombres = new Set();
  for (const [, nombre] of html.matchAll(new RegExp(`${ISLA}="([^"]*)"`, "g"))) nombres.add(nombre);
  return nombres;
}

/** Las islas de `defineIsland` que exporta un módulo, por su nombre. */
export function nombresDe(modulo) {
  const nombres = [];
  for (const valor of Object.values(modulo)) {
    if (valor && typeof valor.name === "string" && typeof valor.prepare === "function") nombres.push(valor.name);
  }
  return nombres;
}

/**
 * De los nombres que usa una página a los módulos que hay que cargar, con
 * `mapa` yendo del nombre al módulo. Una isla que no está en el mapa —hecha
 * con `island()` a mano— no tiene nada que hidratar aquí.
 */
export function modulosDe(nombres, mapa) {
  return [...new Set([...nombres].map((n) => mapa[n]).filter(Boolean))].sort();
}

/**
 * Lo que una página con islas añade al esqueleto: el script que las hidrata,
 * la lista de módulos que tiene que cargar, y sus chunks y hojas por delante
 * para que no haya cascada ni parpadeo. Sin islas que hidratar, nada.
 *
 * `construido` es lo que dejó el build del cliente —o, en desarrollo, solo el
 * script—: `islas` va de la clave de cada módulo a sus chunks y sus hojas.
 */
export function conIslas(nombres, mapa, { script, precargas = [], hojas = [], islas = {}, partials = false }) {
  const modulos = modulosDe(nombres ?? [], mapa);
  // Con partials el script va en todas las páginas: es el que navega.
  if (!script || (modulos.length === 0 && !partials)) return { script: null };
  const chunks = new Set(precargas);
  const estilos = new Set(hojas);
  for (const modulo of modulos) {
    for (const chunk of islas[modulo]?.precargas ?? []) chunks.add(chunk);
    for (const hoja of islas[modulo]?.hojas ?? []) estilos.add(hoja);
  }
  // El script ya se pide con su `<script>`: precargarlo es pedirlo dos veces.
  chunks.delete(script);
  return { script, islas: modulos, precargas: [...chunks], hojas: [...estilos] };
}

/**
 * Lo que lanza `load()` cuando lo pedido no existe: el sitio responde con la
 * página 404 en vez de con un error.
 *
 * ```ts
 * import { notFound } from "vite-plugin-ascua/site";
 *
 * export async function load({ id }: { id: string }) {
 *   const pedido = await buscarPedido(id);
 *   if (!pedido) throw notFound();
 *   return pedido;
 * }
 * ```
 */
export function notFound() {
  const error = new Error("no existe");
  error.name = "NotFound";
  // Una marca y no `instanceof`: el servidor puede llevar dentro su propia
  // copia de este módulo.
  error.ascuaNoExiste = true;
  return error;
}

export const esNoExiste = (error) => error?.ascuaNoExiste === true;

/**
 * Lo que devuelve —o lanza— una acción, o lanza `load()`, para mandar al
 * navegador a otra página. Por defecto un 303: el navegador la pide con GET,
 * y recargar no reenvía el formulario.
 */
export function redirect(location, status = 303) {
  if (status < 300 || status > 308) throw new Error(`redirect: ${status} no es un código de redirección`);
  const error = new Error(`redirige a ${location}`);
  error.name = "Redirect";
  error.ascuaRedirige = { status, location: String(location) };
  return error;
}

const redireccionDe = (valor) => valor?.ascuaRedirige ?? null;

/**
 * Lo que devuelve una acción cuando lo enviado no vale: la página se vuelve a
 * pintar con ese código y `data` en la prop `form`, para mostrar los errores
 * y lo que se había escrito.
 */
export function fail(status, data) {
  if (status < 400 || status > 599) throw new Error(`fail: ${status} no es un código de error`);
  return { ascuaFallo: true, status, data };
}

const esFallo = (valor) => valor?.ascuaFallo === true;

// ---------------------------------------------------------------------------
// Formularios.

/**
 * Los campos de un formulario como objeto. Un nombre repetido —casillas con
 * el mismo `name`, un `<select multiple>`— da una lista.
 */
export function formValues(form) {
  const valores = {};
  const entradas = typeof form?.entries === "function" ? form.entries() : Object.entries(form ?? {});
  for (const [nombre, valor] of entradas) {
    if (!(nombre in valores)) valores[nombre] = valor;
    else if (Array.isArray(valores[nombre])) valores[nombre].push(valor);
    else valores[nombre] = [valores[nombre], valor];
  }
  return valores;
}

/** Lo que se le devuelve al formulario para volver a llenarlo: sin archivos ni contraseñas. */
const CONTRASEÑA = /pass|contrase/i;
function paraVolver(valores) {
  const salida = {};
  for (const [nombre, valor] of Object.entries(valores)) {
    if (CONTRASEÑA.test(nombre)) continue;
    if (typeof valor === "string") salida[nombre] = valor;
    else if (Array.isArray(valor) && valor.every((v) => typeof v === "string")) salida[nombre] = valor;
  }
  return salida;
}

/**
 * Valida un formulario con un esquema de Standard Schema: los de `fields`, o
 * Zod, Valibot, ArkType…
 *
 * ```ts
 * const resultado = await validate(Pedido, formData);
 * if (!resultado.ok) return fail(400, resultado);
 * await guardar(resultado.data);
 * ```
 *
 * Si no vale, `errors` lleva el primer mensaje de cada campo y `values` lo
 * que se escribió, para volver a llenar el formulario.
 */
export async function validate(schema, form) {
  const valores = formValues(form);
  const resultado = await schema["~standard"].validate(valores);
  if (!resultado.issues) return { ok: true, data: resultado.value };
  const errors = {};
  for (const problema of resultado.issues) {
    const primero = problema.path?.[0];
    const campo = typeof primero === "object" && primero !== null ? primero.key : primero;
    const clave = campo === undefined ? "" : String(campo);
    errors[clave] ??= problema.message;
  }
  return { ok: false, errors, values: paraVolver(valores) };
}

function esquema(validar) {
  return { "~standard": { version: 1, vendor: "ascua", validate: validar } };
}

const problema = (message) => ({ issues: [{ message }] });
const texto = (valor) => (typeof valor === "string" ? valor : Array.isArray(valor) ? String(valor.at(-1) ?? "") : "");

/**
 * Esquemas para lo que llega de un formulario, que siempre es texto. Cada
 * uno convierte y valida; los mensajes se cambian con `message`.
 *
 * ```ts
 * const Pedido = fields({
 *   nombre: field.text({ max: 80 }),
 *   cantidad: field.number({ min: 1, integer: true }),
 *   correo: field.email(),
 *   urgente: field.checkbox(),
 *   notas: field.optional(field.text()),
 * });
 * ```
 */
export const field = {
  /** Texto, sin los espacios de los extremos. Obligatorio. */
  text({ min = 1, max = Infinity, pattern, trim = true, message } = {}) {
    return esquema((valor) => {
      const leido = trim ? texto(valor).trim() : texto(valor);
      if (leido.length === 0 && min > 0) return problema(message ?? paraUsuario().obligatorio);
      if (leido.length < min) return problema(message ?? paraUsuario().alMenos(min));
      if (leido.length > max) return problema(message ?? paraUsuario().comoMucho(max));
      if (pattern && !pattern.test(leido)) return problema(message ?? paraUsuario().formato);
      return { value: leido };
    });
  },

  /** Un correo. Obligatorio. */
  email({ message } = {}) {
    return esquema((valor) => {
      const leido = texto(valor).trim();
      if (!leido) return problema(message ?? paraUsuario().obligatorio);
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leido) ? { value: leido } : problema(message ?? paraUsuario().correo);
    });
  },

  /** Un número. Obligatorio. */
  number({ min = -Infinity, max = Infinity, integer = false, message } = {}) {
    return esquema((valor) => {
      const leido = texto(valor).trim();
      if (!leido) return problema(message ?? paraUsuario().obligatorio);
      const numero = Number(leido.replace(",", "."));
      if (!Number.isFinite(numero)) return problema(message ?? paraUsuario().numero);
      if (integer && !Number.isInteger(numero)) return problema(message ?? paraUsuario().entero);
      if (numero < min) return problema(message ?? paraUsuario().minimo(min));
      if (numero > max) return problema(message ?? paraUsuario().maximo(max));
      return { value: numero };
    });
  },

  /** Una casilla: marcada si llegó, sea cual sea su valor. */
  checkbox() {
    return esquema((valor) => ({ value: valor !== undefined && valor !== null }));
  },

  /** Uno de los valores dados. */
  choice(opciones, { message } = {}) {
    return esquema((valor) => {
      const leido = texto(valor);
      return opciones.includes(leido) ? { value: leido } : problema(message ?? paraUsuario().opcion);
    });
  },

  /** Vacío o ausente es `undefined`; si no, lo valida `interior`. */
  optional(interior) {
    return esquema((valor) =>
      valor === undefined || texto(valor).trim() === "" ? { value: undefined } : interior["~standard"].validate(valor),
    );
  },
};

/**
 * Un objeto de campos. A diferencia de un esquema de objeto corriente, junta
 * los problemas de **todos** los campos: un formulario los muestra a la vez.
 */
export function fields(forma) {
  return esquema(async (valores) => {
    const objeto = valores && typeof valores === "object" ? valores : {};
    const salida = {};
    const issues = [];
    for (const [clave, esquemaCampo] of Object.entries(forma)) {
      const resultado = await esquemaCampo["~standard"].validate(objeto[clave]);
      if (resultado.issues) {
        for (const p of resultado.issues) issues.push({ ...p, path: [clave, ...(p.path ?? [])] });
      } else if (resultado.value !== undefined) {
        salida[clave] = resultado.value;
      }
    }
    return issues.length ? { issues } : { value: salida };
  });
}
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
 * @property {string[]} segmentos  `["pedidos", ":id"]`; vacío para `/`. `*rest`
 *   atrapa lo que queda de la URL: `[...rest].ts`.
 * @property {boolean} es404
 * @property {boolean} [es500]   `500.ts`: la página de un error que nadie capturó.
 * @property {boolean} archivo    `busqueda.js.ts`: no es una página, es ese archivo.
 */

/** ¿Encaja `camino` con la ruta? Devuelve los parámetros, o `null`. */
export function encajar(ruta, camino) {
  if (ruta.es404 || ruta.es500) return null;
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
  if (ruta.es500) return "/500";
  const partes = ruta.segmentos.map((s) => {
    if (!s.startsWith(":") && !s.startsWith("*")) return s;
    const valor = parametros[s.slice(1)];
    if (valor === undefined || valor === null || valor === "") {
      throw new Error(paraDesarrollo().faltaParametro(s.slice(1), `/${ruta.segmentos.join("/")}`));
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
export function componer(esqueleto, { html, css, title: titulo, description: descripcion, head: extra, lang: idioma, script, islas = [], precargas = [], hojas = [] }) {
  let salida = esqueleto;
  // `export const lang` en la ruta: el idioma de esa página, sobre el del
  // esqueleto. Un sitio en dos idiomas comparte esqueleto.
  if (idioma) {
    salida = salida.replace(/<html\b([^>]*)>/i, (_, atributos) => {
      const sin = atributos.replace(/\s+lang\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, "");
      return `<html lang="${escapar(idioma)}"${sin}>`;
    });
  }
  // Con funciones y no con texto: `replace` interpreta `$&` en el reemplazo.
  if (titulo !== undefined && titulo !== null) {
    salida = /<title>[\s\S]*?<\/title>/.test(salida)
      ? salida.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${escapar(titulo)}</title>`)
      : salida.replace("</head>", () => `  <title>${escapar(titulo)}</title>\n  </head>`);
  }

  const cabeza = [
    descripcion ? `<meta name="description" content="${escapar(descripcion)}">` : "",
    // `head` es HTML tal cual, como lo escribió la ruta.
    extra ? String(extra).trim() : "",
    ...precargas.map((p) => `<link rel="modulepreload" crossorigin href="${p}">`),
    ...hojas.map((h) => `<link rel="stylesheet" href="${h}">`),
    css ? `<style>${css}</style>` : "",
  ].filter(Boolean);
  if (cabeza.length) salida = salida.replace("</head>", () => `  ${cabeza.join("\n    ")}\n  </head>`);

  salida = salida.includes(HUECO)
    ? salida.replace(HUECO, () => html)
    : salida.replace(/<body[^>]*>/, (apertura) => `${apertura}\n${html}`);

  if (script) {
    // `<` escapado: el JSON va dentro de un `<script>` y no puede cerrarlo.
    const lista = JSON.stringify(islas).replace(/</g, "\\u003c");
    salida = salida.replace(
      "</body>",
      () =>
        `  <script type="application/json" id="${LISTA}">${lista}</script>\n` +
        `  <script type="module" src="${script}"></script>\n  </body>`,
    );
  }
  return salida;
}

/**
 * Lo que recibe la página, su título y su descripción: parámetros, datos y,
 * tras una acción, lo que devolvió.
 */
async function propsDe(modulo, parametros, contexto, form, extra) {
  const props = { ...parametros, ...extra };
  if (typeof modulo.load === "function") props.data = await modulo.load({ ...parametros }, contexto);
  if (form !== undefined) props.form = form;
  return props;
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
 * @returns {Promise<{ tipo: string, cuerpo: string | Uint8Array, nombresIslas?: Set<string>, html?: string, css?: string, title?: string, description?: string }>}
 */
export async function renderizar({ ruta, modulo, marcos = [], parametros, camino, ascua, contexto = {}, form, extra }) {
  const props = await propsDe(modulo, parametros, contexto, form, extra);

  if (ruta.archivo) {
    if (typeof modulo.default !== "function") throw new Error(paraDesarrollo().faltaDefault(`/${ruta.segmentos.join("/")}`));
    const cuerpo = await modulo.default(props);
    return { tipo: tipoDe(ruta.segmentos.at(-1)), cuerpo };
  }

  if (typeof modulo.default !== "function") {
    throw new Error(paraDesarrollo().faltaComponente(camino));
  }
  const envolver = (i) =>
    i === marcos.length
      ? modulo.default(props)
      : marcos[i]({
          path: camino,
          params: parametros,
          locals: contexto.locals ?? {},
          children: (padre) => ascua.append(padre, envolver(i + 1)),
        });
  const html = ascua.renderToString(() => envolver(0));
  return {
    tipo: TIPOS[".html"],
    html,
    css: ascua.collectStyles(html),
    title: valorDe(modulo.title, props),
    description: valorDe(modulo.description, props),
    head: valorDe(modulo.head, props),
    lang: valorDe(modulo.lang, props),
    nombresIslas: islasEn(html),
  };
}

// ---------------------------------------------------------------------------
// Atender una petición: lo mismo en desarrollo y en el servidor.

/**
 * Los métodos que una ruta puede atender con una función propia, como en
 * Fresh: `export async function PUT(ctx) { return Response.json(…) }`.
 */
export const METODOS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

/** Los que leen: no cambian nada, así que no se mira de dónde vienen. */
const SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Lo que se acepta de cuerpo en un POST si no se dice otra cosa: 1 MiB. */
export const LIMITE_CUERPO = 1024 * 1024;

const LOCALES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** ¿Llegó por HTTPS, directamente o a través de un proxy? */
function porHttps(peticion, url) {
  const proxy = peticion.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return (proxy ?? url.protocol.slice(0, -1)) === "https";
}

/**
 * Atiende una petición a las rutas del sitio. Devuelve `{ status, headers,
 * body }`, o `null` si ninguna ruta la atiende y no hay 404 propia.
 *
 * - `GET`/`HEAD`: la página, con sus datos.
 * - `POST`: la acción de la ruta —`?/nombre` elige una de `actions`; si no,
 *   `default`—, que solo corre si el formulario viene de este mismo origen.
 *   Después, la página se pinta con lo que devolvió en `form`, salvo que la
 *   acción redirija.
 *
 * Con la cabecera `x-ascua-action: 1` —la que pone `enhance()` desde una
 * isla—, un `POST` no pinta la página: responde el resultado de la acción en
 * JSON, `{ type, status, data | location | message }`, con `type` uno de
 * `success`, `failure`, `redirect` o `error`. Una redirección va con un 200,
 * para que `fetch` no la siga por su cuenta, y un `fail` también: su código
 * va en `status`. Solo un rechazo (otro origen, una acción que no existe)
 * lleva su código de error.
 *
 * Si la ruta exporta una función con el nombre del método —`GET`, `PUT`,
 * `DELETE`…—, responde ella con su `Response`, antes que la página o las
 * acciones. Las que no leen solo corren si vienen del mismo origen.
 *
 * Un error que nadie captura pinta `500.ts`, si la hay, con el error en
 * `props.error`. Salvo en una ruta de archivo, un método propio o `enhance()`,
 * que esperan otra cosa que una página: ahí sigue el error.
 *
 * Antes de todo eso corren los `_middleware.ts` de la ruta, del de fuera al
 * de dentro: pueden redirigir, dar la 404, dejar datos en `locals` para
 * `load()`, las acciones y los layouts, y añadir cabeceras con `setHeaders`.
 *
 * `cargar(ruta)` da `{ modulo, marcos, middlewares }`; `componer(pagina)`, el HTML entero.
 * `seguridad` es la de `site.security` —`false` la apaga— y, en
 * `desarrollo`, la CSP solo avisa.
 */
export async function responder({ peticion, camino, rutas, cargar, ascua, componer: componerPagina, seguridad = {}, desarrollo = false, secreto }) {
  const encontrada = buscar(rutas, camino);
  if (!encontrada) return null;
  let { ruta, parametros, estado } = encontrada;
  let { modulo, marcos, middlewares = [] } = await cargar(ruta);
  let form;

  const url = new URL(peticion.url);
  const metodo = peticion.method.toUpperCase();
  const cookies = createCookies(peticion.headers.get("cookie"), { secret: secreto, secure: !LOCALES.has(url.hostname) });
  /** Lo que los middlewares dejan para `load()`, las acciones y los layouts. */
  const locals = {};
  const contexto = { url, request: peticion, cookies, locals };
  /** Las cabeceras de `setHeaders`: van en cualquier respuesta, y mandan sobre las del kit. */
  const extra = {};
  /** Si respondió un método propio: un error ahí no es una página. */
  let enMetodo = false;

  const conCookies = (respuesta) => {
    Object.assign(respuesta.headers, extra);
    const lineas = cookies.headers();
    if (lineas.length) respuesta.headers["set-cookie"] = lineas;
    return respuesta;
  };
  const texto = (status, body, extra = {}) =>
    conCookies({ status, headers: { "content-type": TIPOS[".txt"], "x-content-type-options": "nosniff", ...extra }, body });
  const redirigir = ({ status, location }) => conCookies({ status, headers: { location, "cache-control": "no-store" }, body: "" });

  // El resultado de una acción en JSON, para `enhance()`.
  const comoDatos = metodo === "POST" && peticion.headers.get(CABECERA_ACCION) === "1";
  const json = (status, cuerpo) =>
    conCookies({
      status,
      headers: { "content-type": TIPOS[".json"], "x-content-type-options": "nosniff", "cache-control": "private, no-store" },
      body: JSON.stringify(cuerpo),
    });
  const rechazar = (status, mensaje, extra) =>
    comoDatos ? json(status, { type: "error", status, message: mensaje }) : texto(status, mensaje, extra);

  /** A la página 404, si la hay. */
  const aLa404 = async () => {
    const noEncontrada = rutas.find((r) => r.es404);
    if (!noEncontrada) return false;
    ruta = noEncontrada;
    parametros = {};
    estado = 404;
    form = undefined;
    ({ modulo, marcos } = await cargar(ruta));
    return true;
  };

  // Los middlewares, del de fuera al de dentro. Cada uno puede cortar
  // —redirigir, la 404, una `Response` propia— o envolver lo de dentro con
  // `next()`: recibe la respuesta como `Response` y devuelve esa u otra. Si
  // no llama a `next()` ni devuelve nada, se sigue como si no estuviera.
  /** Lo que respondió la cadena cuando no había nada que responder (sin ruta ni 404 propia). */
  const sinRespuesta = new Response(paraUsuario().noExiste, { status: 404, headers: { "content-type": TIPOS[".txt"] } });
  const cortar = async (error) => {
    const destino = redireccionDe(error);
    if (destino) return comoDatos ? json(200, { type: "redirect", ...destino }) : redirigir(destino);
    if (!esNoExiste(error)) throw error;
    if (comoDatos) return json(404, { type: "error", status: 404, message: paraUsuario().noExiste });
    if (!(await aLa404())) return null;
    return resto();
  };
  /**
   * Una respuesta que pasó por las manos de un middleware: lo que este cambió
   * manda. Las cabeceras de `setHeaders` solo se añaden si faltan, y las
   * cookies se suman —las de `cookies.set()` después de `next()` también—.
   */
  const completar = (respuesta) => {
    for (const [nombre, valor] of Object.entries(extra)) {
      if (!(nombre in respuesta.headers)) respuesta.headers[nombre] = valor;
    }
    const previas = [respuesta.headers["set-cookie"] ?? []].flat();
    const todas = [...previas, ...cookies.headers().filter((linea) => !previas.includes(linea))];
    if (todas.length) respuesta.headers["set-cookie"] = todas;
    return respuesta;
  };
  const cadena = async (i) => {
    const middleware = middlewares[i];
    if (i >= middlewares.length) return resto();
    if (typeof middleware !== "function") return cadena(i + 1);
    let dentro;
    let llamado = false;
    const enMiddleware = {
      url,
      request: peticion,
      params: { ...parametros },
      cookies,
      locals,
      setHeaders(cabeceras) {
        for (const [nombre, valor] of Object.entries(cabeceras)) extra[nombre.toLowerCase()] = valor;
      },
      async next() {
        if (!llamado) {
          llamado = true;
          const interna = await cadena(i + 1);
          dentro = interna === null ? sinRespuesta : comoResponse(interna);
        }
        return dentro;
      },
    };
    let devuelto;
    try {
      devuelto = await middleware(enMiddleware);
    } catch (error) {
      return cortar(error);
    }
    if (redireccionDe(devuelto)) return cortar(devuelto);
    if (devuelto instanceof Response) {
      if (devuelto === sinRespuesta) return null;
      return completar(await deResponse(devuelto));
    }
    if (llamado) return dentro === sinRespuesta ? null : completar(await deResponse(dentro));
    return cadena(i + 1);
  };
  try {
    return await cadena(0);
  } catch (error) {
    const deError = rutas.find((r) => r.es500);
    if (!deError || comoDatos || enMetodo || ruta.archivo) throw error;
    console.error(error);
    try {
      const cargada = await cargar(deError);
      const pagina = await renderizar({
        ruta: deError,
        modulo: cargada.modulo,
        marcos: cargada.marcos,
        parametros: {},
        camino: "/500",
        ascua,
        contexto,
        extra: { error },
      });
      const respuesta = await comoPagina(pagina, 500);
      respuesta.headers["cache-control"] = "no-store";
      return respuesta;
    } catch {
      // Si la página de error también falla, el error de verdad es el primero.
      throw error;
    }
  }

  /** Una página ya pintada, con su HTML entero y las cabeceras de seguridad. */
  async function comoPagina(pagina, status) {
    const html = await componerPagina(pagina);
    const headers = { "content-type": pagina.tipo };
    if (seguridad !== false) {
      const csp =
        seguridad.csp === false ? undefined : await contentSecurityPolicy(html, { directives: seguridad.csp ?? {}, wasm: seguridad.wasm });
      Object.assign(
        headers,
        securityHeaders({ csp, reportOnly: desarrollo, hsts: !desarrollo && porHttps(peticion, url), headers: seguridad.headers }),
      );
    }
    // Lo que depende de quién pregunta no se guarda en cachés compartidas.
    if (metodo === "POST" || cookies.headers().length > 0) headers["cache-control"] = "private, no-store";
    return conCookies({ status, headers, body: html });
  }

  async function resto() {
  const conAcciones = estado === 200 && !ruta.archivo && modulo.actions && typeof modulo.actions === "object";
  const propios = METODOS.filter((m) => typeof modulo[m] === "function");
  /** Lo que la ruta atiende, para el `allow` de un 405. */
  const permitidos = () => {
    const lista = new Set();
    if (typeof modulo.default === "function" || propios.includes("GET")) lista.add("GET").add("HEAD");
    if (conAcciones) lista.add("POST");
    for (const m of propios) lista.add(m);
    return [...lista].join(", ");
  };

  // Un método propio: `export async function PUT(ctx)` responde un PUT.
  const nombre = metodo === "HEAD" ? "GET" : metodo;
  if (estado === 200 && propios.includes(nombre)) {
    if (!SEGUROS.has(metodo) && seguridad !== false && !checkOrigin(peticion, { origins: seguridad.origins })) {
      return texto(403, paraUsuario().otroOrigenPeticion);
    }
    enMetodo = true;
    let devuelto;
    try {
      devuelto = await modulo[nombre]({ params: { ...parametros }, url, request: peticion, cookies, locals });
    } catch (error) {
      const destino = redireccionDe(error);
      if (destino) return redirigir(destino);
      if (!esNoExiste(error)) throw error;
      enMetodo = false;
      if (!(await aLa404())) return null;
    }
    if (estado === 200) {
      const destino = redireccionDe(devuelto);
      if (destino) return redirigir(destino);
      if (!(devuelto instanceof Response)) throw new Error(paraDesarrollo().sinResponse(nombre, camino));
      return completar(await deResponse(devuelto));
    }
  }
  if (metodo === "POST" && estado === 200) {
    if (!conAcciones) return rechazar(405, paraUsuario().sinFormularios, { allow: permitidos() });
    if (seguridad !== false && !checkOrigin(peticion, { origins: seguridad.origins })) {
      return rechazar(403, paraUsuario().otroOrigen);
    }
    const nombre = url.search.startsWith("?/") ? decodeURIComponent(url.search.slice(2).split("&")[0]) : "default";
    const accion = Object.hasOwn(modulo.actions, nombre) ? modulo.actions[nombre] : undefined;
    if (typeof accion !== "function") return rechazar(404, paraUsuario().sinAccion(nombre));

    let formData;
    try {
      formData = await peticion.formData();
    } catch {
      return rechazar(400, paraUsuario().ilegible);
    }

    let resultado;
    try {
      resultado = await accion({ params: { ...parametros }, url, request: peticion, cookies, locals, formData });
    } catch (error) {
      const destino = redireccionDe(error);
      if (destino) return comoDatos ? json(200, { type: "redirect", ...destino }) : redirigir(destino);
      if (!esNoExiste(error)) throw error;
      if (comoDatos) return json(404, { type: "error", status: 404, message: paraUsuario().noExiste });
      if (!(await aLa404())) return null;
    }
    const destino = redireccionDe(resultado);
    if (destino) return comoDatos ? json(200, { type: "redirect", ...destino }) : redirigir(destino);
    if (comoDatos) {
      return esFallo(resultado)
        ? // Con un 200: el código va en el JSON, y un 400 de un formulario
          // mal llenado no es un error que el navegador deba anotar en la consola.
          json(200, { type: "failure", status: resultado.status, data: resultado.data ?? null })
        : json(200, { type: "success", status: 200, data: resultado ?? null });
    }
    if (estado !== 404) {
      if (esFallo(resultado)) {
        estado = resultado.status;
        form = resultado.data;
      } else {
        form = resultado;
      }
    }
  } else if (metodo !== "GET" && metodo !== "HEAD" && estado === 200) {
    return texto(405, paraUsuario().metodo, { allow: permitidos() });
  } else if (estado === 200 && !ruta.archivo && typeof modulo.default !== "function" && propios.length > 0) {
    // Solo métodos propios, sin página: un GET que no está entre ellos.
    return texto(405, paraUsuario().metodo, { allow: permitidos() });
  }

  const pintar = () => renderizar({ ruta, modulo, marcos, parametros, camino, ascua, contexto, form });
  let pagina;
  try {
    pagina = await pintar();
  } catch (error) {
    // `load()` manda a otra parte —sin sesión, a entrar— o dijo que no existe.
    const destino = redireccionDe(error);
    if (destino) return redirigir(destino);
    if (!esNoExiste(error)) throw error;
    if (!(await aLa404())) return null;
    pagina = await pintar();
  }

  if (ruta.archivo) {
    return conCookies({ status: estado, headers: { "content-type": pagina.tipo, "x-content-type-options": "nosniff" }, body: pagina.cuerpo });
  }

  return comoPagina(pagina, estado);
  }
}

/** Lo que responde el kit, como `Response`: lo que recibe `next()`. */
function comoResponse({ status, headers, body }) {
  const salida = new Headers();
  for (const [nombre, valor] of Object.entries(headers)) {
    for (const uno of Array.isArray(valor) ? valor : [valor]) salida.append(nombre, uno);
  }
  const sinCuerpo = status === 204 || status === 304 || (status >= 100 && status < 200);
  return new Response(sinCuerpo ? null : body, { status, headers: salida });
}

/**
 * Una `Response` de un middleware, de vuelta al formato del kit. El cuerpo
 * de lo que es texto queda como texto; lo demás, en bytes.
 */
async function deResponse(respuesta) {
  const headers = {};
  for (const [nombre, valor] of respuesta.headers) {
    if (nombre === "set-cookie") continue;
    headers[nombre] = valor;
  }
  const cookies = respuesta.headers.getSetCookie();
  if (cookies.length) headers["set-cookie"] = cookies;
  const tipo = headers["content-type"] ?? "";
  const esTexto = /^text\/|json|xml|javascript/.test(tipo);
  const body = respuesta.body === null ? "" : esTexto ? await respuesta.text() : new Uint8Array(await respuesta.arrayBuffer());
  return { status: respuesta.status, headers, body };
}

/** Un cuerpo más grande de lo aceptado. */
export const esDemasiado = (error) => error?.ascuaDemasiado === true;

/**
 * De la petición de `node:http` a un `Request`, leyendo el cuerpo hasta
 * `limite` bytes: más que eso es un error que se responde con un 413.
 */
export async function peticionWeb(entrante, limite = LIMITE_CUERPO) {
  const host = entrante.headers.host ?? "localhost";
  const url = new URL(entrante.url ?? "/", `http://${host}`);
  const headers = new Headers();
  for (const [nombre, valor] of Object.entries(entrante.headers)) {
    if (valor === undefined || nombre.startsWith(":")) continue;
    try {
      for (const uno of Array.isArray(valor) ? valor : [valor]) headers.append(nombre, uno);
    } catch {
      // Una cabecera que `Headers` no acepta no la necesita nadie aquí.
    }
  }
  const metodo = entrante.method ?? "GET";
  let body;
  if (metodo !== "GET" && metodo !== "HEAD") {
    const demasiado = () => Object.assign(new Error("cuerpo demasiado grande"), { ascuaDemasiado: true });
    if (Number(entrante.headers["content-length"]) > limite) throw demasiado();
    const trozos = [];
    let total = 0;
    for await (const trozo of entrante) {
      total += trozo.length;
      if (total > limite) throw demasiado();
      trozos.push(trozo);
    }
    body = new Uint8Array(total);
    let posicion = 0;
    for (const trozo of trozos) {
      body.set(trozo, posicion);
      posicion += trozo.length;
    }
  }
  return new Request(url, { method: metodo, headers, body });
}

/**
 * Lo mismo que `peticionWeb` para un `Request` que ya llega hecho —el de
 * `fetch` en Workers, Deno o Bun—: lee el cuerpo hasta `limite` bytes, con o
 * sin `content-length`, y lanza el error del 413 si pasa de ahí.
 */
export async function conLimite(peticion, limite = LIMITE_CUERPO) {
  if (!peticion.body) return peticion;
  const demasiado = () => Object.assign(new Error("cuerpo demasiado grande"), { ascuaDemasiado: true });
  if (Number(peticion.headers.get("content-length")) > limite) throw demasiado();
  const lector = peticion.body.getReader();
  const trozos = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await lector.cancel();
      throw demasiado();
    }
    trozos.push(value);
  }
  const cuerpo = new Uint8Array(total);
  let posicion = 0;
  for (const trozo of trozos) {
    cuerpo.set(trozo, posicion);
    posicion += trozo.byteLength;
  }
  return new Request(peticion.url, { method: peticion.method, headers: peticion.headers, body: cuerpo });
}

/** Escribe lo de `responder` en una respuesta de `node:http`. */
export function escribir(salida, { status, headers, body }, metodo = "GET") {
  salida.statusCode = status;
  for (const [nombre, valor] of Object.entries(headers)) salida.setHeader(nombre, valor);
  salida.end(metodo === "HEAD" ? undefined : body);
}

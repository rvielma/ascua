/**
 * Seguridad de la capa web, sin dependencias.
 *
 * Lo que un servidor que pinta HTML tiene que hacer bien y casi nunca hace por
 * defecto: una Content-Security-Policy que no necesite `unsafe-inline`, las
 * cabeceras que cierran lo obvio, cookies que no se puedan leer desde
 * JavaScript ni falsificar, y rechazar los formularios que llegan de otro
 * sitio. Todo con Web Crypto: corre igual en Node, Deno, Bun y un worker.
 *
 * El kit de sitios de `vite-plugin-ascua` lo aplica solo en `mode: "server"`;
 * este paquete es para usarlo en cualquier otro servidor.
 */

const codificador = new TextEncoder();

/** Bytes a base64. */
function base64(bytes) {
  let binario = "";
  for (const byte of new Uint8Array(bytes)) binario += String.fromCharCode(byte);
  return btoa(binario);
}

const base64url = (bytes) => base64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function desdeBase64url(texto) {
  const normal = texto.replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(normal + "=".repeat((4 - (normal.length % 4)) % 4));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

// ---------------------------------------------------------------------------
// Content-Security-Policy.

/**
 * La política de partida. Nada de fuera, ningún script en línea que no esté
 * contado, ni `<object>`, ni `<base>` ajeno, ni formularios hacia otro sitio,
 * ni la página dentro de un `<iframe>` ajeno.
 *
 * Los estilos admiten `'unsafe-inline'`: los atributos `style` de una
 * plantilla —y los que pone el runtime al hidratar— no se pueden contar con
 * hashes sin `'unsafe-hashes'`, y un estilo inyectado no ejecuta código.
 */
export const DEFAULT_DIRECTIVES = Object.freeze({
  "default-src": ["'self'"],
  "script-src": ["'self'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:", "blob:"],
  "font-src": ["'self'"],
  "connect-src": ["'self'"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
});

/** El hash de CSP de un texto: `'sha256-…'`. */
export async function hash(texto) {
  const resumen = await crypto.subtle.digest("SHA-256", codificador.encode(texto));
  return `'sha256-${base64(resumen)}'`;
}

/** Tipos de `<script>` que el navegador no ejecuta: datos, no código. */
const DATOS = /^(application\/(ld\+)?json|text\/plain)$/i;

/**
 * Los scripts en línea de un HTML que el navegador ejecutaría, con su
 * contenido exacto. Los que tienen `src` se cubren con `'self'`, y los de
 * datos —la lista de islas de Ascua, un JSON-LD— no se ejecutan.
 */
export function inlineScripts(html) {
  const scripts = [];
  for (const [, atributos, contenido] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\ssrc\s*=/i.test(atributos)) continue;
    const tipo = /\stype\s*=\s*["']?([^"'\s>]+)/i.exec(atributos)?.[1];
    if (tipo && DATOS.test(tipo)) continue;
    scripts.push(contenido);
  }
  return scripts;
}

/**
 * La Content-Security-Policy de una página, con el hash de cada script en
 * línea que lleve. Así no hace falta `'unsafe-inline'` para que funcione lo
 * que la propia página trae, y lo que se cuele no corre.
 *
 * `directives` amplía la política de partida: una lista se suma a la que
 * hubiera, y `null` quita la directiva. `wasm` añade `'wasm-unsafe-eval'`,
 * sin el que el navegador no compila WebAssembly.
 *
 * ```js
 * await contentSecurityPolicy(html, { directives: { "img-src": ["https://cdn.ejemplo.cl"] } });
 * ```
 */
export async function contentSecurityPolicy(html = "", { directives = {}, wasm = false } = {}) {
  const politica = new Map(Object.entries(DEFAULT_DIRECTIVES).map(([nombre, valores]) => [nombre, [...valores]]));
  for (const [nombre, valores] of Object.entries(directives)) {
    if (valores === null || valores === false) politica.delete(nombre);
    else politica.set(nombre, [...(politica.get(nombre) ?? []), ...valores]);
  }
  const scripts = politica.get("script-src");
  if (scripts) {
    if (wasm) scripts.push("'wasm-unsafe-eval'");
    for (const contenido of inlineScripts(html)) scripts.push(await hash(contenido));
  }
  return [...politica]
    .map(([nombre, valores]) => [nombre, ...new Set(valores)].join(" ").trim())
    .join("; ");
}

/**
 * Las cabeceras de seguridad de una respuesta HTML.
 *
 * - `csp`: la política, de `contentSecurityPolicy`. Sin ella no se manda.
 * - `reportOnly`: la manda como `Content-Security-Policy-Report-Only`, que
 *   avisa en la consola sin bloquear. Para desarrollo.
 * - `hsts`: `Strict-Transport-Security` de un año. Solo tiene sentido si la
 *   petición llegó por HTTPS.
 * - `headers`: añade o reemplaza; `null` quita una cabecera.
 *
 * Los nombres van en minúsculas, como los da `Headers`.
 */
export function securityHeaders({ csp, reportOnly = false, hsts = false, headers = {} } = {}) {
  const salida = {
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "cross-origin-opener-policy": "same-origin",
  };
  if (csp) salida[reportOnly ? "content-security-policy-report-only" : "content-security-policy"] = csp;
  if (hsts) salida["strict-transport-security"] = "max-age=31536000";
  for (const [nombre, valor] of Object.entries(headers)) {
    const clave = nombre.toLowerCase();
    if (valor === null || valor === false) delete salida[clave];
    else salida[clave] = String(valor);
  }
  return salida;
}

// ---------------------------------------------------------------------------
// Firmas.

const claves = new Map();

function claveDe(secreto) {
  if (typeof secreto !== "string" || secreto.length < 32) {
    throw new Error("ascua-security: el secreto tiene que ser un texto de al menos 32 caracteres");
  }
  let clave = claves.get(secreto);
  if (!clave) {
    clave = crypto.subtle.importKey("raw", codificador.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
      "verify",
    ]);
    claves.set(secreto, clave);
  }
  return clave;
}

/** `valor.firma`, con HMAC-SHA256. El valor viaja tal cual: firmar no es cifrar. */
export async function sign(valor, secreto) {
  const firma = await crypto.subtle.sign("HMAC", await claveDe(secreto), codificador.encode(valor));
  return `${valor}.${base64url(firma)}`;
}

/**
 * El valor de `sign`, o `null` si la firma no es de este secreto. La
 * comparación la hace `crypto.subtle.verify`, en tiempo constante.
 */
export async function unsign(firmado, secreto) {
  if (typeof firmado !== "string") return null;
  const punto = firmado.lastIndexOf(".");
  if (punto < 0) return null;
  const valor = firmado.slice(0, punto);
  let firma;
  try {
    firma = desdeBase64url(firmado.slice(punto + 1));
  } catch {
    return null;
  }
  const valida = await crypto.subtle.verify("HMAC", await claveDe(secreto), firma, codificador.encode(valor));
  return valida ? valor : null;
}

// ---------------------------------------------------------------------------
// Cookies.

/** Lo que admite el nombre de una cookie (un `token` de RFC 9110). */
const NOMBRE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** Las cookies de una cabecera `Cookie`, por nombre. Con un nombre repetido, gana la primera. */
export function parseCookies(cabecera) {
  const cookies = {};
  if (!cabecera) return cookies;
  for (const trozo of cabecera.split(";")) {
    const igual = trozo.indexOf("=");
    if (igual < 0) continue;
    const nombre = trozo.slice(0, igual).trim();
    if (!nombre || nombre in cookies) continue;
    let valor = trozo.slice(igual + 1).trim();
    if (valor.startsWith('"') && valor.endsWith('"')) valor = valor.slice(1, -1);
    try {
      cookies[nombre] = decodeURIComponent(valor);
    } catch {
      cookies[nombre] = valor;
    }
  }
  return cookies;
}

/**
 * Una cabecera `Set-Cookie`. Por defecto, la opción segura: `HttpOnly` (no se
 * lee desde JavaScript), `SameSite=Lax` (no viaja en los POST de otro sitio),
 * `Secure` y `Path=/`.
 */
export function serializeCookie(nombre, valor, opciones = {}) {
  if (!NOMBRE.test(nombre)) throw new Error(`ascua-security: «${nombre}» no vale como nombre de cookie`);
  const { path = "/", domain, maxAge, expires, httpOnly = true, secure = true, sameSite = "Lax", partitioned } = opciones;
  const partes = [`${nombre}=${encodeURIComponent(valor)}`];
  if (path) partes.push(`Path=${path}`);
  if (domain) partes.push(`Domain=${domain}`);
  if (maxAge !== undefined) partes.push(`Max-Age=${Math.floor(maxAge)}`);
  if (expires) partes.push(`Expires=${expires.toUTCString()}`);
  if (httpOnly) partes.push("HttpOnly");
  if (secure) partes.push("Secure");
  if (sameSite) partes.push(`SameSite=${sameSite[0].toUpperCase()}${sameSite.slice(1).toLowerCase()}`);
  if (partitioned) partes.push("Partitioned");
  return partes.join("; ");
}

/**
 * Las cookies de una petición, para leerlas y para escribir la respuesta.
 *
 * `secure: false` quita `Secure` de las que se escriban: hace falta en
 * `http://localhost` con Safari. `secret` habilita las firmadas.
 *
 * ```js
 * const cookies = createCookies(request.headers.get("cookie"), { secret });
 * await cookies.setSigned("sesion", idDeUsuario, { maxAge: 60 * 60 * 24 * 7 });
 * // …
 * for (const linea of cookies.headers()) respuesta.headers.append("set-cookie", linea);
 * ```
 */
export function createCookies(cabecera, { secret, secure = true } = {}) {
  const entrantes = parseCookies(cabecera);
  /** Lo que se va a mandar, por nombre: la última escritura gana. */
  const salientes = new Map();
  const secreto = () => {
    const valor = typeof secret === "function" ? secret() : secret;
    if (!valor) throw new Error("ascua-security: las cookies firmadas necesitan un secreto");
    return valor;
  };

  /** El valor que llegó, o el que se acaba de escribir en esta petición. */
  const get = (nombre) => {
    const escrita = salientes.get(nombre);
    if (escrita) return escrita.borrada ? undefined : escrita.valor;
    return entrantes[nombre];
  };
  const set = (nombre, valor, opciones = {}) => {
    salientes.set(nombre, { valor, linea: serializeCookie(nombre, valor, { secure, ...opciones }) });
  };

  return {
    get,
    set,
    /** Todas las que llegaron. */
    all: () => ({ ...entrantes }),
    delete(nombre, opciones = {}) {
      salientes.set(nombre, {
        borrada: true,
        linea: serializeCookie(nombre, "", { secure, ...opciones, maxAge: 0, expires: new Date(0) }),
      });
    },
    /** El valor si la firma es buena; `undefined` si no hay cookie o la tocaron. */
    async getSigned(nombre) {
      const valor = get(nombre);
      if (valor === undefined) return undefined;
      return (await unsign(valor, secreto())) ?? undefined;
    },
    async setSigned(nombre, valor, opciones = {}) {
      set(nombre, await sign(String(valor), secreto()), opciones);
    },
    /** Las cabeceras `Set-Cookie` que hay que mandar, una por cookie. */
    headers: () => [...salientes.values()].map((s) => s.linea),
  };
}

// ---------------------------------------------------------------------------
// CSRF.

/**
 * ¿La petición viene de esta misma página? Es la defensa contra CSRF: un
 * navegador manda `Origin` en todo POST, y otro sitio no puede falsificarlo.
 *
 * Sin `Origin` —curl, un servidor— no hay navegador que engañar, y pasa. El
 * host propio es el de `X-Forwarded-Host` si llega detrás de un proxy, o el de
 * `Host`. `origins` añade otros de confianza: `["https://admin.ejemplo.cl"]`.
 */
export function checkOrigin(peticion, { origins = [] } = {}) {
  const origen = peticion.headers.get("origin");
  if (!origen) return peticion.headers.get("sec-fetch-site") !== "cross-site";
  if (origen === "null") return false;
  if (origins.includes(origen)) return true;
  const propio =
    peticion.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    peticion.headers.get("host") ||
    new URL(peticion.url).host;
  try {
    return new URL(origen).host === propio;
  } catch {
    return false;
  }
}

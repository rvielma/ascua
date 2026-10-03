/**
 * Sitios: de `src/routes/` a páginas HTML.
 *
 * Dos modos:
 *
 * - `static` (por defecto): `vite build` construye el cliente —el
 *   esqueleto y el script que hidrata las islas— y, al cerrar, renderiza cada
 *   ruta con `renderToString` y la escribe en `dist/`.
 * - `server`: el cliente va a `dist/client/` y un segundo build deja en
 *   `dist/server/index.mjs` un servidor Node que renderiza en cada petición.
 *
 * En desarrollo, en los dos, cada petición a una ruta se renderiza al vuelo.
 * El diseño está en `docs/sitio.md`.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buscar,
  caminoDe,
  componer,
  conIslas,
  esDemasiado,
  escribir,
  ESQUELETO,
  esVariable,
  LISTA,
  nombresDe,
  peticionWeb,
  renderizar,
  responder,
} from "./sitio-comun.js";

// No `virtual:ascua/…`: ese prefijo es el de las hojas del plugin de plantillas.
const CLIENTE = "virtual:ascua-site/client";
const SERVIDOR = "virtual:ascua-site/server";
/** Para un sitio sin esqueleto ni islas: Vite necesita alguna entrada. */
const VACIO = "virtual:ascua-site/empty";
const MODULO = /\.[mc]?[jt]s$/;
const COMUN = fileURLToPath(new URL("./sitio-comun.js", import.meta.url));

/**
 * Las rutas que hay en `dir`, las fijas antes que las variables —y las que
 * atrapan el resto, al final— para que `/pedidos/nuevo` gane a `/pedidos/:id`.
 *
 * Cada ruta lleva sus `marcos`: los `_layout.ts` de su carpeta y de las de
 * encima, del de fuera al de dentro.
 */
export function descubrir(dir) {
  const rutas = [];
  /** Carpeta relativa → su `_layout`. */
  const marcosPorCarpeta = new Map();

  const recorrer = (carpeta) => {
    for (const nombre of readdirSync(carpeta).sort()) {
      const completo = join(carpeta, nombre);
      if (statSync(completo).isDirectory()) {
        if (!nombre.startsWith("_")) recorrer(completo);
        continue;
      }
      if (!MODULO.test(nombre) || nombre.endsWith(".d.ts") || nombre.includes(".test.")) continue;

      const base = nombre.replace(MODULO, "");
      const relativo = relative(dir, carpeta);
      if (base === "_layout") {
        marcosPorCarpeta.set(relativo, completo);
        continue;
      }
      if (base.startsWith("_")) continue;
      if (base === "404" && relativo === "") {
        rutas.push({ modulo: completo, segmentos: [], es404: true, archivo: false, carpeta: "" });
        continue;
      }

      const trozos = [...(relativo ? relativo.split(sep) : []), base].filter((s) => s !== "index");
      const segmentos = trozos.map((s, i) => {
        if (s.startsWith("[...") && s.endsWith("]")) {
          if (i !== trozos.length - 1) {
            throw new Error(`${relative(process.cwd(), completo)}: [...rest] solo puede ir al final`);
          }
          return `*${s.slice(4, -1)}`;
        }
        return s.startsWith("[") && s.endsWith("]") ? `:${s.slice(1, -1)}` : s;
      });
      // `busqueda.js.ts`: sin el `.ts` sigue teniendo extensión, así que no es
      // una página sino ese archivo.
      const archivo = /\.[a-z0-9]+$/i.test(base);
      rutas.push({ modulo: completo, segmentos, es404: false, archivo, carpeta: relativo });
    }
  };
  if (existsSync(dir)) recorrer(dir);

  for (const ruta of rutas) {
    const partes = ruta.carpeta ? ruta.carpeta.split(sep) : [];
    ruta.marcos = [];
    for (let i = 0; i <= partes.length; i++) {
      const marco = marcosPorCarpeta.get(partes.slice(0, i).join(sep));
      if (marco) ruta.marcos.push(marco);
    }
  }

  const peso = (r) =>
    r.segmentos.reduce((total, s) => total + (s.startsWith("*") ? 100 : s.startsWith(":") ? 1 : 0), 0);
  rutas.sort((a, b) => peso(a) - peso(b));
  return { rutas, marco: marcosPorCarpeta.get("") ?? null };
}

/** Los componentes de los marcos de una ruta, cargados con `cargar`. */
async function marcosDe(ruta, cargar) {
  return Promise.all(ruta.marcos.map(async (archivo) => (await cargar(archivo)).default));
}

/** Los módulos de la carpeta de las islas, sin tipos ni tests. */
function archivosDeIslas(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => MODULO.test(f) && !f.endsWith(".d.ts") && !f.includes(".test."))
    .sort()
    .map((f) => join(dir, f));
}

/** Cómo se llama un módulo de islas en el cliente: la clave de `import.meta.glob`. */
const claveDe = (root, archivo) => `/${relative(root, archivo).split(sep).join("/")}`;

/** Del nombre de cada isla a la clave de su módulo, cargándolos con `cargar`. */
async function mapaDeIslas(dir, root, cargar) {
  const mapa = {};
  for (const archivo of archivosDeIslas(dir)) {
    for (const nombre of nombresDe(await cargar(archivo))) mapa[nombre] ??= claveDe(root, archivo);
  }
  return mapa;
}

/**
 * El código del cliente. Cada módulo de `dir` es su propio chunk, cargado
 * cuando hace falta: la página dice en un `<script type="application/json">`
 * cuáles usa, y solo esos viajan. Sin la lista —una página que no pasó por el
 * kit—, se cargan todos.
 */
function codigoCliente(dir) {
  const patrones = [`/${dir}/**/*.{ts,js,mts,mjs}`, `!/${dir}/**/*.d.ts`, `!/${dir}/**/*.test.*`];
  return `import { hydrate } from "ascua";
const modulos = import.meta.glob(${JSON.stringify(patrones)});
const lista = document.getElementById(${JSON.stringify(LISTA)});
const claves = lista ? JSON.parse(lista.textContent) : Object.keys(modulos);
Promise.all(claves.map((clave) => modulos[clave]?.())).then((cargados) => {
  const islas = [];
  for (const modulo of cargados) {
    for (const valor of Object.values(modulo ?? {})) {
      if (valor && typeof valor.name === "string" && typeof valor.prepare === "function") islas.push(valor);
    }
  }
  hydrate(islas);
});
`;
}

/** El servidor de la fase 3: todas las rutas dentro, y el `http` de Node. */
function codigoServidor(dirRutas, dirIslas, root) {
  const { rutas } = descubrir(dirRutas);
  const marcos = [...new Set(rutas.flatMap((r) => r.marcos))];
  const islas = archivosDeIslas(dirIslas);
  const importes = [
    ...rutas.map((r, i) => `import * as m${i} from ${JSON.stringify(r.modulo)};`),
    ...marcos.map((m, i) => `import k${i} from ${JSON.stringify(m)};`),
    ...islas.map((a, i) => `import * as i${i} from ${JSON.stringify(a)};`),
  ];
  const tablaIslas = islas.map((a, i) => `  [${JSON.stringify(claveDe(root, a))}, i${i}],`);
  const tabla = rutas.map((r, i) => {
    const suyos = r.marcos.map((m) => `k${marcos.indexOf(m)}`).join(", ");
    return `  { segmentos: ${JSON.stringify(r.segmentos)}, es404: ${r.es404}, archivo: ${r.archivo}, modulo: m${i}, marcos: [${suyos}] },`;
  });
  return `import { createServer } from "node:http";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { collectStyles, renderToString } from "ascua/server";
import { append } from "ascua";
import { componer, conIslas, esDemasiado, escribir, nombresDe, peticionWeb, responder, tipoDe } from ${JSON.stringify(COMUN)};
${importes.join("\n")}

const RUTAS = [
${tabla.join("\n")}
];
const aqui = dirname(fileURLToPath(import.meta.url));
const SITIO = JSON.parse(readFileSync(join(aqui, "site.json"), "utf8"));
const ESTATICOS = join(aqui, "..", "client");
const ascua = { renderToString, collectStyles, append };

/** Del nombre de cada isla al módulo que la define. */
const ISLAS = {};
for (const [clave, modulo] of [
${tablaIslas.join("\n")}
]) {
  for (const nombre of nombresDe(modulo)) ISLAS[nombre] ??= clave;
}

const sinBase = (camino) =>
  SITIO.base !== "/" && camino.startsWith(SITIO.base) ? "/" + camino.slice(SITIO.base.length) : camino;

/** El secreto de las cookies firmadas: de fuera, nunca dentro del build. */
function secreto() {
  const valor = process.env.ASCUA_SECRET;
  if (!valor) throw new Error("ascua: las cookies firmadas necesitan la variable de entorno ASCUA_SECRET, de 32 caracteres o más");
  return valor;
}

const NO_EXISTE = { status: 404, headers: { "content-type": "text/plain; charset=utf-8" }, body: "No existe" };

/**
 * De una petición a lo que se responde: \`status\`, \`headers\`, \`body\` y,
 * por comodidad, \`type\`. Acepta un \`Request\` o, para un GET, la URL.
 */
export async function handle(entrada) {
  const peticion = typeof entrada === "string" ? new Request(new URL(entrada, "http://localhost")) : entrada;
  const camino = sinBase(new URL(peticion.url).pathname);
  const respuesta =
    (await responder({
      peticion,
      camino,
      rutas: RUTAS,
      cargar: async (ruta) => ({ modulo: ruta.modulo, marcos: ruta.marcos }),
      ascua,
      componer: (pagina) => componer(SITIO.esqueleto, { ...pagina, ...conIslas(pagina.nombresIslas, ISLAS, SITIO) }),
      seguridad: SITIO.seguridad,
      secreto,
    })) ?? NO_EXISTE;
  return { ...respuesta, type: respuesta.headers["content-type"] };
}

/** Lo de dist/client: el script de las islas, las hojas, lo de public/. */
function estatico(peticion, respuesta) {
  let camino;
  try {
    camino = sinBase(decodeURIComponent(new URL(peticion.url ?? "/", "http://x").pathname));
  } catch {
    return false;
  }
  if (camino.endsWith("/")) return false;
  const archivo = normalize(join(ESTATICOS, camino));
  if (!archivo.startsWith(ESTATICOS + sep)) return false;
  try {
    if (!statSync(archivo).isFile()) return false;
  } catch {
    return false;
  }
  respuesta.setHeader("content-type", tipoDe(archivo));
  respuesta.setHeader("x-content-type-options", "nosniff");
  // Lo que genera Vite lleva un hash en el nombre: se puede cachear para siempre.
  if (camino.startsWith("/assets/")) respuesta.setHeader("cache-control", "public, max-age=31536000, immutable");
  createReadStream(archivo).pipe(respuesta);
  return true;
}

/** Arranca el servidor; \`node dist/server/index.mjs\` lo hace solo. */
export function serve(puerto = Number(process.env.PORT ?? 3000)) {
  const servidor = createServer(async (entrante, salida) => {
    const lectura = entrante.method === "GET" || entrante.method === "HEAD";
    if (lectura && estatico(entrante, salida)) return;
    try {
      const peticion = await peticionWeb(entrante, SITIO.seguridad?.bodyLimit);
      escribir(salida, await handle(peticion), entrante.method);
    } catch (error) {
      if (esDemasiado(error)) {
        salida.statusCode = 413;
        salida.end("Demasiado grande");
        return;
      }
      console.error(error);
      salida.statusCode = 500;
      salida.end("Error interno");
    }
  });
  return servidor.listen(puerto, () => console.log("ascua: http://localhost:" + servidor.address().port));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) serve();
`;
}

/** ¿Hay algún módulo en la carpeta de las islas? */
function hayIslas(dir) {
  return archivosDeIslas(dir).length > 0;
}

/** Los parámetros de cada página de una ruta variable. */
async function paginasDe(modulo, ruta, raiz) {
  if (!esVariable(ruta)) return [{}];
  const nombre = relative(raiz, ruta.modulo);
  if (typeof modulo.paths !== "function") {
    throw new Error(`${nombre}: una ruta variable necesita export function paths(), que diga qué páginas generar`);
  }
  const lista = await modulo.paths();
  if (!Array.isArray(lista)) throw new Error(`${nombre}: paths() tiene que devolver una lista`);
  return lista;
}

/** Las piezas de Ascua del servidor de Vite: las mismas con las que se registraron los estilos. */
async function ascuaDe(vite) {
  const { renderToString, collectStyles } = await vite.ssrLoadModule("ascua/server");
  const { append } = await vite.ssrLoadModule("ascua");
  return { renderToString, collectStyles, append };
}

/** ¿Hay algún `.wasm` en `dir`? */
function hayWasm(dir) {
  if (!dir || !existsSync(dir)) return false;
  return readdirSync(dir, { recursive: true }).some((f) => String(f).endsWith(".wasm"));
}

/** Un secreto por proceso para las cookies firmadas en desarrollo, si no hay `ASCUA_SECRET`. */
let secretoDeDesarrollo;
const secretoDev = () =>
  process.env.ASCUA_SECRET ?? (secretoDeDesarrollo ??= `${crypto.randomUUID()}${crypto.randomUUID()}`);

/**
 * @param {true | { routes?: string, islands?: string, shell?: string, mode?: "static" | "server", security?: false | object }} opciones
 */
export function sitio(opciones) {
  const ajustes = {
    routes: "src/routes",
    islands: "src/islands",
    shell: "index.html",
    mode: "static",
    ...(opciones === true ? {} : opciones),
  };
  if (ajustes.mode !== "static" && ajustes.mode !== "server") {
    throw new Error(`ascua: site.mode es "static" o "server", no ${JSON.stringify(ajustes.mode)}`);
  }

  /** @type {import("vite").ResolvedConfig} */
  let config;
  /** La configuración tal como la escribió el usuario, para los builds de dentro. */
  let delUsuario = {};
  let esqueletoConstruido = null;
  let scriptConstruido = null;
  /** Lo que importa el script de las islas: el runtime, en su chunk. */
  let precargasConstruidas = [];
  /** De la clave de cada módulo de islas a sus chunks y sus hojas. */
  let islasConstruidas = {};
  /** ¿El cliente lleva WebAssembly? La CSP tiene que dejarlo compilar. */
  let wasmConstruido = false;

  /**
   * `site.security` resuelta: lo que necesita `responder`. `false` la
   * apaga. Con una `base` en otro origen —un CDN—, ese origen entra en la CSP.
   */
  const seguridad = (wasm) => {
    if (ajustes.security === false) return false;
    const propia = ajustes.security && ajustes.security !== true ? ajustes.security : {};
    let csp = propia.csp === false ? false : { ...(propia.csp ?? {}) };
    if (csp && /^https?:\/\//.test(config.base)) {
      const origen = new URL(config.base).origin;
      for (const directiva of ["script-src", "style-src", "img-src", "font-src", "connect-src"]) {
        csp[directiva] = [...(csp[directiva] ?? []), origen];
      }
    }
    return { csp, headers: propia.headers, origins: propia.origins, bodyLimit: propia.bodyLimit, wasm };
  };

  const raiz = () => config.root;
  const dirRutas = () => resolve(raiz(), ajustes.routes);
  const dirIslas = () => resolve(raiz(), ajustes.islands);
  const archivoEsqueleto = (root) => resolve(root, ajustes.shell);
  const leerEsqueleto = () => {
    const archivo = archivoEsqueleto(raiz());
    return existsSync(archivo) ? readFileSync(archivo, "utf8") : ESQUELETO;
  };
  const sinBase = (camino) =>
    config.base !== "/" && camino.startsWith(config.base) ? `/${camino.slice(config.base.length)}` : camino;

  /** Un servidor o un build con la misma configuración del usuario. */
  const conLaConfig = (extra) =>
    config.configFile ? { ...extra, configFile: config.configFile } : { ...delUsuario, ...extra, configFile: false };

  /** Atiende en desarrollo una petición a una ruta; `false` si no es de ninguna. */
  async function servirRuta(servidor, entrante, respuesta) {
    const url = entrante.url ?? "/";
    const camino = sinBase(new URL(url, "http://x").pathname);
    const reglas = seguridad(hayWasm(config.publicDir));
    let peticion;
    try {
      peticion = await peticionWeb(entrante, reglas ? reglas.bodyLimit : undefined);
    } catch (error) {
      if (!esDemasiado(error)) throw error;
      respuesta.statusCode = 413;
      respuesta.end("Demasiado grande");
      return true;
    }
    const cargar = (archivo) => servidor.ssrLoadModule(archivo);
    const ascua = await ascuaDe(servidor);
    const resultado = await responder({
      peticion,
      camino,
      rutas: descubrir(dirRutas()).rutas,
      cargar: async (ruta) => ({ modulo: await cargar(ruta.modulo), marcos: await marcosDe(ruta, cargar) }),
      ascua,
      componer: async (pagina) => {
        const esqueleto = await servidor.transformIndexHtml(url, leerEsqueleto());
        const mapa = await mapaDeIslas(dirIslas(), raiz(), cargar);
        const script = `${config.base}@id/${CLIENTE}`;
        return componer(esqueleto, { ...pagina, ...conIslas(pagina.nombresIslas, mapa, { script }) });
      },
      seguridad: reglas,
      desarrollo: true,
      secreto: secretoDev,
    });
    // Ninguna ruta, ni 404 propia: que siga Vite, que quizá lo tiene
    // —`/docs/docs.css` encaja con `/docs/:pagina` y es un archivo de public/—.
    if (!resultado) return false;
    escribir(respuesta, resultado, entrante.method);
    return true;
  }

  return {
    name: "ascua:site",

    config(usuario, entorno) {
      delUsuario = usuario;
      // El build del servidor de la fase 3 trae su propia entrada, y lo lleva
      // todo dentro: `node dist/server/index.mjs` no necesita node_modules.
      if (entorno.isSsrBuild) return { ssr: { noExternal: usuario.ssr?.noExternal ?? true } };

      const root = resolve(usuario.root ?? process.cwd());
      // Sin islas no hay nada que hidratar: ni script, ni un trozo de runtime
      // que Vite parta para compartirlo con otras entradas.
      const entradas = hayIslas(resolve(root, ajustes.islands)) ? { "ascua-client": CLIENTE } : {};
      const esqueleto = archivoEsqueleto(root);
      // Si el esqueleto es otro archivo, `index.html` sigue siendo lo que era:
      // una página más de Vite, como la portada de un sitio con documentación.
      const indice = join(root, "index.html");
      if (existsSync(esqueleto)) {
        // El nombre de la entrada es el del archivo: es el que lleva su hoja,
        // `esqueleto-….css`, y no uno inventado.
        const nombre = basename(esqueleto).replace(/\.html?$/i, "");
        const libre = esqueleto === indice || nombre !== "index" ? nombre : "ascua-shell";
        entradas[libre] = esqueleto;
      }
      if (esqueleto !== indice && existsSync(indice)) entradas.index = indice;
      // Sin ninguna, rolldown no construye; esta sale vacía y se borra.
      if (Object.keys(entradas).length === 0) entradas["ascua-empty"] = VACIO;

      return {
        // Sin el respaldo de SPA de Vite: lo que no es una ruta ni un archivo
        // es un 404.
        appType: usuario.appType ?? "mpa",
        build: {
          rollupOptions: { input: entradas },
          ...(ajustes.mode === "server" && !usuario.build?.outDir ? { outDir: "dist/client" } : {}),
        },
      };
    },

    configResolved(resuelta) {
      config = resuelta;
    },

    resolveId(id) {
      return id === CLIENTE || id === SERVIDOR || id === VACIO ? `\0${id}` : null;
    },

    load(id) {
      if (id === `\0${CLIENTE}`) return codigoCliente(ajustes.islands.replace(/^\/+|\/+$/g, ""));
      if (id === `\0${SERVIDOR}`) return codigoServidor(dirRutas(), dirIslas(), raiz());
      if (id === `\0${VACIO}`) return "export {};";
      return null;
    },

    writeBundle(opcionesSalida, bundle) {
      if (config.build.ssr) return;
      const dir = opcionesSalida.dir ?? resolve(raiz(), config.build.outDir);
      const chunks = Object.fromEntries(
        Object.values(bundle)
          .filter((parte) => parte.type === "chunk")
          .map((parte) => [parte.fileName, parte]),
      );
      /** Un chunk y lo que importa, sin repetir. */
      const conLoQueImporta = (nombre, vistos = new Set()) => {
        if (vistos.has(nombre)) return vistos;
        vistos.add(nombre);
        for (const importado of chunks[nombre]?.imports ?? []) conLoQueImporta(importado, vistos);
        return vistos;
      };
      const islas = new Map(archivosDeIslas(dirIslas()).map((archivo) => [archivo, claveDe(raiz(), archivo)]));
      for (const parte of Object.values(chunks)) {
        if (!parte.isDynamicEntry || !islas.has(parte.facadeModuleId)) continue;
        const suyos = [...conLoQueImporta(parte.fileName)];
        islasConstruidas[islas.get(parte.facadeModuleId)] = {
          precargas: suyos.map((f) => `${config.base}${f}`),
          hojas: suyos.flatMap((f) => [...(chunks[f].viteMetadata?.importedCss ?? [])]).map((h) => `${config.base}${h}`),
        };
      }
      wasmConstruido = Object.keys(bundle).some((nombre) => nombre.endsWith(".wasm")) || hayWasm(config.publicDir);
      for (const parte of Object.values(bundle)) {
        if (parte.type === "chunk" && parte.facadeModuleId === `\0${VACIO}`) {
          rmSync(join(dir, parte.fileName), { force: true });
          const carpeta = dirname(join(dir, parte.fileName));
          if (existsSync(carpeta) && readdirSync(carpeta).length === 0) rmSync(carpeta, { recursive: true });
        }
        if (parte.type === "chunk" && parte.isEntry && parte.facadeModuleId === `\0${CLIENTE}`) {
          scriptConstruido = `${config.base}${parte.fileName}`;
          precargasConstruidas = [...conLoQueImporta(parte.fileName)]
            .filter((f) => f !== parte.fileName)
            .map((f) => `${config.base}${f}`);
        }
      }
      // El esqueleto procesado —con sus hojas ya con hash— es la base de cada
      // página, no una página: se lee y se quita. Vite lo escribe al final,
      // así que se lee de disco.
      const nombre = relative(raiz(), archivoEsqueleto(raiz())).split(sep).join("/");
      const escrito = join(dir, nombre);
      if (bundle[nombre] && existsSync(escrito)) {
        esqueletoConstruido = readFileSync(escrito, "utf8");
        rmSync(escrito);
        // Si estaba en una subcarpeta —`src/landing/esqueleto.html`—, Vite la
        // creó solo para él: se quitan las que queden vacías.
        for (let carpeta = dirname(escrito); carpeta.startsWith(dir + sep); carpeta = dirname(carpeta)) {
          if (readdirSync(carpeta).length > 0) break;
          rmSync(carpeta, { recursive: true });
        }
      }
    },

    async closeBundle() {
      // Solo el build del cliente; no el del servidor ni el de dentro.
      if (config.command !== "build" || config.build.ssr) return;
      if (this.environment && this.environment.name !== "client") return;

      // Todo lo que hace falta, antes de nada: con la configuración en línea,
      // los plugins del servidor o del build de dentro son estos mismos
      // objetos, y se vuelven a configurar.
      const root = raiz();
      const salida = resolve(root, config.build.outDir);
      const logger = config.logger;
      const rutasDir = dirRutas();
      const construido = {
        base: config.base,
        esqueleto: esqueletoConstruido ?? ESQUELETO,
        script: scriptConstruido,
        precargas: precargasConstruidas,
        islas: islasConstruidas,
        seguridad: seguridad(wasmConstruido),
      };
      const dentro = conLaConfig({ root, mode: config.mode, logLevel: "error" });

      if (ajustes.mode === "server") {
        const dirServidor = resolve(salida, "..", "server");
        const { build } = await import("vite");
        await build({
          ...dentro,
          build: {
            // `ssr: true` y la entrada aparte: con `ssr: "…"` Vite lo toma por
            // una ruta de archivo, y el módulo es virtual.
            ssr: true,
            outDir: dirServidor,
            emptyOutDir: true,
            rollupOptions: { input: { index: SERVIDOR }, output: { entryFileNames: "index.mjs" } },
          },
        });
        writeFileSync(join(dirServidor, "site.json"), JSON.stringify(construido));
        logger.info(`ascua: servidor en ${relative(root, dirServidor)}/index.mjs`);
        return;
      }

      const { createServer } = await import("vite");
      const vite = await createServer({ ...dentro, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
      let paginas = 0;
      let archivos = 0;
      try {
        const { rutas } = descubrir(rutasDir);
        if (rutas.length === 0) logger.warn(`ascua: no hay rutas en ${ajustes.routes}/`);
        const ascua = await ascuaDe(vite);
        const mapa = await mapaDeIslas(dirIslas(), root, (archivo) => vite.ssrLoadModule(archivo));
        // Antes de pintar nada: un formulario sin servidor se perdería en silencio.
        for (const ruta of rutas) {
          if ((await vite.ssrLoadModule(ruta.modulo)).actions) {
            throw new Error(
              `${relative(root, ruta.modulo)}: las acciones necesitan un servidor que las reciba; usa site: { mode: "server" }`,
            );
          }
        }

        for (const ruta of rutas) {
          const modulo = await vite.ssrLoadModule(ruta.modulo);
          const marcos = await marcosDe(ruta, (archivo) => vite.ssrLoadModule(archivo));
          for (const parametros of await paginasDe(modulo, ruta, root)) {
            const camino = caminoDe(ruta, parametros);
            const pagina = await renderizar({ ruta, modulo, marcos, parametros, camino, ascua });
            const partes = camino.split("/").filter(Boolean).map(decodeURIComponent);
            let archivo;
            let contenido;
            if (ruta.archivo) {
              archivo = join(salida, ...partes);
              contenido = pagina.cuerpo;
            } else {
              archivo = ruta.es404 ? join(salida, "404.html") : join(salida, ...partes, "index.html");
              contenido = componer(construido.esqueleto, {
                ...pagina,
                ...conIslas(pagina.nombresIslas, mapa, construido),
              });
            }
            mkdirSync(dirname(archivo), { recursive: true });
            writeFileSync(archivo, contenido);
            if (ruta.archivo) archivos++;
            else paginas++;
          }
        }
      } finally {
        await vite.close();
      }
      const cuantos = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
      const otros = archivos ? ` y ${cuantos(archivos, "archivo", "archivos")}` : "";
      logger.info(`ascua: ${cuantos(paginas, "página", "páginas")}${otros} en ${relative(root, salida) || "."}/`);
    },

    configureServer(servidor) {
      // Tocar algo que usa una página recarga el navegador: el HTML lo pinta el
      // servidor y no hay HMR que lo reemplace.
      servidor.watcher.on("change", (archivo) => {
        const grafo = servidor.environments?.ssr?.moduleGraph ?? servidor.moduleGraph;
        const usado = grafo.getModulesByFile?.(archivo)?.size || archivo.startsWith(dirRutas());
        if (usado) servidor.ws.send({ type: "full-reload" });
      });

      const atender = (soloNoEncontradas) => async (peticion, respuesta, seguir) => {
        // Una ruta recibe formularios; lo que no existe, solo se lee.
        const lectura = peticion.method === "GET" || peticion.method === "HEAD";
        if (soloNoEncontradas && !lectura) return seguir();
        const url = peticion.url ?? "/";
        const camino = sinBase(new URL(url, "http://x").pathname);
        if (camino.startsWith("/@")) return seguir();
        try {
          const encontrada = buscar(descubrir(dirRutas()).rutas, camino);
          if (!encontrada || (encontrada.estado === 404) !== soloNoEncontradas) return seguir();
          if (!(await servirRuta(servidor, peticion, respuesta))) seguir();
        } catch (error) {
          servidor.ssrFixStacktrace?.(error);
          seguir(error);
        }
      };

      // Una carpeta de public/ con su index.html —el playground de un sitio— se
      // sirve como la serviría cualquier servidor estático en producción; Vite
      // solo sirve archivos de public/ por su nombre.
      const indicePublico = (peticion, respuesta, seguir) => {
        const camino = sinBase(new URL(peticion.url ?? "/", "http://x").pathname);
        const dir = config.publicDir;
        if (!dir || !camino.endsWith("/")) return seguir();
        const indice = join(dir, ...camino.split("/").filter(Boolean).map(decodeURIComponent), "index.html");
        if (!indice.startsWith(dir + sep) || !existsSync(indice)) return seguir();
        respuesta.setHeader("content-type", "text/html; charset=utf-8");
        respuesta.end(readFileSync(indice));
      };

      // Las rutas, antes que Vite; la 404, después: así lo que Vite sabe servir
      // —la portada, lo de public/— se sirve antes de declararlo inexistente.
      servidor.middlewares.use(atender(false));
      return () => {
        servidor.middlewares.use(indicePublico);
        servidor.middlewares.use(atender(true));
      };
    },
  };
}

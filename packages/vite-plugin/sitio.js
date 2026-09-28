/**
 * Sitios: de `src/rutas/` a páginas HTML.
 *
 * Dos modos:
 *
 * - `estatico` (por defecto): `vite build` construye el cliente —el
 *   esqueleto y el script que hidrata las islas— y, al cerrar, renderiza cada
 *   ruta con `renderToString` y la escribe en `dist/`.
 * - `servidor`: el cliente va a `dist/cliente/` y un segundo build deja en
 *   `dist/servidor/index.mjs` un servidor Node que renderiza en cada petición.
 *
 * En desarrollo, en los dos, cada petición a una ruta se renderiza al vuelo.
 * El diseño está en `docs/sitio.md`.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { buscar, caminoDe, componer, ESQUELETO, esNoExiste, esVariable, renderizar } from "./sitio-comun.js";

// No `virtual:ascua/…`: ese prefijo es el de las hojas del plugin de plantillas.
const CLIENTE = "virtual:ascua-sitio/cliente";
const SERVIDOR = "virtual:ascua-sitio/servidor";
/** Para un sitio sin esqueleto ni islas: Vite necesita alguna entrada. */
const VACIO = "virtual:ascua-sitio/vacio";
const MODULO = /\.[mc]?[jt]s$/;
const COMUN = fileURLToPath(new URL("./sitio-comun.js", import.meta.url));

/**
 * Las rutas que hay en `dir`, las fijas antes que las variables —y las que
 * atrapan el resto, al final— para que `/pedidos/nuevo` gane a `/pedidos/:id`.
 *
 * Cada ruta lleva sus `marcos`: los `_marco.ts` de su carpeta y de las de
 * encima, del de fuera al de dentro.
 */
export function descubrir(dir) {
  const rutas = [];
  /** Carpeta relativa → su `_marco`. */
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
      if (base === "_marco") {
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
            throw new Error(`${relative(process.cwd(), completo)}: [...resto] solo puede ir al final`);
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

/** El código del cliente: todas las islas de `dir`, hidratadas. */
function codigoCliente(dir) {
  return `import { hydrate } from "ascua";
const modulos = import.meta.glob(${JSON.stringify(`/${dir}/**/*.{ts,js,mts,mjs}`)}, { eager: true });
const islas = [];
for (const modulo of Object.values(modulos)) {
  for (const valor of Object.values(modulo)) {
    if (valor && typeof valor.nombre === "string" && typeof valor.preparar === "function") islas.push(valor);
  }
}
hydrate(islas);
`;
}

/** El servidor de la fase 3: todas las rutas dentro, y el `http` de Node. */
function codigoServidor(dirRutas) {
  const { rutas } = descubrir(dirRutas);
  const marcos = [...new Set(rutas.flatMap((r) => r.marcos))];
  const importes = [
    ...rutas.map((r, i) => `import * as m${i} from ${JSON.stringify(r.modulo)};`),
    ...marcos.map((m, i) => `import k${i} from ${JSON.stringify(m)};`),
  ];
  const tabla = rutas.map((r, i) => {
    const suyos = r.marcos.map((m) => `k${marcos.indexOf(m)}`).join(", ");
    return `  { segmentos: ${JSON.stringify(r.segmentos)}, es404: ${r.es404}, archivo: ${r.archivo}, modulo: m${i}, marcos: [${suyos}] },`;
  });
  return `import { createServer } from "node:http";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { collectStyles, renderToString } from "ascua/servidor";
import { append } from "ascua";
import { buscar, componer, esNoExiste, renderizar, tipoDe } from ${JSON.stringify(COMUN)};
${importes.join("\n")}

const RUTAS = [
${tabla.join("\n")}
];
const aqui = dirname(fileURLToPath(import.meta.url));
const SITIO = JSON.parse(readFileSync(join(aqui, "sitio.json"), "utf8"));
const ESTATICOS = join(aqui, "..", "cliente");
const ascua = { renderToString, collectStyles, append };

const sinBase = (camino) =>
  SITIO.base !== "/" && camino.startsWith(SITIO.base) ? "/" + camino.slice(SITIO.base.length) : camino;

/** De una URL a lo que se responde: estado, tipo y cuerpo. */
export async function responder(url) {
  const direccion = new URL(url, "http://x");
  const camino = sinBase(direccion.pathname);
  const encontrada = buscar(RUTAS, camino);
  if (!encontrada) return { estado: 404, tipo: "text/plain; charset=utf-8", cuerpo: "No existe" };
  let { ruta, parametros, estado } = encontrada;
  let pagina;
  try {
    pagina = await renderizar({ ruta, modulo: ruta.modulo, marcos: ruta.marcos, parametros, camino, ascua, contexto: { url: direccion } });
  } catch (error) {
    // \`cargar()\` dijo que no existe: la página 404, si la hay.
    const noEncontrada = esNoExiste(error) && RUTAS.find((r) => r.es404);
    if (!esNoExiste(error)) throw error;
    if (!noEncontrada) return { estado: 404, tipo: "text/plain; charset=utf-8", cuerpo: "No existe" };
    ruta = noEncontrada;
    parametros = {};
    estado = 404;
    pagina = await renderizar({ ruta, modulo: ruta.modulo, marcos: ruta.marcos, parametros, camino, ascua, contexto: { url: direccion } });
  }
  if (ruta.archivo) return { estado, tipo: pagina.tipo, cuerpo: pagina.cuerpo };
  const cuerpo = componer(SITIO.esqueleto, {
    ...pagina,
    script: pagina.conIslas ? SITIO.script : null,
    hojas: pagina.conIslas ? SITIO.hojas : [],
  });
  return { estado, tipo: pagina.tipo, cuerpo };
}

/** Lo de dist/cliente: el script de las islas, las hojas, lo de public/. */
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
  // Lo que genera Vite lleva un hash en el nombre: se puede cachear para siempre.
  if (camino.startsWith("/assets/")) respuesta.setHeader("cache-control", "public, max-age=31536000, immutable");
  createReadStream(archivo).pipe(respuesta);
  return true;
}

/** Arranca el servidor; \`node dist/servidor/index.mjs\` lo hace solo. */
export function servir(puerto = Number(process.env.PORT ?? 3000)) {
  const servidor = createServer((peticion, respuesta) => {
    if (estatico(peticion, respuesta)) return;
    responder(peticion.url ?? "/").then(
      ({ estado, tipo, cuerpo }) => {
        respuesta.statusCode = estado;
        respuesta.setHeader("content-type", tipo);
        respuesta.end(peticion.method === "HEAD" ? undefined : cuerpo);
      },
      (error) => {
        console.error(error);
        respuesta.statusCode = 500;
        respuesta.end("Error interno");
      },
    );
  });
  return servidor.listen(puerto, () => console.log("ascua: http://localhost:" + servidor.address().port));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) servir();
`;
}

/** ¿Hay algún módulo en la carpeta de las islas? */
function hayIslas(dir) {
  if (!existsSync(dir)) return false;
  return readdirSync(dir, { recursive: true }).some((f) => MODULO.test(String(f)) && !String(f).endsWith(".d.ts"));
}

/** Los parámetros de cada página de una ruta variable. */
async function paginasDe(modulo, ruta, raiz) {
  if (!esVariable(ruta)) return [{}];
  const nombre = relative(raiz, ruta.modulo);
  if (typeof modulo.parametros !== "function") {
    throw new Error(`${nombre}: una ruta variable necesita export function parametros(), que diga qué páginas generar`);
  }
  const lista = await modulo.parametros();
  if (!Array.isArray(lista)) throw new Error(`${nombre}: parametros() tiene que devolver una lista`);
  return lista;
}

/** Las piezas de Ascua del servidor de Vite: las mismas con las que se registraron los estilos. */
async function ascuaDe(vite) {
  const { renderToString, collectStyles } = await vite.ssrLoadModule("ascua/servidor");
  const { append } = await vite.ssrLoadModule("ascua");
  return { renderToString, collectStyles, append };
}

/**
 * @param {true | { rutas?: string, islas?: string, esqueleto?: string, modo?: "estatico" | "servidor" }} opciones
 */
export function sitio(opciones) {
  const ajustes = {
    rutas: "src/rutas",
    islas: "src/islas",
    esqueleto: "index.html",
    modo: "estatico",
    ...(opciones === true ? {} : opciones),
  };
  if (ajustes.modo !== "estatico" && ajustes.modo !== "servidor") {
    throw new Error(`ascua: sitio.modo es "estatico" o "servidor", no ${JSON.stringify(ajustes.modo)}`);
  }

  /** @type {import("vite").ResolvedConfig} */
  let config;
  /** La configuración tal como la escribió el usuario, para los builds de dentro. */
  let delUsuario = {};
  let esqueletoConstruido = null;
  let scriptConstruido = null;
  let hojasConstruidas = [];

  const raiz = () => config.root;
  const dirRutas = () => resolve(raiz(), ajustes.rutas);
  const archivoEsqueleto = (root) => resolve(root, ajustes.esqueleto);
  const leerEsqueleto = () => {
    const archivo = archivoEsqueleto(raiz());
    return existsSync(archivo) ? readFileSync(archivo, "utf8") : ESQUELETO;
  };
  const sinBase = (camino) =>
    config.base !== "/" && camino.startsWith(config.base) ? `/${camino.slice(config.base.length)}` : camino;

  /** Un servidor o un build con la misma configuración del usuario. */
  const conLaConfig = (extra) =>
    config.configFile ? { ...extra, configFile: config.configFile } : { ...delUsuario, ...extra, configFile: false };

  /** Renderiza en desarrollo y responde; `encontrada` sale de `buscar`. */
  async function servirRuta(servidor, url, encontrada, respuesta) {
    let { ruta, parametros, estado } = encontrada;
    const { rutas } = descubrir(dirRutas());
    const camino = sinBase(new URL(url, "http://x").pathname);
    const ascua = await ascuaDe(servidor);
    const contexto = { url: new URL(url, "http://localhost") };
    const cargar = (archivo) => servidor.ssrLoadModule(archivo);
    const intentar = async () =>
      renderizar({
        ruta,
        modulo: await cargar(ruta.modulo),
        marcos: await marcosDe(ruta, cargar),
        parametros,
        camino,
        ascua,
        contexto,
      });

    let pagina;
    try {
      pagina = await intentar();
    } catch (error) {
      if (!esNoExiste(error)) throw error;
      // `cargar()` dijo que no existe: la página 404, si la hay; si no, que
      // siga Vite, que quizá lo tiene —`/docs/docs.css` encaja con
      // `/docs/:pagina` y es un archivo de public/—.
      const noEncontrada = rutas.find((r) => r.es404);
      if (!noEncontrada) return false;
      ruta = noEncontrada;
      parametros = {};
      estado = 404;
      pagina = await intentar();
    }

    respuesta.statusCode = estado;
    respuesta.setHeader("content-type", pagina.tipo);
    if (ruta.archivo) {
      respuesta.end(pagina.cuerpo);
      return true;
    }

    const esqueleto = await servidor.transformIndexHtml(url, leerEsqueleto());
    respuesta.end(componer(esqueleto, { ...pagina, script: pagina.conIslas ? `${config.base}@id/${CLIENTE}` : null }));
    return true;
  }

  return {
    name: "ascua:sitio",

    config(usuario, entorno) {
      delUsuario = usuario;
      // El build del servidor de la fase 3 trae su propia entrada, y lo lleva
      // todo dentro: `node dist/servidor/index.mjs` no necesita node_modules.
      if (entorno.isSsrBuild) return { ssr: { noExternal: usuario.ssr?.noExternal ?? true } };

      const root = resolve(usuario.root ?? process.cwd());
      // Sin islas no hay nada que hidratar: ni script, ni un trozo de runtime
      // que Vite parta para compartirlo con otras entradas.
      const entradas = hayIslas(resolve(root, ajustes.islas)) ? { "ascua-cliente": CLIENTE } : {};
      const esqueleto = archivoEsqueleto(root);
      // Si el esqueleto es otro archivo, `index.html` sigue siendo lo que era:
      // una página más de Vite, como la portada de un sitio con documentación.
      const indice = join(root, "index.html");
      if (existsSync(esqueleto)) entradas[esqueleto === indice ? "index" : "ascua-esqueleto"] = esqueleto;
      if (esqueleto !== indice && existsSync(indice)) entradas.index = indice;
      // Sin ninguna, rolldown no construye; esta sale vacía y se borra.
      if (Object.keys(entradas).length === 0) entradas["ascua-vacio"] = VACIO;

      return {
        // Sin el respaldo de SPA de Vite: lo que no es una ruta ni un archivo
        // es un 404.
        appType: usuario.appType ?? "mpa",
        build: {
          rollupOptions: { input: entradas },
          ...(ajustes.modo === "servidor" && !usuario.build?.outDir ? { outDir: "dist/cliente" } : {}),
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
      if (id === `\0${CLIENTE}`) return codigoCliente(ajustes.islas.replace(/^\/+|\/+$/g, ""));
      if (id === `\0${SERVIDOR}`) return codigoServidor(dirRutas());
      if (id === `\0${VACIO}`) return "export {};";
      return null;
    },

    writeBundle(opcionesSalida, bundle) {
      if (config.build.ssr) return;
      const dir = opcionesSalida.dir ?? resolve(raiz(), config.build.outDir);
      for (const parte of Object.values(bundle)) {
        if (parte.type === "chunk" && parte.facadeModuleId === `\0${VACIO}`) {
          rmSync(join(dir, parte.fileName), { force: true });
          const carpeta = dirname(join(dir, parte.fileName));
          if (existsSync(carpeta) && readdirSync(carpeta).length === 0) rmSync(carpeta, { recursive: true });
        }
        if (parte.type === "chunk" && parte.isEntry && parte.facadeModuleId === `\0${CLIENTE}`) {
          scriptConstruido = `${config.base}${parte.fileName}`;
          hojasConstruidas = [...(parte.viteMetadata?.importedCss ?? [])].map((h) => `${config.base}${h}`);
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
        hojas: hojasConstruidas,
      };
      const dentro = conLaConfig({ root, mode: config.mode, logLevel: "error" });

      if (ajustes.modo === "servidor") {
        const dirServidor = resolve(salida, "..", "servidor");
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
        writeFileSync(join(dirServidor, "sitio.json"), JSON.stringify(construido));
        logger.info(`ascua: servidor en ${relative(root, dirServidor)}/index.mjs`);
        return;
      }

      const { createServer } = await import("vite");
      const vite = await createServer({ ...dentro, server: { middlewareMode: true, hmr: false, watch: null }, appType: "custom" });
      let paginas = 0;
      let archivos = 0;
      try {
        const { rutas } = descubrir(rutasDir);
        if (rutas.length === 0) logger.warn(`ascua: no hay rutas en ${ajustes.rutas}/`);
        const ascua = await ascuaDe(vite);

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
                script: pagina.conIslas ? construido.script : null,
                hojas: pagina.conIslas ? construido.hojas : [],
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
        if (peticion.method !== "GET" && peticion.method !== "HEAD") return seguir();
        const url = peticion.url ?? "/";
        const camino = sinBase(new URL(url, "http://x").pathname);
        if (camino.startsWith("/@")) return seguir();
        try {
          const encontrada = buscar(descubrir(dirRutas()).rutas, camino);
          if (!encontrada || (encontrada.estado === 404) !== soloNoEncontradas) return seguir();
          if (!(await servirRuta(servidor, url, encontrada, respuesta))) seguir();
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

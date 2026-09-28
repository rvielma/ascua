/**
 * `ascua-check`: los tipos de TypeScript, también dentro de las plantillas.
 *
 * Para TypeScript una plantilla es una cadena y sus huecos son `unknown`:
 * `<Tarjeta titulo=${42}/>` pasa aunque `titulo` sea un `string`. Pero lo que
 * sale del compilador de Ascua **es TypeScript tipado** —esa etiqueta se
 * convierte en `Tarjeta({ titulo: 42 })`—, así que basta con comprobar eso.
 *
 * El recorrido:
 *
 * 1. `tsc --showConfig` resuelve el tsconfig del proyecto: `extends`,
 *    `include` y `exclude` ya aplicados, y la lista exacta de archivos.
 * 2. Se copia el proyecto a `.ascua-check/`, con las plantillas compiladas.
 * 3. Un tsconfig nuevo extiende el tuyo y apunta a la copia.
 * 4. Se ejecuta **tu** `tsc` —el 5 o el 7, el que tenga el proyecto— y cada
 *    error se devuelve a tu archivo con el source map del compilador.
 *
 * Se usa el binario y no la API de TypeScript a propósito: la API cambia
 * entre versiones —en la 7 ni siquiera es estable— y la salida de `tsc`, no.
 */

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { lineasDeOrigen } from "./mapa.js";

const PLANTILLA = /\b(?:view|html)`/;
const EXTENSIONES = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"]);
const COMPILABLES = /\.(?:[mc]?ts|tsx|[mc]?js|jsx)$/;
const IGNORADOS = new Set(["node_modules", "dist", "build", "coverage", ".ascua-check"]);
const SOMBRA = ".ascua-check";

/**
 * @typedef {object} Diagnostic
 * @property {string} file      Ruta absoluta del archivo original, o "" si es global.
 * @property {number} line      Desde 1.
 * @property {number} column    Desde 1.
 * @property {string} code      `TS2322`.
 * @property {"error" | "warning"} severity
 * @property {string} message   Con sus líneas de detalle, si las hay.
 */

/**
 * Comprueba un proyecto y devuelve los diagnósticos, ya en los archivos
 * originales.
 *
 * @param {{ project?: string, cwd?: string, keep?: boolean }} [opciones]
 * @returns {Promise<{ diagnostics: Diagnostic[], files: number, withTemplates: number, root: string }>}
 */
export async function check({ project = "tsconfig.json", cwd = process.cwd(), keep = false } = {}) {
  const config = resolve(cwd, project);
  if (!existsSync(config)) throw new Error(`no existe ${relative(cwd, config) || config}`);
  const raiz = dirname(config);
  const tsc = localizarTsc(config);
  const compilar = localizarCompilador(config);

  const resuelta = mostrarConfig(tsc, config, raiz);
  const sombra = join(raiz, SOMBRA);
  rmSync(sombra, { recursive: true, force: true });
  mkdirSync(sombra, { recursive: true });
  // Para que ningún control de versiones la recoja si queda a la vista.
  writeFileSync(join(sombra, ".gitignore"), "*\n");

  try {
    // Se copia todo el código del proyecto, no solo lo que incluye el
    // tsconfig: un archivo incluido puede importar otro que no lo está.
    const mapas = new Map();
    let archivos = 0;
    for (const original of recorrer(raiz)) {
      const copia = join(sombra, relative(raiz, original));
      mkdirSync(dirname(copia), { recursive: true });
      const fuente = readFileSync(original, "utf8");
      if (COMPILABLES.test(original) && !original.endsWith(".d.ts") && PLANTILLA.test(fuente)) {
        let salida;
        try {
          salida = compilar(fuente, relative(raiz, original));
        } catch (error) {
          // El compilador en wasm lanza el mensaje como cadena, no como Error,
          // y sin el archivo delante no hay por dónde empezar a buscar.
          throw new Error(`${relative(cwd, original)}: ${error?.message ?? error}`);
        }
        writeFileSync(copia, salida.code);
        mapas.set(copia, {
          original,
          lineasOriginales: fuente.split("\n"),
          lineasGeneradas: salida.code.split("\n"),
          origen: salida.map ? lineasDeOrigen(salida.map) : null,
        });
      } else {
        cpSync(original, copia);
      }
      archivos++;
    }

    writeFileSync(join(sombra, "tsconfig.json"), JSON.stringify(configSombra(resuelta, config, raiz, sombra), null, 2));

    const ejecucion = spawnSync(process.execPath, [tsc, "-p", join(sombra, "tsconfig.json"), "--pretty", "false"], {
      cwd: raiz,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    if (ejecucion.error) throw ejecucion.error;
    const salida = `${ejecucion.stdout ?? ""}${ejecucion.stderr ?? ""}`;
    const diagnosticos = leerDiagnosticos(salida, raiz).map((d) => devolver(d, raiz, sombra, mapas));

    return { diagnostics: diagnosticos, files: archivos, withTemplates: mapas.size, root: raiz };
  } finally {
    if (!keep) rmSync(sombra, { recursive: true, force: true });
  }
}

/** La línea de comandos. Devuelve el código de salida. */
export async function main(argumentos) {
  if (argumentos.includes("-h") || argumentos.includes("--help")) {
    console.log(AYUDA);
    return 0;
  }
  const indice = argumentos.findIndex((a) => a === "-p" || a === "--project");
  const proyecto = indice >= 0 ? argumentos[indice + 1] : "tsconfig.json";
  const keep = argumentos.includes("--keep");

  let resultado;
  try {
    resultado = await check({ project: proyecto, keep });
  } catch (error) {
    console.error(`ascua-check: ${error?.message ?? error}`);
    return 2;
  }

  const color = process.stdout.isTTY && !process.env.NO_COLOR;
  const pintar = (codigo, texto) => (color ? `\x1b[${codigo}m${texto}\x1b[0m` : texto);
  const { diagnostics: diagnosticos, files: archivos, withTemplates: conPlantillas, root: raiz } = resultado;

  for (const d of diagnosticos) console.log(`${formatear(d, raiz, pintar)}\n`);

  const errores = diagnosticos.filter((d) => d.severity === "error");
  if (errores.length === 0) {
    console.log(pintar(32, `✓ sin errores de tipos`) + ` · ${archivos} archivos, ${conPlantillas} con plantillas`);
    return 0;
  }
  const enArchivos = new Set(errores.map((d) => d.file)).size;
  console.log(
    pintar(31, `✗ ${errores.length} ${errores.length === 1 ? "error" : "errores"}`) +
      ` en ${enArchivos} ${enArchivos === 1 ? "archivo" : "archivos"}`,
  );
  return 1;
}

const AYUDA = `ascua-check — comprueba los tipos, también dentro de las plantillas

USO:
    ascua-check [-p tsconfig.json]

OPCIONES:
    -p, --project RUTA   el tsconfig del proyecto (por defecto, tsconfig.json)
        --keep           no borra .ascua-check/ al terminar: se ve lo que comprobó tsc
    -h, --help           muestra esta ayuda

Usa el typescript instalado en el proyecto, sea el 5 o el 7.`;

// ---------------------------------------------------------------------------

function localizarTsc(config) {
  let paquete;
  try {
    paquete = createRequire(config).resolve("typescript/package.json");
  } catch {
    throw new Error("hace falta typescript en el proyecto: stil add -D typescript (o npm install -D typescript)");
  }
  const { bin } = JSON.parse(readFileSync(paquete, "utf8"));
  const tsc = typeof bin === "string" ? bin : bin?.tsc;
  if (!tsc) throw new Error(`el paquete typescript de ${dirname(paquete)} no trae tsc`);
  return join(dirname(paquete), tsc);
}

/** El compilador de Ascua, buscado desde el proyecto y desde este paquete. */
function localizarCompilador(config) {
  for (const desde of [config, import.meta.url]) {
    try {
      const wasm = createRequire(desde)("ascua-compilador");
      return (codigo, archivo) => JSON.parse(wasm.compileJson(codigo, archivo));
    } catch {
      // Se prueba el siguiente.
    }
  }
  throw new Error("no se encuentra ascua-compilador");
}

function mostrarConfig(tsc, config, raiz) {
  const ejecucion = spawnSync(process.execPath, [tsc, "--showConfig", "-p", config], { cwd: raiz, encoding: "utf8" });
  try {
    return JSON.parse(ejecucion.stdout);
  } catch {
    throw new Error(`tsc no pudo leer ${relative(raiz, config)}:\n${ejecucion.stdout}${ejecucion.stderr}`);
  }
}

function* recorrer(directorio) {
  for (const entrada of readdirSync(directorio, { withFileTypes: true })) {
    if (entrada.name.startsWith(".") || IGNORADOS.has(entrada.name)) continue;
    // Los tsconfig no se copian: el de la copia extiende el original.
    if (/^tsconfig.*\.json$/.test(entrada.name)) continue;
    const ruta = join(directorio, entrada.name);
    if (entrada.isDirectory()) {
      yield* recorrer(ruta);
    } else if (entrada.isFile() && EXTENSIONES.has(extname(entrada.name)) && statSync(ruta).size < 4_000_000) {
      yield ruta;
    }
  }
}

const dentro = (padre, ruta) => {
  const camino = relative(padre, ruta);
  return camino !== "" && !camino.startsWith("..") && !isAbsolute(camino);
};

/**
 * El tsconfig de la copia: extiende el tuyo y lo reapunta.
 *
 * Todo lo que en el tuyo es una ruta del proyecto —los archivos, `paths`,
 * `baseUrl`, `rootDir`— se traslada a su sitio en la copia. Lo que queda fuera
 * del proyecto se deja con su ruta absoluta.
 */
function configSombra(resuelta, config, raiz, sombra) {
  const opciones = resuelta.compilerOptions ?? {};
  const trasladar = (ruta) => {
    const absoluta = resolve(raiz, ruta);
    return dentro(raiz, absoluta) && !absoluta.split(sep).includes("node_modules")
      ? join(sombra, relative(raiz, absoluta))
      : absoluta;
  };

  const compilerOptions = {
    noEmit: true,
    incremental: false,
    composite: false,
    declaration: false,
    emitDeclarationOnly: false,
  };
  const base = opciones.baseUrl ? resolve(raiz, opciones.baseUrl) : raiz;
  if (opciones.baseUrl) compilerOptions.baseUrl = trasladar(opciones.baseUrl);
  if (opciones.rootDir) compilerOptions.rootDir = trasladar(opciones.rootDir);
  if (opciones.paths) {
    compilerOptions.paths = Object.fromEntries(
      Object.entries(opciones.paths).map(([patron, destinos]) => [
        patron,
        destinos.map((destino) => trasladar(relative(raiz, resolve(base, destino)))),
      ]),
    );
  }

  return {
    extends: config,
    compilerOptions,
    files: (resuelta.files ?? []).map((archivo) => trasladar(archivo)),
    include: [],
  };
}

const LINEA = /^(.+?)\((\d+),(\d+)\): (error|warning) (TS\d+): (.*)$/;
const GLOBAL = /^(error|warning) (TS\d+): (.*)$/;

/** La salida de `tsc --pretty false`, en diagnósticos. */
function leerDiagnosticos(salida, raiz) {
  const diagnosticos = [];
  for (const linea of salida.split(/\r?\n/)) {
    const conLugar = LINEA.exec(linea);
    const sinLugar = conLugar ? null : GLOBAL.exec(linea);
    if (conLugar) {
      const [, archivo, fila, columna, gravedad, codigo, mensaje] = conLugar;
      diagnosticos.push({
        file: resolve(raiz, archivo),
        line: Number(fila),
        column: Number(columna),
        severity: gravedad,
        code: codigo,
        message: mensaje,
      });
    } else if (sinLugar) {
      const [, gravedad, codigo, mensaje] = sinLugar;
      diagnosticos.push({ file: "", line: 0, column: 0, severity: gravedad, code: codigo, message: mensaje });
    } else if (linea.startsWith("  ") && diagnosticos.length > 0) {
      diagnosticos[diagnosticos.length - 1].message += `\n${linea}`;
    }
  }
  return diagnosticos;
}

/** Del archivo de la copia al original. */
function devolver(diagnostico, raiz, sombra, mapas) {
  if (!diagnostico.file || !dentro(sombra, diagnostico.file)) return diagnostico;
  // Un error del tsconfig generado es un error del tuyo, pero sus líneas no
  // son las tuyas: se da sin posición.
  if (diagnostico.file === join(sombra, "tsconfig.json")) {
    return { ...diagnostico, file: "", message: `en la configuración: ${diagnostico.message}` };
  }
  const original = join(raiz, relative(sombra, diagnostico.file));
  const mapa = mapas.get(diagnostico.file);
  if (!mapa?.origen) return { ...diagnostico, file: original };

  const indice = diagnostico.line - 1;
  const linea = (mapa.origen[indice] ?? 0) + 1;
  const generada = mapa.lineasGeneradas[indice] ?? "";
  const escrita = mapa.lineasOriginales[linea - 1] ?? "";

  // El mapa es por líneas. Si la línea se copió tal cual, la columna vale; si
  // la generó el compilador, se busca en la original lo mismo que señala el
  // error —el nombre de un prop, un manejador— y si no aparece, el principio
  // de la línea.
  let columna = diagnostico.column;
  if (generada !== escrita) {
    const senalado = /^[\w$.]+/.exec(generada.slice(diagnostico.column - 1))?.[0] ?? "";
    const donde = senalado ? escrita.indexOf(senalado) : -1;
    columna = donde >= 0 ? donde + 1 : escrita.search(/\S/) + 1 || 1;
  }
  return { ...diagnostico, file: original, line: linea, column: columna };
}

function formatear(d, raiz, pintar) {
  const gravedad = d.severity === "error" ? pintar(31, "error") : pintar(33, "warning");
  if (!d.file) return `${gravedad} ${pintar(90, d.code)}: ${d.message}`;

  const ruta = relative(raiz, d.file);
  const cabecera = `${pintar(36, ruta)}:${pintar(33, d.line)}:${pintar(33, d.column)} - ${gravedad} ${pintar(90, d.code)}: ${d.message}`;

  let texto = "";
  try {
    texto = readFileSync(d.file, "utf8").split("\n")[d.line - 1] ?? "";
  } catch {
    return cabecera;
  }
  const numero = String(d.line);
  const marca = " ".repeat(Math.max(0, d.column - 1)) + pintar(31, "~");
  return `${cabecera}\n\n${pintar(90, numero)} ${texto}\n${" ".repeat(numero.length)} ${marca}`;
}

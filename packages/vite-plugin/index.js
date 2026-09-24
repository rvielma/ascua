/**
 * Plugin de Vite para Ascua.
 *
 * Hace dos cosas: pasar cada archivo con plantillas por `ascuac`, y recoger el
 * CSS que ese compilador extrae para entregárselo a Vite como una hoja de
 * estilos más.
 *
 * Lo que **no** hace: tocar la reactividad, empaquetar o resolver módulos. Si
 * mañana hay que cambiar de bundler, se reescriben estas líneas y todo lo
 * demás sigue igual.
 */

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

const EXTENSIONES = /\.[jt]sx?$/;
const PREFIJO = "virtual:ascua/";
const PLANTILLA = /\b(?:view|html)`/;

/**
 * Elige con qué compilar.
 *
 * Por defecto, el compilador **en WebAssembly**: un solo artefacto que vale
 * para Node, Bun, Deno y el navegador, sin binarios por plataforma ni
 * `postinstall` que descargue nada. Si se pasa `bin`, se usa ese ejecutable
 * nativo, que es algo más rápido.
 */
function elegirCompilador(opciones) {
  if (opciones.bin) {
    return (codigo, archivo) =>
      JSON.parse(
        execFileSync(opciones.bin, ["--json", "--origen", archivo], {
          input: codigo,
          encoding: "utf8",
        }),
      );
  }

  // Se busca desde el proyecto y desde el propio plugin: en un monorepo el
  // paquete puede estar colgando de cualquiera de los dos.
  for (const desde of [join(process.cwd(), "index.js"), import.meta.url]) {
    try {
      const wasm = createRequire(desde)("ascua-compilador");
      return (codigo, archivo) => JSON.parse(wasm.compilar_json(codigo, archivo));
    } catch {
      // Se prueba el siguiente.
    }
  }

  // Sin el paquete WebAssembly, queda el binario del PATH.
  return (codigo, archivo) =>
    JSON.parse(
      execFileSync("ascuac", ["--json", "--origen", archivo], {
        input: codigo,
        encoding: "utf8",
      }),
    );
}

/**
 * @param {{ bin?: string }} [opciones]
 *   `bin`: ruta a un `ascuac` nativo. Sin esto se usa el compilador WASM.
 */
export default function ascua(opciones = {}) {
  const compilar = elegirCompilador(opciones);
  /** Hojas extraídas, por id virtual. */
  const hojas = new Map();

  return {
    name: "ascua",
    // Antes que nada: lo que sale es TypeScript normal, y de ahí en adelante
    // lo tratan las herramientas de siempre.
    enforce: "pre",

    resolveId(id) {
      // El `\0` es la convención de Rollup para módulos que no son archivos.
      // La extensión .css se conserva para que Vite lo trate como estilos.
      if (id.startsWith(PREFIJO)) return `\0${id}`;
      return null;
    },

    load(id) {
      if (id.startsWith(`\0${PREFIJO}`)) return hojas.get(id.slice(1)) ?? "";
      return null;
    },

    transform(codigo, id) {
      const archivo = id.split("?")[0];
      if (!EXTENSIONES.test(archivo)) return null;
      // Sin plantillas no hay nada que compilar, y el archivo ni se toca.
      // `html` es el alias de `view` que colorean los editores.
      if (!PLANTILLA.test(codigo)) return null;

      let salida;
      try {
        salida = compilar(codigo, archivo);
      } catch (error) {
        const detalle = error.stderr?.toString().trim() || error.message;
        this.error(`ascua: ${detalle}\n  en ${archivo}`);
        return null;
      }

      // El source map viene del compilador, que es quien sabe de qué línea
      // del archivo original salió cada línea de la suya. Sin esto, un error
      // en el navegador señala `_$dtxt(...)` y no lo que alguien escribió.
      if (!salida.css) return { code: salida.code, map: salida.map };

      // El CSS se entrega como un módulo aparte: Vite lo inyecta en dev y lo
      // extrae a un .css en el build. No queda nada de estilos en runtime.
      //
      // El id lleva **el scope del propio CSS**, que el compilador deriva de su
      // contenido. Así, tocar un `<style>` produce otro módulo virtual en vez
      // de cambiar el contenido de uno que ya existe: en dev, un id estable con
      // contenido nuevo se queda servido con el de antes, y los estilos dejan
      // de casar con los elementos, que sí llevan ya el scope nuevo.
      const nombre = archivo.replace(/[^a-zA-Z0-9]/g, "_").slice(-60);
      const scope = /data-ascua-([0-9a-f]+)/.exec(salida.css)?.[1] ?? "css";
      const idVirtual = `${PREFIJO}${nombre}-${scope}.css`;

      // Las versiones anteriores de este mismo archivo ya no las pide nadie.
      for (const anterior of hojas.keys()) {
        if (anterior.startsWith(`${PREFIJO}${nombre}-`) && anterior !== idVirtual) {
          hojas.delete(anterior);
        }
      }
      hojas.set(idVirtual, salida.css);

      // El import de la hoja empuja todo una línea hacia abajo, así que el
      // mapa necesita una línea en blanco por delante para no descuadrarse.
      const mapa = salida.map ? { ...salida.map, mappings: `;${salida.map.mappings}` } : null;

      return {
        code: `import ${JSON.stringify(idVirtual)};\n${salida.code}`,
        map: mapa,
      };
    },
  };
}

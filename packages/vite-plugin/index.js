/**
 * Plugin de Vite para Ascua.
 *
 * Lo único que hace es pasar cada archivo que contenga una plantilla por
 * `ascuac`, el compilador. Ni toca la reactividad, ni empaqueta, ni resuelve
 * nada: si mañana hay que cambiar de bundler, se reescriben estas veinte
 * líneas y todo lo demás sigue igual.
 */

import { execFileSync } from "node:child_process";

const EXTENSIONES = /\.[jt]sx?$/;

/**
 * @param {{ bin?: string }} [opciones]
 *   `bin`: ruta al binario `ascuac`. Por defecto se busca en el PATH.
 */
export default function ascua(opciones = {}) {
  const binario = opciones.bin ?? "ascuac";

  return {
    name: "ascua",
    // Antes que nada: el resultado es TypeScript normal, y de ahí en adelante
    // lo tratan las herramientas de siempre.
    enforce: "pre",

    transform(codigo, id) {
      if (!EXTENSIONES.test(id.split("?")[0])) return null;
      // Sin plantillas no hay nada que compilar, y el archivo ni se toca.
      if (!codigo.includes("view`")) return null;

      try {
        const salida = execFileSync(binario, [], { input: codigo, encoding: "utf8" });
        return { code: salida, map: null };
      } catch (error) {
        const detalle = error.stderr?.toString().trim() || error.message;
        this.error(`ascua: ${detalle}\n  en ${id}`);
        return null;
      }
    },
  };
}

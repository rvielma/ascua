/**
 * En dev, tocar un `<style>` tiene que producir otra hoja virtual: Vite sirve
 * la de un id que ya conoce con el contenido de antes.
 */

import { expect, it } from "vitest";

import ascua from "../index.js";

const archivo = "/proyecto/src/dos.ts";
const fuente = (color) => `import { view } from "ascua";
export const A = () => view\`<p class="a">a<style>.a { color: red; }</style></p>\`;
export const B = () => view\`<p class="b">b<style>.b { color: ${color}; }</style></p>\`;
`;

function compilar(plugin, codigo) {
  const salida = plugin.transform.call({ error: (m) => { throw new Error(m); } }, codigo, archivo);
  const id = /^import "(virtual:ascua\/[^"]+)";/.exec(salida.code)?.[1];
  return { id, css: plugin.load(plugin.resolveId(id)) };
}

it("editar el estilo de la segunda plantilla de un archivo cambia la hoja", () => {
  const plugin = [ascua()].flat().find((p) => p.name === "ascua");
  const antes = compilar(plugin, fuente("blue"));
  const despues = compilar(plugin, fuente("green"));

  expect(despues.id).not.toBe(antes.id);
  expect(despues.css).toContain("color: green");
  expect(despues.css).not.toContain("color: blue");
});

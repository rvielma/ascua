// @vitest-environment happy-dom
/**
 * El HTML que sale del build, cargado en un documento con el script que el
 * propio build generó: la isla tiene que adoptar el botón del servidor y
 * responder al click.
 */

import { readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "vite";
import { afterAll, beforeAll, expect, it } from "vitest";

// Con `node:path` y no con `URL`: en este entorno, `URL` es la de happy-dom.
const PROYECTO = join(dirname(fileURLToPath(import.meta.url)), "fixtures/sitio");
const DIST = join(PROYECTO, "dist-hidratacion");

afterAll(() => rmSync(DIST, { recursive: true, force: true }));

beforeAll(async () => {
  await build({ root: PROYECTO, logLevel: "silent", build: { outDir: "dist-hidratacion", emptyOutDir: true } });
});

it("la isla adopta el nodo del servidor y funciona", async () => {
  const pagina = readFileSync(join(DIST, "index.html"), "utf8");
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(pagina)[1].replace(/<script[\s\S]*?<\/script>/g, "");
  const boton = document.querySelector("button.contador");
  expect(boton.textContent).toBe("3");

  const script = readdirSync(join(DIST, "assets")).find((a) => a.startsWith("ascua-cliente-"));
  await import(join(DIST, "assets", script));

  // El mismo nodo, no uno nuevo.
  expect(document.querySelector("button.contador")).toBe(boton);
  boton.click();
  expect(boton.textContent).toBe("4");
});

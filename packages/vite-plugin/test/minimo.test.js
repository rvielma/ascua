/**
 * El proyecto del «Empezar» del README: una ruta, sin index.html y sin islas.
 * Vite necesita alguna entrada; el sitio pone una vacía y la borra.
 */

import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { build } from "vite";
import { afterAll, expect, it } from "vitest";

const PROYECTO = new URL("./fixtures/minimo/", import.meta.url).pathname;
const DIST = join(PROYECTO, "dist");

afterAll(() => rmSync(DIST, { recursive: true, force: true }));

it("construye con solo src/rutas/index.ts, y no deja nada más que la página", async () => {
  await build({ root: PROYECTO, logLevel: "silent" });
  expect(readdirSync(DIST)).toEqual(["index.html"]);
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  expect(html).toContain("<title>Inicio</title>");
  expect(html).toContain("<main><h1>Hola</h1></main>");
  expect(html).not.toContain("<script");
});

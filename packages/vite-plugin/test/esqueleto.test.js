/**
 * Un esqueleto en una subcarpeta, como el de Letra Muerta
 * (`src/landing/esqueleto.html`): no puede dejar carpetas vacías en `dist/`, y
 * su hoja se llama como él.
 */

import { existsSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { build } from "vite";
import { afterAll, expect, it } from "vitest";

const PROYECTO = new URL("./fixtures/esqueleto/", import.meta.url).pathname;
const DIST = join(PROYECTO, "dist");

afterAll(() => rmSync(DIST, { recursive: true, force: true }));

it("quita el esqueleto y la carpeta que Vite creó para él", async () => {
  await build({ root: PROYECTO, logLevel: "silent" });
  expect(existsSync(join(DIST, "src"))).toBe(false);
  expect(readdirSync(DIST).sort()).toEqual(["assets", "index.html"]);

  const hojas = readdirSync(join(DIST, "assets"));
  expect(hojas).toHaveLength(1);
  expect(hojas[0]).toMatch(/^esqueleto-[\w-]+\.css$/);
  expect(readFileSync(join(DIST, "index.html"), "utf8")).toContain(`/assets/${hojas[0]}`);
});

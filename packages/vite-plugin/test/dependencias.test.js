/**
 * Vite versiona las dependencias pre-empaquetadas con un hash que no mira
 * `stil-lock.json`; el plugin mete la huella del lockfile en ese hash.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, it } from "vitest";

import ascua from "../index.js";

const original = process.cwd();
let dir;

afterEach(() => {
  process.chdir(original);
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function nombres() {
  return [ascua()].flat().map((p) => p.name);
}

it("con stil-lock.json, un plugin lleva su huella, y cambia con el lockfile", () => {
  dir = mkdtempSync(join(tmpdir(), "ascua-deps-"));
  process.chdir(dir);
  writeFileSync("stil-lock.json", '{"ascua@0.5.0":{}}');
  const antes = nombres().find((n) => n.startsWith("ascua:stil-lock-"));
  writeFileSync("stil-lock.json", '{"ascua@0.6.0":{}}');
  const despues = nombres().find((n) => n.startsWith("ascua:stil-lock-"));
  expect(antes).toMatch(/^ascua:stil-lock-[0-9a-f]{12}$/);
  expect(despues).not.toBe(antes);
});

it("sin stil-lock.json, el plugin es uno solo, como siempre", () => {
  dir = mkdtempSync(join(tmpdir(), "ascua-deps-"));
  process.chdir(dir);
  const plugin = ascua();
  expect(Array.isArray(plugin)).toBe(false);
  expect(plugin.name).toBe("ascua");
});

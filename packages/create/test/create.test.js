/**
 * create-ascua: las plantillas, los argumentos y el comando.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, it } from "vitest";

import { crear, leerArgumentos, versionesDelRepositorio } from "../index.js";

const COMANDO = new URL("../index.js", import.meta.url).pathname;
let dir;
const nuevo = () => (dir = mkdtempSync(join(tmpdir(), "create-ascua-")));
afterEach(() => dir && rmSync(dir, { recursive: true, force: true }));

it("static: el sitio base, con .gitignore y las versiones de Ascua", () => {
  const destino = join(nuevo(), "my-site");
  const archivos = crear(destino, "static");
  expect(archivos).toContain(".gitignore");
  expect(archivos).not.toContain("_gitignore");
  expect(archivos).toContain(join("src", "routes", "index.ts"));
  expect(archivos).toContain(join("src", "islands", "counter.ts"));
  expect(archivos).not.toContain(join("src", "routes", "contact.ts"));

  const paquete = JSON.parse(readFileSync(join(destino, "package.json"), "utf8"));
  const v = versionesDelRepositorio();
  expect(paquete.name).toBe("my-site");
  expect(paquete.dependencies.ascua).toBe(`^${v.ascua}`);
  expect(paquete.devDependencies["vite-plugin-ascua"]).toBe(`^${v["vite-plugin-ascua"]}`);
  expect(paquete.scripts).toEqual({ dev: "vite", build: "vite build", preview: "vite preview" });
  expect(readFileSync(join(destino, "vite.config.ts"), "utf8")).toContain("site: true");
});

it("server: la base más el formulario, el middleware y el arranque", () => {
  const destino = join(nuevo(), "My Site");
  const archivos = crear(destino, "server");
  for (const archivo of ["contact.ts", "_middleware.ts", "about.ts"]) {
    expect(archivos).toContain(join("src", "routes", archivo));
  }
  expect(archivos).toContain(join("src", "islands", "contact-form.ts"));
  expect(readFileSync(join(destino, "vite.config.ts"), "utf8")).toContain('mode: "server"');
  // El layout de server reemplaza al de la base: enlaza a contacto.
  expect(readFileSync(join(destino, "src/routes/_layout.ts"), "utf8")).toContain('href="/contact"');
  const paquete = JSON.parse(readFileSync(join(destino, "package.json"), "utf8"));
  expect(paquete.name).toBe("my-site");
  expect(paquete.scripts.start).toBe("node dist/server/index.mjs");
});

it("no pisa un directorio con cosas", () => {
  const destino = nuevo();
  writeFileSync(join(destino, "algo.txt"), "");
  expect(() => crear(destino)).toThrow(/not empty|no está vacío/);
  // Uno vacío sí vale.
  const vacio = join(destino, "vacio");
  mkdirSync(vacio);
  expect(() => crear(vacio)).not.toThrow();
});

it("lee los argumentos y rechaza lo que no conoce", () => {
  expect(leerArgumentos(["web", "--template", "server"])).toEqual({ dir: "web", template: "server", ayuda: false });
  expect(leerArgumentos(["--template=static"])).toMatchObject({ template: "static" });
  expect(leerArgumentos(["--help"]).ayuda).toBe(true);
  expect(() => leerArgumentos(["--template", "spa"])).toThrow();
  expect(() => leerArgumentos(["--force"])).toThrow();
});

it("el comando crea el sitio y dice cómo seguir, con el gestor que lo corrió", () => {
  const raiz = nuevo();
  const salida = execFileSync(process.execPath, [COMANDO, "web", "--template", "server"], {
    cwd: raiz,
    encoding: "utf8",
    env: { ...process.env, LANG: "en_US.UTF-8", npm_config_user_agent: "bun/1.2.0" },
  });
  expect(salida).toContain("Done: web (server)");
  expect(salida).toContain("bun install");
  expect(existsSync(join(raiz, "web", "src", "routes", "contact.ts"))).toBe(true);

  const enEspañol = execFileSync(process.execPath, [COMANDO, "otro"], {
    cwd: raiz,
    encoding: "utf8",
    env: { ...process.env, LANG: "es_CL.UTF-8", npm_config_user_agent: "" },
  });
  expect(enEspañol).toContain("Listo: otro (static)");
  expect(enEspañol).toContain("npm install");
});

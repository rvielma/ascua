/**
 * create-ascua: las plantillas, los argumentos y el comando.
 */

import { execFileSync } from "node:child_process";
import { accessSync, chmodSync, constants, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  expect(readFileSync(join(destino, "vite.config.ts"), "utf8")).toMatch(/site: \{ lang: "(es|en)" \}/);
});

it("server: la base más el formulario, el middleware y el arranque", () => {
  const destino = join(nuevo(), "My Site");
  const archivos = crear(destino, "server");
  for (const archivo of ["contact.ts", "_middleware.ts", "about.ts"]) {
    expect(archivos).toContain(join("src", "routes", archivo));
  }
  expect(archivos).toContain(join("src", "islands", "contact-form.ts"));
  expect(readFileSync(join(destino, "vite.config.ts"), "utf8")).toMatch(/site: \{ mode: "server", lang: "(es|en)" \}/);
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

it("el idioma del sitio va al esqueleto y a la opción del kit", () => {
  const raiz = nuevo();
  crear(join(raiz, "en"), "server", "en");
  expect(readFileSync(join(raiz, "en/index.html"), "utf8")).toContain('<html lang="en">');
  expect(readFileSync(join(raiz, "en/vite.config.ts"), "utf8")).toContain('site: { mode: "server", lang: "en" }');
  crear(join(raiz, "es"), "static", "es");
  expect(readFileSync(join(raiz, "es/index.html"), "utf8")).toContain('<html lang="es">');
  expect(readFileSync(join(raiz, "es/vite.config.ts"), "utf8")).toContain('site: { lang: "es" }');
});

it("el sitio sale editable aunque la plantilla sea de solo lectura, como en el store de stil", async () => {
  const raiz = nuevo();
  // Una copia del paquete con todo en 0444, como lo deja stil.
  const paquete = join(raiz, "paquete");
  cpSync(new URL("..", import.meta.url).pathname, paquete, {
    recursive: true,
    filter: (f) => !f.includes("node_modules") && !f.includes(`${"/"}test${"/"}`),
  });
  const soloLectura = (dir) => {
    for (const n of readdirSync(dir)) {
      const f = join(dir, n);
      if (statSync(f).isDirectory()) soloLectura(f);
      else chmodSync(f, 0o444);
    }
  };
  // Como el publicado: con sus versiones al lado, sin el repositorio alrededor.
  writeFileSync(join(paquete, "versions.json"), JSON.stringify({ ascua: "0.5.0", "vite-plugin-ascua": "0.10.0" }));
  soloLectura(join(paquete, "templates"));
  const { crear: crearDesde } = await import(join(paquete, "index.js"));
  const destino = join(raiz, "web");
  crearDesde(destino, "server", "en");
  for (const archivo of ["index.html", "vite.config.ts", "src/routes/contact.ts"]) {
    expect(() => accessSync(join(destino, archivo), constants.W_OK), archivo).not.toThrow();
  }
  expect(readFileSync(join(destino, "index.html"), "utf8")).toContain('<html lang="en">');
});


/**
 * `ascua({ sitio: true })` sobre un proyecto de verdad: se construye con Vite
 * y se mira lo que queda en `dist/`, y se levanta el servidor de desarrollo y
 * se le piden páginas.
 */

import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { build, createServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { descubrir } from "../sitio.js";
import { encajar } from "../sitio-comun.js";

const PROYECTO = new URL("./fixtures/sitio/", import.meta.url).pathname;
const DIST = join(PROYECTO, "dist");
const leer = (archivo) => readFileSync(join(DIST, archivo), "utf8");

describe("descubrir y encajar", () => {
  const { rutas, marco } = descubrir(join(PROYECTO, "src/rutas"));

  it("una ruta por archivo; el marco y lo que empieza por _ no lo son", () => {
    expect(marco).toMatch(/_marco\.ts$/);
    expect(rutas.map((r) => (r.es404 ? "404" : `/${r.segmentos.join("/")}`)).sort()).toEqual([
      "/",
      "/acerca",
      "/docs/*ruta",
      "/lenguajes.json",
      "/lenguajes/:nombre",
      "404",
    ]);
    expect(rutas.find((r) => r.segmentos[0] === "lenguajes.json").archivo).toBe(true);
  });

  it("encaja con parámetros, y las fijas van antes que las variables", () => {
    const variable = rutas.find((r) => r.segmentos[1] === ":nombre");
    expect(encajar(variable, "/lenguajes/rust")).toEqual({ nombre: "rust" });
    expect(encajar(variable, "/lenguajes")).toBeNull();

    // La que atrapa el resto va la última, y se lleva todo lo que queda.
    const resto = rutas.at(-1);
    expect(resto.segmentos).toEqual(["docs", "*ruta"]);
    expect(encajar(resto, "/docs/a/b/c")).toEqual({ ruta: "a/b/c" });
    expect(encajar(resto, "/docs")).toBeNull();
  });

  it("cada ruta lleva los marcos de su carpeta y de las de encima", () => {
    const variable = rutas.find((r) => r.segmentos[1] === ":nombre");
    expect(variable.marcos.map((m) => m.split("/rutas/")[1])).toEqual(["_marco.ts", "lenguajes/_marco.ts"]);
    expect(rutas.find((r) => r.segmentos[0] === "acerca").marcos).toHaveLength(1);
  });
});

describe("vite build", () => {
  afterAll(() => rmSync(DIST, { recursive: true, force: true }));
  beforeAll(async () => {
    rmSync(DIST, { recursive: true, force: true });
    await build({ root: PROYECTO, logLevel: "silent" });
  });

  it("escribe una página por ruta, y una por cada parámetro", () => {
    for (const archivo of [
      "index.html",
      "acerca/index.html",
      "lenguajes/rust/index.html",
      "lenguajes/zig/index.html",
      "404.html",
    ]) {
      expect(existsSync(join(DIST, archivo)), archivo).toBe(true);
    }
    expect(existsSync(join(DIST, "_privada"))).toBe(false);
  });

  it("usa index.html de esqueleto, con sus hojas ya con hash", () => {
    const inicio = leer("index.html");
    expect(inicio).toMatch(/<div id="app"><div data-ascua-\w+ class="marco">/);
    expect(inicio).toMatch(/<link rel="stylesheet" crossorigin href="\/assets\/index-[\w-]+\.css">/);
    expect(inicio).toContain("<title>Inicio</title>");
  });

  it("cada página lleva los estilos de lo que usa, dentro", () => {
    expect(leer("acerca/index.html")).toMatch(/<style>\.marco header\[data-ascua-\w+\]/);
  });

  it("solo las páginas con islas llevan JavaScript", () => {
    expect(leer("index.html")).toMatch(/<script type="module" src="\/assets\/ascua-cliente-[\w-]+\.js"><\/script>/);
    expect(leer("acerca/index.html")).not.toContain("<script");
    expect(leer("lenguajes/rust/index.html")).not.toContain("<script");
  });

  it("los títulos y el contenido dependen de los parámetros", () => {
    const zig = leer("lenguajes/zig/index.html");
    expect(zig).toContain("<title>Lenguaje zig</title>");
    expect(zig).toContain("<h1>zig</h1><p>2016</p>");
    expect(leer("404.html")).toContain("<h1>No existe</h1>");
  });

  it("cargar() corre al construir y sus datos llegan a la página y a su descripción", () => {
    expect(leer("lenguajes/rust/index.html")).toContain('<meta name="description" content="rust tiene 11 años">');
  });

  it("los marcos se anidan: el de la raíz envuelve al de la carpeta", () => {
    expect(leer("lenguajes/rust/index.html")).toMatch(
      /<header[^>]*>Sitio · \/lenguajes\/rust<\/header><main[^>]*><section class="lenguajes"><p>Lenguajes<\/p><div><article><h1>rust<\/h1>/,
    );
    expect(leer("acerca/index.html")).not.toContain('class="lenguajes"');
  });

  it("[...ruta] genera una página por resto, con sus barras", () => {
    expect(leer("docs/guia/inicio/index.html")).toContain("<h1>docs: guia/inicio</h1>");
    expect(leer("docs/api/index.html")).toContain("<h1>docs: api</h1>");
  });

  it("cabeza va al <head> tal cual", () => {
    expect(leer("index.html")).toMatch(/<meta property="og:title" content="Inicio">[\s\S]*<\/head>/);
  });

  it("una ruta con extensión es ese archivo, no una página", () => {
    expect(JSON.parse(leer("lenguajes.json"))).toEqual(["rust", "zig"]);
  });
});

describe("vite en desarrollo", () => {
  let servidor;
  let origen;

  beforeAll(async () => {
    servidor = await createServer({ root: PROYECTO, logLevel: "silent", server: { port: 0 } });
    await servidor.listen();
    const { port } = servidor.httpServer.address();
    origen = `http://localhost:${port}`;
  });
  afterAll(() => servidor?.close());

  it("renderiza la ruta pedida, con el script de islas si hace falta", async () => {
    const respuesta = await fetch(`${origen}/`);
    expect(respuesta.status).toBe(200);
    const html = await respuesta.text();
    expect(html).toContain('data-ascua-island="contador"');
    expect(html).toContain('<script type="module" src="/@id/virtual:ascua-sitio/cliente"></script>');

    const script = await fetch(`${origen}/@id/virtual:ascua-sitio/cliente`);
    expect(script.status).toBe(200);
    expect(await script.text()).toContain("hydrate");
  });

  it("los parámetros salen de la URL", async () => {
    const html = await (await fetch(`${origen}/lenguajes/rust`)).text();
    expect(html).toContain("<title>Lenguaje rust</title>");
    expect(html).not.toContain("<script type=\"module\" src=\"/@id/");
  });

  it("en desarrollo, cargar() corre en cada petición y las rutas-archivo llevan su tipo", async () => {
    const html = await (await fetch(`${origen}/lenguajes/zig`)).text();
    expect(html).toContain('<meta name="description" content="zig tiene 10 años">');

    const json = await fetch(`${origen}/lenguajes.json`);
    expect(json.headers.get("content-type")).toContain("application/json");
    expect(await json.json()).toEqual(["rust", "zig"]);
  });

  it("en desarrollo, [...ruta] atrapa cualquier profundidad", async () => {
    const html = await (await fetch(`${origen}/docs/uno/dos/tres`)).text();
    expect(html).toContain("<h1>docs: uno/dos/tres</h1>");
  });

  it("noExiste() en cargar() da la página 404", async () => {
    const respuesta = await fetch(`${origen}/lenguajes/cobol`);
    expect(respuesta.status).toBe(404);
    expect(await respuesta.text()).toContain("<h1>No existe</h1>");
  });

  it("lo que no es una ruta es la página 404, con su estado", async () => {
    const respuesta = await fetch(`${origen}/no-existe`);
    expect(respuesta.status).toBe(404);
    expect(await respuesta.text()).toContain("<h1>No existe</h1>");
  });
});

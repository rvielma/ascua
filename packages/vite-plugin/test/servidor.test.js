/**
 * La fase 3: `sitio: { modo: "servidor" }`. El build deja un servidor Node
 * que lleva todo dentro y renderiza en cada petición; aquí se construye, se
 * importa y se le piden páginas, por `responder` y por HTTP.
 */

import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

import { build } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PROYECTO = new URL("./fixtures/sitio/", import.meta.url).pathname;
const DIST = join(PROYECTO, "dist-srv");

let modulo;
let servidor;
let origen;

beforeAll(async () => {
  rmSync(DIST, { recursive: true, force: true });
  await build({ root: PROYECTO, configFile: join(PROYECTO, "vite.servidor.config.js"), logLevel: "silent" });
  modulo = await import(join(DIST, "server/index.mjs"));
  servidor = modulo.serve(0);
  await new Promise((listo) => servidor.once("listening", listo));
  origen = `http://localhost:${servidor.address().port}`;
});

afterAll(() => {
  servidor?.close();
  rmSync(DIST, { recursive: true, force: true });
});

describe("vite build en modo servidor", () => {
  it("deja el cliente y un servidor que no necesita nada más", () => {
    expect(existsSync(join(DIST, "server/index.mjs"))).toBe(true);
    expect(existsSync(join(DIST, "client/assets"))).toBe(true);
    // Ninguna página escrita: se renderizan al pedirlas.
    expect(existsSync(join(DIST, "client/index.html"))).toBe(false);
  });

  it("handle: páginas, rutas-archivo y la 404", async () => {
    const inicio = await modulo.handle("/");
    expect(inicio.status).toBe(200);
    expect(inicio.body).toContain('data-ascua-island="contador"');
    expect(inicio.body).toMatch(/<script type="module" src="\/assets\/ascua-client-[\w-]+\.js">/);

    const zig = await modulo.handle("/lenguajes/zig");
    expect(zig.body).toContain('<meta name="description" content="zig tiene 10 años">');
    // Los marcos anidados también viajan en el servidor.
    expect(zig.body).toContain('<section class="lenguajes">');
    expect((await modulo.handle("/docs/x/y")).body).toContain("<h1>docs: x/y</h1>");

    const json = await modulo.handle("/lenguajes.json");
    expect(json.type).toContain("application/json");
    expect(JSON.parse(json.body)).toEqual(["rust", "zig"]);

    const nada = await modulo.handle("/nada");
    expect(nada.status).toBe(404);
    expect(nada.body).toContain("<h1>No existe</h1>");
  });

  it("por HTTP sirve también el script de las islas, cacheable", async () => {
    const pagina = await (await fetch(`${origen}/`)).text();
    const script = /src="(\/assets\/ascua-client-[\w-]+\.js)"/.exec(pagina)[1];
    const respuesta = await fetch(`${origen}${script}`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-type")).toContain("text/javascript");
    expect(respuesta.headers.get("cache-control")).toContain("immutable");

    const noExiste = await fetch(`${origen}/tampoco`);
    expect(noExiste.status).toBe(404);
  });

  it("una ruta variable acepta cualquier valor, y load() decide si existe", async () => {
    const zig = await fetch(`${origen}/lenguajes/zig`);
    expect(zig.status).toBe(200);

    // `throw notFound()` en load(): la página 404, no un error.
    const cobol = await fetch(`${origen}/lenguajes/cobol`);
    expect(cobol.status).toBe(404);
    expect(await cobol.text()).toContain("<h1>No existe</h1>");
  });
});

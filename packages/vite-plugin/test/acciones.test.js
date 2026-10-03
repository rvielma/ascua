/**
 * Acciones de formulario y seguridad: `export const actions` en una ruta,
 * `redirect`, `fail` y `validate`, con la CSP, las cabeceras, las cookies
 * firmadas y la comprobación de origen que pone el kit en `mode: "server"`.
 * Se prueba el servidor construido y el de desarrollo, que comparten código.
 */

import { rmSync } from "node:fs";
import { join } from "node:path";

import { build, createServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { hash } from "ascua-security";

import { field, fields, validate } from "../sitio-comun.js";

const PROYECTO = new URL("./fixtures/acciones/", import.meta.url).pathname;
const DIST = join(PROYECTO, "dist");
const SECRETO = "secreto-de-los-tests-de-acciones-con-32-o-mas";

/** Un POST de formulario, como lo manda un navegador desde la misma página. */
function enviar(origen, ruta, campos, cabeceras = {}) {
  return fetch(`${origen}${ruta}`, {
    method: "POST",
    redirect: "manual",
    headers: { origin: origen, "content-type": "application/x-www-form-urlencoded", ...cabeceras },
    body: new URLSearchParams(campos),
  });
}

/** Lo mismo para cada servidor: el construido y el de desarrollo. */
function comunes(nombre, origenDe, { desarrollo }) {
  describe(nombre, () => {
    it("GET: la página con las cabeceras de seguridad y el hash del script del esqueleto", async () => {
      const respuesta = await fetch(`${origenDe()}/`);
      expect(respuesta.status).toBe(200);
      const cabecera = desarrollo ? "content-security-policy-report-only" : "content-security-policy";
      const csp = respuesta.headers.get(cabecera);
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain(await hash('document.documentElement.dataset.js = "1";'));
      expect(csp).toContain("img-src 'self' data: blob: https://cdn.ejemplo.cl");
      expect(respuesta.headers.get("x-content-type-options")).toBe("nosniff");
      expect(respuesta.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
      expect(respuesta.headers.get("strict-transport-security")).toBeNull();
    });

    it("POST que no vale: 400 y la página con los errores y lo escrito", async () => {
      const respuesta = await enviar(origenDe(), "/", { nombre: "  café  ", cantidad: "1,5" });
      expect(respuesta.status).toBe(400);
      const html = await respuesta.text();
      expect(html).toContain('<p class="error-cantidad">Tiene que ser un número entero</p>');
      expect(html).toContain('<p class="error-nombre"></p>');
      expect(html).toContain('value="  café  "');
      expect(respuesta.headers.get("cache-control")).toBe("private, no-store");
    });

    it("POST que vale: 303 a otra página, sin reenvío al recargar", async () => {
      const respuesta = await enviar(origenDe(), "/", { nombre: "pan", cantidad: "3", urgente: "on" });
      expect(respuesta.status).toBe(303);
      const destino = respuesta.headers.get("location");
      expect(destino).toBe("/gracias?pedido=3%20pan%20urgente");
      expect(await (await fetch(`${origenDe()}${destino}`)).text()).toContain("<h1>Gracias por 3 pan urgente</h1>");
    });

    it("?/nombre elige la acción, y lo que devuelve llega en form", async () => {
      const respuesta = await enviar(origenDe(), "/?/subscribe", { correo: "a@b.cl" });
      expect(respuesta.status).toBe(200);
      expect(await respuesta.text()).toContain('<p class="suscrito">a@b.cl</p>');
      expect((await enviar(origenDe(), "/?/missing", {})).status).toBe(404);
    });

    it("un formulario de otro origen no llega a la acción", async () => {
      const respuesta = await enviar(origenDe(), "/", { nombre: "pan", cantidad: "3" }, { origin: "https://malo.cl" });
      expect(respuesta.status).toBe(403);
    });

    it("sin acciones, POST es 405; otros métodos también", async () => {
      const post = await enviar(origenDe(), "/gracias", {});
      expect(post.status).toBe(405);
      expect(post.headers.get("allow")).toBe("GET, HEAD");
      const put = await fetch(`${origenDe()}/`, { method: "PUT", headers: { origin: origenDe() } });
      expect(put.status).toBe(405);
      expect(put.headers.get("allow")).toBe("GET, HEAD, POST");
    });

    it("cookies firmadas: HttpOnly, SameSite=Lax, y una tocada no vale", async () => {
      const entrar = await enviar(origenDe(), "/sesion", { nombre: "ana" });
      expect(entrar.status).toBe(303);
      const linea = entrar.headers.get("set-cookie");
      expect(linea).toMatch(/^sesion=ana\.[\w-]+; Path=\/; HttpOnly; SameSite=Lax$/);
      const cookie = linea.split(";")[0];

      const dentro = await fetch(`${origenDe()}/sesion`, { headers: { cookie } });
      expect(await dentro.text()).toContain('<p class="quien">ana</p>');

      const tocada = await fetch(`${origenDe()}/sesion`, { headers: { cookie: cookie.replace("ana.", "eva.") } });
      expect(await tocada.text()).toContain('<p class="quien">nadie</p>');

      const salir = await enviar(origenDe(), "/sesion?/logout", {}, { cookie });
      expect(salir.status).toBe(303);
      expect(salir.headers.get("set-cookie")).toMatch(/^sesion=; Path=\/; Max-Age=0/);
    });

    it("load() puede lanzar redirect: sin sesión, a entrar", async () => {
      const fuera = await fetch(`${origenDe()}/panel`, { redirect: "manual" });
      expect(fuera.status).toBe(302);
      expect(fuera.headers.get("location")).toBe("/sesion");

      const entrar = await enviar(origenDe(), "/sesion", { nombre: "ana" });
      const cookie = entrar.headers.get("set-cookie").split(";")[0];
      const dentro = await fetch(`${origenDe()}/panel`, { headers: { cookie }, redirect: "manual" });
      expect(dentro.status).toBe(200);
      expect(await dentro.text()).toContain("<h1>Panel de ana</h1>");
    });

    it("las rutas-archivo y la 404 siguen como antes", async () => {
      const json = await fetch(`${origenDe()}/datos.json`);
      expect(await json.json()).toEqual({ ok: true });
      const nada = await fetch(`${origenDe()}/nada`);
      expect(nada.status).toBe(404);
      expect(await nada.text()).toContain("<h1>No existe</h1>");
    });
  });
}

describe("acciones", () => {
  let modulo;
  let servidor;
  let origen;
  let vite;
  let origenDev;
  let secretoPrevio;

  beforeAll(async () => {
    secretoPrevio = process.env.ASCUA_SECRET;
    process.env.ASCUA_SECRET = SECRETO;
    rmSync(DIST, { recursive: true, force: true });
    await build({ root: PROYECTO, logLevel: "silent" });
    modulo = await import(join(DIST, "server/index.mjs"));
    servidor = modulo.serve(0);
    await new Promise((listo) => servidor.once("listening", listo));
    origen = `http://localhost:${servidor.address().port}`;

    vite = await createServer({ root: PROYECTO, logLevel: "silent", server: { port: 0 } });
    await vite.listen();
    origenDev = `http://localhost:${vite.httpServer.address().port}`;
  });

  afterAll(async () => {
    servidor?.close();
    await vite?.close();
    rmSync(DIST, { recursive: true, force: true });
    if (secretoPrevio === undefined) delete process.env.ASCUA_SECRET;
    else process.env.ASCUA_SECRET = secretoPrevio;
  });

  comunes("servidor construido", () => origen, { desarrollo: false });
  comunes("desarrollo", () => origenDev, { desarrollo: true });

  it("handle acepta un Request, y detrás de un proxy con HTTPS manda HSTS", async () => {
    const respuesta = await modulo.handle(
      new Request("http://127.0.0.1:3000/", { headers: { "x-forwarded-proto": "https" } }),
    );
    expect(respuesta.status).toBe(200);
    expect(respuesta.type).toContain("text/html");
    expect(respuesta.headers["strict-transport-security"]).toBe("max-age=31536000");
    // handle con una URL, como antes.
    expect((await modulo.handle("/gracias")).status).toBe(200);
  });

  it("un cuerpo de más de 1 MiB es un 413", async () => {
    const respuesta = await fetch(`${origen}/`, {
      method: "POST",
      headers: { origin: origen, "content-type": "application/x-www-form-urlencoded" },
      body: `nombre=${"x".repeat(1024 * 1024 + 1)}`,
    });
    expect(respuesta.status).toBe(413);
  });

  it("los archivos de dist/client llevan nosniff", async () => {
    const respuesta = await fetch(`${origen}/robots.txt`);
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("un sitio estático con acciones no se construye", async () => {
    await expect(
      build({ root: PROYECTO, configFile: join(PROYECTO, "vite.estatico.config.js"), logLevel: "silent" }),
    ).rejects.toThrow(/las acciones necesitan un servidor/);
    rmSync(join(PROYECTO, "dist-estatico"), { recursive: true, force: true });
  });
});

describe("validate y field", () => {
  const Esquema = fields({
    nombre: field.text({ max: 3 }),
    correo: field.email(),
    edad: field.optional(field.number({ min: 18 })),
    plan: field.choice(["libre", "pro"]),
    acepta: field.checkbox(),
  });

  it("convierte el texto y junta los errores de todos los campos", async () => {
    const bien = await validate(Esquema, { nombre: " ana ", correo: "a@b.cl", edad: "", plan: "pro", acepta: "on" });
    expect(bien).toEqual({ ok: true, data: { nombre: "ana", correo: "a@b.cl", plan: "pro", acepta: true } });

    const datos = new FormData();
    datos.append("nombre", "anabel");
    datos.append("correo", "no");
    datos.append("edad", "12");
    datos.append("plan", "gratis");
    datos.append("password", "secreta");
    const mal = await validate(Esquema, datos);
    expect(mal.ok).toBe(false);
    expect(mal.errors).toEqual({
      nombre: "Como mucho 3 caracteres",
      correo: "No es un correo válido",
      edad: "Como mínimo 18",
      plan: "Opción no válida",
    });
    expect(mal.values).toEqual({ nombre: "anabel", correo: "no", edad: "12", plan: "gratis" });
  });

  it("sirve cualquier Standard Schema", async () => {
    const propio = {
      "~standard": {
        version: 1,
        vendor: "x",
        validate: (v) => (v.a === "1" ? { value: 1 } : { issues: [{ message: "no", path: [{ key: "a" }] }] }),
      },
    };
    expect(await validate(propio, { a: "1" })).toEqual({ ok: true, data: 1 });
    expect((await validate(propio, { a: "2" })).errors).toEqual({ a: "no" });
  });
});

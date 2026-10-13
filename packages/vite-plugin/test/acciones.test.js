/**
 * Acciones de formulario y seguridad: `export const actions` en una ruta,
 * `redirect`, `fail` y `validate`, con la CSP, las cabeceras, las cookies
 * firmadas y la comprobación de origen que pone el kit en `mode: "server"`.
 * Se prueba el servidor construido y el de desarrollo, que comparten código.
 */

import { execFileSync, spawn } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { createServer as servidorTcp } from "node:net";
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

/** El binario de un runtime: el de la variable de entorno, o el del PATH. */
function binario(nombre, variable) {
  const propio = process.env[variable];
  if (propio) return existsSync(propio) ? propio : null;
  try {
    return execFileSync("which", [nombre], { encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

/** Un puerto libre. */
function puertoLibre() {
  return new Promise((listo) => {
    const s = servidorTcp().listen(0, () => {
      const { port } = s.address();
      s.close(() => listo(port));
    });
  });
}

/** Espera a que responda `origen`. */
async function esperar(origen, proceso) {
  for (let i = 0; i < 100; i++) {
    if (proceso.exitCode !== null) throw new Error(`el proceso terminó con ${proceso.exitCode}`);
    try {
      await fetch(origen);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`${origen} no respondió`);
}

/** La configuración de `workerd`: el manejador, y dist/client como ASSETS. */
const configWorkerd = (puerto) => `using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "main", worker = .sitio),
    (name = "assets", disk = (path = ${JSON.stringify(join(DIST, "client"))}, writable = false)),
  ],
  sockets = [ (name = "http", address = "127.0.0.1:${puerto}", http = (), service = "main") ],
);

const sitio :Workerd.Worker = (
  modules = [ (name = "worker.mjs", esModule = embed "server/worker.mjs") ],
  compatibilityDate = "2026-09-01",
  bindings = [
    (name = "ASSETS", service = "assets"),
    (name = "ASCUA_SECRET", text = ${JSON.stringify(SECRETO)}),
  ],
);
`;

/**
 * Los runtimes además de Node. Cada uno se prueba si está: en el PATH o, para
 * los que no se suelen instalar, en `DENO_BIN` y `WORKERD_BIN`.
 */
const RUNTIMES = [
  { nombre: "Bun", bin: binario("bun", "BUN_BIN"), argumentos: () => ["server/index.mjs"] },
  { nombre: "Deno", bin: binario("deno", "DENO_BIN"), argumentos: () => ["run", "-A", "server/index.mjs"] },
  {
    nombre: "workerd",
    bin: binario("workerd", "WORKERD_BIN"),
    argumentos: (puerto) => {
      writeFileSync(join(DIST, "ascua.capnp"), configWorkerd(puerto));
      return ["serve", "ascua.capnp"];
    },
  },
];

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

    it("con x-ascua-action, una acción responde su resultado en JSON", async () => {
      const comoDatos = { "x-ascua-action": "1" };
      const fallo = await enviar(origenDe(), "/", { nombre: "pan", cantidad: "0" }, comoDatos);
      // El código del `fail` va en el JSON: un 400 se anotaría como error en la consola.
      expect(fallo.status).toBe(200);
      expect(fallo.headers.get("content-type")).toContain("application/json");
      expect(fallo.headers.get("cache-control")).toBe("private, no-store");
      expect(await fallo.json()).toEqual({
        type: "failure",
        status: 400,
        data: { ok: false, errors: { cantidad: "Como mínimo 1" }, values: { nombre: "pan", cantidad: "0" } },
      });

      // La redirección va con un 200: si no, `fetch` la seguiría solo.
      const bien = await enviar(origenDe(), "/", { nombre: "pan", cantidad: "3" }, comoDatos);
      expect(bien.status).toBe(200);
      expect(await bien.json()).toEqual({ type: "redirect", status: 303, location: "/gracias?pedido=3%20pan" });

      const suscrito = await enviar(origenDe(), "/?/subscribe", { correo: "a@b.cl" }, comoDatos);
      expect(await suscrito.json()).toEqual({ type: "success", status: 200, data: { suscrito: "a@b.cl" } });

      const otro = await enviar(origenDe(), "/", {}, { ...comoDatos, origin: "https://malo.cl" });
      expect(otro.status).toBe(403);
      expect(await otro.json()).toEqual({ type: "error", status: 403, message: "Formulario enviado desde otro origen" });

      const ninguna = await enviar(origenDe(), "/?/missing", {}, comoDatos);
      expect((await ninguna.json()).type).toBe("error");
    });

    it("con x-ascua-action, las cookies de la acción también llegan", async () => {
      const entrar = await enviar(origenDe(), "/sesion", { nombre: "ana" }, { "x-ascua-action": "1" });
      expect(await entrar.json()).toEqual({ type: "redirect", status: 303, location: "/sesion" });
      expect(entrar.headers.get("set-cookie")).toMatch(/^sesion=ana\./);
    });

    it("una página con una isla que mejora su formulario", async () => {
      const html = await (await fetch(`${origenDe()}/isla`)).text();
      expect(html).toContain('data-ascua-island="pedido"');
      // Sin JavaScript sigue siendo un formulario corriente; con él, la
      // isla trae `enhance`.
      expect(html).toMatch(/<form[^>]* method="post">/);
      expect(html).toMatch(/<script type="module" src="[^"]+">/);

      // Enviado sin JavaScript, la isla recibe el resultado en su prop `form`
      // y pinta los errores igual.
      const sinJs = await enviar(origenDe(), "/isla", { nombre: "", cantidad: "0" });
      expect(sinJs.status).toBe(400);
      const pintada = await sinJs.text();
      expect(pintada).toContain('class="error-nombre">Obligatorio</p>');
      expect(pintada).toContain('class="error-cantidad">Como mínimo 1</p>');
    });

    it("el middleware de la raíz corre en todas las rutas: cabeceras y redirecciones", async () => {
      const inicio = await fetch(`${origenDe()}/`);
      expect(inicio.headers.get("x-site")).toBe("acciones");
      const nada = await fetch(`${origenDe()}/nada`);
      expect(nada.status).toBe(404);
      expect(nada.headers.get("x-site")).toBe("acciones");

      const viejo = await fetch(`${origenDe()}/viejo`, { redirect: "manual" });
      expect(viejo.status).toBe(301);
      expect(viejo.headers.get("location")).toBe("/gracias?pedido=viejo");
      expect(viejo.headers.get("x-site")).toBe("acciones");
    });

    it("el de una carpeta corta antes de load() y de las acciones, y deja locals", async () => {
      const fuera = await fetch(`${origenDe()}/admin`, { redirect: "manual" });
      expect(fuera.status).toBe(303);
      expect(fuera.headers.get("location")).toBe("/sesion");
      const postFuera = await enviar(origenDe(), "/admin", {}, { "x-ascua-action": "1" });
      expect(await postFuera.json()).toEqual({ type: "redirect", status: 303, location: "/sesion" });

      const entrar = await enviar(origenDe(), "/sesion", { nombre: "ana" });
      const cookie = entrar.headers.get("set-cookie").split(";")[0];
      const dentro = await (await fetch(`${origenDe()}/admin`, { headers: { cookie } })).text();
      // `load()` ve lo de los dos middlewares, y el layout también.
      expect(dentro).toContain("<h1>Admin de ana</h1>");
      expect(dentro).toContain('<p class="visto">/admin</p>');
      expect(dentro).toMatch(/<header[^>]*class="quien-layout"[^>]*>ana<\/header>/);

      const accion = await enviar(origenDe(), "/admin", {}, { cookie, "x-ascua-action": "1" });
      expect(await accion.json()).toEqual({ type: "success", status: 200, data: { hecho: "ana" } });
    });

    it("un middleware con next() envuelve: cambia la respuesta y suma cookies", async () => {
      const r = await fetch(`${origenDe()}/envuelto`);
      expect(r.status).toBe(200);
      expect(r.headers.get("x-envuelto")).toBe("si");
      // El de fuera, que no envuelve, sigue poniendo lo suyo.
      expect(r.headers.get("x-site")).toBe("acciones");
      const cookies = r.headers.getSetCookie().map((c) => c.split(";")[0]);
      expect(cookies).toContain("visita=1");
      expect(cookies).toContain("despues=1");
      // `load()` ve los `locals` del de fuera.
      expect(await r.text()).toContain("<h1>Envuelto /envuelto</h1>");
    });

    it("next() también envuelve la 404 de notFound(), y un error de la ruta se puede capturar", async () => {
      const nada = await fetch(`${origenDe()}/envuelto/perdido`);
      expect(nada.status).toBe(404);
      expect(nada.headers.get("x-envuelto")).toBe("si");
      expect(await nada.text()).toContain("<h1>No existe</h1>");

      const falla = await fetch(`${origenDe()}/envuelto/falla`);
      expect(falla.status).toBe(500);
      expect(falla.headers.get("x-envuelto")).toBe("error");
      expect(await falla.text()).toBe("la ruta falló");
    });

    it("una Response devuelta sin next() corta, con las cabeceras de fuera", async () => {
      const corto = await fetch(`${origenDe()}/envuelto?corto`);
      expect(corto.status).toBe(418);
      expect(await corto.text()).toBe("corto");
      expect(corto.headers.get("x-site")).toBe("acciones");
    });

    it("las acciones también pasan por next()", async () => {
      const r = await enviar(origenDe(), "/envuelto", {}, { "x-ascua-action": "1" });
      // La ruta no tiene acciones: el rechazo pasa por el middleware.
      expect(r.status).toBe(405);
      expect(r.headers.get("x-envuelto")).toBe("si");
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

  for (const runtime of RUNTIMES) {
    describe.skipIf(!runtime.bin)(`en ${runtime.nombre}`, () => {
      let proceso;
      let origenRuntime;
      beforeAll(async () => {
        const puerto = await puertoLibre();
        proceso = spawn(runtime.bin, runtime.argumentos(puerto), {
          cwd: DIST,
          env: { ...process.env, PORT: String(puerto), ASCUA_SECRET: SECRETO },
          stdio: "ignore",
        });
        origenRuntime = `http://localhost:${puerto}`;
        await esperar(origenRuntime, proceso);
      });
      afterAll(() => proceso?.kill());

      comunes("el mismo sitio", () => origenRuntime, { desarrollo: false });

      it("un cuerpo de más de 1 MiB es un 413, y lo de dist/client se sirve", async () => {
        const grande = await enviar(origenRuntime, "/", { nombre: "x".repeat(1024 * 1024 + 1) });
        expect(grande.status).toBe(413);
        expect((await fetch(`${origenRuntime}/robots.txt`)).status).toBe(200);
      });
    });
  }

  it("worker.mjs es portable: no importa nada, y su fetch da un Response", async () => {
    const codigo = (await import("node:fs")).readFileSync(join(DIST, "server/worker.mjs"), "utf8");
    expect(codigo).not.toMatch(/^\s*import\b/m);

    const worker = await import(join(DIST, "server/worker.mjs"));
    const env = { ASCUA_SECRET: SECRETO };
    const pagina = await worker.default.fetch(new Request("http://sitio.cl/"), env);
    expect(pagina).toBeInstanceOf(Response);
    expect(pagina.headers.get("content-security-policy")).toContain("default-src 'self'");

    const formulario = { method: "POST", headers: { origin: "http://sitio.cl", "content-type": "application/x-www-form-urlencoded" } };
    const entrar = await worker.fetch(new Request("http://sitio.cl/sesion", { ...formulario, body: "nombre=ana" }), env);
    expect(entrar.status).toBe(303);
    expect(entrar.headers.get("set-cookie")).toMatch(/^sesion=ana\./);

    // Sin `content-length`, el límite se cuenta leyendo.
    const flujo = new ReadableStream({
      start(control) {
        control.enqueue(new TextEncoder().encode(`nombre=${"x".repeat(1024 * 1024 + 1)}`));
        control.close();
      },
    });
    const grande = await worker.fetch(new Request("http://sitio.cl/", { ...formulario, body: flujo, duplex: "half" }), env);
    expect(grande.status).toBe(413);

    // Con `env.ASSETS`, lo que existe en dist/client lo sirve él.
    const ASSETS = { fetch: async (r) => new Response(new URL(r.url).pathname === "/robots.txt" ? "ok" : "no", { status: new URL(r.url).pathname === "/robots.txt" ? 200 : 404 }) };
    expect(await (await worker.fetch(new Request("http://sitio.cl/robots.txt"), { ...env, ASSETS })).text()).toBe("ok");
    expect((await worker.fetch(new Request("http://sitio.cl/gracias"), { ...env, ASSETS })).status).toBe(200);
  });

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

  it("un sitio estático con middleware no se construye", async () => {
    const proyecto = new URL("./fixtures/middleware-estatico/", import.meta.url).pathname;
    await expect(build({ root: proyecto, logLevel: "silent" })).rejects.toThrow(
      /_middleware\.ts: un middleware necesita un servidor/,
    );
    rmSync(join(proyecto, "dist"), { recursive: true, force: true });
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

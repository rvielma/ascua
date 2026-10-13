/**
 * Métodos propios (`export async function PUT`) y la página de error
 * (`500.ts`), por `responder`, con rutas y módulos de mentira.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { notFound, redirect, responder } from "../sitio-comun.js";
import { descubrir } from "../sitio.js";

afterEach(() => vi.restoreAllMocks());

// Páginas que son texto: basta para ver qué se pinta y con qué marco.
const ascua = {
  renderToString: (fn) => fn(),
  collectStyles: () => "",
  append: (padre, hijo) => padre.push(hijo),
};
const Marco = ({ children }) => {
  const dentro = [];
  children(dentro);
  return `<main>${dentro.join("")}</main>`;
};

const RUTA = { segmentos: ["posts", ":id"], es404: false, archivo: false };
const R404 = { segmentos: [], es404: true, archivo: false };
const R500 = { segmentos: [], es404: false, es500: true, archivo: false };

function atender(modulo, { method = "GET", headers = {}, body, rutas = [RUTA], modulos = {}, middlewares = [] } = {}) {
  return responder({
    peticion: new Request("http://sitio.cl/posts/7", { method, headers, body }),
    camino: "/posts/7",
    rutas,
    cargar: async (ruta) => ({
      modulo: ruta === RUTA ? modulo : modulos[ruta.es404 ? "404" : "500"],
      marcos: [Marco],
      middlewares: ruta === RUTA ? middlewares : [],
    }),
    ascua,
    componer: async (pagina) => pagina.html,
    seguridad: { csp: false },
  });
}

describe("métodos propios", () => {
  const api = {
    GET: ({ params }) => Response.json({ id: params.id }),
    PUT: async ({ request, params }) => Response.json({ id: params.id, ...(await request.json()) }),
    DELETE: () => new Response(null, { status: 204 }),
  };

  it("responde cada método con su función", async () => {
    const leido = await atender(api);
    expect(leido.status).toBe(200);
    expect(JSON.parse(leido.body)).toEqual({ id: "7" });

    const puesto = await atender(api, { method: "PUT", body: JSON.stringify({ titulo: "Hola" }) });
    expect(JSON.parse(puesto.body)).toEqual({ id: "7", titulo: "Hola" });

    expect((await atender(api, { method: "DELETE" })).status).toBe(204);
    expect((await atender(api, { method: "HEAD" })).status).toBe(200);
  });

  it("lo que no exporta es un 405 con lo que sí atiende", async () => {
    const respuesta = await atender(api, { method: "PATCH" });
    expect(respuesta.status).toBe(405);
    expect(respuesta.headers.allow).toBe("GET, HEAD, PUT, DELETE");

    // Sin página ni GET propio, un GET tampoco se atiende.
    const soloEscribe = await atender({ POST: () => new Response("ok") });
    expect(soloEscribe.status).toBe(405);
    expect(soloEscribe.headers.allow).toBe("POST");
  });

  it("conviven con la página y las acciones: el método propio va primero", async () => {
    const modulo = { default: () => "<h1>Post</h1>", actions: { default: () => ({ ok: true }) }, DELETE: () => new Response("fuera") };
    expect((await atender(modulo)).body).toBe("<main><h1>Post</h1></main>");
    expect((await atender(modulo, { method: "DELETE" })).body).toBe("fuera");
    const otro = await atender(modulo, { method: "PUT" });
    expect(otro.headers.allow).toBe("GET, HEAD, POST, DELETE");
  });

  it("los que escriben solo desde el mismo origen; sin Origin (un servidor, curl) pasan", async () => {
    const ajeno = await atender(api, { method: "DELETE", headers: { origin: "https://malo.cl" } });
    expect(ajeno.status).toBe(403);
    expect((await atender(api, { method: "DELETE", headers: { origin: "http://sitio.cl" } })).status).toBe(204);
    expect((await atender(api, { method: "DELETE" })).status).toBe(204);
    // Leer no cambia nada: da igual de dónde venga.
    expect((await atender(api, { headers: { origin: "https://malo.cl" } })).status).toBe(200);
  });

  it("reciben locals y cookies, y lo de setHeaders se añade", async () => {
    const respuesta = await atender(
      {
        GET: ({ locals, cookies }) => {
          cookies.set("visto", "1");
          return Response.json({ usuario: locals.usuario });
        },
      },
      {
        middlewares: [
          ({ locals, setHeaders }) => {
            locals.usuario = "ana";
            setHeaders({ "x-servido-por": "ascua" });
          },
        ],
      },
    );
    expect(JSON.parse(respuesta.body)).toEqual({ usuario: "ana" });
    expect(respuesta.headers["x-servido-por"]).toBe("ascua");
    expect(String(respuesta.headers["set-cookie"])).toContain("visto=1");
  });

  it("redirect y notFound funcionan como en load()", async () => {
    const lejos = await atender({ GET: () => redirect("/login") });
    expect(lejos.status).toBe(303);
    expect(lejos.headers.location).toBe("/login");

    const falta = await atender(
      {
        GET: () => {
          throw notFound();
        },
      },
      { rutas: [RUTA, R404], modulos: { 404: { default: () => "<h1>No está</h1>" } } },
    );
    expect(falta.status).toBe(404);
    expect(falta.body).toBe("<main><h1>No está</h1></main>");
  });

  it("devolver otra cosa que un Response es un error de quien lo escribió", async () => {
    await expect(atender({ GET: () => ({ id: 7 }) })).rejects.toThrow(/Response/);
  });
});

describe("500.ts", () => {
  const falla = {
    load() {
      throw new Error("la base de datos no responde");
    },
    default: () => "<h1>Post</h1>",
  };
  const conError = {
    rutas: [RUTA, R500],
    modulos: { 500: { default: ({ error }) => `<h1>Algo falló</h1><p>${error.message}</p>`, title: "Error" } },
  };

  it("un error sin capturar pinta la página de error, con su marco y el error en props", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const respuesta = await atender(falla, conError);
    expect(respuesta.status).toBe(500);
    expect(respuesta.body).toBe("<main><h1>Algo falló</h1><p>la base de datos no responde</p></main>");
    expect(respuesta.headers["cache-control"]).toBe("no-store");
    expect(console.error).toHaveBeenCalled();
  });

  it("sin 500.ts, el error sigue como antes", async () => {
    await expect(atender(falla)).rejects.toThrow("la base de datos no responde");
  });

  it("un método propio o enhance() no reciben una página: el error sigue", async () => {
    const api = {
      GET: () => {
        throw new Error("api rota");
      },
    };
    await expect(atender(api, conError)).rejects.toThrow("api rota");

    const accion = {
      default: () => "<form></form>",
      actions: {
        default() {
          throw new Error("acción rota");
        },
      },
    };
    const deEnhance = atender(accion, { ...conError, method: "POST", headers: { "x-ascua-action": "1" }, body: new URLSearchParams() });
    await expect(deEnhance).rejects.toThrow("acción rota");
  });

  it("si la página de error también falla, el error que sale es el primero", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const rota = {
      ...conError,
      modulos: {
        500: {
          default() {
            throw new Error("la de error también");
          },
        },
      },
    };
    await expect(atender(falla, rota)).rejects.toThrow("la base de datos no responde");
  });
});

describe("descubrir", () => {
  it("500.ts en la raíz es la página de error, no una URL", () => {
    const dir = mkdtempSync(join(tmpdir(), "ascua-rutas-"));
    try {
      mkdirSync(join(dir, "posts"));
      for (const archivo of ["index.ts", "500.ts", "posts/500.ts"]) writeFileSync(join(dir, archivo), "export default () => null;");
      const { rutas } = descubrir(dir);
      expect(rutas.filter((r) => r.es500).map((r) => r.modulo)).toEqual([join(dir, "500.ts")]);
      // Dentro de una carpeta, 500.ts es una página más: /posts/500.
      expect(rutas.some((r) => r.segmentos.join("/") === "posts/500")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

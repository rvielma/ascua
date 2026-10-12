/**
 * Los mensajes del kit en inglés: `site.lang` para quien usa el sitio, `LANG`
 * para quien lo desarrolla. Lo de `enhance()`, que sigue el `lang` de la
 * página, está en `form.test.js`.
 */

import { afterEach, expect, it, vi } from "vitest";

import { fijarIdioma, paraDesarrollo } from "../mensajes.js";
import { field, fields, responder, validate } from "../sitio-comun.js";

afterEach(() => {
  fijarIdioma("es");
  vi.unstubAllEnvs();
});

const Pedido = fields({ correo: field.email(), cantidad: field.number({ min: 1, integer: true }), nombre: field.text({ max: 3 }) });
const datos = { correo: "x", cantidad: "1,5", nombre: "largo" };

it("la validación habla el idioma del sitio", async () => {
  expect((await validate(Pedido, datos)).errors).toEqual({
    correo: "No es un correo válido",
    cantidad: "Tiene que ser un número entero",
    nombre: "Como mucho 3 caracteres",
  });
  fijarIdioma("en");
  expect((await validate(Pedido, datos)).errors).toEqual({
    correo: "Not a valid email",
    cantidad: "Must be a whole number",
    nombre: "At most 3 characters",
  });
  // `message` sigue mandando sobre los dos.
  const conPropio = fields({ correo: field.email({ message: "¡Revisa el correo!" }) });
  expect((await validate(conPropio, { correo: "x" })).errors.correo).toBe("¡Revisa el correo!");
});

it("las respuestas del kit también", async () => {
  fijarIdioma("en");
  const respuesta = await responder({
    peticion: new Request("http://sitio.cl/", { method: "POST", headers: { origin: "https://malo.cl" }, body: new URLSearchParams() }),
    camino: "/",
    rutas: [{ segmentos: [], es404: false, archivo: false }],
    cargar: async () => ({ modulo: { actions: { default() {} }, default: () => null }, marcos: [] }),
    ascua: {},
    componer: async () => "",
  });
  expect(respuesta.status).toBe(403);
  expect(respuesta.body).toBe("Form sent from another origin");
});

it("lo de quien desarrolla sigue a LANG", () => {
  vi.stubEnv("LANG", "en_US.UTF-8");
  expect(paraDesarrollo().sinRutas("src/routes")).toBe("ascua: no routes in src/routes/");
  expect(paraDesarrollo().construido(1, 2, "dist")).toBe("ascua: 1 page and 2 files in dist/");
  vi.stubEnv("LANG", "es_CL.UTF-8");
  expect(paraDesarrollo().construido(3, 0, "dist")).toBe("ascua: 3 páginas en dist/");
});

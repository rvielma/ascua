// @vitest-environment happy-dom
/**
 * `enhance()`: el formulario se envía con `fetch`, con la cabecera que pide
 * JSON, y el resultado queda en signals.
 */

import { afterEach, expect, it, vi } from "vitest";

import { enhance, formResult } from "../form.js";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

/** Un formulario en el documento y un `fetch` que responde `cuerpo`. */
function preparar(html, cuerpo, status = 200) {
  document.body.innerHTML = html;
  const form = document.querySelector("form");
  const fetch = vi.fn(async () => new Response(JSON.stringify(cuerpo), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  return { form, fetch };
}

/** Lo que hace el navegador al enviar: un `SubmitEvent` con su botón. */
function enviar(form, submitter = null) {
  const evento = new Event("submit", { bubbles: true, cancelable: true });
  Object.defineProperty(evento, "submitter", { value: submitter });
  Object.defineProperty(evento, "target", { value: form });
  return evento;
}

it("un fallo deja su data en result, sin recargar ni vaciar el formulario", async () => {
  const datos = { ok: false, errors: { nombre: "Obligatorio" }, values: {} };
  const { form, fetch } = preparar(`<form method="post"><input name="nombre" value="x"></form>`, { type: "failure", status: 400, data: datos }, 400);
  const pedido = enhance();

  const evento = enviar(form);
  const enviado = pedido.submit(evento);
  expect(evento.defaultPrevented).toBe(true);
  expect(pedido.pending()).toBe(true);
  await enviado;

  expect(pedido.pending()).toBe(false);
  expect(pedido.result()).toEqual(datos);
  expect(pedido.status()).toBe(400);
  expect(form.querySelector("input").value).toBe("x");

  const [, opciones] = fetch.mock.calls[0];
  expect(opciones.method).toBe("POST");
  expect(opciones.headers["x-ascua-action"]).toBe("1");
  expect(opciones.body.get("nombre")).toBe("x");
});

it("una acción que sale bien vacía el formulario y avisa", async () => {
  const { form } = preparar(`<form method="post"><input name="nombre" value="x"></form>`, { type: "success", status: 200, data: { id: 7 } });
  const onSuccess = vi.fn();
  const pedido = enhance({ onSuccess });
  form.querySelector("input").value = "escrito";

  await pedido.submit(enviar(form));
  expect(pedido.result()).toEqual({ id: 7 });
  expect(onSuccess).toHaveBeenCalledWith({ id: 7 });
  expect(form.querySelector("input").value).toBe("x");
});

it("el botón que lo envió cuenta: su formaction elige la acción, y su name va en los datos", async () => {
  const { form, fetch } = preparar(
    `<form method="post"><button name="como" value="rapido" formaction="?/fast">Ir</button></form>`,
    { type: "success", status: 200, data: null },
  );
  const boton = form.querySelector("button");
  await enhance().submit(enviar(form, boton));

  const [destino, opciones] = fetch.mock.calls[0];
  expect(String(destino)).toMatch(/\?\/fast$/);
  expect(opciones.body.get("como")).toBe("rapido");
});

it("una redirección navega, salvo que onRedirect diga que no", async () => {
  const { form } = preparar(`<form method="post"></form>`, { type: "redirect", status: 303, location: "/gracias" });
  const onRedirect = vi.fn(() => false);
  await enhance({ onRedirect }).submit(enviar(form));
  expect(onRedirect).toHaveBeenCalledWith("/gracias");
});

it("un rechazo o una red caída quedan en error", async () => {
  const { form } = preparar(`<form method="post"></form>`, { type: "error", status: 403, message: "Formulario enviado desde otro origen" }, 403);
  const pedido = enhance();
  await pedido.submit(enviar(form));
  expect(pedido.error()).toBe("Formulario enviado desde otro origen");
  expect(pedido.status()).toBe(403);

  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("sin red"); }));
  await pedido.submit(enviar(form));
  expect(pedido.error()).toBe("No se pudo enviar el formulario");
});

it("un formulario GET lo envía el navegador, y no se envía dos veces a la vez", async () => {
  const { form, fetch } = preparar(`<form method="get"></form>`, {});
  const evento = enviar(form);
  await enhance().submit(evento);
  expect(evento.defaultPrevented).toBe(false);
  expect(fetch).not.toHaveBeenCalled();

  form.setAttribute("method", "post");
  const pedido = enhance();
  const primero = pedido.submit(enviar(form));
  const segundo = enviar(form);
  await pedido.submit(segundo);
  await primero;
  expect(segundo.defaultPrevented).toBe(true);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("formResult acepta el resultado de una acción o nada", () => {
  const { validate } = formResult()["~standard"];
  expect(validate(undefined)).toEqual({ value: undefined });
  expect(validate({ ok: false })).toEqual({ value: { ok: false } });
  expect(validate("x").issues).toHaveLength(1);
});

it("sus mensajes siguen el lang de la página", async () => {
  const { form } = preparar(`<form method="post"></form>`, {});
  vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("sin red"); }));
  const pedido = enhance();
  document.documentElement.lang = "en";
  await pedido.submit(enviar(form));
  expect(pedido.error()).toBe("The form could not be sent");
  document.documentElement.lang = "es";
  await pedido.submit(enviar(form));
  expect(pedido.error()).toBe("No se pudo enviar el formulario");
  document.documentElement.lang = "";
});

/**
 * Formularios mejorados desde una isla: el mismo `<form method="post">`, que
 * sin JavaScript se envía como siempre, pero que con la isla hidratada se
 * envía con `fetch` y muestra el resultado sin recargar la página.
 *
 * Corre en el navegador: no importa nada del servidor.
 */

import { signal } from "ascua";

/** Los mensajes propios, en el idioma de la página: `<html lang="en">` o español. */
const enIngles = () => typeof document !== "undefined" && /^en\b/i.test(document.documentElement.lang);
const respondio = (status) => (enIngles() ? `The server answered ${status}` : `El servidor respondió ${status}`);
const sinRed = () => (enIngles() ? "The form could not be sent" : "No se pudo enviar el formulario");

/** La cabecera que pide el resultado en JSON. La misma que en `sitio-comun.js`. */
const CABECERA_ACCION = "x-ascua-action";

/**
 * Mejora un formulario. `submit` va en su `onsubmit`; `pending`, `result`,
 * `error` y `status` se leen en la plantilla.
 *
 * ```ts
 * const order = enhance({ initial: props.form });
 * view`<form method="post" onsubmit=${order.submit}>
 *   <p class="error">${() => order.result()?.errors?.product ?? ""}</p>
 *   <button disabled=${() => order.pending()}>Pedir</button>
 * </form>`;
 * ```
 */
export function enhance(options = {}) {
  const pending = signal(false);
  const result = signal(options.initial);
  const error = signal(undefined);
  const status = signal(undefined);

  async function submit(event) {
    // `target` y no `currentTarget`: con los eventos delegados, este último
    // solo vale mientras dura el reparto, y aquí se lee después de un await.
    const form = event.target;
    if (typeof HTMLFormElement === "undefined" || !(form instanceof HTMLFormElement)) return;
    const submitter = event.submitter ?? null;
    const metodo = (submitter?.getAttribute("formmethod") ?? form.getAttribute("method") ?? "get").toLowerCase();
    // Un GET —un buscador— lo hace mejor el navegador: deja la URL compartible.
    if (metodo !== "post") return;
    event.preventDefault();
    if (pending.peek()) return;

    const destino = submitter?.hasAttribute("formaction") ? submitter.formAction : form.action;
    let datos;
    try {
      // Con el botón que lo envió: su `name` y su `value` también cuentan.
      datos = new FormData(form, submitter);
    } catch {
      datos = new FormData(form);
    }

    pending.set(true);
    error.set(undefined);
    try {
      const respuesta = await fetch(destino, {
        method: "POST",
        body: datos,
        headers: { [CABECERA_ACCION]: "1", accept: "application/json" },
        credentials: "same-origin",
      });
      const cuerpo = await respuesta.json().catch(() => null);
      status.set(cuerpo?.status ?? respuesta.status);

      switch (cuerpo?.type) {
        case "redirect":
          if (options.onRedirect?.(cuerpo.location) !== false) location.assign(cuerpo.location);
          break;
        case "success":
          result.set(cuerpo.data ?? undefined);
          if (options.reset !== false) form.reset();
          options.onSuccess?.(cuerpo.data ?? undefined);
          break;
        case "failure":
          result.set(cuerpo.data ?? undefined);
          break;
        default:
          error.set(cuerpo?.message ?? respondio(respuesta.status));
      }
    } catch {
      error.set(sinRed());
    } finally {
      pending.set(false);
    }
  }

  return {
    submit,
    pending: () => pending(),
    result: () => result(),
    error: () => error(),
    status: () => status(),
  };
}

/**
 * El esquema del prop `form` de una isla: lo que devolvió la acción cuando
 * el formulario se envió sin JavaScript, para mostrar sus errores igual.
 */
export function formResult() {
  return {
    "~standard": {
      version: 1,
      vendor: "ascua",
      validate: (valor) =>
        valor === undefined || (typeof valor === "object" && valor !== null)
          ? { value: valor }
          : { issues: [{ message: "Se esperaba el resultado de un formulario" }] },
    },
  };
}

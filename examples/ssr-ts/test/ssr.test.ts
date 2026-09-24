/**
 * La aplicación entera, del servidor al cliente: `render` produce el HTML, el
 * documento lo lee como lo leería el navegador y `hydrate` lo adopta.
 */

import { hydrate } from "ascua";
import { afterEach, describe, expect, it } from "vitest";

import { render } from "../src/entrada-servidor.js";
import { ISLAS } from "../src/islas/index.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function servir(url: string) {
  const respuesta = render(url);
  document.body.innerHTML = respuesta.html;
  return respuesta;
}

describe("render", () => {
  it("elige la página por la ruta, con o sin barra final y query", () => {
    expect(render("/").titulo).toBe("Inicio · Ascua");
    expect(render("/lenguajes/?orden=año").titulo).toBe("Lenguajes · Ascua");
    expect(render("/nada").estado).toBe(404);
  });

  it("las páginas son HTML completo sin JavaScript", () => {
    servir("/lenguajes");
    expect(document.querySelectorAll("li")).toHaveLength(14);
    expect(document.querySelector("[aria-current=page]")!.textContent).toBe("Lenguajes");
    // Lo que no es isla no lleva números: no hay nada que hidratar ahí.
    expect(document.querySelector("header")!.outerHTML).not.toContain("data-ascua-h");
  });

  it("escapa lo que viene de la URL", () => {
    const { html } = render("/<script>alert(1)</script>");
    expect(html).not.toContain("<script>");
  });
});

describe("hydrate", () => {
  it("adopta el contador y lo deja vivo", () => {
    servir("/");
    const salida = document.querySelector("output")!;

    const { adoptados, creados } = hydrate(ISLAS);
    expect(creados).toBe(0);
    expect(adoptados).toBe(4);

    (document.querySelector("[aria-label=sumar]") as HTMLElement).click();
    expect(document.querySelector("output")).toBe(salida);
    expect(salida.textContent).toBe("4");
  });

  it("el buscador filtra los mismos <li> que pintó el servidor", () => {
    servir("/lenguajes");
    const rust = [...document.querySelectorAll("li")].find((li) => li.textContent!.startsWith("Rust"));

    const { creados } = hydrate(ISLAS);
    expect(creados).toBe(0);

    const campo = document.querySelector("input")!;
    campo.value = "ru";
    campo.dispatchEvent(new Event("input"));

    expect([...document.querySelectorAll("li")]).toEqual([rust]);
    expect(document.querySelector(".nota")!.textContent).toBe("1 de 14");
    expect(document.body.innerHTML).not.toContain("data-ascua-h");
  });
});

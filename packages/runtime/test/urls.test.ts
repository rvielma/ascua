/**
 * Una URL `javascript:` que llega por un hueco no se escribe tal cual: sería
 * una XSS en cuanto alguien hace clic. Se bloquea, como en React 19.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { attribute, element, property, staticAttribute } from "../src/dom.js";
import { root, signal } from "../src/reactivo.js";
import { renderToString } from "../src/server.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const peligrosas = [
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  " javascript:alert(1)",
  "\u0001javascript:alert(1)",
  "java\tscript:alert(1)",
  "java\nscript:alert(1)",
];

describe("URLs javascript:", () => {
  it("se bloquean en href, src, action y formaction", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const url of peligrosas) {
      for (const nombre of ["href", "src", "action", "formaction", "xlink:href"]) {
        const nodo = element("a");
        staticAttribute(nodo, nombre, url);
        expect(nodo.getAttribute(nombre), `${nombre}=${JSON.stringify(url)}`).toMatch(/^javascript:throw /);
      }
    }
    expect(error).toHaveBeenCalled();
  });

  it("un atributo reactivo se bloquea cada vez que cambia, y lo seguro pasa", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const url = signal("https://flow.cl/pay/1");
    const nodo = element("a");
    root(() => attribute(nodo, "href", () => url()));
    expect(nodo.getAttribute("href")).toBe("https://flow.cl/pay/1");
    url.set("javascript:alert(document.cookie)");
    expect(nodo.getAttribute("href")).toMatch(/^javascript:throw /);
    url.set("/pagos?id=1");
    expect(nodo.getAttribute("href")).toBe("/pagos?id=1");
  });

  it("lo que no es una URL ejecutable no se toca", () => {
    const nodo = element("a");
    staticAttribute(nodo, "title", "javascript:alert(1)");
    staticAttribute(nodo, "href", "mailto:hola@asiste.run");
    expect(nodo.getAttribute("title")).toBe("javascript:alert(1)");
    expect(nodo.getAttribute("href")).toBe("mailto:hola@asiste.run");
  });

  it("también con prop:", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const nodo = element("a");
    root(() => property(nodo, "href", () => "javascript:alert(1)"));
    expect(nodo.getAttribute("href") ?? (nodo as HTMLAnchorElement).href).toMatch(/^javascript:throw /);
  });

  it("y en el HTML que sale del servidor", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(() => {
      const a = element("a");
      staticAttribute(a, "href", "javascript:alert(1)");
      return a;
    });
    expect(html).not.toContain("alert(1)");
    expect(html).toContain("javascript:throw");
  });
});

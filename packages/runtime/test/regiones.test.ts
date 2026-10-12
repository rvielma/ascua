/**
 * Regiones sueltas: un `<Show>` o un `<For>` directamente en la rama de otro,
 * sin un elemento que los contenga. Así es como lo emite el compilador: la
 * rama devuelve una función que se coloca con el padre real.
 */

import { afterEach, describe, expect, it } from "vitest";

import { append, element, hydrate, island, list, mount, show, text, type Region } from "../src/dom.js";
import { signal } from "../src/reactivo.js";
import { renderToString } from "../src/server.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function li(contenido: string): HTMLLIElement {
  const nodo = element("li");
  append(nodo, text(contenido));
  return nodo;
}

/**
 * `<ul><Show when=abierto><li>antes</li><Show when=detalle><li>detalle</li></Show><li>después</li>
 *  <Else><For each=items …/></Else></Show></ul>`
 */
function Lista(estado: { abierto: () => boolean; detalle: () => boolean; items: () => string[] }) {
  const ul = element("ul");
  show(
    ul,
    estado.abierto,
    (abierto) => {
      if (abierto) {
        const detalle: Region = (padre, antes) =>
          show(padre, estado.detalle, (si) => (si ? li("detalle") : null), antes);
        return [li("antes"), detalle, li("después")];
      }
      const filas: Region = (padre, antes) => list(padre, estado.items, (s) => s, (s) => li(s), antes);
      return filas;
    },
  );
  return ul;
}

const textos = (raiz: ParentNode) => [...raiz.querySelectorAll("li")].map((n) => n.textContent).join(",");

describe("regiones sueltas en una rama", () => {
  it("se colocan en su sitio y siguen a su condición", () => {
    const abierto = signal(true);
    const detalle = signal(false);
    const items = signal(["a", "b"]);
    const raiz = element("div");
    document.body.appendChild(raiz);
    mount(raiz, () => Lista({ abierto, detalle, items }));

    expect(textos(raiz)).toBe("antes,después");
    detalle.set(true);
    expect(textos(raiz)).toBe("antes,detalle,después");
    detalle.set(false);
    expect(textos(raiz)).toBe("antes,después");
  });

  it("al cerrarse la rama se llevan su contenido, aunque haya cambiado", () => {
    const abierto = signal(true);
    const detalle = signal(true);
    const items = signal(["a", "b"]);
    const raiz = element("div");
    document.body.appendChild(raiz);
    mount(raiz, () => Lista({ abierto, detalle, items }));

    abierto.set(false);
    expect(textos(raiz)).toBe("a,b");
    // El `<Show>` interior ya no existe: cambiarlo no toca nada.
    detalle.set(false);
    detalle.set(true);
    expect(textos(raiz)).toBe("a,b");

    items.set(["b", "c", "a"]);
    expect(textos(raiz)).toBe("b,c,a");

    abierto.set(true);
    expect(textos(raiz)).toBe("antes,detalle,después");
    // Solo quedan los marcadores de las regiones vivas: el de fuera y el de dentro.
    const comentarios = [...raiz.querySelector("ul")!.childNodes].filter((n) => n.nodeType === 8);
    expect(comentarios).toHaveLength(2);
  });

  it("se renderizan en el servidor y se hidratan sin crear nada", () => {
    const html = renderToString(() => {
      const main = element("main");
      append(
        main,
        island("lista", () => Lista({ abierto: () => true, detalle: () => true, items: () => [] }), ""),
      );
      return main;
    });
    expect(html).toContain("antes");
    document.body.innerHTML = html;
    const antes = [...document.querySelectorAll("li")];

    const abierto = signal(true);
    const detalle = signal(true);
    const items = signal<string[]>(["x"]);
    const { created } = hydrate({ lista: () => Lista({ abierto, detalle, items }) });

    expect(created).toBe(0);
    expect([...document.querySelectorAll("li")]).toEqual(antes);
    expect(textos(document)).toBe("antes,detalle,después");

    detalle.set(false);
    expect(textos(document)).toBe("antes,después");
    abierto.set(false);
    expect(textos(document)).toBe("x");
  });
});

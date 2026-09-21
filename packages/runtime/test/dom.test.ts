/**
 * Las operaciones de DOM.
 *
 * Lo que se comprueba no es solo que el DOM acabe bien, sino **cómo**: que el
 * nodo que se actualiza sea el mismo de antes, que reordenar mueva en vez de
 * reconstruir, y que desmontar no deje listeners vivos.
 */

import { describe, expect, it } from "vitest";

import { append, attribute, dynamicText, element, list, mount, on, show, text } from "../src/dom.js";
import { onCleanup, signal } from "../src/reactivo.js";

function escenario(): HTMLElement {
  document.body.innerHTML = "";
  const raiz = element("div");
  document.body.appendChild(raiz);
  return raiz;
}

describe("texto", () => {
  it("actualiza el nodo, no lo sustituye", () => {
    const raiz = escenario();
    const count = signal(0);

    const desmontar = mount(raiz, () => {
      const p = element("p");
      append(p, dynamicText(() => `Clicks: ${count()}`));
      return p;
    });

    const parrafo = raiz.querySelector("p")!;
    const nodoDeTexto = parrafo.firstChild;
    expect(parrafo.textContent).toBe("Clicks: 0");

    count.set(7);
    expect(parrafo.textContent).toBe("Clicks: 7");
    expect(parrafo.firstChild).toBe(nodoDeTexto); // el mismo objeto del DOM
    expect(raiz.querySelector("p")).toBe(parrafo);

    desmontar();
    expect(raiz.innerHTML).toBe("");
  });
});

describe("atributos", () => {
  it("se ponen y se quitan", () => {
    const raiz = escenario();
    const bloqueado = signal(true);

    mount(raiz, () => {
      const boton = element("button");
      attribute(boton, "disabled", () => bloqueado());
      attribute(boton, "class", () => (bloqueado() ? "inactivo" : "activo"));
      return boton;
    });

    const boton = raiz.querySelector("button")!;
    expect(boton.getAttribute("disabled")).toBe("");
    expect(boton.getAttribute("class")).toBe("inactivo");

    bloqueado.set(false);
    expect(boton.hasAttribute("disabled")).toBe(false);
    expect(boton.getAttribute("class")).toBe("activo");
  });
});

describe("eventos", () => {
  it("reaccionan y se quitan al desmontar", () => {
    const raiz = escenario();
    const count = signal(0);

    const desmontar = mount(raiz, () => {
      const boton = element("button");
      append(boton, dynamicText(() => count()));
      on(boton, "click", () => count.update((c) => c + 1));
      return boton;
    });

    const boton = raiz.querySelector("button")!;
    boton.click();
    boton.click();
    expect(count()).toBe(2);
    expect(boton.textContent).toBe("2");

    // El nodo se guarda antes de desmontar para poder seguir pulsándolo.
    desmontar();
    boton.click();
    expect(count()).toBe(2);
  });
});

describe("show", () => {
  it("sustituye el contenido al cambiar la condición", () => {
    const raiz = escenario();
    const dentro = signal(false);

    mount(raiz, () => {
      const div = element("div");
      show(
        div,
        () => dentro(),
        (visible) => {
          const p = element("p");
          append(p, text(visible ? "Hola" : "Inicia sesión"));
          return p;
        },
      );
      return div;
    });

    expect(raiz.textContent).toBe("Inicia sesión");
    dentro.set(true);
    expect(raiz.textContent).toBe("Hola");
  });

  it("no reconstruye si la condición no cambia de valor", () => {
    const raiz = escenario();
    const count = signal(0);
    let construcciones = 0;

    mount(raiz, () => {
      const div = element("div");
      show(
        div,
        () => count() > 2,
        () => {
          construcciones++;
          return element("p");
        },
      );
      return div;
    });

    expect(construcciones).toBe(1);

    count.set(1);
    count.set(2);
    expect(construcciones).toBe(1); // el booleano no cambió

    count.set(3);
    expect(construcciones).toBe(2);
  });
});

describe("list", () => {
  it("inserta, borra y reordena", () => {
    const raiz = escenario();
    const items = signal([1, 2, 3]);

    mount(raiz, () => {
      const ul = element("ul");
      list(
        ul,
        () => items(),
        (n) => n,
        (n) => {
          const li = element("li");
          append(li, text(String(n)));
          return li;
        },
      );
      return ul;
    });

    const textos = () => [...raiz.querySelectorAll("li")].map((li) => li.textContent).join(",");

    expect(textos()).toBe("1,2,3");

    items.set([1, 2, 3, 4]);
    expect(textos()).toBe("1,2,3,4");

    items.set([0, 1, 2, 3, 4]);
    expect(textos()).toBe("0,1,2,3,4");

    items.set([0, 4, 2]);
    expect(textos()).toBe("0,4,2");

    items.set([]);
    expect(textos()).toBe("");
  });

  it("conserva la identidad de los nodos al reordenar", () => {
    const raiz = escenario();
    const items = signal([1, 2, 3]);
    let construcciones = 0;

    mount(raiz, () => {
      const ul = element("ul");
      list(
        ul,
        () => items(),
        (n) => n,
        (n) => {
          construcciones++;
          const li = element("li");
          append(li, text(String(n)));
          return li;
        },
      );
      return ul;
    });

    const antes = new Map(
      [...raiz.querySelectorAll("li")].map((li) => [li.textContent, li] as const),
    );
    expect(construcciones).toBe(3);

    items.set([3, 1, 2]);

    const despues = [...raiz.querySelectorAll("li")];
    expect(despues.map((li) => li.textContent).join(",")).toBe("3,1,2");
    for (const li of despues) {
      expect(li).toBe(antes.get(li.textContent));
    }
    expect(construcciones).toBe(3); // ni uno nuevo: se movieron
  });

  it("libera el scope de los items borrados", () => {
    const raiz = escenario();
    const items = signal([1, 2, 3]);
    const limpiados: number[] = [];

    const desmontar = mount(raiz, () => {
      const ul = element("ul");
      list(
        ul,
        () => items(),
        (n) => n,
        (n) => {
          onCleanup(() => limpiados.push(n));
          const li = element("li");
          append(li, text(String(n)));
          return li;
        },
      );
      return ul;
    });

    items.set([1, 3]);
    expect(limpiados).toEqual([2]); // solo el borrado
    expect(raiz.querySelectorAll("li").length).toBe(2);

    desmontar();
    expect([...limpiados].sort()).toEqual([1, 2, 3]); // y al desmontar, el resto
  });
});

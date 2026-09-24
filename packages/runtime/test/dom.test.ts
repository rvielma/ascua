/**
 * Las operaciones de DOM.
 *
 * Lo que se comprueba no es solo que el DOM acabe bien, sino **cómo**: que el
 * nodo que se actualiza sea el mismo de antes, que reordenar mueva en vez de
 * reconstruir, y que desmontar no deje listeners vivos.
 */

import { describe, expect, it, vi } from "vitest";

import { append, attribute, dynamicText, element, list, mount, on, show, text } from "../src/dom.js";
import { currentScope, onCleanup, root, signal } from "../src/reactivo.js";

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

describe("list: lo que cuesta reordenar", () => {
  /** Monta una lista de números y devuelve cómo cambiarla y qué mirar. */
  function montarLista(inicial: number[]) {
    const padre = element("ul");
    const items = signal(inicial);
    mount(document.body, () => {
      list(
        padre,
        () => items(),
        (n) => n,
        (n) => {
          const li = element("li");
          append(li, text(String(n)));
          return li;
        },
      );
      return padre;
    });
    const movimientos = vi.spyOn(padre, "insertBefore");
    const contenido = () => [...padre.children].map((li) => Number(li.textContent));
    const nodo = (n: number) => [...padre.children].find((li) => li.textContent === String(n));
    return { items, movimientos, contenido, nodo, padre };
  }

  const mil = Array.from({ length: 1000 }, (_, i) => i);

  it("intercambiar dos de mil son dos movimientos", () => {
    const { items, movimientos, contenido } = montarLista(mil);
    movimientos.mockClear();

    const nueva = mil.slice();
    [nueva[1], nueva[998]] = [nueva[998]!, nueva[1]!];
    items.set(nueva);

    expect(contenido()).toEqual(nueva);
    expect(movimientos).toHaveBeenCalledTimes(2);
  });

  it("mover uno al final es un movimiento", () => {
    const { items, movimientos, contenido } = montarLista(mil);
    movimientos.mockClear();

    const nueva = [...mil.slice(1), 0];
    items.set(nueva);

    expect(contenido()).toEqual(nueva);
    expect(movimientos).toHaveBeenCalledTimes(1);
  });

  it("invertir mueve todo menos uno", () => {
    const { items, movimientos, contenido } = montarLista([1, 2, 3, 4, 5]);
    movimientos.mockClear();

    items.set([5, 4, 3, 2, 1]);
    expect(contenido()).toEqual([5, 4, 3, 2, 1]);
    // La subsecuencia creciente más larga de una lista invertida mide uno.
    expect(movimientos).toHaveBeenCalledTimes(4);
  });

  it("barajar al azar deja el orden bien y conserva cada nodo", () => {
    const { items, contenido, nodo } = montarLista(mil);
    const antes = new Map(mil.map((n) => [n, nodo(n)]));

    // Un generador con semilla: si falla, falla siempre igual.
    let semilla = 42;
    const azar = () => (semilla = (semilla * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

    for (let vuelta = 0; vuelta < 20; vuelta++) {
      const nueva = mil.slice().sort(() => azar() - 0.5);
      items.set(nueva);
      expect(contenido()).toEqual(nueva);
    }
    for (const n of mil) expect(nodo(n)).toBe(antes.get(n));
  });

  it("mezclar altas, bajas y movimientos a la vez", () => {
    const { items, contenido } = montarLista([1, 2, 3, 4, 5, 6]);
    items.set([6, 10, 3, 1, 11, 5]);
    expect(contenido()).toEqual([6, 10, 3, 1, 11, 5]);
  });

  it("vaciar es una sola operación cuando la lista está sola", () => {
    const { items, padre, contenido } = montarLista(mil);
    // Se espía el setter y no `removeChild`: happy-dom implementa
    // `textContent = ""` quitando los hijos de uno en uno por dentro, y eso
    // contaría como mil llamadas lo que en el código es una.
    const vaciado = vi.spyOn(padre, "textContent", "set");

    items.set([]);
    expect(contenido()).toEqual([]);
    expect(vaciado).toHaveBeenCalledTimes(1);
    vaciado.mockRestore();

    // Y la lista sigue viva después.
    items.set([7, 8]);
    expect(contenido()).toEqual([7, 8]);
  });

  it("con hermanos en el padre, vaciar no se los lleva", () => {
    const padre = element("ul");
    const antes = element("li");
    append(antes, text("cabecera"));
    append(padre, antes);

    const items = signal([1, 2, 3]);
    mount(document.body, () => {
      list(padre, () => items(), (n) => n, (n) => {
        const li = element("li");
        append(li, text(String(n)));
        return li;
      });
      return padre;
    });

    items.set([]);
    expect([...padre.children].map((li) => li.textContent)).toEqual(["cabecera"]);
  });

  it("reemplazarlo todo libera los scopes viejos", () => {
    const soltados: number[] = [];
    const padre = element("ul");
    const items = signal([1, 2, 3]);
    mount(document.body, () => {
      list(padre, () => items(), (n) => n, (n) => {
        onCleanup(() => soltados.push(n));
        return element("li");
      });
      return padre;
    });

    items.set([4, 5]);
    expect(soltados.sort()).toEqual([1, 2, 3]);
  });
});

describe("memoria", () => {
  it("una lista que se llena y se vacía no retiene las filas que ya no están", () => {
    const items = signal<number[]>([]);
    let scope: { hijos: unknown[] } | undefined;
    mount(document.body, () => {
      const ul = element("ul");
      scope = currentScope() as unknown as { hijos: unknown[] };
      list(ul, () => items(), (n) => n, (n) => {
        const li = element("li");
        append(li, text(String(n)));
        return li;
      });
      return ul;
    });

    for (let vuelta = 0; vuelta < 10; vuelta++) {
      items.set(Array.from({ length: 1000 }, (_, i) => vuelta * 1000 + i));
      items.set([]);
    }
    // Antes de arreglarlo eran 10.001: cada fila que existió seguía colgada
    // del scope de la lista, con sus closures y sus nodos del DOM.
    expect(scope!.hijos.length).toBeLessThan(100);
  });

  it("liberar dos veces no repite las limpiezas", () => {
    let limpiezas = 0;
    const [, liberar] = root(() => onCleanup(() => limpiezas++));
    liberar();
    liberar();
    expect(limpiezas).toBe(1);
  });

  it("un listener se quita si el nodo sigue en el documento, y no si ya salió", () => {
    const dentro = element("button");
    const fuera = element("button");
    document.body.append(dentro, fuera);
    const [, liberar] = root(() => {
      on(dentro, "click", () => {});
      on(fuera, "click", () => {});
    });
    const quitarDentro = vi.spyOn(dentro, "removeEventListener");
    const quitarFuera = vi.spyOn(fuera, "removeEventListener");

    fuera.remove();
    liberar();
    expect(quitarDentro).toHaveBeenCalledTimes(1);
    expect(quitarFuera).not.toHaveBeenCalled();
    dentro.remove();
  });
});


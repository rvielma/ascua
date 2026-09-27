/**
 * Lo que llegó en la 0.3: `showValue`, `component`, `bind` y `resource`.
 *
 * Salieron de lo que una aplicación de verdad —Letra Muerta— tuvo que escribir
 * a mano una y otra vez.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { append, bind, component, dynamicText, element, mount, showValue, text } from "../src/dom.js";
import { resource, root, signal } from "../src/reactivo.js";

let desmontar: (() => void) | null = null;
afterEach(() => {
  desmontar?.();
  desmontar = null;
  document.body.innerHTML = "";
});

function montar(construir: () => Node): HTMLElement {
  const raiz = element("div");
  document.body.appendChild(raiz);
  desmontar = mount(raiz, construir);
  return raiz;
}

const esperar = () => new Promise<void>((listo) => setTimeout(listo, 0));

describe("showValue", () => {
  interface Club {
    nombre: string;
  }

  it("entrega el valor estrechado y solo reconstruye al aparecer o desaparecer", () => {
    const club = signal<Club | undefined>(undefined);
    const construida = vi.fn();

    const raiz = montar(() => {
      const div = element("div");
      showValue(
        div,
        () => club(),
        (actual) => {
          construida();
          const h2 = element("h2");
          // `actual()` es un Club: sin `?.` ni `?? ""`.
          append(h2, dynamicText(() => actual().nombre));
          return h2;
        },
        () => text("sin club"),
      );
      return div;
    });

    expect(raiz.textContent).toBe("sin club");

    club.set({ nombre: "Los Andes" });
    const h2 = raiz.querySelector("h2");
    expect(h2?.textContent).toBe("Los Andes");

    // Un sondeo que trae otro objeto: se actualiza el texto, no la rama.
    club.set({ nombre: "Los Andes (2)" });
    expect(raiz.querySelector("h2")).toBe(h2);
    expect(h2?.textContent).toBe("Los Andes (2)");
    expect(construida).toHaveBeenCalledTimes(1);

    club.set(undefined);
    expect(raiz.textContent).toBe("sin club");
  });

  it("un 0 es un valor; false no", () => {
    const n = signal<number | false>(0);
    const raiz = montar(() => {
      const div = element("div");
      showValue(div, () => n(), (valor) => dynamicText(() => `n=${valor()}`));
      return div;
    });
    expect(raiz.textContent).toBe("n=0");
    n.set(false);
    expect(raiz.textContent).toBe("");
  });
});

describe("component", () => {
  it("llama sin props a lo que no las pide", () => {
    function Menu() {
      return element("nav");
    }
    expect(component(Menu).localName).toBe("nav");
  });
});

describe("bind", () => {
  it("value va y vuelve con input", () => {
    const nombre = signal("Ana");
    const raiz = montar(() => {
      const campo = element("input");
      bind(campo, "value", nombre);
      return campo;
    });
    const campo = raiz.querySelector("input")!;
    expect(campo.value).toBe("Ana");

    campo.value = "Eva";
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    expect(nombre()).toBe("Eva");

    nombre.set("Sol");
    expect(campo.value).toBe("Sol");
  });

  it("checked escucha change", () => {
    const acepta = signal(false);
    const raiz = montar(() => {
      const casilla = element("input");
      casilla.type = "checkbox";
      bind(casilla, "checked", acepta);
      return casilla;
    });
    const casilla = raiz.querySelector("input")!;
    casilla.checked = true;
    casilla.dispatchEvent(new Event("change", { bubbles: true }));
    expect(acepta()).toBe(true);
  });

  it("valueAsNumber guarda un número", () => {
    const edad = signal(30);
    const raiz = montar(() => {
      const campo = element("input");
      campo.type = "number";
      bind(campo, "valueAsNumber", edad);
      return campo;
    });
    const campo = raiz.querySelector("input")!;
    expect(campo.value).toBe("30");
    campo.value = "31";
    campo.dispatchEvent(new Event("input", { bubbles: true }));
    expect(edad()).toBe(31);
  });
});

describe("resource", () => {
  it("pasa por cargando y queda listo", async () => {
    const [datos, liberar] = root(() => resource(async () => 42));
    expect(datos.state()).toBe("loading");
    expect(datos()).toBeUndefined();

    await esperar();
    expect(datos.state()).toBe("ready");
    expect(datos()).toBe(42);
    liberar();
  });

  it("un error queda en error() y no tira nada", async () => {
    const [datos, liberar] = root(() =>
      resource(async () => {
        throw new Error("sin red");
      }),
    );
    await esperar();
    expect(datos.state()).toBe("error");
    expect((datos.error() as Error).message).toBe("sin red");
    liberar();
  });

  it("recarga cuando cambia la fuente, y la respuesta vieja no pisa a la nueva", async () => {
    const id = signal(1);
    const pendientes = new Map<number, (valor: string) => void>();
    const abortadas: number[] = [];

    const [club, liberar] = root(() =>
      resource(
        () => id(),
        (n, { signal: senal }) =>
          new Promise<string>((listo) => {
            senal.addEventListener("abort", () => abortadas.push(n));
            pendientes.set(n, listo);
          }),
      ),
    );

    id.set(2);
    expect(abortadas).toEqual([1]);

    pendientes.get(2)!("club 2");
    pendientes.get(1)!("club 1"); // llega tarde: se descarta
    await esperar();
    expect(club()).toBe("club 2");
    liberar();
  });

  it("sin fuente no carga; reload vuelve a cargar; mutate no carga", async () => {
    const id = signal<number | null>(null);
    const cargar = vi.fn(async (n: number) => n * 10);
    const [datos, liberar] = root(() => resource(() => id(), cargar));

    expect(datos.state()).toBe("idle");
    expect(cargar).not.toHaveBeenCalled();

    id.set(4);
    await esperar();
    expect(datos()).toBe(40);

    datos.reload();
    expect(datos.state()).toBe("loading");
    // Mientras recarga, el valor anterior sigue ahí.
    expect(datos()).toBe(40);
    await esperar();
    expect(cargar).toHaveBeenCalledTimes(2);

    datos.mutate(7);
    expect(datos()).toBe(7);
    expect(cargar).toHaveBeenCalledTimes(2);
    liberar();
  });

  it("liberar el scope cancela lo que estaba en camino", async () => {
    let senal: AbortSignal | undefined;
    const [datos, liberar] = root(() =>
      resource(({ signal: s }) => {
        senal = s;
        return new Promise<number>(() => {});
      }),
    );
    expect(datos.loading()).toBe(true);
    liberar();
    expect(senal?.aborted).toBe(true);
  });
});

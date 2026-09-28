/**
 * El paquete de testing, probado con las mismas herramientas que ofrece.
 *
 * Los componentes de aquí se construyen con las funciones del runtime en vez
 * de con plantillas: este paquete no depende del compilador, y sus tests
 * tampoco deberían.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { element, on, onCleanup, property, signal, text, dynamicText, append } from "ascua";
import { check, cleanup, click, drag, input, render, submit, wait, waitFor } from "../src/index.js";

afterEach(cleanup);

function Contador() {
  const cuenta = signal(0);
  const caja = element("div");
  const salida = element("output");

  append(salida, dynamicText(() => cuenta()));
  const boton = element("button");
  append(boton, text("+1"));
  on(boton, "click", () => cuenta.update((c) => c + 1));

  append(caja, salida, boton);
  return caja;
}

describe("render", () => {
  it("monta en el documento", () => {
    const { container, text } = render(Contador);

    expect(container.isConnected).toBe(true);
    expect(text("output")).toBe("0");
  });

  it("lo que pasa tras pulsar ya está al volver", () => {
    // Los efectos de Ascua corren al escribir el signal, no en un tick
    // posterior: el test no espera a nada.
    const { get, text } = render(Contador);

    click(get("button"));
    expect(text("output")).toBe("1");

    click(get("button"));
    click(get("button"));
    expect(text("output")).toBe("3");
  });

  it("dice qué hay montado cuando no encuentra algo", () => {
    const { get } = render(Contador);
    expect(() => get(".no-existe")).toThrow(/no hay ningún ".no-existe"/);
  });

  it("unmount libera los efectos", () => {
    const soltado = vi.fn();
    const { unmount, container } = render(() => {
      onCleanup(soltado);
      return element("p");
    });

    unmount();
    expect(soltado).toHaveBeenCalledTimes(1);
    expect(container.isConnected).toBe(false);
  });

  it("cleanup se lleva todo lo que quedó montado", () => {
    render(Contador);
    render(Contador);
    expect(document.body.children.length).toBe(2);

    cleanup();
    expect(document.body.children.length).toBe(0);
  });
});

describe("los gestos", () => {
  function Formulario(alEnviar: (valor: string) => void) {
    const texto = signal("");
    const marcada = signal(false);

    const form = element("form") as HTMLFormElement;
    const campo = element("input") as HTMLInputElement;
    property(campo, "value", () => texto());
    on(campo, "input", (e) => texto.set((e.target as HTMLInputElement).value));

    const casilla = element("input") as HTMLInputElement;
    casilla.type = "checkbox";
    on(casilla, "change", (e) => marcada.set((e.target as HTMLInputElement).checked));

    const eco = element("p");
    append(eco, dynamicText(() => `${texto()}${marcada() ? " ✓" : ""}`));

    on(form, "submit", (e) => {
      e.preventDefault();
      alEnviar(texto());
    });

    append(form, campo, casilla, eco);
    return form;
  }

  it("input avisa al que escucha", () => {
    const { get, text } = render(() => Formulario(() => {}));

    input(get<HTMLInputElement>("input"), "hola");
    expect(text("p")).toBe("hola");
  });

  it("check dispara el change", () => {
    const { getAll, text } = render(() => Formulario(() => {}));

    check(getAll<HTMLInputElement>("input")[1]!);
    expect(text("p")).toBe(" ✓");
  });

  it("submit llega con lo que había escrito", () => {
    const recibido = vi.fn();
    const { get } = render(() => Formulario(recibido));

    input(get<HTMLInputElement>("input"), "Ana");
    submit(get<HTMLFormElement>("form"));

    expect(recibido).toHaveBeenCalledWith("Ana");
  });
});

describe("drag", () => {
  function Lienzo(registro: string[]) {
    const lienzo = element("div");
    for (const tipo of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
      on(lienzo, tipo, (e) => {
        const p = e as PointerEvent;
        registro.push(`${p.type}@${p.clientX},${p.clientY}#${p.pointerId}:${p.pointerType}`);
      });
    }
    return lienzo;
  }

  it("baja en el primero, se mueve y suelta en el último", () => {
    const registro: string[] = [];
    const { container } = render(() => Lienzo(registro));

    drag(container.firstElementChild!, [
      { x: 14, y: 14 },
      { x: 44, y: 44 },
      { x: 74, y: 74 },
    ]);

    expect(registro).toEqual([
      "pointerdown@14,14#1:mouse",
      "pointermove@44,44#1:mouse",
      "pointermove@74,74#1:mouse",
      "pointerup@74,74#1:mouse",
    ]);
  });

  it("acepta el dedo y la cancelación", () => {
    const registro: string[] = [];
    const { container } = render(() => Lienzo(registro));

    drag(container.firstElementChild!, [{ x: 0, y: 0 }, { x: 5, y: 5 }], {
      pointerId: 7,
      pointerType: "touch",
      cancel: true,
    });

    expect(registro.at(-1)).toBe("pointercancel@5,5#7:touch");
  });

  it("un solo punto es un toque", () => {
    const registro: string[] = [];
    const { container } = render(() => Lienzo(registro));

    drag(container.firstElementChild!, [{ x: 3, y: 3 }]);
    expect(registro).toEqual(["pointerdown@3,3#1:mouse", "pointerup@3,3#1:mouse"]);
  });

  it("sin puntos falla", () => {
    const { container } = render(() => Lienzo([]));
    expect(() => drag(container, [])).toThrow(/al menos un punto/);
  });
});

describe("wait", () => {
  it("cede el turno a lo que estaba pendiente", async () => {
    const estado = signal("cargando");
    const { text } = render(() => {
      const p = element("p");
      append(p, dynamicText(() => estado()));
      return p;
    });

    void Promise.resolve().then(() => estado.set("listo"));
    expect(text()).toBe("cargando");

    await wait();
    expect(text()).toBe("listo");
  });
});

describe("waitFor", () => {
  function Tardio(ms: number) {
    const listo = signal(false);
    const caja = element("div");
    append(caja, dynamicText(() => (listo() ? "" : "cargando")));
    setTimeout(() => {
      listo.set(true);
      const hecho = element("p");
      hecho.className = "hecho";
      append(hecho, text("listo"));
      append(caja, hecho);
    }, ms);
    return caja;
  }

  it("devuelve el nodo en cuanto aparece", async () => {
    const { waitFor: esperarNodo } = render(() => Tardio(20));

    const hecho = await esperarNodo(".hecho");
    expect(hecho.textContent).toBe("listo");
  });

  it("si ya está, no espera", async () => {
    const { container } = render(() => element("span"));
    await expect(waitFor("span", { within: container })).resolves.toBe(container.firstElementChild);
  });

  it("falla al acabarse el plazo, con lo que había", async () => {
    render(() => Tardio(500));
    await expect(waitFor(".hecho", { timeout: 30 })).rejects.toThrow(/"\.hecho" no apareció en 30 ms:[\s\S]*cargando/);
  });

  it("con within no ve lo de fuera", async () => {
    render(() => Tardio(10));
    const { waitFor: soloAqui } = render(() => element("section"));
    await expect(soloAqui(".hecho", { timeout: 60 })).rejects.toThrow(/no apareció/);
  });
});

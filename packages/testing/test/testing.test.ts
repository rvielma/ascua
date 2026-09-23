/**
 * El paquete de testing, probado con las mismas herramientas que ofrece.
 *
 * Los componentes de aquí se construyen con las funciones del runtime en vez
 * de con plantillas: este paquete no depende del compilador, y sus tests
 * tampoco deberían.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { element, on, onCleanup, property, signal, text, dynamicText, append } from "@ascua/runtime";
import { enviar, escribir, esperar, limpiar, marcar, pulsar, render } from "../src/index.js";

afterEach(limpiar);

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
    const { contenedor, texto } = render(Contador);

    expect(contenedor.isConnected).toBe(true);
    expect(texto("output")).toBe("0");
  });

  it("lo que pasa tras pulsar ya está al volver", () => {
    // Los efectos de Ascua corren al escribir el signal, no en un tick
    // posterior: el test no espera a nada.
    const { buscar, texto } = render(Contador);

    pulsar(buscar("button"));
    expect(texto("output")).toBe("1");

    pulsar(buscar("button"));
    pulsar(buscar("button"));
    expect(texto("output")).toBe("3");
  });

  it("dice qué hay montado cuando no encuentra algo", () => {
    const { buscar } = render(Contador);
    expect(() => buscar(".no-existe")).toThrow(/no hay ningún ".no-existe"/);
  });

  it("desmontar libera los efectos", () => {
    const soltado = vi.fn();
    const { desmontar, contenedor } = render(() => {
      onCleanup(soltado);
      return element("p");
    });

    desmontar();
    expect(soltado).toHaveBeenCalledTimes(1);
    expect(contenedor.isConnected).toBe(false);
  });

  it("limpiar se lleva todo lo que quedó montado", () => {
    render(Contador);
    render(Contador);
    expect(document.body.children.length).toBe(2);

    limpiar();
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

  it("escribir avisa al que escucha", () => {
    const { buscar, texto } = render(() => Formulario(() => {}));

    escribir(buscar<HTMLInputElement>("input"), "hola");
    expect(texto("p")).toBe("hola");
  });

  it("marcar dispara el change", () => {
    const { buscarTodos, texto } = render(() => Formulario(() => {}));

    marcar(buscarTodos<HTMLInputElement>("input")[1]!);
    expect(texto("p")).toBe(" ✓");
  });

  it("enviar llega con lo que había escrito", () => {
    const recibido = vi.fn();
    const { buscar } = render(() => Formulario(recibido));

    escribir(buscar<HTMLInputElement>("input"), "Ana");
    enviar(buscar<HTMLFormElement>("form"));

    expect(recibido).toHaveBeenCalledWith("Ana");
  });
});

describe("esperar", () => {
  it("cede el turno a lo que estaba pendiente", async () => {
    const estado = signal("cargando");
    const { texto } = render(() => {
      const p = element("p");
      append(p, dynamicText(() => estado()));
      return p;
    });

    void Promise.resolve().then(() => estado.set("listo"));
    expect(texto()).toBe("cargando");

    await esperar();
    expect(texto()).toBe("listo");
  });
});

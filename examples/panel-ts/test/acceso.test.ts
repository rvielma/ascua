/**
 * El acceso del panel, probado como lo usaría alguien.
 *
 * Esto es lo que hace `ascua-testing` por un proyecto: montar un componente
 * con plantillas, tocarlo y mirar el DOM, sin más ceremonia que un
 * `afterEach(limpiar)`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { navegar } from "ascua-router";
import { enviar, escribir, esperar, limpiar, pulsar, render } from "ascua-testing";

import { Login } from "../src/login.js";
import { Panel } from "../src/panel.js";
import { PEDIDOS } from "../src/datos.js";

afterEach(limpiar);

// La ruta es de módulo, así que un test no debe heredar dónde lo dejó el
// anterior.
beforeEach(() => navegar("/", { reemplazar: true }));

function campos(buscar: <T extends Element = HTMLElement>(s: string) => T) {
  return {
    usuario: buscar<HTMLInputElement>("input[name=usuario]"),
    clave: buscar<HTMLInputElement>("input[name=clave]"),
    boton: buscar<HTMLButtonElement>("button[type=submit]"),
    formulario: buscar<HTMLFormElement>("form"),
  };
}

describe("el acceso", () => {
  it("no deja enviar hasta que hay usuario y contraseña", () => {
    const { buscar } = render(() => Login({ onentrar: () => {} }));
    const { usuario, clave, boton } = campos(buscar);

    expect(boton.disabled).toBe(true);

    escribir(usuario, "ana");
    expect(boton.disabled).toBe(true);

    escribir(clave, "ascua");
    expect(boton.disabled).toBe(false);
  });

  it("avisa cuando la contraseña no vale, y vacía el campo", async () => {
    const entrar = vi.fn();
    const { buscar, contenedor } = render(() => Login({ onentrar: entrar }));
    const { usuario, clave, formulario } = campos(buscar);

    escribir(usuario, "ana");
    escribir(clave, "mala");
    enviar(formulario);

    // Mientras comprueba, el botón lo dice y no se puede reenviar.
    expect(buscar("button[type=submit]").textContent?.trim()).toBe("Comprobando…");

    await esperar(700);

    expect(entrar).not.toHaveBeenCalled();
    expect(buscar("[role=alert]").textContent).toContain("incorrectos");
    // La propiedad manda sobre lo que el usuario tecleó: por eso se puede
    // vaciar el campo desde el código.
    expect(clave.value).toBe("");
    expect(contenedor.textContent).toContain("Entrar");
  });

  it("entrega la sesión cuando las credenciales son buenas", async () => {
    const entrar = vi.fn();
    const { buscar } = render(() => Login({ onentrar: entrar }));
    const { usuario, clave, formulario } = campos(buscar);

    escribir(usuario, "ana");
    escribir(clave, "ascua");
    enviar(formulario);
    await esperar(700);

    expect(entrar).toHaveBeenCalledWith({
      usuario: "ana",
      nombre: "Ana Ferreira",
      rol: "admin",
    });
  });
});

describe("el panel", () => {
  const sesion = { usuario: "ana", nombre: "Ana Ferreira", rol: "admin" } as const;

  function montar() {
    return render(() =>
      Panel({ sesion: () => sesion, onsalir: () => {}, pedidos: PEDIDOS }),
    );
  }

  it("abre en el resumen con las cifras de la cartera", () => {
    const { texto } = montar();
    expect(texto("h2")).toBe("Estado de la cartera");
    expect(texto()).toContain("Pendientes");
  });

  it("la sección la manda la URL", () => {
    const { texto, buscar } = montar();

    navegar("/pedidos");
    expect(texto("h2")).toBe("Pedidos");
    expect(buscar("nav a.activa").textContent).toBe("Pedidos");

    navegar("/");
    expect(texto("h2")).toBe("Estado de la cartera");
  });

  it("avanzar un pedido no reconstruye su fila", () => {
    const { buscarTodos } = montar();
    navegar("/pedidos");

    const fila = buscarTodos("tbody tr")[0]!;
    const marca = fila.querySelector<HTMLButtonElement>(".marca")!;
    expect(marca.textContent?.trim()).toBe("pendiente");

    pulsar(marca);

    expect(marca.textContent?.trim()).toBe("enviado");
    // El mismo nodo de siempre: se escribió en él, no se rehízo.
    expect(buscarTodos("tbody tr")[0]).toBe(fila);
    expect(fila.querySelector(".marca")).toBe(marca);
  });

  it("el filtro quita filas y el botón de limpiar las devuelve", () => {
    const { buscar, buscarTodos } = montar();
    navegar("/pedidos");
    expect(buscarTodos("tbody tr")).toHaveLength(PEDIDOS.length);

    escribir(buscar<HTMLInputElement>("input[name=busqueda]"), "viña");
    expect(buscarTodos("tbody tr")).toHaveLength(1);

    pulsar(buscar(".limpiar"));
    expect(buscarTodos("tbody tr")).toHaveLength(PEDIDOS.length);
  });
});

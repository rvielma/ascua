/**
 * El acceso del panel, probado como lo usaría alguien.
 *
 * Esto es lo que hace `ascua-testing` por un proyecto: montar un componente
 * con plantillas, tocarlo y mirar el DOM, sin más ceremonia que un
 * `afterEach(cleanup)`.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { navigate } from "ascua-router";
import { cleanup, click, input, render, submit, wait } from "ascua-testing";

import { Login } from "../src/login.js";
import { Panel } from "../src/panel.js";
import { PEDIDOS } from "../src/datos.js";

afterEach(cleanup);

// La ruta es de módulo, así que un test no debe heredar dónde lo dejó el
// anterior.
beforeEach(() => navigate("/", { replace: true }));

function campos(get: <T extends Element = HTMLElement>(s: string) => T) {
  return {
    usuario: get<HTMLInputElement>("input[name=usuario]"),
    clave: get<HTMLInputElement>("input[name=clave]"),
    boton: get<HTMLButtonElement>("button[type=submit]"),
    formulario: get<HTMLFormElement>("form"),
  };
}

describe("el acceso", () => {
  it("no deja enviar hasta que hay usuario y contraseña", () => {
    const { get } = render(() => Login({ onentrar: () => {} }));
    const { usuario, clave, boton } = campos(get);

    expect(boton.disabled).toBe(true);

    input(usuario, "ana");
    expect(boton.disabled).toBe(true);

    input(clave, "ascua");
    expect(boton.disabled).toBe(false);
  });

  it("avisa cuando la contraseña no vale, y vacía el campo", async () => {
    const entrar = vi.fn();
    const { get, container } = render(() => Login({ onentrar: entrar }));
    const { usuario, clave, formulario } = campos(get);

    input(usuario, "ana");
    input(clave, "mala");
    submit(formulario);

    // Mientras comprueba, el botón lo dice y no se puede reenviar.
    expect(get("button[type=submit]").textContent?.trim()).toBe("Comprobando…");

    await wait(700);

    expect(entrar).not.toHaveBeenCalled();
    expect(get("[role=alert]").textContent).toContain("incorrectos");
    // La propiedad manda sobre lo que el usuario tecleó: por eso se puede
    // vaciar el campo desde el código.
    expect(clave.value).toBe("");
    expect(container.textContent).toContain("Entrar");
  });

  it("entrega la sesión cuando las credenciales son buenas", async () => {
    const entrar = vi.fn();
    const { get } = render(() => Login({ onentrar: entrar }));
    const { usuario, clave, formulario } = campos(get);

    input(usuario, "ana");
    input(clave, "ascua");
    submit(formulario);
    await wait(700);

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
    const { text } = montar();
    expect(text("h2")).toBe("Estado de la cartera");
    expect(text()).toContain("Pendientes");
  });

  it("la sección la manda la URL", () => {
    const { text, get } = montar();

    navigate("/pedidos");
    expect(text("h2")).toBe("Pedidos");
    expect(get("nav a.activa").textContent).toBe("Pedidos");

    navigate("/");
    expect(text("h2")).toBe("Estado de la cartera");
  });

  it("avanzar un pedido no reconstruye su fila", () => {
    const { getAll } = montar();
    navigate("/pedidos");

    const fila = getAll("tbody tr")[0]!;
    const marca = fila.querySelector<HTMLButtonElement>(".marca")!;
    expect(marca.textContent?.trim()).toBe("pendiente");

    click(marca);

    expect(marca.textContent?.trim()).toBe("enviado");
    // El mismo nodo de siempre: se escribió en él, no se rehízo.
    expect(getAll("tbody tr")[0]).toBe(fila);
    expect(fila.querySelector(".marca")).toBe(marca);
  });

  it("el filtro quita filas y el botón de limpiar las devuelve", () => {
    const { get, getAll } = montar();
    navigate("/pedidos");
    expect(getAll("tbody tr")).toHaveLength(PEDIDOS.length);

    input(get<HTMLInputElement>("input[name=busqueda]"), "viña");
    expect(getAll("tbody tr")).toHaveLength(1);

    click(get(".limpiar"));
    expect(getAll("tbody tr")).toHaveLength(PEDIDOS.length);
  });
});

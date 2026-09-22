/**
 * El router, contra un DOM de verdad.
 *
 * Lo que se comprueba no es que "funcione la navegación", sino lo que se
 * espera de un router cuando la vista ya está montada: que no rehaga lo que no
 * cambió, que libere lo que sí, y que un enlace siga siendo un enlace.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { onCleanup } from "@ascua/runtime";
import { coincide, enlaces, enrutarEn, navegar, query, ruta, sinQuery } from "../src/index.js";

function elemento(texto: string): HTMLElement {
  const nodo = document.createElement("p");
  nodo.textContent = texto;
  return nodo;
}

/** Lo que cada test monta, para que no siga vivo en el siguiente. */
let soltar: (() => void) | null = null;

function enrutar(padre: Node, rutas: Parameters<typeof enrutarEn>[1]): void {
  soltar = enrutarEn(padre, rutas);
}

beforeEach(() => {
  document.body.innerHTML = "";
  navegar("/", { reemplazar: true });
});

afterEach(() => {
  soltar?.();
  soltar = null;
});

describe("coincide", () => {
  it("compara camino a camino", () => {
    expect(coincide("/pedidos", "/pedidos")).toEqual({});
    expect(coincide("/pedidos", "/pedidos/4821")).toBeNull();
    expect(coincide("/pedidos", "/otra")).toBeNull();
  });

  it("captura los parámetros del patrón", () => {
    expect(coincide("/pedidos/:id", "/pedidos/4821")).toEqual({ id: "4821" });
    expect(coincide("/:seccion/:id", "/pedidos/4821")).toEqual({
      seccion: "pedidos",
      id: "4821",
    });
    // Un segmento vacío no es un parámetro.
    expect(coincide("/pedidos/:id", "/pedidos/")).toBeNull();
  });

  it("decodifica lo que venga escapado en la URL", () => {
    expect(coincide("/clientes/:nombre", "/clientes/Vi%C3%B1a%20Colchagua")).toEqual({
      nombre: "Viña Colchagua",
    });
  });

  it("el comodín se queda con el resto", () => {
    expect(coincide("/archivos/*", "/archivos/2026/informe.pdf")).toEqual({
      resto: "2026/informe.pdf",
    });
  });

  it("la barra final no hace otra ruta", () => {
    expect(coincide("/pedidos", "/pedidos/")).toEqual({});
  });
});

describe("navegar", () => {
  it("cambia la ruta y el historial", () => {
    navegar("/pedidos");
    expect(ruta()).toBe("/pedidos");
    expect(location.pathname).toBe("/pedidos");
  });

  it("separa la query del camino", () => {
    navegar("/pedidos?estado=pendiente&pagina=2");
    expect(sinQuery(ruta())).toBe("/pedidos");
    expect(query().get("estado")).toBe("pendiente");
    expect(query().get("pagina")).toBe("2");
  });
});

describe("el historial del navegador", () => {
  it("atrás y adelante cambian la ruta sin recargar", () => {
    navegar("/pedidos");
    navegar("/pedidos/4821");

    // Lo que hace el navegador al pulsar atrás: cambia la URL y avisa.
    history.back();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(ruta()).toBe("/pedidos");

    history.forward();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(ruta()).toBe("/pedidos/4821");
  });
});

describe("enrutarEn", () => {
  const rutas = [
    { patron: "/", vista: () => elemento("inicio") },
    { patron: "/pedidos", vista: () => elemento("lista") },
    { patron: "/pedidos/:id", vista: (p: Record<string, string>) => elemento(`pedido ${p.id}`) },
    { vista: () => elemento("no encontrado") },
  ];

  it("monta la vista de la ruta actual", () => {
    enrutar(document.body, rutas);
    expect(document.body.textContent).toBe("inicio");

    navegar("/pedidos");
    expect(document.body.textContent).toBe("lista");
  });

  it("pasa los parámetros a la vista", () => {
    navegar("/pedidos/4821", { reemplazar: true });
    enrutar(document.body, rutas);
    expect(document.body.textContent).toBe("pedido 4821");
  });

  it("cae en el fallback cuando no coincide nada", () => {
    navegar("/lo-que-sea", { reemplazar: true });
    enrutar(document.body, rutas);
    expect(document.body.textContent).toBe("no encontrado");
  });

  it("no reconstruye si la ruta resuelve a lo mismo", () => {
    navegar("/pedidos", { reemplazar: true });
    enrutar(document.body, rutas);
    const nodo = document.body.firstElementChild;

    // Otra vez la misma ruta, y con query distinta: la vista es la misma.
    navegar("/pedidos");
    navegar("/pedidos?orden=total");
    expect(document.body.firstElementChild).toBe(nodo);
  });

  it("reconstruye cuando cambia un parámetro", () => {
    navegar("/pedidos/1", { reemplazar: true });
    enrutar(document.body, rutas);
    const nodo = document.body.firstElementChild;

    navegar("/pedidos/2");
    expect(document.body.textContent).toBe("pedido 2");
    expect(document.body.firstElementChild).not.toBe(nodo);
  });

  it("libera la vista que deja de estar", () => {
    const soltado = vi.fn();
    enrutar(document.body, [
      {
        patron: "/",
        vista: () => {
          onCleanup(soltado);
          return elemento("inicio");
        },
      },
      { patron: "/pedidos", vista: () => elemento("lista") },
    ]);

    expect(soltado).not.toHaveBeenCalled();
    navegar("/pedidos");
    expect(soltado).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toBe("lista");
  });

  it("convive con lo que ya hay en el padre", () => {
    const contenedor = document.createElement("main");
    contenedor.appendChild(elemento("cabecera"));
    document.body.appendChild(contenedor);

    enrutar(contenedor, rutas);
    navegar("/pedidos");

    expect([...contenedor.children].map((c) => c.textContent)).toEqual(["cabecera", "lista"]);
  });
});

describe("enlaces", () => {
  function pulsar(nodo: Element, opciones: MouseEventInit = {}): MouseEvent {
    const evento = new MouseEvent("click", { bubbles: true, cancelable: true, ...opciones });
    nodo.dispatchEvent(evento);
    return evento;
  }

  it("navega sin recargar", () => {
    document.body.innerHTML = `<a href="/pedidos">ver</a>`;
    const soltar = enlaces(document);

    const evento = pulsar(document.querySelector("a")!);
    expect(evento.defaultPrevented).toBe(true);
    expect(ruta()).toBe("/pedidos");
    soltar();
  });

  it("deja en paz lo que no es una navegación normal", () => {
    document.body.innerHTML = `
      <a id="externo" href="https://example.com/x">fuera</a>
      <a id="ancla" href="#seccion">ancla</a>
      <a id="descarga" href="/informe.pdf" download>bajar</a>
      <a id="pestana" href="/pedidos" target="_blank">otra pestaña</a>
      <a id="normal" href="/pedidos">normal</a>`;
    const soltar = enlaces(document);

    for (const id of ["externo", "ancla", "descarga", "pestana"]) {
      const evento = pulsar(document.querySelector(`#${id}`)!);
      expect(evento.defaultPrevented, id).toBe(false);
    }
    // Y con ⌘ pulsado, tampoco: el usuario quiere otra pestaña.
    const conMeta = pulsar(document.querySelector("#normal")!, { metaKey: true });
    expect(conMeta.defaultPrevented).toBe(false);
    expect(ruta()).toBe("/");

    soltar();
  });

  it("deja de escuchar cuando se suelta", () => {
    document.body.innerHTML = `<a href="/pedidos">ver</a>`;
    const soltar = enlaces(document);
    soltar();

    const evento = pulsar(document.querySelector("a")!);
    expect(evento.defaultPrevented).toBe(false);
    expect(ruta()).toBe("/");
  });
});

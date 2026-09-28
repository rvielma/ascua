/**
 * El router, contra un DOM de verdad.
 *
 * Lo que se comprueba no es que "funcione la navegación", sino lo que se
 * espera de un router cuando la vista ya está montada: que no rehaga lo que no
 * cambió, que libere lo que sí, y que un enlace siga siendo un enlace.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { onCleanup } from "ascua";
import { links, match, mountRoutes, navigate, path, query, stripQuery } from "../src/index.js";

function elemento(texto: string): HTMLElement {
  const nodo = document.createElement("p");
  nodo.textContent = texto;
  return nodo;
}

/** Lo que cada test monta, para que no siga vivo en el siguiente. */
let soltar: (() => void) | null = null;

function enrutar(padre: Node, rutas: Parameters<typeof mountRoutes>[1]): void {
  soltar = mountRoutes(padre, rutas);
}

beforeEach(() => {
  document.body.innerHTML = "";
  navigate("/", { replace: true });
});

afterEach(() => {
  soltar?.();
  soltar = null;
});

describe("match", () => {
  it("compara camino a camino", () => {
    expect(match("/pedidos", "/pedidos")).toEqual({});
    expect(match("/pedidos", "/pedidos/4821")).toBeNull();
    expect(match("/pedidos", "/otra")).toBeNull();
  });

  it("captura los parámetros del patrón", () => {
    expect(match("/pedidos/:id", "/pedidos/4821")).toEqual({ id: "4821" });
    expect(match("/:seccion/:id", "/pedidos/4821")).toEqual({
      seccion: "pedidos",
      id: "4821",
    });
    // Un segmento vacío no es un parámetro.
    expect(match("/pedidos/:id", "/pedidos/")).toBeNull();
  });

  it("decodifica lo que venga escapado en la URL", () => {
    expect(match("/clientes/:nombre", "/clientes/Vi%C3%B1a%20Colchagua")).toEqual({
      nombre: "Viña Colchagua",
    });
  });

  it("el comodín se queda con el resto", () => {
    expect(match("/archivos/*", "/archivos/2026/informe.pdf")).toEqual({
      rest: "2026/informe.pdf",
    });
  });

  it("la barra final no hace otra ruta", () => {
    expect(match("/pedidos", "/pedidos/")).toEqual({});
  });
});

describe("navigate", () => {
  it("cambia la ruta y el historial", () => {
    navigate("/pedidos");
    expect(path()).toBe("/pedidos");
    expect(location.pathname).toBe("/pedidos");
  });

  it("separa la query del camino", () => {
    navigate("/pedidos?estado=pendiente&pagina=2");
    expect(stripQuery(path())).toBe("/pedidos");
    expect(query().get("estado")).toBe("pendiente");
    expect(query().get("pagina")).toBe("2");
  });
});

describe("el historial del navegador", () => {
  it("atrás y adelante cambian la ruta sin recargar", () => {
    navigate("/pedidos");
    navigate("/pedidos/4821");

    // Lo que hace el navegador al pulsar atrás: cambia la URL y avisa.
    history.back();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(path()).toBe("/pedidos");

    history.forward();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(path()).toBe("/pedidos/4821");
  });
});

describe("mountRoutes", () => {
  const rutas = [
    { pattern: "/", view: () => elemento("inicio") },
    { pattern: "/pedidos", view: () => elemento("lista") },
    { pattern: "/pedidos/:id", view: (p: Record<string, string>) => elemento(`pedido ${p.id}`) },
    { view: () => elemento("no encontrado") },
  ];

  it("monta la vista de la ruta actual", () => {
    enrutar(document.body, rutas);
    expect(document.body.textContent).toBe("inicio");

    navigate("/pedidos");
    expect(document.body.textContent).toBe("lista");
  });

  it("pasa los parámetros a la vista", () => {
    navigate("/pedidos/4821", { replace: true });
    enrutar(document.body, rutas);
    expect(document.body.textContent).toBe("pedido 4821");
  });

  it("cae en el fallback cuando no coincide nada", () => {
    navigate("/lo-que-sea", { replace: true });
    enrutar(document.body, rutas);
    expect(document.body.textContent).toBe("no encontrado");
  });

  it("no reconstruye si la ruta resuelve a lo mismo", () => {
    navigate("/pedidos", { replace: true });
    enrutar(document.body, rutas);
    const nodo = document.body.firstElementChild;

    // Otra vez la misma ruta, y con query distinta: la vista es la misma.
    navigate("/pedidos");
    navigate("/pedidos?orden=total");
    expect(document.body.firstElementChild).toBe(nodo);
  });

  it("reconstruye cuando cambia un parámetro", () => {
    navigate("/pedidos/1", { replace: true });
    enrutar(document.body, rutas);
    const nodo = document.body.firstElementChild;

    navigate("/pedidos/2");
    expect(document.body.textContent).toBe("pedido 2");
    expect(document.body.firstElementChild).not.toBe(nodo);
  });

  it("libera la vista que deja de estar", () => {
    const soltado = vi.fn();
    enrutar(document.body, [
      {
        pattern: "/",
        view: () => {
          onCleanup(soltado);
          return elemento("inicio");
        },
      },
      { pattern: "/pedidos", view: () => elemento("lista") },
    ]);

    expect(soltado).not.toHaveBeenCalled();
    navigate("/pedidos");
    expect(soltado).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toBe("lista");
  });

  it("convive con lo que ya hay en el padre", () => {
    const contenedor = document.createElement("main");
    contenedor.appendChild(elemento("cabecera"));
    document.body.appendChild(contenedor);

    enrutar(contenedor, rutas);
    navigate("/pedidos");

    expect([...contenedor.children].map((c) => c.textContent)).toEqual(["cabecera", "lista"]);
  });
});

describe("links", () => {
  function pulsar(nodo: Element, opciones: MouseEventInit = {}): MouseEvent {
    const evento = new MouseEvent("click", { bubbles: true, cancelable: true, ...opciones });
    nodo.dispatchEvent(evento);
    return evento;
  }

  it("navega sin recargar", () => {
    document.body.innerHTML = `<a href="/pedidos">ver</a>`;
    const soltar = links(document);

    const evento = pulsar(document.querySelector("a")!);
    expect(evento.defaultPrevented).toBe(true);
    expect(path()).toBe("/pedidos");
    soltar();
  });

  it("deja en paz lo que no es una navegación normal", () => {
    document.body.innerHTML = `
      <a id="externo" href="https://example.com/x">fuera</a>
      <a id="ancla" href="#seccion">ancla</a>
      <a id="descarga" href="/informe.pdf" download>bajar</a>
      <a id="pestana" href="/pedidos" target="_blank">otra pestaña</a>
      <a id="normal" href="/pedidos">normal</a>`;
    const soltar = links(document);

    for (const id of ["externo", "ancla", "descarga", "pestana"]) {
      const evento = pulsar(document.querySelector(`#${id}`)!);
      expect(evento.defaultPrevented, id).toBe(false);
    }
    // Y con ⌘ pulsado, tampoco: el usuario quiere otra pestaña.
    const conMeta = pulsar(document.querySelector("#normal")!, { metaKey: true });
    expect(conMeta.defaultPrevented).toBe(false);
    expect(path()).toBe("/");

    soltar();
  });

  it("deja de escuchar cuando se suelta", () => {
    document.body.innerHTML = `<a href="/pedidos">ver</a>`;
    const soltar = links(document);
    soltar();

    const evento = pulsar(document.querySelector("a")!);
    expect(evento.defaultPrevented).toBe(false);
    expect(path()).toBe("/");
  });
});

describe("links fuera de la aplicación", () => {
  function pulsar(nodo: Element): MouseEvent {
    const evento = new MouseEvent("click", { bubbles: true, cancelable: true });
    nodo.dispatchEvent(evento);
    return evento;
  }

  it("con base, solo navega lo que cuelga de ella", () => {
    document.body.innerHTML = `
      <a id="portada" href="/">portada</a>
      <a id="vecino" href="/jugarlo">otra página</a>
      <a id="raiz" href="/jugar">raíz</a>
      <a id="caso" href="/jugar/?caso=001">caso</a>`;
    const soltar = links(document, { base: "/jugar/" });

    for (const id of ["portada", "vecino"]) {
      expect(pulsar(document.querySelector(`#${id}`)!).defaultPrevented, id).toBe(false);
    }
    for (const id of ["raiz", "caso"]) {
      expect(pulsar(document.querySelector(`#${id}`)!).defaultPrevented, id).toBe(true);
    }
    expect(path()).toBe("/jugar/?caso=001");
    soltar();
  });

  it("rel=external no se intercepta", () => {
    document.body.innerHTML = `<a href="/" rel="noopener external">portada</a>`;
    const soltar = links(document);

    expect(pulsar(document.querySelector("a")!).defaultPrevented).toBe(false);
    soltar();
  });
});

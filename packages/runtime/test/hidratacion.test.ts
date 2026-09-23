/**
 * Hidratación: el cliente adopta el HTML del servidor en vez de rehacerlo.
 *
 * Cada test renderiza en el servidor, mete el HTML en el documento como lo
 * haría el navegador al leerlo, y luego hidrata con **el mismo código**. Lo
 * que se comprueba es identidad: el nodo al que queda atado el efecto tiene
 * que ser el que escribió el servidor.
 */

import { afterEach, describe, expect, it } from "vitest";

import {
  HYDRATION_ATTR,
  append,
  attribute,
  dynamicText,
  element,
  hydrate,
  island,
  list,
  on,
  show,
  staticAttribute,
  text,
} from "../src/dom.js";
import { signal } from "../src/reactivo.js";
import { renderToString } from "../src/servidor.js";

afterEach(() => {
  document.body.innerHTML = "";
});

/** Una aplicación pequeña con todo lo que hay que emparejar. */
function App(props: string) {
  const inicial = Number(props || "0");
  const cuenta = signal(inicial);
  const items = signal(["a", "b", "c"]);
  const abierto = signal(true);

  const raiz = element("div");
  staticAttribute(raiz, "class", "app");

  const salida = element("output");
  attribute(salida, "data-alto", () => cuenta() > 2);
  append(salida, text("Cuenta: "), dynamicText(() => cuenta()));
  append(raiz, salida);

  const mas = element("button");
  staticAttribute(mas, "class", "mas");
  on(mas, "click", () => cuenta.update((c) => c + 1));
  append(mas, text("+1"));
  append(raiz, mas);

  const panel = element("section");
  show(
    panel,
    () => abierto(),
    (visible) => {
      if (!visible) return text("cerrado");
      const p = element("p");
      append(p, text("abierto"));
      return p;
    },
  );
  append(raiz, panel);

  const ul = element("ul");
  list(
    ul,
    () => items(),
    (s) => s,
    (s) => {
      const li = element("li");
      append(li, text(s));
      return li;
    },
  );
  append(raiz, ul);

  const pie = element("footer");
  append(pie, dynamicText(() => `${items().length} items`), text(" · fin"));
  append(raiz, pie);

  return { raiz, cuenta, items, abierto };
}

/** Renderiza en el servidor y deja el HTML en el documento. */
function servir(props = "0") {
  const html = renderToString(() => {
    const body = element("main");
    append(body, island("app", () => App(props).raiz, props));
    return body;
  });
  document.body.innerHTML = html;
  return html;
}

function hidratar() {
  let app: ReturnType<typeof App> | undefined;
  const resultado = hydrate({
    app: (props) => {
      app = App(props);
      return app.raiz;
    },
  });
  if (!app) throw new Error("la isla no se hidrató");
  return { ...resultado, app };
}

describe("hydrate", () => {
  it("adopta todos los elementos y marcadores, y no crea ninguno", () => {
    servir();
    const antes = [...document.querySelectorAll(`[${HYDRATION_ATTR}]`)];

    const { adoptados, creados, app } = hidratar();

    expect(creados).toBe(0);
    // 10 elementos y 2 marcadores.
    expect(adoptados).toBe(12);
    expect(app.raiz).toBe(antes[0]);
    // Los mismos objetos, en el mismo orden.
    const despues = [...document.querySelectorAll(".app, .app *")];
    expect(despues).toEqual(antes);
  });

  it("deja el documento limpio: sin números ni separadores", () => {
    servir();
    const html = document.body.innerHTML;
    expect(html).toContain(HYDRATION_ATTR);
    expect(html).toContain("<!--/-->");

    hidratar();

    const limpio = document.body.innerHTML;
    expect(limpio).not.toContain(HYDRATION_ATTR);
    expect(limpio).not.toContain("<!--/-->");
    expect(limpio).not.toMatch(/<!--\d+-->/);
    expect(document.querySelector("output")!.textContent).toBe("Cuenta: 0");
    expect(document.querySelector("footer")!.textContent).toBe("3 items · fin");
  });

  it("los efectos quedan atados a los nodos adoptados", () => {
    servir();
    const salida = document.querySelector("output")!;
    const boton = document.querySelector(".mas") as HTMLElement;

    hidratar();
    boton.click();
    boton.click();
    boton.click();

    expect(document.querySelector("output")).toBe(salida);
    expect(salida.textContent).toBe("Cuenta: 3");
    expect(salida.hasAttribute("data-alto")).toBe(true);
  });

  it("la lista adoptada sigue siendo una lista con clave", () => {
    servir();
    const [a, b, c] = [...document.querySelectorAll("li")];

    const { app } = hidratar();
    app.items.set(["c", "a", "d"]);

    const lis = [...document.querySelectorAll("li")];
    expect(lis.map((li) => li.textContent)).toEqual(["c", "a", "d"]);
    expect(lis[0]).toBe(c);
    expect(lis[1]).toBe(a);
    expect(lis).not.toContain(b);
    expect(document.querySelector("footer")!.textContent).toBe("3 items · fin");
  });

  it("show sustituye la rama adoptada", () => {
    servir();
    const { app } = hidratar();

    app.abierto.set(false);
    expect(document.querySelector("section")!.textContent).toBe("cerrado");
    app.abierto.set(true);
    expect(document.querySelector("section")!.innerHTML).toBe("<p>abierto</p><!---->");
  });

  it("si el servidor renderizó otro estado, se corrige y no se duplica", () => {
    servir("5");
    // El cliente arranca con otros props: el servidor quedó desfasado.
    const isla = document.querySelector("ascua-island")!;
    isla.setAttribute("data-ascua-props", "1");

    hidratar();
    expect(document.querySelector("output")!.textContent).toBe("Cuenta: 1");
    expect(document.querySelector("output")!.hasAttribute("data-alto")).toBe(false);
    expect(document.querySelectorAll("output")).toHaveLength(1);
  });

  it("lo que falta en el HTML se crea, y lo que sobra se quita", () => {
    servir();
    document.querySelector("footer")!.remove();
    document.querySelector("li")!.setAttribute(HYDRATION_ATTR, "999");

    const { creados } = hidratar();

    expect(creados).toBeGreaterThan(0);
    expect(document.querySelectorAll("footer")).toHaveLength(1);
    expect([...document.querySelectorAll("li")].map((li) => li.textContent)).toEqual(["a", "b", "c"]);
    expect(document.querySelector("footer")!.textContent).toBe("3 items · fin");
  });

  it("las islas sin constructor se dejan intactas", () => {
    servir();
    const antes = document.body.innerHTML;
    const resultado = hydrate({ otra: () => element("p") });
    expect(resultado.adoptados).toBe(0);
    expect(document.body.innerHTML).toBe(antes);
  });

  it("desmontar apaga los efectos y deja el HTML", () => {
    servir();
    const { desmontar } = hidratar();
    const salida = document.querySelector("output")!;
    desmontar();
    (document.querySelector(".mas") as HTMLElement).click();
    expect(salida.textContent).toBe("Cuenta: 0");
  });

  it("una isla dentro de otra tiene su propia numeración", () => {
    const Hoja = () => {
      const n = signal(0);
      const b = element("button");
      on(b, "click", () => n.update((x) => x + 1));
      append(b, dynamicText(() => n()));
      return b;
    };
    const Exterior = () => {
      const div = element("div");
      const h = element("h2");
      append(h, text("fuera"));
      append(div, h, island("hoja", Hoja));
      return div;
    };

    document.body.innerHTML = renderToString(() => island("exterior", Exterior));
    const boton = document.querySelector("button")!;

    const { adoptados, creados } = hydrate({ exterior: Exterior, hoja: Hoja });
    expect(creados).toBe(0);
    expect(adoptados).toBe(4); // div, h2, la isla interior y su botón
    expect(document.querySelector("button")).toBe(boton);
    boton.click();
    expect(boton.textContent).toBe("1");
  });
});

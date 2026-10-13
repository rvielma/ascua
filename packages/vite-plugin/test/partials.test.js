// @vitest-environment happy-dom
/**
 * Partials: un enlace interno reemplaza solo las regiones `data-partial`, con
 * sus islas, y si la página nueva no encaja se navega como siempre.
 */

import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { interceptable, partials } from "../partials.js";

const pagina = (titulo, cuerpo, islas = []) => `<!doctype html>
<html lang="es"><head><title>${titulo}</title><meta name="description" content="de ${titulo}">
<link rel="modulepreload" href="/assets/${titulo}.js"></head>
<body><header id="cabecera">menú</header>${cuerpo}
<script type="application/json" id="ascua-islands">${JSON.stringify(islas)}</script></body></html>`;

let hidratadas;
let liberadas;
let asignar;

beforeEach(() => {
  history.replaceState(null, "", "/");
  document.head.innerHTML = '<title>Inicio</title><link rel="modulepreload" href="/assets/Inicio.js">';
  document.body.innerHTML = '<header id="cabecera">menú</header><main data-partial="main"><a href="/b">a b</a></main>';
  hidratadas = [];
  liberadas = [];
  asignar = vi.spyOn(window.location, "assign").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Un `fetch` que responde estas páginas por camino. */
function servir(paginas) {
  const fetch = vi.fn(async (url) => {
    const camino = new URL(url).pathname;
    const html = paginas[camino];
    if (!html) return new Response("no", { status: 404, headers: { "content-type": "text/plain" } });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const hydrate = (raiz, _doc, fuera = []) => {
  const nombre = raiz === document ? `documento sin ${fuera.length}` : raiz.getAttribute?.("data-partial") ?? "?";
  const texto = raiz === document ? document.getElementById("cabecera").textContent : raiz.textContent;
  hidratadas.push(`${nombre}:${texto.trim().slice(0, 10)}`);
  return () => liberadas.push(nombre);
};

const clic = (selector) => {
  const enlace = document.querySelector(selector);
  const evento = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
  enlace.dispatchEvent(evento);
  return evento;
};

const esperar = () => new Promise((listo) => setTimeout(listo, 10));

it("al cargar, hidrata cada región por su lado y lo de fuera una vez", () => {
  partials({ hydrate });
  expect(hidratadas).toEqual(["documento sin 1:menú", "main:a b"]);
});

it("un enlace interno reemplaza la región, el título y suma los módulos nuevos", async () => {
  servir({ "/b": pagina("B", '<main data-partial="main"><h1>Página B</h1></main>', ["/src/islands/b.ts"]) });
  partials({ hydrate });
  const cabecera = document.getElementById("cabecera");

  const evento = clic('a[href="/b"]');
  expect(evento.defaultPrevented).toBe(true);
  await esperar();

  expect(document.querySelector("main").textContent).toBe("Página B");
  expect(document.title).toBe("B");
  expect(document.querySelector('meta[name="description"]').getAttribute("content")).toBe("de B");
  expect(document.querySelector('link[href="/assets/B.js"]')).not.toBeNull();
  // Lo de fuera de la región es el mismo nodo: no se tocó.
  expect(document.getElementById("cabecera")).toBe(cabecera);
  // Las islas de la región vieja se liberan y las de la nueva se hidratan.
  expect(liberadas).toEqual(["main"]);
  expect(hidratadas.at(-1)).toBe("main:Página B");
  expect(location.pathname).toBe("/b");
  expect(history.state).toMatchObject({ ascua: true });
  expect(asignar).not.toHaveBeenCalled();
});

it("si la página nueva no tiene la región, navega como siempre", async () => {
  servir({ "/b": pagina("B", "<div>sin región</div>") });
  partials({ hydrate });
  clic('a[href="/b"]');
  await esperar();
  expect(asignar).toHaveBeenCalledOnce();
  expect(document.querySelector("main").textContent).toBe("a b");
});

it("si no es HTML, también", async () => {
  servir({});
  partials({ hydrate });
  clic('a[href="/b"]');
  await esperar();
  expect(asignar).toHaveBeenCalledOnce();
});

it("no intercepta lo que no le toca", () => {
  document.body.innerHTML = `
    <a id="fuera" href="https://otro.example/x">fuera</a>
    <a id="nueva" href="/x" target="_blank">nueva</a>
    <a id="bajar" href="/x.pdf" download>bajar</a>
    <a id="externo" href="/x" rel="external">externo</a>
    <div data-partials="false"><a id="apagado" href="/x">apagado</a></div>
    <a id="ancla" href="#seccion">ancla</a>
    <a id="normal" href="/x">normal</a>`;
  const de = (id, extra = {}) =>
    interceptable(Object.assign(new MouseEvent("click", { button: 0, ...extra }), {}) && {
      defaultPrevented: false,
      button: extra.button ?? 0,
      metaKey: extra.metaKey ?? false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      target: document.getElementById(id),
    });
  expect(de("fuera")).toBeNull();
  expect(de("nueva")).toBeNull();
  expect(de("bajar")).toBeNull();
  expect(de("externo")).toBeNull();
  expect(de("apagado")).toBeNull();
  expect(de("ancla")).toBeNull();
  expect(de("normal", { metaKey: true })).toBeNull();
  expect(de("normal", { button: 1 })).toBeNull();
  expect(de("normal")).toBe(document.getElementById("normal"));
});

it("atrás vuelve a pedir la página y la reemplaza sin apilar otra entrada", async () => {
  servir({
    "/b": pagina("B", '<main data-partial="main"><a href="/">volver</a>B</main>'),
    "/": pagina("Inicio", '<main data-partial="main"><a href="/b">a b</a></main>'),
  });
  partials({ hydrate });
  clic('a[href="/b"]');
  await esperar();
  expect(document.title).toBe("B");

  const empujar = vi.spyOn(history, "pushState");
  history.replaceState({ ascua: true, scroll: 0 }, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate", { state: { ascua: true, scroll: 0 } }));
  await esperar();
  expect(document.title).toBe("Inicio");
  expect(empujar).not.toHaveBeenCalled();
});

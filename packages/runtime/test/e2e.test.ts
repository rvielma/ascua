/**
 * De TypeScript a DOM, pasando por el compilador de verdad.
 *
 * El test invoca el binario `ascuac`, ejecuta el JavaScript que produce y
 * comprueba el DOM resultante. Si el compilador y el runtime dejan de
 * entenderse, esto se rompe.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { hydrate, island } from "../src/index.js";
import { renderToString } from "../src/servidor.js";

const RAIZ = resolve(__dirname, "../../..");
const ASCUAC = join(RAIZ, "target/debug/ascuac");

let compilado = "";
let modulo: { Contador: (inicial?: number) => HTMLElement };

function compilar(fuente: string): string {
  return execFileSync(ASCUAC, [], { input: fuente, encoding: "utf8" });
}

beforeAll(async () => {
  const fuente = readFileSync(join(__dirname, "fixtures/contador.ts"), "utf8");
  compilado = compilar(fuente);

  // Dentro del proyecto: vitest no importa módulos de fuera de su raíz.
  const carpeta = join(__dirname, ".generado");
  mkdirSync(carpeta, { recursive: true });
  const destino = join(carpeta, "contador.js");
  writeFileSync(
    destino,
    // replaceAll: hay dos imports del runtime, el del fixture y el que añade
    // el compilador.
    compilado.replaceAll('"ascua"', `"${resolve(__dirname, "../src/index.ts")}"`),
  );
  modulo = (await import(/* @vite-ignore */ destino)) as typeof modulo;
});

describe("el código generado", () => {
  it("no deja rastro de la plantilla y pide solo lo que usa", () => {
    expect(compilado).not.toContain("view`");
    expect(compilado).toContain("element as _$el");
    expect(compilado).toContain("dynamicText as _$dtxt");
    expect(compilado).toContain("on as _$on");
  });

  it("se puede leer", () => {
    // Un compilador cuyo output no se entiende es magia con otro nombre.
    expect(compilado).toMatch(/const _n\d+ = _\$el\("div"\);/);
    expect(compilado).toMatch(/_\$add\(_n\d+, _n\d+\);/);
  });
});

describe("el componente compilado", () => {
  it("construye el árbol que dice la plantilla", () => {
    document.body.innerHTML = "";
    document.body.appendChild(modulo.Contador(0));

    const caja = document.querySelector(".caja")!;
    expect(caja.getAttribute("data-rol")).toBe("contador");
    expect(caja.querySelector("output")!.textContent).toBe("0");
    expect(caja.querySelector("output")!.getAttribute("class")).toBe("bajo");
    expect(caja.querySelector(".fijo")!.textContent).toBe("Empezó en 0");
  });

  it("reacciona sin sustituir nodos", () => {
    document.body.innerHTML = "";
    document.body.appendChild(modulo.Contador(0));

    const salida = document.querySelector("output")!;
    const nodoDeTexto = salida.firstChild;

    (document.querySelector(".mas") as HTMLElement).click();
    (document.querySelector(".mas") as HTMLElement).click();
    (document.querySelector(".mas") as HTMLElement).click();

    expect(salida.textContent).toBe("3");
    expect(salida.getAttribute("class")).toBe("alto"); // el atributo también sigue
    expect(salida.firstChild).toBe(nodoDeTexto); // el mismo nodo de siempre
    expect(document.querySelector("output")).toBe(salida);

    (document.querySelector(".menos") as HTMLElement).click();
    expect(salida.textContent).toBe("2");
    expect(salida.getAttribute("class")).toBe("bajo");
  });

  it("lo que no es una closure se evalúa una vez", () => {
    document.body.innerHTML = "";
    document.body.appendChild(modulo.Contador(5));

    // `${inicial}` no es reactivo: se quedó con el valor del montaje.
    expect(document.querySelector(".fijo")!.textContent).toBe("Empezó en 5");
    (document.querySelector(".mas") as HTMLElement).click();
    expect(document.querySelector(".fijo")!.textContent).toBe("Empezó en 5");
    expect(document.querySelector("output")!.textContent).toBe("6");
  });
});

describe("el componente compilado, del servidor al cliente", () => {
  it("se renderiza sin navegador y se hidrata sin crear nada", () => {
    const html = renderToString(() => island("contador", () => modulo.Contador(2), "2"));
    expect(html).toContain('<output data-ascua-h="2" class="bajo">2</output>');

    document.body.innerHTML = html;
    const salida = document.querySelector("output")!;
    const mas = document.querySelector(".mas") as HTMLElement;

    const { adoptados, creados } = hydrate({ contador: (props) => modulo.Contador(Number(props)) });
    expect(creados).toBe(0);
    expect(adoptados).toBe(document.querySelectorAll(".caja, .caja *").length);

    mas.click();
    expect(document.querySelector("output")).toBe(salida);
    expect(salida.textContent).toBe("3");
    expect(salida.getAttribute("class")).toBe("alto");
    expect(document.querySelector(".fijo")!.textContent).toBe("Empezó en 2");
    expect(document.body.innerHTML).not.toContain("data-ascua-h");
  });
});

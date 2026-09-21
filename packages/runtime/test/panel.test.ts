/**
 * Un panel entero, del TypeScript al DOM.
 *
 * Es el test que cubre lo que un contador no toca: componentes con props e
 * hijos, una región que se sustituye, una lista con clave que se filtra y
 * reordena, y un formulario cuyo `value` manda sobre lo que el usuario
 * escribió.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

const RAIZ = resolve(__dirname, "../../..");
const ASCUAC = join(RAIZ, "target/debug/ascuac");

let compilado = "";
let modulo: { Panel: () => HTMLElement };

function elemento<T extends Element>(selector: string): T {
  const encontrado = document.querySelector<T>(selector);
  if (!encontrado) throw new Error(`no hay ningún ${selector} en el documento`);
  return encontrado;
}

function pulsar(selector: string): void {
  (elemento<HTMLElement>(selector)).click();
}

function escribir(selector: string, texto: string): void {
  const campo = elemento<HTMLInputElement>(selector);
  campo.value = texto;
  campo.dispatchEvent(new Event("input", { bubbles: true }));
}

function entrar(nombre = "Ana"): void {
  escribir(".usuario", nombre);
  elemento<HTMLFormElement>(".acceso").dispatchEvent(new Event("submit", { bubbles: true }));
}

beforeAll(async () => {
  const fuente = readFileSync(join(__dirname, "fixtures/panel.ts"), "utf8");
  compilado = execFileSync(ASCUAC, [], { input: fuente, encoding: "utf8" });

  const carpeta = join(__dirname, ".generado");
  mkdirSync(carpeta, { recursive: true });
  // Se guarda como .ts porque el fixture es TypeScript y el compilador de
  // Ascua no transpila: copia lo que no es plantilla tal cual, a propósito.
  const destino = join(carpeta, "panel.ts");
  writeFileSync(
    destino,
    compilado.replaceAll('"@ascua/runtime"', `"${resolve(__dirname, "../src/index.ts")}"`),
  );
  modulo = (await import(/* @vite-ignore */ destino)) as typeof modulo;
});

beforeEach(() => {
  document.body.innerHTML = "";
  document.body.appendChild(modulo.Panel());
});

describe("el código generado", () => {
  it("resuelve los componentes como llamadas, no como etiquetas", () => {
    expect(compilado).toContain("Tarjeta({");
    expect(compilado).not.toContain('_$el("Tarjeta")');
    expect(compilado).not.toContain('_$el("Show")');
    expect(compilado).not.toContain('_$el("For")');
  });

  it("compila también las plantillas que van dentro de un hueco", () => {
    // El `render` del <For> lleva otra plantilla dentro.
    expect(compilado).not.toContain("view`");
    expect(compilado).toContain('_$el("li")');
  });
});

describe("la región que se sustituye", () => {
  it("empieza en la otra rama", () => {
    expect(document.querySelector(".acceso")).not.toBeNull();
    expect(document.querySelector(".tarjeta")).toBeNull();
  });

  it("cambia de rama y libera la anterior", () => {
    entrar();
    expect(document.querySelector(".acceso")).toBeNull();
    expect(elemento(".tarjeta h2").textContent).toBe("Tareas");

    pulsar(".salir");
    expect(document.querySelector(".tarjeta")).toBeNull();
    expect(document.querySelector(".acceso")).not.toBeNull();
  });

  it("no reconstruye si la condición no cambia de valor", () => {
    const formulario = elemento(".acceso");
    escribir(".usuario", "Ana");
    escribir(".usuario", "Anabel");
    // Sigue en la misma rama: el mismo nodo de siempre.
    expect(document.querySelector(".acceso")).toBe(formulario);
  });
});

describe("el formulario", () => {
  it("el botón sigue al estado del campo", () => {
    const boton = elemento<HTMLButtonElement>(".entrar");
    expect(boton.hasAttribute("disabled")).toBe(true);

    escribir(".usuario", "Ana");
    expect(boton.hasAttribute("disabled")).toBe(false);

    escribir(".usuario", "   ");
    expect(boton.hasAttribute("disabled")).toBe(true);
  });

  it("`prop:` manda sobre lo que el usuario tecleó", () => {
    entrar("Ana");
    const filtro = elemento<HTMLInputElement>(".filtro");

    escribir(".filtro", "dormir");
    expect(filtro.value).toBe("dormir");
    expect(elemento(".tareas").children).toHaveLength(1);

    // La propiedad, no el atributo: esto es lo que un `value=` no consigue.
    expect(filtro.getAttribute("value")).toBeNull();
  });
});

describe("los hijos de un componente", () => {
  it("van donde el componente decide", () => {
    entrar();
    const cuerpo = elemento(".tarjeta .cuerpo");
    expect(cuerpo.querySelector(".tareas")).not.toBeNull();
    expect(elemento(".hola").textContent).toBe("Hola Ana");
  });
});

describe("la lista con clave", () => {
  it("conserva los nodos de las claves que siguen estando", () => {
    entrar();
    const primera = elemento('[data-id="1"]');

    pulsar(".anadir");
    expect(elemento(".tareas").children).toHaveLength(3);
    expect(document.querySelector('[data-id="1"]')).toBe(primera);
  });

  it("un cambio dentro de una fila no reconstruye la fila", () => {
    entrar();
    const fila = elemento('[data-id="1"]');
    const titulo = fila.querySelector(".titulo")!.firstChild;

    expect(elemento(".cuenta").textContent).toBe("1 pendientes");
    (fila.querySelector(".alternar") as HTMLElement).click();

    expect(fila.getAttribute("class")).toBe("hecha");
    expect(document.querySelector('[data-id="1"]')).toBe(fila);
    expect(fila.querySelector(".titulo")!.firstChild).toBe(titulo);
    // Y la cifra derivada se ha enterado.
    expect(elemento(".cuenta").textContent).toBe("0 pendientes");
  });

  it("filtrar quita y devuelve filas sin perder las que quedan", () => {
    entrar();
    const dormir = elemento('[data-id="2"]');

    escribir(".filtro", "dormir");
    expect(elemento(".tareas").children).toHaveLength(1);
    expect(document.querySelector('[data-id="2"]')).toBe(dormir);

    escribir(".filtro", "");
    expect(elemento(".tareas").children).toHaveLength(2);
    expect(document.querySelector('[data-id="2"]')).toBe(dormir);
  });

  it("la región de la lista vacía aparece cuando no queda nada", () => {
    entrar();
    expect(document.querySelector(".vacio")).toBeNull();

    escribir(".filtro", "zzz");
    expect(elemento(".vacio").textContent).toBe("Nada coincide");

    escribir(".filtro", "");
    expect(document.querySelector(".vacio")).toBeNull();
  });

  it("las regiones hermanas conservan su sitio", () => {
    entrar();
    // <p class="vacio"> va entre la lista y el botón de añadir, no al final:
    // el marcador de la región guarda la posición.
    escribir(".filtro", "zzz");
    const cuerpo = elemento(".cuerpo");
    const orden = [...cuerpo.children].map((hijo) => hijo.className);
    expect(orden).toEqual(["hola", "cuenta", "filtro", "tareas", "vacio", "anadir", "salir"]);
  });
});

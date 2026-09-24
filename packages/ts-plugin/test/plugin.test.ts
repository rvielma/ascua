/**
 * El plugin sobre un language service de verdad, como el que arma tsserver
 * para el editor: TypeScript 6 con el proyecto de prueba en disco.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
// ASCUA_TS permite probar con otra versión: la ruta a un paquete typescript.
const ts = require(process.env.ASCUA_TS ?? "typescript") as typeof import("typescript");
const init = require("../index.js");

const PROYECTO = join(__dirname, "fixtures/proyecto");
const ruta = (archivo: string) => join(PROYECTO, archivo);

let servicio: import("typescript").LanguageService;

beforeAll(() => {
  const configuracion = ts.readConfigFile(ruta("tsconfig.json"), ts.sys.readFile).config;
  const { options, fileNames } = ts.parseJsonConfigFileContent(configuracion, ts.sys, PROYECTO);

  const host: import("typescript").LanguageServiceHost = {
    getScriptFileNames: () => fileNames,
    getScriptVersion: () => "1",
    getScriptSnapshot: (nombre) =>
      ts.sys.fileExists(nombre) ? ts.ScriptSnapshot.fromString(readFileSync(nombre, "utf8")) : undefined,
    getCurrentDirectory: () => PROYECTO,
    getCompilationSettings: () => options,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
  };
  const base = ts.createLanguageService(host, ts.createDocumentRegistry());
  servicio = init({ typescript: ts }).create({
    languageService: base,
    project: { getCurrentDirectory: () => PROYECTO, projectService: { logger: { info() {} } } },
    config: {},
  });
});

/** La posición de la n-ésima aparición de `aguja` en el archivo, más `desplazamiento`. */
function posicion(archivo: string, aguja: string, desplazamiento = 0) {
  const texto = readFileSync(ruta(archivo), "utf8");
  const indice = texto.indexOf(aguja);
  if (indice < 0) throw new Error(`no está «${aguja}» en ${archivo}`);
  return indice + desplazamiento;
}

function lugar(archivo: string, inicio: number) {
  const texto = readFileSync(ruta(archivo), "utf8");
  const antes = texto.slice(0, inicio).split("\n");
  return { linea: antes.length, columna: antes[antes.length - 1]!.length + 1 };
}

describe("diagnósticos", () => {
  it("los errores de dentro de las plantillas aparecen en su línea", () => {
    const diagnosticos = servicio.getSemanticDiagnostics(ruta("src/mal.ts"));
    const vistos = diagnosticos.map((d) => ({ ...lugar("src/mal.ts", d.start!), codigo: d.code, fuente: d.source }));

    expect(vistos).toEqual([
      // El de fuera de las plantillas lo da TypeScript, como siempre.
      { linea: 19, columna: 14, codigo: 2322, fuente: undefined },
      { linea: 10, columna: 16, codigo: 2322, fuente: "ascua" },
      // Un prop obligatorio que falta: TypeScript 6 lo da como 2345 y el 7
      // como 2741. El mensaje es el mismo.
      { linea: 11, columna: 7, codigo: 2345, fuente: "ascua" },
      { linea: 14, columna: 9, codigo: 2322, fuente: "ascua" },
      { linea: 15, columna: 7, codigo: 2769, fuente: "ascua" },
    ]);
  });

  it("subrayan lo que falla: el prop, no la línea entera", () => {
    const [, titulo] = servicio.getSemanticDiagnostics(ruta("src/mal.ts"));
    const texto = readFileSync(ruta("src/mal.ts"), "utf8");
    expect(texto.slice(titulo!.start!, titulo!.start! + titulo!.length!)).toBe("titulo");
  });

  it("lo bien tipado queda limpio", () => {
    expect(servicio.getSemanticDiagnostics(ruta("src/bien.ts"))).toEqual([]);
    expect(servicio.getSemanticDiagnostics(ruta("src/componentes.ts"))).toEqual([]);
  });

  it("una plantilla mal formada es un error en su línea", () => {
    const [error] = servicio.getSemanticDiagnostics(ruta("src/rota.ts"));
    expect(error!.code).toBe(90001);
    expect(String(error!.messageText)).toMatch(/^Ascua: .*no cierra/);
    expect(lugar("src/rota.ts", error!.start!).linea).toBeGreaterThanOrEqual(1);
  });
});

describe("autocompletado", () => {
  it("dentro de la etiqueta de un componente, ofrece sus props", () => {
    const aqui = posicion("src/editor.ts", `<Metrica etiqueta="dos" `, `<Metrica etiqueta="dos" `.length);
    const nombres = servicio.getCompletionsAtPosition(ruta("src/editor.ts"), aqui, {})!.entries.map((e) => e.name);
    // `etiqueta` ya está escrito; `valor` falta.
    expect(nombres).toEqual(["valor"]);
  });

  it("no ofrece lo ya escrito, aunque esté después del cursor, ni children", () => {
    const aqui = posicion("src/editor.ts", `<Tarjeta `, `<Tarjeta `.length);
    const resultado = servicio.getCompletionsAtPosition(ruta("src/editor.ts"), aqui, {});
    // `titulo` ya está; `children` son los hijos, no un atributo.
    expect(resultado?.entries.filter((e) => ["titulo", "children"].includes(e.name)) ?? []).toEqual([]);
  });

  it("dentro de un valor entre comillas, no", () => {
    const aqui = posicion("src/editor.ts", `etiqueta="d`, `etiqueta="d`.length);
    const resultado = servicio.getCompletionsAtPosition(ruta("src/editor.ts"), aqui, {});
    expect(resultado?.entries.some((e) => e.name === "valor") ?? false).toBe(false);
  });
});

describe("autocompletado del HTML", () => {
  const completar = (aguja: string, desplazamiento: number, fragmentos = false) =>
    servicio.getCompletionsAtPosition(ruta("src/html.ts"), posicion("src/html.ts", aguja, desplazamiento), {
      includeCompletionsWithSnippetText: fragmentos,
    })!.entries;

  it("en una etiqueta, sus atributos, los globales, los eventos y prop:", () => {
    const entradas = completar(`disabled >`, `disabled `.length);
    const nombres = entradas.map((e) => e.name);

    expect(nombres).toEqual(expect.arrayContaining(["placeholder", "value", "name", "required"]));
    expect(nombres).toEqual(expect.arrayContaining(["id", "class", "tabindex", "hidden"]));
    expect(nombres).toEqual(expect.arrayContaining(["oninput", "onclick", "onkeydown"]));
    expect(nombres).toEqual(expect.arrayContaining(["prop:value", "prop:checked", "class:", "ref"]));
    // Lo ya escrito no se repite.
    expect(nombres).not.toContain("type");
    expect(nombres).not.toContain("disabled");
    // Ni métodos, ni lo que es de solo lectura, ni los manejadores `on…` como propiedad.
    expect(nombres).not.toContain("prop:click");
    expect(nombres).not.toContain("prop:form");
    expect(nombres).not.toContain("prop:onclick");
  });

  it("los atributos de la etiqueta van primero, y las propiedades suyas antes que las heredadas", () => {
    const entradas = completar(`disabled >`, `disabled `.length);
    const orden = (nombre: string) => entradas.find((e) => e.name === nombre)!.sortText;
    expect(orden("placeholder") < orden("id")).toBe(true);
    expect(orden("id") < orden("onclick")).toBe(true);
    expect(orden("prop:value") < orden("prop:title")).toBe(true);
  });

  it("cada etiqueta, los suyos", () => {
    const nombres = completar(`<a >`, 3).map((e) => e.name);
    expect(nombres).toEqual(expect.arrayContaining(["href", "target", "download"]));
    expect(nombres).not.toContain("placeholder");
  });

  it("con fragmentos, el valor viene puesto", () => {
    const entradas = completar(`disabled >`, `disabled `.length, true);
    const insertar = (nombre: string) => entradas.find((e) => e.name === nombre)!.insertText;
    expect(insertar("placeholder")).toBe('placeholder="$1"');
    expect(insertar("oninput")).toBe("oninput=${$1}");
    expect(insertar("prop:value")).toBe("prop:value=${$1}");
    // Un booleano se escribe solo.
    expect(insertar("required")).toBeUndefined();
  });

  it("después de <, las etiquetas y los componentes en scope", () => {
    const entradas = completar(`<p><`, 4);
    const nombres = entradas.map((e) => e.name);
    expect(nombres).toEqual(expect.arrayContaining(["button", "div", "input", "section"]));
    expect(nombres).toContain("Metrica");
    // Los componentes primero.
    expect(entradas.find((e) => e.name === "Metrica")!.sortText).toBe("0");
  });
});

describe("navegación", () => {
  it("ir a la definición desde la etiqueta", () => {
    const aqui = posicion("src/editor.ts", "<Metrica", 3);
    const resultado = servicio.getDefinitionAndBoundSpan(ruta("src/editor.ts"), aqui)!;
    const [destino] = resultado.definitions!;
    expect(destino!.fileName).toBe(ruta("src/componentes.ts"));
    const texto = readFileSync(destino!.fileName, "utf8");
    expect(texto.slice(destino!.textSpan.start, destino!.textSpan.start + destino!.textSpan.length)).toBe("Metrica");
  });

  it("al pasar por encima, la firma del componente", () => {
    const aqui = posicion("src/editor.ts", "<Tarjeta", 2);
    const info = servicio.getQuickInfoAtPosition(ruta("src/editor.ts"), aqui)!;
    const texto = info.displayParts!.map((p) => p.text).join("");
    expect(texto).toContain("(componente) Tarjeta(props: { titulo: string; children?: Children");
  });
});

it("fuera de las plantillas no cambia nada", () => {
  const aqui = posicion("src/editor.ts", "Metrica, Tarjeta", 2);
  expect(servicio.getQuickInfoAtPosition(ruta("src/editor.ts"), aqui)?.displayParts?.map((p) => p.text).join("")).toMatch(
    /Metrica/,
  );
  expect(dirname(ruta("x"))).toBe(PROYECTO);
});

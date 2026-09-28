/**
 * ascua-check sobre un proyecto de verdad: con un archivo bien tipado, otro
 * con errores en líneas conocidas, un tsconfig con comentarios, `paths` y un
 * alias. Cada test ejecuta el tsc del paquete.
 */

import { existsSync } from "node:fs";
import { join, relative } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { check } from "../src/index.js";

const PROYECTO = join(__dirname, "fixtures/proyecto");

type Resultado = Awaited<ReturnType<typeof check>>;
let resultado: Resultado;

const de = (archivo: string) =>
  resultado.diagnostics
    .filter((d) => relative(PROYECTO, d.file) === archivo)
    .map((d) => ({ linea: d.line, columna: d.column, codigo: d.code, mensaje: d.message.split("\n")[0] }));

beforeAll(async () => {
  resultado = await check({ project: join(PROYECTO, "tsconfig.json") });
});

describe("ascua-check", () => {
  it("lo bien tipado pasa, con ref y eventos de su tipo concreto", () => {
    expect(de("src/bien.ts")).toEqual([]);
    expect(de("src/componentes.ts")).toEqual([]);
  });

  it("encuentra los errores de dentro de las plantillas, cada uno en su línea", () => {
    const errores = de("src/mal.ts");
    expect(errores.map((e) => [e.linea, e.codigo])).toEqual([
      [10, "TS2322"], // <Tarjeta titulo=${42}/>
      [11, "TS2741"], // <Metrica> sin `valor`
      [14, "TS2322"], // valor=${() => "cero"}, en la tercera línea de su etiqueta
      [15, "TS2769"], // onclick con un KeyboardEvent
      [19, "TS2322"], // y lo de fuera de las plantillas, como siempre
    ]);
  });

  it("Show entrega el valor estrechado, bind exige su tipo y <Menu/> no pide firma", () => {
    expect(de("src/novedades.ts").map((e) => [e.linea, e.codigo])).toEqual([
      [29, "TS2345"], // <Pide/> sin su prop obligatoria
      [32, "TS2769"], // bind:value con un signal de número
      // `when=${datos}` sin flecha y el parámetro anotado en un genérico
      // pasan; un componente por nombre como hijo de <Show> no.
      [54, "TS2345"],
    ]);
  });

  it("la columna señala lo que falla en la línea original", () => {
    const [titulo, , valor] = de("src/mal.ts");
    // `      <Tarjeta titulo=${42}/>`: la columna de `titulo`.
    expect(titulo!.columna).toBe(16);
    // `        valor=${() => "cero"}/>`
    expect(valor!.columna).toBe(9);
  });

  it("los mensajes son los de TypeScript", () => {
    expect(de("src/mal.ts")[0]!.mensaje).toBe("Type 'number' is not assignable to type 'string'.");
  });

  it("cuenta lo que hizo y no deja la copia", () => {
    expect(resultado.files).toBe(4);
    expect(resultado.withTemplates).toBe(4);
    expect(existsSync(join(PROYECTO, ".ascua-check"))).toBe(false);
  });

  it("si una plantilla no compila, dice cuál y por qué", async () => {
    const roto = join(__dirname, "fixtures/roto/tsconfig.json");
    await expect(check({ project: roto })).rejects.toThrow(
      /src\/raiz\.ts: .*<Show> necesita un elemento donde anclarse/,
    );
  });

  it("sin tsconfig lo dice", async () => {
    await expect(check({ project: join(PROYECTO, "no-existe.json") })).rejects.toThrow(/no existe/);
  });
});

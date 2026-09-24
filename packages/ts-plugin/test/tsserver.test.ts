/**
 * De punta a punta: tsserver de verdad, que carga el plugin desde el
 * tsconfig —como en el editor— y responde por su protocolo.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { afterAll, beforeAll, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const PROYECTO = join(__dirname, "fixtures/proyecto");
const ENLACE = join(PROYECTO, "node_modules/ascua-ts-plugin");

let servidor: ChildProcess;
let salida = "";
let secuencia = 0;

/** Manda una petición y espera su respuesta. */
function pedir(command: string, args: object): Promise<any> {
  const seq = ++secuencia;
  servidor.stdin!.write(`${JSON.stringify({ seq, type: "request", command, arguments: args })}\n`);
  return new Promise((listo, fallo) => {
    const limite = setTimeout(() => fallo(new Error(`sin respuesta a ${command}`)), 50_000);
    const mirar = () => {
      // Solo las líneas completas: una respuesta grande llega en trozos.
      const lineas = salida.split(/\r?\n/);
      lineas.pop();
      for (const linea of lineas) {
        if (!linea.startsWith("{")) continue;
        let mensaje;
        try {
          mensaje = JSON.parse(linea);
        } catch {
          continue;
        }
        if (mensaje.type === "response" && mensaje.request_seq === seq) {
          clearTimeout(limite);
          servidor.stdout!.off("data", mirar);
          return listo(mensaje);
        }
      }
    };
    servidor.stdout!.on("data", mirar);
    mirar();
  });
}

beforeAll(() => {
  // El plugin se resuelve desde el node_modules del proyecto, como uno
  // instalado.
  rmSync(ENLACE, { force: true, recursive: true });
  mkdirSync(dirname(ENLACE), { recursive: true });
  symlinkSync(join(__dirname, ".."), ENLACE, "dir");

  const paquete = process.env.ASCUA_TS ?? dirname(require.resolve("typescript/package.json"));
  const tsserver = join(paquete, "lib/tsserver.js");
  // tsserver busca los plugins junto al TypeScript que corre. En el editor,
  // con la versión del proyecto, ese es el node_modules del proyecto; aquí se
  // le indica con --pluginProbeLocations, que es lo mismo.
  servidor = spawn(
    process.execPath,
    [tsserver, "--disableAutomaticTypingAcquisition", "--pluginProbeLocations", PROYECTO],
    { cwd: PROYECTO },
  );
  servidor.stdout!.setEncoding("utf8");
  servidor.stdout!.on("data", (trozo: string) => (salida += trozo));
});

afterAll(() => {
  servidor?.kill();
  rmSync(join(PROYECTO, "node_modules"), { force: true, recursive: true });
});

it("tsserver carga el plugin desde el tsconfig y los errores llegan al editor", async () => {
  const archivo = join(PROYECTO, "src/mal.ts");
  servidor.stdin!.write(
    `${JSON.stringify({ seq: ++secuencia, type: "request", command: "open", arguments: { file: archivo } })}\n`,
  );
  const respuesta = await pedir("semanticDiagnosticsSync", { file: archivo });

  const deAscua = respuesta.body.filter((d: any) => d.source === "ascua");
  expect(deAscua.map((d: any) => d.start.line)).toEqual([10, 11, 14, 15]);
  expect(deAscua[0].text).toBe("Type 'number' is not assignable to type 'string'.");
});

it("y el autocompletado de atributos, por el mismo protocolo", async () => {
  const archivo = join(PROYECTO, "src/html.ts");
  servidor.stdin!.write(
    `${JSON.stringify({ seq: ++secuencia, type: "request", command: "open", arguments: { file: archivo } })}\n`,
  );
  // Línea 6: `      <input type="text" disabled >`, con el cursor antes del `>`
  // (tsserver cuenta las columnas desde 1).
  const respuesta = await pedir("completionInfo", { file: archivo, line: 6, offset: 35 });
  const nombres = respuesta.body.entries.map((e: any) => e.name);
  expect(nombres).toEqual(expect.arrayContaining(["placeholder", "oninput", "prop:value"]));
  expect(nombres).not.toContain("disabled");
});


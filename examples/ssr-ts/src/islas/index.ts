/**
 * Las islas: las únicas partes de la página que llevan JavaScript.
 *
 * Cada una tiene dos caras. En el servidor, `IslaX` envuelve el componente en
 * `<ascua-island>` con sus props en JSON. En el cliente, `ISLAS` dice cómo
 * reconstruirla a partir de esos props. Ascua no impone el formato: aquí es
 * JSON porque es lo cómodo.
 */

import { island } from "ascua";

import type { Lenguaje } from "../datos.js";
import { Buscador } from "./buscador.js";
import { Contador } from "./contador.js";

export function IslaContador(props: { inicial: number }) {
  return island("contador", () => Contador(props), JSON.stringify(props));
}

export function IslaBuscador(props: { lenguajes: Lenguaje[] }) {
  return island("buscador", () => Buscador(props), JSON.stringify(props));
}

export const ISLAS = {
  contador: (props: string) => Contador(JSON.parse(props)),
  buscador: (props: string) => Buscador(JSON.parse(props)),
};

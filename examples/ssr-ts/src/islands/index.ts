/**
 * Las islas: las únicas partes de la página que llevan JavaScript.
 *
 * Cada una se define una vez, con el esquema de sus props. En el servidor se
 * usa como un componente y deja los props en JSON; en el cliente, `hydrate`
 * los comprueba contra el esquema antes de activarla. Si el servidor mandó
 * otra cosa —otra versión, un dato mal convertido—, la isla se queda estática
 * y la consola dice qué campo falló.
 */

import { defineIsland, p } from "ascua";

import { Buscador } from "./buscador.js";
import { Contador } from "./contador.js";

export const IslaContador = defineIsland("contador", { inicial: p.number }, Contador);

export const IslaBuscador = defineIsland(
  "buscador",
  { lenguajes: p.array(p.object({ nombre: p.string, año: p.number })) },
  Buscador,
);

export const ISLAS = [IslaContador, IslaBuscador];

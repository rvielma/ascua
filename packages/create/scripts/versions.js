/**
 * Escribe `versions.json` con las versiones de los paquetes de Ascua del
 * repositorio. Corre antes de empaquetar (`prepack`): lo publicado lleva las
 * versiones que se publicaron con él.
 */

import { writeFileSync } from "node:fs";

import { versionesDelRepositorio } from "../index.js";

writeFileSync(new URL("../versions.json", import.meta.url), `${JSON.stringify(versionesDelRepositorio(), null, 2)}\n`);

/**
 * Lo único que corre en el navegador: encontrar las islas y adoptarlas.
 *
 * Las páginas no se importan aquí, así que su código no viaja. El bundle es
 * el runtime más los componentes de las islas.
 */

import { hydrate } from "ascua";

import { ISLAS } from "./islas/index.js";

const { adoptados, creados } = hydrate(ISLAS);

// Si el servidor y el cliente se desincronizan, aquí se ve: `creados` deja de
// ser cero. No rompe nada —lo que no encaja se crea—, pero conviene saberlo.
if (import.meta.env.DEV) console.info(`[ascua] hidratación: ${adoptados} adoptados, ${creados} creados`);

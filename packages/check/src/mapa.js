/**
 * Lo justo de los source maps: de qué línea original viene cada línea
 * generada.
 *
 * El compilador de Ascua emite un mapa por líneas —un segmento al principio
 * de cada una—, así que no hace falta una librería: basta con leer el primer
 * segmento de cada línea y acumular su tercer campo.
 */

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Decodifica un segmento VLQ en sus números. */
function vlq(segmento) {
  const valores = [];
  let valor = 0;
  let desplazamiento = 0;
  for (const caracter of segmento) {
    let digito = BASE64.indexOf(caracter);
    if (digito < 0) break;
    const sigue = digito & 32;
    digito &= 31;
    valor += digito << desplazamiento;
    if (sigue) {
      desplazamiento += 5;
    } else {
      valores.push(valor & 1 ? -(valor >> 1) : valor >> 1);
      valor = 0;
      desplazamiento = 0;
    }
  }
  return valores;
}

/**
 * Para cada línea generada, la línea original (desde 0). Una línea sin
 * segmento hereda la de la anterior.
 *
 * @param {{ mappings: string } | string} mapa
 * @returns {number[]}
 */
export function lineasDeOrigen(mapa) {
  const { mappings } = typeof mapa === "string" ? JSON.parse(mapa) : mapa;
  const lineas = [];
  let original = 0;
  for (const linea of mappings.split(";")) {
    const primero = linea.split(",")[0];
    if (primero) {
      const campos = vlq(primero);
      if (campos.length >= 3) original += campos[2];
    }
    lineas.push(original);
  }
  return lineas;
}

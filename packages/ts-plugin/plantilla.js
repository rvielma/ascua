"use strict";
/**
 * Lo que el plugin necesita saber de una plantilla sin compilarla: dónde
 * está, qué hay bajo el cursor y de qué línea viene cada línea compilada.
 */

const ETIQUETAS = new Set(["view", "html"]);

/** La plantilla `view`/`html` que contiene la posición, o `undefined`. */
function plantillaEn(ts, archivo, posicion) {
  let encontrada;
  const visitar = (nodo) => {
    if (posicion < nodo.getFullStart() || posicion > nodo.getEnd()) return;
    if (
      ts.isTaggedTemplateExpression(nodo) &&
      ts.isIdentifier(nodo.tag) &&
      ETIQUETAS.has(nodo.tag.text) &&
      posicion > nodo.template.getStart(archivo) &&
      posicion < nodo.template.getEnd()
    ) {
      // La más interna gana: el `render` de un <For> es otra plantilla.
      encontrada = nodo;
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(archivo);
  return encontrada;
}

/**
 * El texto de la plantilla con los huecos tapados.
 *
 * Cada `${…}` se sustituye por guiones bajos de la misma longitud, así que las
 * posiciones siguen valiendo y un `<` o un `>` escritos dentro de una
 * expresión no confunden a quien busca etiquetas.
 */
function enmascarar(ts, archivo, nodo) {
  const plantilla = nodo.template;
  const inicio = plantilla.getStart(archivo);
  const caracteres = archivo.text.slice(inicio, plantilla.getEnd()).split("");

  if (ts.isTemplateExpression(plantilla)) {
    const literales = [plantilla.head, ...plantilla.templateSpans.map((span) => span.literal)];
    for (let i = 0; i + 1 < literales.length; i++) {
      // `${` son los dos últimos caracteres de un literal, y `}` el primero
      // del siguiente.
      const desde = literales[i].getEnd() - 2 - inicio;
      const hasta = literales[i + 1].getStart(archivo) + 1 - inicio;
      for (let j = desde; j < hasta; j++) if (caracteres[j] !== "\n") caracteres[j] = "_";
    }
  }
  return { inicio, texto: caracteres.join("") };
}

/**
 * Qué hay en `relativa` —una posición dentro del texto enmascarado—: la
 * etiqueta que se está escribiendo y en qué parte de ella está el cursor.
 */
function etiquetaEn(texto, relativa) {
  const antes = texto.slice(0, relativa);
  const abre = antes.lastIndexOf("<");
  if (abre < 0 || antes.indexOf(">", abre) >= 0) return undefined;
  // `</div>` es un cierre: ahí no hay nada que completar.
  if (texto[abre + 1] === "/") return undefined;

  // El nombre puede estar vacío si el cursor está justo después de `<`: es
  // cuando se completan etiquetas.
  const nombre = /^[A-Za-z][\w.-]*/.exec(texto.slice(abre + 1))?.[0] ?? "";
  const finNombre = abre + 1 + nombre.length;
  if (!nombre && relativa !== abre + 1) return undefined;

  const dentro = texto.slice(finNombre, relativa);
  // Dentro de un valor entre comillas no se completa nada.
  const comillas = (dentro.match(/"/g)?.length ?? 0) + (dentro.match(/'/g)?.length ?? 0);
  const prefijo = /[\w:-]*$/.exec(dentro)?.[0] ?? "";

  // Lo ya escrito es la etiqueta entera, también lo que hay después del
  // cursor —en `<Tarjeta | titulo="x">`, `titulo` no se vuelve a ofrecer—,
  // pero no la palabra que se está escribiendo.
  const cierra = texto.indexOf(">", relativa);
  let despues = texto.slice(relativa, cierra < 0 ? texto.length : cierra);
  // Si el cursor está a mitad de una palabra, su final es parte de lo que se
  // escribe; si está delante de una, esa ya estaba.
  if (prefijo) despues = despues.replace(/^[\w:-]*/, "");
  const sinValores = `${texto.slice(finNombre, relativa - prefijo.length)} ${despues}`
    .replace(/"[^"]*"|'[^']*'/g, "")
    .replace(/_+/g, "");
  const escritos = new Set([...sinValores.matchAll(/[\w:.-]+/g)].map((m) => m[0]));

  return {
    nombre,
    esComponente: /^[A-Z]/.test(nombre),
    inicioNombre: abre + 1,
    enNombre: relativa <= finNombre,
    enValor: comillas % 2 === 1 || /=\s*$/.test(dentro),
    escritos,
    prefijo,
  };
}

// ---------------------------------------------------------------------------
// Source map: de qué línea original viene cada línea compilada.

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

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

/** Para cada línea compilada, la línea original (desde 0). */
function lineasDeOrigen(mapa) {
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

module.exports = { plantillaEn, enmascarar, etiquetaEn, lineasDeOrigen };

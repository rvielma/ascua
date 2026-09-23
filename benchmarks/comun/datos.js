// Los datos del benchmark, iguales para todos los contendientes.
//
// Son los de js-framework-benchmark: etiquetas de tres palabras al azar y un
// id que crece. Todos importan este mismo módulo, así que el coste de
// generarlos es idéntico en cada columna y no distorsiona la comparación.

const ADJETIVOS = [
  "pretty", "large", "big", "small", "tall", "short", "long", "handsome", "plain",
  "quaint", "clean", "elegant", "easy", "angry", "crazy", "helpful", "mushy", "odd",
  "unsightly", "adorable", "important", "inexpensive", "cheap", "expensive", "fancy",
];
const COLORES = [
  "red", "yellow", "blue", "green", "pink", "brown", "purple", "brown", "white",
  "black", "orange",
];
const NOMBRES = [
  "table", "chair", "house", "bbq", "desk", "car", "pony", "cookie", "sandwich",
  "burger", "pizza", "mouse", "keyboard",
];

let siguiente = 1;

function azar(maximo) {
  return Math.round(Math.random() * 1000) % maximo;
}

export function construirDatos(cuantas) {
  const datos = new Array(cuantas);
  for (let i = 0; i < cuantas; i++) {
    datos[i] = {
      id: siguiente++,
      label: `${ADJETIVOS[azar(ADJETIVOS.length)]} ${COLORES[azar(COLORES.length)]} ${NOMBRES[azar(NOMBRES.length)]}`,
    };
  }
  return datos;
}

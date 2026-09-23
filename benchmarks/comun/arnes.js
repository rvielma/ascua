// El arnés: mide las operaciones de js-framework-benchmark desde dentro de la
// página, igual para todos los contendientes.
//
// Qué se mide: desde el click hasta que el DOM está actualizado y maquetado.
// Se fuerza el layout leyendo `offsetHeight`, así que entra el recálculo de
// estilos y la maquetación, pero no el pintado. js-framework-benchmark mide
// con trazas de Chrome e incluye el pintado; por eso los números absolutos no
// son comparables con los suyos, y los relativos sí.
//
// Qué se comprueba: después de cada vuelta, el DOM tiene que estar como debe.
// Si un framework deja trabajo pendiente —React programa el suyo en una
// microtarea—, la comprobación falla y no sale un número falso.

const filas = () => document.querySelectorAll("tbody tr");
const boton = (id) => document.getElementById(id);
const idDe = (fila) => Number(fila.querySelector("td").textContent);
const etiquetaDe = (fila) => fila.querySelector("a.lbl").textContent;

/** Deja que termine lo que el framework haya programado y fuerza el layout. */
async function asentar() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  void document.body.offsetHeight;
}

const crear = () => boton("run").click();

const OPERACIONES = [
  {
    nombre: "crear 1.000 filas",
    accion: crear,
    ok: () => filas().length === 1000,
  },
  {
    nombre: "reemplazar 1.000",
    antes: [crear],
    captura: () => idDe(filas()[0]),
    accion: crear,
    ok: (primera) => filas().length === 1000 && idDe(filas()[0]) !== primera,
  },
  {
    nombre: "actualizar 1 de cada 10",
    antes: [crear],
    accion: () => boton("update").click(),
    ok: () => etiquetaDe(filas()[0]).endsWith(" !!!") && etiquetaDe(filas()[10]).endsWith(" !!!"),
  },
  {
    nombre: "seleccionar una fila",
    antes: [crear],
    accion: () => filas()[1].querySelector("a.lbl").click(),
    ok: () => filas()[1].classList.contains("danger"),
  },
  {
    nombre: "intercambiar dos filas",
    antes: [crear],
    captura: () => idDe(filas()[998]),
    accion: () => boton("swaprows").click(),
    ok: (id) => idDe(filas()[1]) === id,
  },
  {
    nombre: "quitar una fila",
    antes: [crear],
    captura: () => idDe(filas()[1]),
    accion: () => filas()[1].querySelector("a.remove").click(),
    ok: (id) => filas().length === 999 && idDe(filas()[1]) !== id,
  },
  {
    nombre: "crear 10.000 filas",
    accion: () => boton("runlots").click(),
    ok: () => filas().length === 10000,
  },
  {
    nombre: "añadir 1.000 a 1.000",
    antes: [crear],
    accion: () => boton("add").click(),
    ok: () => filas().length === 2000,
  },
  {
    nombre: "vaciar 1.000 filas",
    antes: [crear],
    accion: () => boton("clear").click(),
    ok: () => filas().length === 0,
  },
];

window.medir = async function medir({ vueltas = 15, calentamiento = 5 } = {}) {
  const resultado = {};

  for (const operacion of OPERACIONES) {
    const tiempos = [];

    for (let vuelta = 0; vuelta < calentamiento + vueltas; vuelta++) {
      boton("clear").click();
      await asentar();
      for (const paso of operacion.antes ?? []) {
        paso();
        await asentar();
      }

      const capturado = operacion.captura?.();
      const inicio = performance.now();
      operacion.accion();
      await asentar();
      const fin = performance.now();

      if (!operacion.ok(capturado)) {
        throw new Error(`${operacion.nombre}: el DOM no quedó como debía`);
      }
      if (vuelta >= calentamiento) tiempos.push(fin - inicio);
    }

    tiempos.sort((a, b) => a - b);
    resultado[operacion.nombre] = Number(tiempos[Math.floor(tiempos.length / 2)].toFixed(2));
  }

  boton("clear").click();
  await asentar();
  return resultado;
};

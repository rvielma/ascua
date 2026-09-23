// El suelo: DOM a mano, sin framework. Lo más rápido que se puede escribir
// sin ponerse heroico, para que las demás columnas tengan contra qué medirse.
import { construirDatos } from "../../comun/datos.js";
import "../../comun/arnes.js";

const tbody = document.getElementById("tbody");

const plantilla = document.createElement("tr");
plantilla.innerHTML =
  '<td class="col-md-1"></td><td class="col-md-4"><a class="lbl"></a></td>' +
  '<td class="col-md-1"><a class="remove"><span class="remove glyphicon glyphicon-remove" aria-hidden="true"></span></a></td>' +
  '<td class="col-md-6"></td>';

/** Cada fila: su dato y los dos nodos que se tocan después. */
let filas = [];
let seleccionada = null;

function construir(dato) {
  const tr = plantilla.cloneNode(true);
  const etiqueta = tr.firstChild.nextSibling.firstChild;
  tr.firstChild.textContent = dato.id;
  etiqueta.textContent = dato.label;
  const fila = { id: dato.id, label: dato.label, tr, etiqueta };
  tr.fila = fila;
  return fila;
}

function añadir(cuantas) {
  const nuevas = construirDatos(cuantas).map(construir);
  const fragmento = document.createDocumentFragment();
  for (const fila of nuevas) fragmento.appendChild(fila.tr);
  tbody.appendChild(fragmento);
  filas = filas.concat(nuevas);
}

function vaciar() {
  tbody.textContent = "";
  filas = [];
  seleccionada = null;
}

document.getElementById("run").onclick = () => {
  vaciar();
  añadir(1000);
};
document.getElementById("runlots").onclick = () => {
  vaciar();
  añadir(10000);
};
document.getElementById("add").onclick = () => añadir(1000);
document.getElementById("clear").onclick = vaciar;

document.getElementById("update").onclick = () => {
  for (let i = 0; i < filas.length; i += 10) {
    const fila = filas[i];
    fila.label += " !!!";
    fila.etiqueta.textContent = fila.label;
  }
};

document.getElementById("swaprows").onclick = () => {
  if (filas.length < 999) return;
  const a = filas[1];
  const b = filas[998];
  const despuesDeB = b.tr.nextSibling;
  tbody.insertBefore(b.tr, a.tr);
  tbody.insertBefore(a.tr, despuesDeB);
  filas[1] = b;
  filas[998] = a;
};

// Delegado: vanilla puede permitírselo sin pagar nada en otra parte.
tbody.onclick = (evento) => {
  const tr = evento.target.closest("tr");
  if (!tr) return;
  const fila = tr.fila;

  if (evento.target.closest("a.remove")) {
    tr.remove();
    filas.splice(filas.indexOf(fila), 1);
    if (seleccionada === fila) seleccionada = null;
  } else if (evento.target.closest("a.lbl")) {
    if (seleccionada) seleccionada.tr.className = "";
    tr.className = "danger";
    seleccionada = fila;
  }
};

// React con hooks, como su versión en js-framework-benchmark: estado en un
// reducer y filas memoizadas para que seleccionar no rehaga las mil.
// `createElement` a mano es exactamente lo que produce el JSX.
import { createElement as h, memo, useReducer } from "react";
import { createRoot } from "react-dom/client";

import { construirDatos } from "../../comun/datos.js";
import "../../comun/arnes.js";

const inicial = { data: [], selected: 0 };

function reducir(estado, accion) {
  const { data, selected } = estado;
  switch (accion.type) {
    case "RUN":
      return { data: construirDatos(1000), selected: 0 };
    case "RUN_LOTS":
      return { data: construirDatos(10000), selected: 0 };
    case "ADD":
      return { data: data.concat(construirDatos(1000)), selected };
    case "UPDATE": {
      const nuevas = data.slice();
      for (let i = 0; i < nuevas.length; i += 10) {
        const fila = nuevas[i];
        nuevas[i] = { id: fila.id, label: `${fila.label} !!!` };
      }
      return { data: nuevas, selected };
    }
    case "CLEAR":
      return { data: [], selected: 0 };
    case "SWAP_ROWS": {
      if (data.length < 999) return estado;
      const nuevas = data.slice();
      const segunda = nuevas[1];
      nuevas[1] = nuevas[998];
      nuevas[998] = segunda;
      return { data: nuevas, selected };
    }
    case "REMOVE":
      return { data: data.filter((fila) => fila.id !== accion.id), selected };
    case "SELECT":
      return { data, selected: accion.id };
    default:
      return estado;
  }
}

const Fila = memo(({ item, selected, dispatch }) =>
  h(
    "tr",
    { className: selected ? "danger" : "" },
    h("td", { className: "col-md-1" }, item.id),
    h(
      "td",
      { className: "col-md-4" },
      h("a", { className: "lbl", onClick: () => dispatch({ type: "SELECT", id: item.id }) }, item.label),
    ),
    h(
      "td",
      { className: "col-md-1" },
      h(
        "a",
        { className: "remove", onClick: () => dispatch({ type: "REMOVE", id: item.id }) },
        h("span", { className: "remove glyphicon glyphicon-remove", "aria-hidden": "true" }),
      ),
    ),
    h("td", { className: "col-md-6" }),
  ),
);

function Boton({ id, texto, onClick }) {
  return h("button", { id, onClick }, texto);
}

function Aplicacion() {
  const [{ data, selected }, dispatch] = useReducer(reducir, inicial);

  return h(
    "div",
    { className: "contenedor" },
    h(
      "div",
      { id: "botones" },
      h(Boton, { id: "run", texto: "Create 1,000 rows", onClick: () => dispatch({ type: "RUN" }) }),
      h(Boton, { id: "runlots", texto: "Create 10,000 rows", onClick: () => dispatch({ type: "RUN_LOTS" }) }),
      h(Boton, { id: "add", texto: "Append 1,000 rows", onClick: () => dispatch({ type: "ADD" }) }),
      h(Boton, { id: "update", texto: "Update every 10th row", onClick: () => dispatch({ type: "UPDATE" }) }),
      h(Boton, { id: "clear", texto: "Clear", onClick: () => dispatch({ type: "CLEAR" }) }),
      h(Boton, { id: "swaprows", texto: "Swap Rows", onClick: () => dispatch({ type: "SWAP_ROWS" }) }),
    ),
    h(
      "table",
      null,
      h(
        "tbody",
        null,
        data.map((item) =>
          h(Fila, { key: item.id, item, selected: selected === item.id, dispatch }),
        ),
      ),
    ),
  );
}

createRoot(document.getElementById("raiz")).render(h(Aplicacion));

// Solid como en js-framework-benchmark: un signal por etiqueta, <For> y
// `createSelector`, que es su manera de que seleccionar una fila solo toque
// dos. Compilado con su plugin: sin él, Solid se evalúa en tiempo de ejecución
// y la comparación sería injusta con él.
import { batch, createSelector, createSignal, For } from "solid-js";
import { render } from "solid-js/web";

import { construirDatos } from "../../comun/datos.js";
import "../../comun/arnes.js";

function crear(cuantas) {
  return construirDatos(cuantas).map((dato) => {
    const [label, setLabel] = createSignal(dato.label);
    return { id: dato.id, label, setLabel };
  });
}

function Aplicacion() {
  const [data, setData] = createSignal([]);
  const [selected, setSelected] = createSignal(0);
  const esSeleccionada = createSelector(selected);

  const correr = (cuantas) =>
    batch(() => {
      setData(crear(cuantas));
      setSelected(0);
    });

  const quitar = (id) => setData((lista) => lista.filter((fila) => fila.id !== id));

  const intercambiar = () => {
    const lista = data().slice();
    if (lista.length < 999) return;
    const segunda = lista[1];
    lista[1] = lista[998];
    lista[998] = segunda;
    setData(lista);
  };

  const actualizar = () =>
    batch(() => {
      const lista = data();
      for (let i = 0; i < lista.length; i += 10) {
        const fila = lista[i];
        fila.setLabel((etiqueta) => `${etiqueta} !!!`);
      }
    });

  return (
    <div class="contenedor">
      <div id="botones">
        <button id="run" onClick={() => correr(1000)}>Create 1,000 rows</button>
        <button id="runlots" onClick={() => correr(10000)}>Create 10,000 rows</button>
        <button id="add" onClick={() => setData((lista) => lista.concat(crear(1000)))}>Append 1,000 rows</button>
        <button id="update" onClick={actualizar}>Update every 10th row</button>
        <button id="clear" onClick={() => correr(0)}>Clear</button>
        <button id="swaprows" onClick={intercambiar}>Swap Rows</button>
      </div>
      <table>
        <tbody>
          <For each={data()}>
            {(fila) => (
              <tr class={esSeleccionada(fila.id) ? "danger" : ""}>
                <td class="col-md-1">{fila.id}</td>
                <td class="col-md-4">
                  <a class="lbl" onClick={() => setSelected(fila.id)}>{fila.label()}</a>
                </td>
                <td class="col-md-1">
                  <a class="remove" onClick={() => quitar(fila.id)}>
                    <span class="remove glyphicon glyphicon-remove" aria-hidden="true" />
                  </a>
                </td>
                <td class="col-md-6" />
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

render(Aplicacion, document.getElementById("raiz"));

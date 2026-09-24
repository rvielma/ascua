// Ascua, escrito como dice su documentación: un signal por etiqueta, <For> con
// clave, y `selector` para la fila elegida —el equivalente al `createSelector`
// que usa Solid en su versión—. Sin atajos que un usuario no tomaría.
import { batch, mount, selector, signal, type Signal } from "ascua";

// @ts-expect-error: módulo JS compartido, sin tipos.
import { construirDatos } from "../../comun/datos.js";
import "../../comun/arnes.js";

interface Fila {
  id: number;
  label: Signal<string>;
}

function crear(cuantas: number): Fila[] {
  return (construirDatos(cuantas) as Array<{ id: number; label: string }>).map((dato) => ({
    id: dato.id,
    label: signal(dato.label),
  }));
}

function Aplicacion() {
  const filas = signal<Fila[]>([]);
  const seleccionada = signal(0);
  const esLaElegida = selector(() => seleccionada());

  const correr = (cuantas: number) =>
    batch(() => {
      filas.set(crear(cuantas));
      seleccionada.set(0);
    });

  const quitar = (id: number) => filas.update((lista) => lista.filter((fila) => fila.id !== id));

  const intercambiar = () =>
    filas.update((lista) => {
      if (lista.length < 999) return lista;
      const copia = lista.slice();
      const segunda = copia[1]!;
      copia[1] = copia[998]!;
      copia[998] = segunda;
      return copia;
    });

  const actualizar = () =>
    batch(() => {
      const lista = filas();
      for (let i = 0; i < lista.length; i += 10) {
        const fila = lista[i]!;
        fila.label.set(`${fila.label.peek()} !!!`);
      }
    });

  return view`
    <div class="contenedor">
      <div id="botones">
        <button id="run" onclick=${() => correr(1000)}>Create 1,000 rows</button>
        <button id="runlots" onclick=${() => correr(10000)}>Create 10,000 rows</button>
        <button id="add" onclick=${() => filas.update((lista) => lista.concat(crear(1000)))}>Append 1,000 rows</button>
        <button id="update" onclick=${actualizar}>Update every 10th row</button>
        <button id="clear" onclick=${() => correr(0)}>Clear</button>
        <button id="swaprows" onclick=${intercambiar}>Swap Rows</button>
      </div>
      <table>
        <tbody>
          <For each=${() => filas()} key=${(fila: Fila) => fila.id} render=${(fila: Fila) => view`
            <tr class:danger=${() => esLaElegida(fila.id)}>
              <td class="col-md-1">${fila.id}</td>
              <td class="col-md-4"><a class="lbl" onclick=${() => seleccionada.set(fila.id)}>${() => fila.label()}</a></td>
              <td class="col-md-1"><a class="remove" onclick=${() => quitar(fila.id)}><span class="remove glyphicon glyphicon-remove" aria-hidden="true"></span></a></td>
              <td class="col-md-6"></td>
            </tr>`}/>
        </tbody>
      </table>
    </div>`;
}

mount(document.getElementById("raiz")!, Aplicacion);

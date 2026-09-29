<script>
  // Svelte 5 como en js-framework-benchmark: runas, una etiqueta con `$state`
  // por fila, la lista como `$state.raw` —se reemplaza entera, no se muta— y
  // `{#each}` con clave. Svelte no tiene un `selector`: cada fila compara su id
  // con la elegida, que es como lo escribiría quien lo usa.
  import { construirDatos } from "../../comun/datos.js";

  class Fila {
    label = $state("");
    constructor(dato) {
      this.id = dato.id;
      this.label = dato.label;
    }
  }

  const crear = (cuantas) => construirDatos(cuantas).map((dato) => new Fila(dato));

  let filas = $state.raw([]);
  let seleccionada = $state(0);

  function correr(cuantas) {
    filas = crear(cuantas);
    seleccionada = 0;
  }

  function quitar(id) {
    filas = filas.filter((fila) => fila.id !== id);
  }

  function intercambiar() {
    if (filas.length < 999) return;
    const copia = filas.slice();
    const segunda = copia[1];
    copia[1] = copia[998];
    copia[998] = segunda;
    filas = copia;
  }

  function actualizar() {
    for (let i = 0; i < filas.length; i += 10) filas[i].label += " !!!";
  }
</script>

<div class="contenedor">
  <div id="botones">
    <button id="run" onclick={() => correr(1000)}>Create 1,000 rows</button>
    <button id="runlots" onclick={() => correr(10000)}>Create 10,000 rows</button>
    <button id="add" onclick={() => (filas = filas.concat(crear(1000)))}>Append 1,000 rows</button>
    <button id="update" onclick={actualizar}>Update every 10th row</button>
    <button id="clear" onclick={() => correr(0)}>Clear</button>
    <button id="swaprows" onclick={intercambiar}>Swap Rows</button>
  </div>
  <table>
    <tbody>
      {#each filas as fila (fila.id)}
        <tr class={seleccionada === fila.id ? "danger" : ""}>
          <td class="col-md-1">{fila.id}</td>
          <td class="col-md-4"><a class="lbl" onclick={() => (seleccionada = fila.id)}>{fila.label}</a></td>
          <td class="col-md-1"><a class="remove" onclick={() => quitar(fila.id)}><span class="remove glyphicon glyphicon-remove" aria-hidden="true"></span></a></td>
          <td class="col-md-6"></td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

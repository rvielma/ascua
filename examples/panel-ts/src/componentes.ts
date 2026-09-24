/**
 * Los componentes que se repiten por el panel.
 *
 * Un componente de Ascua es **una función que recibe props y devuelve un
 * nodo**. No hay clase base, ni ciclo de vida, ni nada que registrar: el
 * compilador traduce `<Tarjeta titulo="x"/>` a `Tarjeta({ titulo: "x" })`, que
 * es lo mismo que se puede escribir a mano.
 */

import type { Children } from "ascua";

/** Una caja con título y el contenido que le pasen. */
export function Tarjeta(props: { titulo: string; nota?: () => string; children?: Children }) {
  const caja = view`
    <section class="tarjeta">
      <header>
        <h2>${props.titulo}</h2>
        <span class="nota">${() => props.nota?.() ?? ""}</span>
      </header>
      <div class="cuerpo"></div>
      <style>
        .tarjeta { border: 1px solid var(--borde); border-radius: 10px; background: var(--panel); }
        header { display: flex; justify-content: space-between; align-items: baseline;
                 padding: .75rem 1rem; border-bottom: 1px solid var(--borde); }
        h2 { font-size: .95rem; margin: 0; font-weight: 600; }
        .nota { font-size: .8rem; color: var(--tenue); font-variant-numeric: tabular-nums; }
        .cuerpo { padding: 1rem; }
      </style>
    </section>`;

  // Los hijos son una receta, no nodos ya hechos: se construyen dentro del
  // elemento que decide el componente. Por eso un <Show> del contenido
  // encuentra el padre que necesita para anclarse.
  props.children?.(caja.querySelector(".cuerpo")!);
  return caja;
}

/**
 * Una cifra grande con su etiqueta.
 *
 * `${() => props.valor()}` y no `${props.valor}`: la regla de Ascua es
 * **sintáctica**, así que lo que hace reactivo a un punto es ver una closure
 * ahí escrita, no que el valor resulte ser una función. Un prop que llega
 * hecho closure se reenvía llamándolo dentro de otra.
 */
export function Metrica(props: { etiqueta: string; valor: () => string }) {
  return view`
    <div class="metrica">
      <span class="valor">${() => props.valor()}</span>
      <span class="etiqueta">${props.etiqueta}</span>
      <style>
        .metrica { display: grid; gap: .15rem; }
        .valor { font-size: 1.5rem; font-weight: 600; font-variant-numeric: tabular-nums; }
        .etiqueta { font-size: .78rem; color: var(--tenue); text-transform: uppercase;
                    letter-spacing: .04em; }
      </style>
    </div>`;
}

/**
 * Un campo de formulario.
 *
 * `valor` se escribe con `prop:value`, no con `value=`. El atributo de un
 * `<input>` es solo su valor inicial y deja de mandar en cuanto el usuario
 * teclea; la propiedad manda siempre. Es la diferencia entre poder vaciar el
 * formulario desde el código y no poder.
 */
export function Campo(props: {
  etiqueta: string;
  tipo?: string;
  nombre: string;
  valor: () => string;
  oncambio: (valor: string) => void;
  deshabilitado?: () => boolean;
}) {
  return view`
    <label class="campo">
      <span>${props.etiqueta}</span>
      <input
        name=${props.nombre}
        type=${props.tipo ?? "text"}
        autocomplete="off"
        prop:value=${() => props.valor()}
        disabled=${() => props.deshabilitado?.() ?? false}
        oninput=${(evento: Event) => props.oncambio((evento.target as HTMLInputElement).value)}>
      <style>
        .campo { display: grid; gap: .3rem; }
        span { font-size: .8rem; color: var(--tenue); }
        input { font: inherit; padding: .5rem .6rem; border: 1px solid var(--borde);
                border-radius: 7px; background: var(--fondo); color: inherit; }
        input:focus { outline: 2px solid var(--acento); outline-offset: 1px; }
        input:disabled { opacity: .6; }
      </style>
    </label>`;
}

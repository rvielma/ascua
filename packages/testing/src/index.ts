/**
 * # @ascua/testing
 *
 * Lo justo para probar un componente: montarlo, tocarlo y desmontarlo.
 *
 * En Ascua los efectos corren **en el momento** de escribir un signal, no en
 * un `tick` posterior, así que un test no necesita esperar a nada: se pulsa un
 * botón y en la línea siguiente el DOM ya cambió. Solo hay que esperar cuando
 * lo que se prueba tiene promesas por medio, y para eso está `esperar`.
 */

import { mount } from "@ascua/runtime";

/** Lo que devuelve `render`. */
export interface Montaje {
  /** El elemento donde se montó, añadido al documento. */
  contenedor: HTMLElement;
  /** El primer nodo que encaja con el selector. Falla si no hay ninguno. */
  buscar: <T extends Element = HTMLElement>(selector: string) => T;
  /** Todos los que encajan. */
  buscarTodos: <T extends Element = HTMLElement>(selector: string) => T[];
  /** El texto de un nodo, o el del contenedor entero. */
  texto: (selector?: string) => string;
  /** Desmonta y libera: nodos, efectos, listeners y `onCleanup`. */
  desmontar: () => void;
}

const montados = new Set<Montaje>();

/**
 * Monta un componente dentro de un contenedor propio.
 *
 * El contenedor va al documento porque hay cosas que solo funcionan ahí: el
 * foco, `closest`, las medidas. Se recoge con `limpiar()`.
 */
export function render(construir: () => Node): Montaje {
  const contenedor = document.createElement("div");
  document.body.appendChild(contenedor);

  const liberar = mount(contenedor, construir);

  const buscar = <T extends Element = HTMLElement>(selector: string): T => {
    const encontrado = contenedor.querySelector<T>(selector);
    if (!encontrado) {
      throw new Error(
        `no hay ningún "${selector}" en lo montado:\n${contenedor.innerHTML.trim()}`,
      );
    }
    return encontrado;
  };

  const montaje: Montaje = {
    contenedor,
    buscar,
    buscarTodos: <T extends Element = HTMLElement>(selector: string) => [
      ...contenedor.querySelectorAll<T>(selector),
    ],
    texto: (selector?: string) =>
      (selector ? buscar(selector).textContent : contenedor.textContent) ?? "",
    desmontar: () => {
      liberar();
      contenedor.remove();
      montados.delete(montaje);
    },
  };

  montados.add(montaje);
  return montaje;
}

/**
 * Desmonta todo lo que se haya renderizado. Va en un `afterEach`.
 *
 * Sin esto, los efectos del test anterior siguen vivos y escribiendo en nodos
 * que ya no están: el fallo aparece dos tests más tarde y en otro sitio.
 */
export function limpiar(): void {
  for (const montaje of [...montados]) montaje.desmontar();
}

/** Un click de los que el DOM propaga. */
export function pulsar(nodo: Element): void {
  nodo.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

/**
 * Escribe en un campo como lo haría una persona: cambia el valor y avisa.
 *
 * El `input` es el evento que escuchan las plantillas; sin él, el valor está
 * puesto pero nadie se ha enterado, que es justo el bug que un test debería
 * detectar y no provocar.
 */
export function escribir(campo: HTMLInputElement | HTMLTextAreaElement, valor: string): void {
  campo.value = valor;
  campo.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Marca o desmarca una casilla, con su evento `change`. */
export function marcar(casilla: HTMLInputElement, marcada = true): void {
  casilla.checked = marcada;
  casilla.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Envía un formulario. */
export function enviar(formulario: HTMLFormElement): void {
  formulario.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

/**
 * Cede el turno para que corran las promesas pendientes.
 *
 * Solo hace falta cuando lo que se prueba espera algo —una carga, un acceso—;
 * los signals no lo necesitan.
 */
export function esperar(milisegundos = 0): Promise<void> {
  return new Promise((listo) => setTimeout(listo, milisegundos));
}

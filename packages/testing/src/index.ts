/**
 * # ascua-testing
 *
 * Lo justo para probar un componente: montarlo, tocarlo y desmontarlo.
 *
 * En Ascua los efectos corren **en el momento** de escribir un signal, no en
 * un `tick` posterior, así que un test no necesita esperar a nada: se pulsa un
 * botón y en la línea siguiente el DOM ya cambió. Solo hay que esperar cuando
 * lo que se prueba tiene promesas por medio, y para eso están `wait` y
 * `waitFor`.
 */

import { mount } from "ascua";

/** Lo que devuelve `render`. */
export interface RenderResult {
  /** El elemento donde se montó, añadido al documento. */
  container: HTMLElement;
  /** El primer nodo que encaja con el selector. Falla si no hay ninguno. */
  get: <T extends Element = HTMLElement>(selector: string) => T;
  /** Todos los que encajan. */
  getAll: <T extends Element = HTMLElement>(selector: string) => T[];
  /** El texto de un nodo, o el del contenedor entero. */
  text: (selector?: string) => string;
  /** `waitFor` limitado a lo montado. */
  waitFor: <T extends Element = HTMLElement>(
    selector: string,
    options?: Omit<WaitForOptions, "within">,
  ) => Promise<T>;
  /** Desmonta y libera: nodos, efectos, listeners y `onCleanup`. */
  unmount: () => void;
}

const montados = new Set<RenderResult>();

/**
 * Monta un componente dentro de un contenedor propio.
 *
 * El contenedor va al documento porque hay cosas que solo funcionan ahí: el
 * foco, `closest`, las medidas. Se recoge con `cleanup()`.
 */
export function render(construir: () => Node): RenderResult {
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

  const montaje: RenderResult = {
    container: contenedor,
    get: buscar,
    getAll: <T extends Element = HTMLElement>(selector: string) => [
      ...contenedor.querySelectorAll<T>(selector),
    ],
    text: (selector?: string) =>
      (selector ? buscar(selector).textContent : contenedor.textContent) ?? "",
    waitFor: (selector, options = {}) => waitFor(selector, { ...options, within: contenedor }),
    unmount: () => {
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
export function cleanup(): void {
  for (const montaje of [...montados]) montaje.unmount();
}

/** Un click de los que el DOM propaga. */
export function click(nodo: Element): void {
  nodo.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

/**
 * Escribe en un campo como lo haría una persona: cambia el valor y avisa.
 *
 * El `input` es el evento que escuchan las plantillas; sin él, el valor está
 * puesto pero nadie se ha enterado, que es justo el bug que un test debería
 * detectar y no provocar.
 */
export function input(campo: HTMLInputElement | HTMLTextAreaElement, valor: string): void {
  campo.value = valor;
  campo.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Marca o desmarca una casilla, con su evento `change`. */
export function check(casilla: HTMLInputElement, checked = true): void {
  casilla.checked = checked;
  casilla.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Envía un formulario. */
export function submit(formulario: HTMLFormElement): void {
  formulario.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
}

/** Un punto del recorrido de `drag`, en coordenadas de ventana. */
export interface Point {
  x: number;
  y: number;
}

/** Opciones de `drag`. */
export interface DragOptions {
  /** Por defecto 1. Dos arrastres con ids distintos son dos dedos. */
  pointerId?: number;
  /** Por defecto `"mouse"`. */
  pointerType?: "mouse" | "pen" | "touch";
  /** Termina con `pointercancel` en vez de `pointerup`, como iOS al entrar un gesto del sistema. */
  cancel?: boolean;
}

/**
 * Arrastra un puntero por los puntos dados: `pointerdown` en el primero,
 * `pointermove` en los intermedios y `pointerup` en el último.
 *
 * Todos los eventos van al mismo nodo, que es lo que pasa en un navegador
 * cuando el componente llama a `setPointerCapture`. El DOM de los tests no
 * hace layout, así que un componente que calcula la celda bajo el dedo a
 * partir de `clientX/Y` tiene que poder recibir el rectángulo desde fuera.
 */
export function drag(nodo: Element, puntos: readonly Point[], options: DragOptions = {}): void {
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  if (!primero || !ultimo) throw new Error("drag necesita al menos un punto");

  const { pointerId = 1, pointerType = "mouse", cancel = false } = options;
  const lanzar = (tipo: string, { x, y }: Point, buttons: number) =>
    nodo.dispatchEvent(
      new PointerEvent(tipo, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId,
        pointerType,
        isPrimary: true,
        button: tipo === "pointermove" ? -1 : 0,
        buttons,
      }),
    );

  lanzar("pointerdown", primero, 1);
  for (const punto of puntos.slice(1, -1)) lanzar("pointermove", punto, 1);
  // El último también se mueve: un navegador siempre avisa de dónde está el
  // dedo antes de soltarlo, y el componente puede depender de ello.
  if (puntos.length > 1) lanzar("pointermove", ultimo, 1);
  lanzar(cancel ? "pointercancel" : "pointerup", ultimo, 0);
}

/**
 * Cede el turno para que corran las promesas pendientes.
 *
 * Solo hace falta cuando lo que se prueba espera algo —una carga, un acceso—;
 * los signals no lo necesitan.
 */
export function wait(milisegundos = 0): Promise<void> {
  return new Promise((listo) => setTimeout(listo, milisegundos));
}

/** Opciones de `waitFor`. */
export interface WaitForOptions {
  /** Dónde buscar. Por defecto, el documento entero. */
  within?: ParentNode;
  /** Cuánto esperar antes de fallar, en milisegundos. Por defecto 1000. */
  timeout?: number;
}

/**
 * Espera a que aparezca un nodo que encaje con el selector y lo devuelve.
 *
 * Para cuando no se sabe cuántos turnos tarda lo que se prueba —un
 * `resource` que encadena varias promesas, un `fetch` simulado con retraso—
 * y un `wait()` suelto sería adivinar. Si ya está, resuelve en el acto; si
 * no, vigila los cambios del DOM hasta que llegue o se acabe el plazo, y
 * entonces falla con lo que había.
 */
export function waitFor<T extends Element = HTMLElement>(
  selector: string,
  options: WaitForOptions = {},
): Promise<T> {
  const { within = document, timeout = 1000 } = options;
  const ya = within.querySelector<T>(selector);
  if (ya) return Promise.resolve(ya);

  return new Promise<T>((resolver, rechazar) => {
    const observador = new MutationObserver(() => {
      const encontrado = within.querySelector<T>(selector);
      if (!encontrado) return;
      terminar();
      resolver(encontrado);
    });
    const plazo = setTimeout(() => {
      terminar();
      const visto = within instanceof Element ? within.innerHTML : (within as Document).body?.innerHTML;
      rechazar(
        new Error(`"${selector}" no apareció en ${timeout} ms:\n${(visto ?? "").trim()}`),
      );
    }, timeout);
    const terminar = () => {
      observador.disconnect();
      clearTimeout(plazo);
    };
    observador.observe(within, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  });
}

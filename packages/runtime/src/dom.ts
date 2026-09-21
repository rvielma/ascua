/**
 * Operaciones de DOM.
 *
 * Son las llamadas que emite el compilador, y lo único que hay entre un cambio
 * de estado y el navegador. Cada punto dinámico de un template es un efecto
 * que **captura el nodo concreto** que debe actualizar: por eso no hay árbol
 * que recorrer ni diff que calcular.
 *
 * Están pensadas para escribirse a mano también: si el compilador no te gusta,
 * esto sigue siendo una librería de signals con helpers de DOM.
 */

import { currentScope, effect, memo, onCleanup, root, withScope } from "./reactivo.js";

/**
 * El contenido que recibe un componente.
 *
 * No son nodos ya construidos, sino la **receta** para construirlos: recibe el
 * elemento donde deben ir y los crea dentro. El componente decide dónde —y
 * si— los pone, y un `<Show>` o un `<For>` del contenido encuentran el padre
 * real que necesitan para anclarse.
 */
export type Children = (padre: Node) => void;

/** Lo que puede acabar dentro de un atributo. */
export type ValorAtributo = string | number | boolean | null | undefined;

export function element(etiqueta: string): HTMLElement {
  return document.createElement(etiqueta);
}

export function text(contenido = ""): Text {
  return document.createTextNode(contenido);
}

/** Nodo invisible que marca una posición: el ancla de las regiones dinámicas. */
export function marker(): Comment {
  return document.createComment("");
}

export function append(padre: Node, ...hijos: Node[]): void {
  for (const hijo of hijos) padre.appendChild(hijo);
}

export function insert(padre: Node, hijo: Node, antes: Node | null): void {
  padre.insertBefore(hijo, antes);
}

/**
 * Nodo de texto atado a una expresión.
 *
 * Es el framework entero en miniatura: un efecto, el nodo capturado, una
 * escritura.
 */
export function dynamicText(calcular: () => unknown): Text {
  const nodo = text();
  effect(() => {
    nodo.data = formatear(calcular());
  });
  return nodo;
}

/**
 * Atributo atado a una expresión.
 *
 * `false`, `null` y `undefined` **quitan** el atributo: así se expresan los
 * booleanos del HTML, que existen o no existen. `true` lo pone vacío.
 */
export function attribute(nodo: Element, nombre: string, calcular: () => ValorAtributo): void {
  effect(() => {
    const valor = calcular();
    if (valor === false || valor === null || valor === undefined) {
      nodo.removeAttribute(nombre);
    } else {
      nodo.setAttribute(nombre, valor === true ? "" : String(valor));
    }
  });
}

/**
 * Propiedad del nodo, atada a una expresión.
 *
 * No es lo mismo que un atributo, y la diferencia se nota justo donde importa:
 * el atributo `value` de un `<input>` es su valor *inicial*, y deja de mandar
 * en cuanto el usuario teclea. La propiedad sí manda siempre. Por eso `value`
 * y `checked` se escriben con `prop:` en la plantilla.
 */
export function property(nodo: Element, nombre: string, calcular: () => unknown): void {
  effect(() => {
    (nodo as unknown as Record<string, unknown>)[nombre] = calcular();
  });
}

/** Atributo que no cambia nunca. */
export function staticAttribute(nodo: Element, nombre: string, valor: ValorAtributo): void {
  if (valor === false || valor === null || valor === undefined) return;
  nodo.setAttribute(nombre, valor === true ? "" : String(valor));
}

/**
 * Manejador de eventos. Se quita solo cuando el scope se libera, así que
 * desmontar no deja listeners colgando.
 *
 * El nombre es el del DOM (`click`, `input`): lo que ya sabe cualquiera que
 * haya escrito HTML.
 */
export function on<K extends keyof HTMLElementEventMap>(
  nodo: Element,
  evento: K | string,
  manejador: (evento: Event) => void,
): void {
  nodo.addEventListener(evento, manejador);
  onCleanup(() => nodo.removeEventListener(evento, manejador));
}

/**
 * Región cuyo contenido se **sustituye**: un `if`, un `match`, una pestaña.
 *
 * Está partida en dos funciones a propósito. `elegir` es lo reactivo: si
 * devuelve el mismo valor, no se reconstruye nada. `construir` levanta el
 * contenido en un scope propio y sin rastrear, así que lo que lea dentro no
 * vuelve a disparar la sustitución.
 */
export function show<T>(
  padre: Node,
  elegir: () => T,
  construir: (valor: T) => Node | readonly Node[] | null,
): void {
  const ancla = marker();
  padre.appendChild(ancla);

  // El scope se captura fuera del efecto: lo que se construya dentro debe
  // pertenecer a quien contiene esta región, no al efecto que la actualiza.
  const scope = currentScope();

  let actuales: readonly Node[] = [];
  let liberar: (() => void) | null = null;

  // El selector va envuelto en un memo: si devuelve el mismo valor, no se
  // reconstruye nada. Alternar un booleano que ya era `true` no toca el DOM.
  const valorActual = memo(elegir);

  effect(() => {
    const valor = valorActual();

    for (const nodo of actuales) padre.removeChild(nodo);
    if (liberar) liberar();
    actuales = [];
    liberar = null;

    withScope(scope, () => {
      const [construido, dispose] = root(() => construir(valor));
      // Una rama puede tener varios nodos hermanos: son contenido dentro de
      // un padre que ya existe, no una vista con raíz propia.
      const nodos =
        construido === null ? [] : Array.isArray(construido) ? construido : [construido as Node];

      if (nodos.length === 0) {
        dispose();
        return;
      }
      for (const nodo of nodos) padre.insertBefore(nodo, ancla);
      actuales = nodos;
      liberar = dispose;
    });
  });
}

/**
 * Lista con clave: el único sitio donde Ascua hace algo parecido a un diff.
 *
 * `construir` se ejecuta **una vez por clave**. Mientras la clave siga en la
 * lista, su nodo se conserva y se mueve; no se rehace. Eso es lo que preserva
 * el foco, el scroll y lo que el usuario estuviera escribiendo.
 */
export function list<T, K>(
  padre: Node,
  items: () => readonly T[],
  clave: (item: T) => K,
  construir: (item: T) => Node,
): void {
  const ancla = marker();
  padre.appendChild(ancla);

  // Igual que en `show`: los scopes de los items no pueden colgar del efecto
  // que reconcilia, o cada reordenación los liberaría todos.
  const scope = currentScope();

  let orden: K[] = [];
  const entradas = new Map<K, { nodo: Node; liberar: () => void }>();

  effect(() => {
    const lista = items();
    const claves = lista.map(clave);
    const presentes = new Set(claves);

    // 1. Fuera los que ya no están: del árbol y del grafo reactivo.
    for (const vieja of orden) {
      if (presentes.has(vieja)) continue;
      const entrada = entradas.get(vieja);
      if (!entrada) continue;
      padre.removeChild(entrada.nodo);
      entrada.liberar();
      entradas.delete(vieja);
    }
    orden = orden.filter((k) => presentes.has(k));

    // 2. Construir los nuevos, cada uno en su propio scope.
    withScope(scope, () => {
      lista.forEach((item, indice) => {
        const k = claves[indice]!;
        if (entradas.has(k)) return;
        const [nodo, liberar] = root(() => construir(item));
        entradas.set(k, { nodo, liberar });
      });
    });

    // 3. Colocar, de derecha a izquierda.
    //
    // Se recorre desde el final porque así siempre se conoce el nodo que debe
    // quedar a la derecha. Si la cola ya coincide con lo esperado, esos nodos
    // no se tocan: reordenar una lista que no cambió no produce ni una sola
    // operación de DOM.
    let siguiente: Node = ancla;
    let cola = orden.length;
    const movidas = new Set<K>();

    for (let i = claves.length - 1; i >= 0; i--) {
      const k = claves[i]!;
      while (cola > 0 && movidas.has(orden[cola - 1]!)) cola--;

      const enSuSitio = cola > 0 && orden[cola - 1] === k;
      const entrada = entradas.get(k);
      if (!entrada) continue;

      if (enSuSitio) {
        cola--;
      } else {
        padre.insertBefore(entrada.nodo, siguiente);
        movidas.add(k);
      }
      siguiente = entrada.nodo;
    }

    orden = claves;
  });
}

/**
 * Monta un árbol dentro de una raíz reactiva propia.
 *
 * Devuelve cómo desmontarlo: quita los nodos y libera todos los efectos que
 * los alimentaban.
 */
export function mount(padre: Node, construir: () => Node): () => void {
  const [nodo, liberar] = root(construir);
  padre.appendChild(nodo);
  return () => {
    liberar();
    if (nodo.parentNode === padre) padre.removeChild(nodo);
  };
}

function formatear(valor: unknown): string {
  return valor === null || valor === undefined ? "" : String(valor);
}

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

/** Atributo con el número de orden de un elemento, para hidratarlo. */
export const HYDRATION_ATTR = "data-ascua-h";
/** Atributo que marca una isla y guarda su nombre. */
export const ISLAND_ATTR = "data-ascua-island";
/** Atributo con los props de una isla, tal como los dejó el servidor. */
export const ISLAND_PROPS_ATTR = "data-ascua-props";

// El documento donde se construye. En el navegador es el de siempre; en el
// servidor, `renderToString` lo cambia por uno en memoria durante el render.
let documento: Document | null = null;

/** @internal Lo usa el renderizado en servidor. */
export function usarDocumento(nuevo: Document | null): Document | null {
  const anterior = documento;
  documento = nuevo;
  return anterior;
}

function doc(): Document {
  return documento ?? document;
}

// En el servidor, dentro de una isla: el contador que numera elementos y
// marcadores. Fuera de las islas no se numera nada, porque no hay nada que
// hidratar.
let numeracion: { contador: number } | null = null;

// En el cliente, mientras se hidrata una isla. Ver `hydrate`.
let hidratando: Hidratacion | null = null;

interface Hidratacion {
  /** Elementos y marcadores del servidor, por su número. */
  candidatos: Map<number, Node>;
  contador: number;
  /** Último hijo colocado en cada padre: de ahí sigue la búsqueda de textos. */
  cursores: WeakMap<Node, Node>;
  /** Textos del servidor que todavía nadie ha reclamado. */
  textos: Set<Text>;
  adoptados: number;
  creados: number;
}

/**
 * Un elemento. Con una etiqueta conocida devuelve su tipo concreto
 * —`element("input")` es un `HTMLInputElement`—, así que un `ref` o un
 * manejador que espera ese tipo lo recibe sin conversiones.
 */
export function element<K extends keyof HTMLElementTagNameMap>(etiqueta: K): HTMLElementTagNameMap[K];
export function element(etiqueta: string): HTMLElement;
export function element(etiqueta: string): HTMLElement {
  if (hidratando) {
    // El elemento número N del cliente es el número N del servidor: los dos
    // ejecutan el mismo código de construcción, en el mismo orden.
    const numero = hidratando.contador++;
    const candidato = hidratando.candidatos.get(numero) as HTMLElement | undefined;
    if (candidato && candidato.nodeType === 1 && candidato.localName === etiqueta.toLowerCase()) {
      hidratando.candidatos.delete(numero);
      candidato.removeAttribute(HYDRATION_ATTR);
      hidratando.adoptados++;
      return candidato;
    }
    hidratando.creados++;
  }
  const nodo = doc().createElement(etiqueta);
  if (numeracion) nodo.setAttribute(HYDRATION_ATTR, String(numeracion.contador++));
  return nodo;
}

export function text(contenido = ""): Text {
  return doc().createTextNode(contenido);
}

/** Nodo invisible que marca una posición: el ancla de las regiones dinámicas. */
export function marker(): Comment {
  if (hidratando) {
    // Los comentarios no admiten atributos: el servidor escribe el número
    // dentro, `<!--5-->`, y comparte contador con los elementos.
    const numero = hidratando.contador++;
    const candidato = hidratando.candidatos.get(numero) as Comment | undefined;
    if (candidato && candidato.nodeType === 8) {
      hidratando.candidatos.delete(numero);
      candidato.data = "";
      hidratando.adoptados++;
      return candidato;
    }
    hidratando.creados++;
  }
  return doc().createComment(numeracion ? String(numeracion.contador++) : "");
}

export function append(padre: Node, ...hijos: Node[]): void {
  for (const hijo of hijos) colocar(padre, hijo, null);
}

export function insert(padre: Node, hijo: Node, antes: Node | null): void {
  colocar(padre, hijo, antes);
}

/**
 * `insertBefore`, salvo mientras se hidrata: entonces lo adoptado ya está
 * donde debe y no se mueve, y los textos se buscan en el HTML del servidor.
 */
function colocar(padre: Node, nodo: Node, antes: Node | null): void {
  if (!hidratando) {
    padre.insertBefore(nodo, antes);
    return;
  }

  if (nodo.parentNode === padre) {
    // Adoptado: el servidor ya lo dejó en su sitio. Los marcadores no
    // avanzan el cursor, porque en el HTML van *después* del contenido de su
    // región, que el cliente todavía no ha colocado.
    if (nodo.nodeType !== 8) avanzar(hidratando, padre, nodo);
    return;
  }

  // El texto que le toca es el siguiente del servidor en ese padre, saltando
  // marcadores: los textos no llevan número, se resuelven por posición.
  const cursor = hidratando.cursores.get(padre);
  let siguiente: Node | null = cursor ? cursor.nextSibling : padre.firstChild;
  if (nodo.nodeType === 3) {
    let candidato = siguiente;
    while (candidato && candidato !== antes && candidato.nodeType === 8) {
      candidato = candidato.nextSibling;
    }
    if (candidato && candidato !== antes && candidato.nodeType === 3) {
      // No se puede adoptar: el nodo nuevo ya está capturado por su efecto.
      // Se pone en el lugar del viejo, que tiene el mismo contenido, así que
      // no se nota.
      padre.replaceChild(nodo, candidato);
      hidratando.textos.delete(candidato as Text);
      avanzar(hidratando, padre, nodo);
      return;
    }
    hidratando.creados++;
  }

  // Lo que no estaba en el servidor se inserta donde toca: antes de `antes`
  // si lo hay, y si no, detrás del último colocado.
  if (antes && siguiente !== antes) siguiente = antes;
  padre.insertBefore(nodo, siguiente);
  if (nodo.nodeType !== 8) avanzar(hidratando, padre, nodo);
}

function avanzar(estado: Hidratacion, padre: Node, nodo: Node): void {
  const cursor = estado.cursores.get(padre);
  // Solo hacia delante: una lista coloca sus items de derecha a izquierda.
  if (!cursor || cursor.compareDocumentPosition(nodo) & 4) estado.cursores.set(padre, nodo);
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

/**
 * Una clase que aparece y desaparece, sin tocar las demás.
 *
 * Es lo que evita tener que construir el `class` entero en cada cambio: el
 * scope del CSS, el estado y lo que ponga el usuario conviven en el mismo
 * atributo sin pisarse.
 */
export function cssClass(nodo: Element, nombre: string, calcular: () => unknown): void {
  effect(() => {
    nodo.classList.toggle(nombre, Boolean(calcular()));
  });
}

/** Atributo que no cambia nunca. */
export function staticAttribute(nodo: Element, nombre: string, valor: ValorAtributo): void {
  if (valor === false || valor === null || valor === undefined) return;
  nodo.setAttribute(nombre, valor === true ? "" : String(valor));
}

/**
 * Manejador de eventos. Se quita solo cuando el scope se libera, así que
 * desmontar no deja listeners colgando: si el nodo sigue en el documento, se
 * quita el listener; si ya salió, se va con él.
 *
 * El nombre es el del DOM (`click`, `input`): lo que ya sabe cualquiera que
 * haya escrito HTML.
 */
export function on<K extends keyof HTMLElementEventMap>(
  nodo: Element,
  evento: K,
  manejador: (evento: HTMLElementEventMap[K]) => void,
): void;
export function on(nodo: Element, evento: string, manejador: (evento: Event) => void): void;
export function on(nodo: Element, evento: string, manejador: (evento: Event) => void): void {
  nodo.addEventListener(evento, manejador);
  // Si el nodo ya salió del documento —una fila que se vacía, una rama de
  // <Show> que se cierra—, el recolector se lo lleva con su listener, y
  // quitarlo uno a uno es trabajo para nada. Solo se quita si el nodo sigue
  // ahí, como cuando se desmonta una isla y su HTML se queda.
  onCleanup(() => {
    if (nodo.isConnected) nodo.removeEventListener(evento, manejador);
  });
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
  colocar(padre, ancla, null);

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

    // `remove` y no `removeChild`: si algo de fuera ya se llevó el nodo —un
    // test que vacía el documento, un script ajeno— quitarlo otra vez no debe
    // tirar la aplicación.
    for (const nodo of actuales) (nodo as ChildNode).remove();
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
      for (const nodo of nodos) colocar(padre, nodo, ancla);
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
  colocar(padre, ancla, null);

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
    //
    // Si no sobrevive ninguno y la lista es lo único que hay en el padre —el
    // caso de vaciar una tabla o reemplazarla entera—, se borra de un golpe
    // en vez de nodo a nodo: una sola operación de DOM en lugar de mil.
    const sobreviven = orden.some((k) => presentes.has(k));
    if (!sobreviven && entradas.size > 0 && padre.childNodes.length === entradas.size + 1) {
      padre.textContent = "";
      padre.appendChild(ancla);
      for (const entrada of entradas.values()) entrada.liberar();
      entradas.clear();
      orden = [];
    } else {
      for (const vieja of orden) {
        if (presentes.has(vieja)) continue;
        const entrada = entradas.get(vieja);
        if (!entrada) continue;
        (entrada.nodo as ChildNode).remove();
        entrada.liberar();
        entradas.delete(vieja);
      }
      orden = orden.filter((k) => presentes.has(k));
    }

    // 2. Construir los nuevos, cada uno en su propio scope.
    withScope(scope, () => {
      lista.forEach((item, indice) => {
        const k = claves[indice]!;
        if (entradas.has(k)) return;
        const [nodo, liberar] = root(() => construir(item));
        entradas.set(k, { nodo, liberar });
      });
    });

    // 3. Colocar moviendo lo mínimo.
    //
    // Las filas que ya estaban, y que siguen en el mismo orden relativo, se
    // quedan quietas: son la subsecuencia creciente más larga de sus
    // posiciones anteriores. Solo se mueve lo demás. Intercambiar dos filas de
    // mil son dos movimientos, no novecientos noventa y siete —que es lo que
    // hacía el recorrido ingenuo, y lo que medía el benchmark.
    const anterior = new Map<K, number>();
    orden.forEach((k, i) => anterior.set(k, i));
    const quietas = subsecuenciaCreciente(claves.map((k) => anterior.get(k) ?? -1));

    let siguiente: Node = ancla;
    for (let i = claves.length - 1; i >= 0; i--) {
      const entrada = entradas.get(claves[i]!);
      if (!entrada) continue;
      if (!quietas.has(i)) colocar(padre, entrada.nodo, siguiente);
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
    (nodo as ChildNode).remove();
  };
}

/**
 * Una isla: la región de una página servida que se activa en el cliente.
 *
 * En el servidor, envuelve el contenido en `<ascua-island>` con su nombre y
 * numera cada elemento y marcador de dentro, para que el cliente pueda
 * adoptarlos. En el cliente, construye el contenido; si se está hidratando,
 * lo adopta del HTML en vez de crearlo.
 *
 * `props` viaja como texto en un atributo. No hay serializador: el formato lo
 * elige quien usa la isla, y así el framework no arrastra uno que no todo el
 * mundo necesita.
 */
export function island(nombre: string, construir: () => Node, props = ""): HTMLElement {
  const contenedor = element("ascua-island");
  staticAttribute(contenedor, ISLAND_ATTR, nombre);
  if (props) staticAttribute(contenedor, ISLAND_PROPS_ATTR, props);

  const numeracionFuera = numeracion;
  const hidratacionFuera = hidratando;
  // La numeración empieza de cero en cada isla: el cliente construirá
  // exactamente este contenido y nada de lo que hay fuera.
  if (documento) numeracion = { contador: 0 };
  let contenido: Node;
  try {
    if (hidratacionFuera && contenedor.parentNode !== null) {
      // Adoptada dentro de otra isla: su contenido tiene su propia numeración.
      const estado = hidratarEn(contenedor, construir);
      hidratacionFuera.adoptados += estado.adoptados;
      hidratacionFuera.creados += estado.creados;
      return contenedor;
    }
    contenido = construir();
  } finally {
    numeracion = numeracionFuera;
  }
  append(contenedor, contenido);
  return contenedor;
}

/** Lo que `hydrate` necesita de una isla de `defineIsland`. */
export interface IslaHidratable {
  readonly nombre: string;
  readonly preparar: (props: string) => (() => Node) | undefined;
}

/** Lo que dejó la hidratación: cuántos nodos se adoptaron y cuántos se crearon. */
export interface Hydrated {
  adoptados: number;
  creados: number;
  /** Apaga las islas: libera sus efectos y listeners, y deja el HTML. */
  desmontar: () => void;
}

/**
 * Activa las islas del documento **adoptando** el HTML del servidor.
 *
 * El `<li>` que escribió el servidor es el mismo `<li>` al que queda atado el
 * efecto: no se reemplaza nada, así que no hay parpadeo ni se pierde lo que
 * el navegador ya tenía —el foco, el scroll, un `<input>` a medio escribir—.
 * Los textos son la excepción: se sustituyen por nodos idénticos, porque el
 * efecto que los actualiza ya capturó el suyo.
 *
 * Si algo no encaja —el servidor renderizó otro estado, falta un nodo— ese
 * nodo se crea y la aplicación sigue. Lo que sobra del servidor se quita.
 *
 * Las islas cuyo nombre no esté registrado se dejan intactas: servidor y
 * cliente se pueden desplegar por separado sin que la página se rompa.
 *
 * Las islas se registran de dos formas: una lista de islas de
 * `defineIsland`, que validan sus props antes de hidratarse y se quedan
 * estáticas si no encajan, o un objeto que va del nombre a una función de los
 * props en texto, sin validar nada.
 */
export function hydrate(
  islas: readonly IslaHidratable[] | Record<string, (props: string) => Node>,
  raiz: ParentNode = document,
): Hydrated {
  const resultado: Hydrated = { adoptados: 0, creados: 0, desmontar: () => {} };
  const liberaciones: (() => void)[] = [];

  for (const contenedor of Array.from(raiz.querySelectorAll(`[${ISLAND_ATTR}]`))) {
    // Las anidadas las hidrata la isla que las contiene, al construirse.
    if (contenedor.parentElement?.closest(`[${ISLAND_ATTR}]`)) continue;
    const nombre = contenedor.getAttribute(ISLAND_ATTR) ?? "";
    const props = contenedor.getAttribute(ISLAND_PROPS_ATTR) ?? "";
    // Se prepara antes de tocar nada: hidratar quita lo que no reclama, y una
    // isla cuyos props no encajan tiene que quedarse como vino.
    const sinValidar = (islas as Record<string, (props: string) => Node>)[nombre];
    const construir = Array.isArray(islas)
      ? (islas as readonly IslaHidratable[]).find((isla) => isla.nombre === nombre)?.preparar(props)
      : sinValidar && (() => sinValidar(props));
    if (!construir) continue;

    const [estado, liberar] = root(() => hidratarEn(contenedor, construir));
    resultado.adoptados += estado.adoptados;
    resultado.creados += estado.creados;
    liberaciones.push(liberar);
  }

  resultado.desmontar = () => {
    for (const liberar of liberaciones) liberar();
  };
  return resultado;
}

function hidratarEn(contenedor: Element, construir: () => Node): Hidratacion {
  const estado: Hidratacion = {
    candidatos: new Map(),
    contador: 0,
    cursores: new WeakMap(),
    textos: new Set(),
    adoptados: 0,
    creados: 0,
  };
  // Se escanea una sola vez: buscar en el documento por cada elemento sería
  // cuadrático.
  escanear(contenedor, estado);

  const fuera = hidratando;
  hidratando = estado;
  try {
    colocar(contenedor, construir(), null);
  } finally {
    hidratando = fuera;
  }

  // Lo que el servidor escribió y el cliente no reclamó no corresponde al
  // estado actual: se quita, para no dejarlo duplicado.
  for (const sobrante of estado.candidatos.values()) (sobrante as ChildNode).remove();
  for (const texto of estado.textos) texto.remove();
  return estado;
}

function escanear(padre: Node, estado: Hidratacion): void {
  let nodo = padre.firstChild;
  while (nodo) {
    const siguiente = nodo.nextSibling;
    if (nodo.nodeType === 1) {
      const numero = (nodo as Element).getAttribute(HYDRATION_ATTR);
      if (numero !== null) estado.candidatos.set(Number(numero), nodo);
      // Dentro de una isla anidada, la numeración es la suya.
      if (!(nodo as Element).hasAttribute(ISLAND_ATTR)) escanear(nodo, estado);
    } else if (nodo.nodeType === 8) {
      const dato = (nodo as Comment).data;
      if (dato === SEPARADOR) nodo.remove();
      else if (dato !== "") estado.candidatos.set(Number(dato), nodo);
    } else if (nodo.nodeType === 3) {
      estado.textos.add(nodo as Text);
    }
    nodo = siguiente;
  }
}

/**
 * Lo que el servidor pone entre dos textos seguidos, para que el navegador no
 * los funda en uno al leer el HTML. Hidratar lo quita.
 */
export const SEPARADOR = "/";

/**
 * Las posiciones que forman la subsecuencia creciente más larga, ignorando
 * los `-1` (lo nuevo, que no tenía posición anterior).
 *
 * Es el algoritmo de la paciencia: O(n log n). Mantiene, para cada longitud,
 * el final más pequeño posible, y recuerda de dónde venía cada elemento para
 * reconstruir la cadena al terminar.
 */
function subsecuenciaCreciente(valores: readonly number[]): Set<number> {
  const finales: number[] = [];
  const previos: number[] = new Array(valores.length);

  for (let i = 0; i < valores.length; i++) {
    const valor = valores[i]!;
    if (valor < 0) continue;

    let bajo = 0;
    let alto = finales.length;
    while (bajo < alto) {
      const medio = (bajo + alto) >> 1;
      if (valores[finales[medio]!]! < valor) bajo = medio + 1;
      else alto = medio;
    }
    previos[i] = bajo > 0 ? finales[bajo - 1]! : -1;
    finales[bajo] = i;
  }

  const resultado = new Set<number>();
  let i = finales.length > 0 ? finales[finales.length - 1]! : -1;
  while (i >= 0) {
    resultado.add(i);
    i = previos[i]!;
  }
  return resultado;
}

function formatear(valor: unknown): string {
  return valor === null || valor === undefined ? "" : String(valor);
}

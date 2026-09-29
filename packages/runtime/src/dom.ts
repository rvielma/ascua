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

import { currentScope, effect, enRaizNueva, liberarScope, memo, onCleanup, registrarOyente, root, withScope, type Scope } from "./reactivo.js";

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
export type AttributeValue = string | number | boolean | null | undefined;

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
 *
 * Con `espacio` se crea en ese espacio de nombres: un `<circle>` hecho con
 * `createElement` es un `HTMLUnknownElement` y no se dibuja. El compilador lo
 * pasa solo para lo que va dentro de `<svg>` o `<math>`.
 */
export function element<K extends keyof HTMLElementTagNameMap>(etiqueta: K): HTMLElementTagNameMap[K];
export function element(etiqueta: string): HTMLElement;
export function element(etiqueta: string, espacio: string): Element;
export function element(etiqueta: string, espacio?: string): HTMLElement {
  if (hidratando) {
    // El elemento número N del cliente es el número N del servidor: los dos
    // ejecutan el mismo código de construcción, en el mismo orden.
    const numero = hidratando.contador++;
    const candidato = hidratando.candidatos.get(numero) as HTMLElement | undefined;
    // En SVG el navegador conserva `linearGradient` tal cual: se compara sin
    // mayúsculas.
    if (
      candidato &&
      candidato.nodeType === 1 &&
      candidato.localName.toLowerCase() === etiqueta.toLowerCase()
    ) {
      hidratando.candidatos.delete(numero);
      candidato.removeAttribute(HYDRATION_ATTR);
      hidratando.adoptados++;
      return candidato;
    }
    hidratando.creados++;
  }
  const nodo = (
    espacio ? doc().createElementNS(espacio, etiqueta) : doc().createElement(etiqueta)
  ) as HTMLElement;
  if (numeracion) nodo.setAttribute(HYDRATION_ATTR, String(numeracion.contador++));
  return nodo;
}

export function text(contenido = ""): Text {
  return doc().createTextNode(contenido);
}

/**
 * El texto de un `${expr}` que no es una closure: se escribe una vez.
 *
 * Su tipo rechaza una función. Como texto, una función solo pinta su código
 * fuente, y casi siempre es un despiste: `${EnCurso}` donde se quería
 * `${(r) => EnCurso(r)}`, o `${cuenta}` donde se quería `${() => cuenta()}`.
 */
export function staticText<T>(valor: T extends (...args: never[]) => unknown ? never : T): Text {
  return text(String(valor));
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

const SVG = "http://www.w3.org/2000/svg";
const MATHML = "http://www.w3.org/1998/Math/MathML";

/**
 * La parte fija de una plantilla, tal como la emite el compilador: un texto, o
 * `[etiqueta, atributos, hijos, espacio]`, con los atributos en pares
 * `[nombre, valor, …]`, `0` donde no hay, y el espacio `1` para SVG y `2` para
 * MathML.
 */
export type TemplateStructure =
  | string
  | readonly [etiqueta: string, atributos: readonly string[] | 0, hijos: readonly TemplateStructure[] | 0, espacio?: 1 | 2];

/** El tipo del nodo que corresponde a cada etiqueta de `template`. */
type NodoDe<E> = E extends "#text"
  ? Text
  : E extends ""
    ? Element
    : E extends keyof HTMLElementTagNameMap
      ? HTMLElementTagNameMap[E]
      : HTMLElement;

/** Los nodos de una plantilla clonada, con su tipo. */
export type TemplateNodes<T extends readonly string[]> = { -readonly [I in keyof T]: NodoDe<T[I]> };

/** Una plantilla ya preparada. Ver `template`. */
export interface Template<T extends readonly string[] = readonly string[]> {
  readonly estructura: TemplateStructure;
  readonly caminos: readonly (readonly number[])[];
  /** Lo mismo que `caminos`, como código: `firstChild` y `nextSibling` directos. */
  readonly recorrer: ((raiz: any) => Node[]) | null;
  /** El árbol que se clona, construido la primera vez que hace falta. */
  prototipo: Node | null;
  /** Solo para el tipo: lo que devuelve `cloneTemplate`. */
  readonly tipos?: T;
}

/**
 * La parte fija de una plantilla, para construirla clonando.
 *
 * El compilador la emite una vez por plantilla, arriba del archivo:
 * `estructura` es todo lo que no cambia —etiquetas, atributos literales,
 * textos—, `caminos` dice dónde están los nodos que el código necesita
 * —los que llevan un evento, un efecto o hijos que se añaden después— y
 * `tipos` es su etiqueta, para que TypeScript los conozca.
 */
export function template<const T extends readonly string[]>(
  estructura: TemplateStructure,
  caminos: readonly (readonly number[])[],
  tipos: T,
  // `any` a propósito: el compilador escribe `r.firstChild.nextSibling` sin
  // `!`, que en un archivo .js no se puede.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  recorrer: ((raiz: any) => Node[]) | null = null,
): Template<T> {
  void tipos;
  return { estructura, caminos, recorrer, prototipo: null };
}

/**
 * Construye una plantilla y devuelve sus nodos señalados, en orden.
 *
 * En el navegador **clona**: el árbol fijo se construye una vez y cada uso es
 * un `cloneNode(true)`, mucho más barato que crear los nodos uno a uno. El
 * prototipo se hace con `createElement` y no con `innerHTML`, así que el
 * parser de HTML no reordena nada —un `<tr>` suelto, un `<circle>`— y el
 * árbol es exactamente el que describe la plantilla.
 *
 * En el servidor y al hidratar construye con las primitivas de siempre, en
 * el mismo orden: son las que numeran y adoptan los nodos.
 */
export function cloneTemplate<T extends readonly string[]>(plantilla: Template<T>): TemplateNodes<T> {
  if (documento || hidratando) return construirPlantilla(plantilla) as TemplateNodes<T>;

  const raiz = (plantilla.prototipo ??= prototipo(plantilla.estructura)).cloneNode(true);
  if (plantilla.recorrer) return plantilla.recorrer(raiz) as unknown as TemplateNodes<T>;
  const caminos = plantilla.caminos;
  const nodos = new Array<Node>(caminos.length);
  // Los caminos vienen en orden de documento: cada uno sigue desde donde
  // comparte tramo con el anterior, en vez de volver a bajar desde la raíz.
  // `pila[j]` es el nodo al que se llegó en el nivel `j` del camino anterior.
  const pila: Node[] = [raiz];
  let anterior: readonly number[] = [];
  for (let i = 0; i < caminos.length; i++) {
    const camino = caminos[i]!;
    let comun = 0;
    while (comun < camino.length && comun < anterior.length && camino[comun] === anterior[comun]) comun++;
    let nodo = pila[comun]!;
    for (let j = comun; j < camino.length; j++) {
      // Hermano del mismo nivel del camino anterior: basta con avanzar.
      let k = camino[j]!;
      if (j === comun && j < anterior.length && k > anterior[j]!) {
        nodo = pila[j + 1]!;
        k -= anterior[j]!;
      } else {
        nodo = nodo.firstChild!;
      }
      for (; k > 0; k--) nodo = nodo.nextSibling!;
      pila[j + 1] = nodo;
    }
    nodos[i] = nodo;
    anterior = camino;
  }
  return nodos as unknown as TemplateNodes<T>;
}

/**
 * El documento donde viven los prototipos: el inerte de un `<template>`.
 * Clonar lo que vive ahí cuesta menos de la mitad que clonar lo creado en el
 * documento de la página —medido: 0,62 frente a 1,42 ms por mil filas—, y
 * sigue saliendo a cuenta tras la adopción al insertarlo.
 */
let inerte: Document | null = null;

function prototipo(estructura: TemplateStructure): Node {
  const casa = (inerte ??= document.createElement("template").content.ownerDocument);
  if (typeof estructura === "string") return casa.createTextNode(estructura);
  const [etiqueta, atributos, hijos, espacio] = estructura;
  const nodo = espacio
    ? casa.createElementNS(espacio === 1 ? SVG : MATHML, etiqueta)
    : casa.createElement(etiqueta);
  if (atributos) for (let i = 0; i < atributos.length; i += 2) nodo.setAttribute(atributos[i]!, atributos[i + 1]!);
  if (hijos) for (const hijo of hijos) nodo.appendChild(prototipo(hijo));
  return nodo;
}

/** La plantilla construida nodo a nodo: en el servidor y al hidratar. */
function construirPlantilla(plantilla: Template): Node[] {
  const buscados = new Map<string, number>();
  plantilla.caminos.forEach((camino, i) => buscados.set(camino.join(","), i));
  const nodos = new Array<Node>(plantilla.caminos.length);

  const construir = (estructura: TemplateStructure, camino: string): Node => {
    let nodo: Node;
    if (typeof estructura === "string") {
      nodo = text(estructura);
    } else {
      const [etiqueta, atributos, hijos, espacio] = estructura;
      const elemento = espacio ? element(etiqueta, espacio === 1 ? SVG : MATHML) : element(etiqueta);
      if (atributos) {
        for (let i = 0; i < atributos.length; i += 2) staticAttribute(elemento, atributos[i]!, atributos[i + 1]!);
      }
      if (hijos) {
        hijos.forEach((hijo, i) => colocar(elemento, construir(hijo, camino ? `${camino},${i}` : String(i)), null));
      }
      nodo = elemento;
    }
    const indice = buscados.get(camino);
    if (indice !== undefined) nodos[indice] = nodo;
    return nodo;
  };

  construir(plantilla.estructura, "");
  return nodos;
}

/**
 * El texto de un `${expr}` que no es una closure, en un nodo que ya existe: el
 * de la plantilla, cuando es el único hijo de su elemento. Como `staticText`,
 * su tipo rechaza una función.
 */
export function setText<T>(nodo: Text, valor: T extends (...args: never[]) => unknown ? never : T): void {
  nodo.data = String(valor);
}

/** `dynamicText` sobre un nodo que ya existe: el de la plantilla. */
export function bindText(nodo: Text, calcular: () => unknown): void {
  effect(() => {
    nodo.data = formatear(calcular());
  });
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
export function attribute(nodo: Element, nombre: string, calcular: () => AttributeValue): void {
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
export function staticAttribute(nodo: Element, nombre: string, valor: AttributeValue): void {
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
  if (!documento && DELEGADOS.has(evento)) {
    // Delegado: el manejador queda en el nodo y un solo listener por tipo,
    // en el documento, lo encuentra al subir. Crear mil filas no son dos mil
    // `addEventListener`.
    const clave = `$$${evento}`;
    const propio = nodo as unknown as Record<string, ((evento: Event) => void) | undefined>;
    const previo = propio[clave];
    propio[clave] = previo
      ? (e: Event) => {
          previo.call(nodo, e);
          manejador.call(nodo, e);
        }
      : manejador;
    escucharEn(doc());
    registrarOyente(nodo, clave, null);
    return;
  }
  nodo.addEventListener(evento, manejador);
  // Se apunta en el scope, sin una closure por listener: una tabla de mil
  // filas son dos mil. Al liberarlo, si el nodo ya salió del documento —una
  // fila que se vacía, una rama de <Show> que se cierra—, el recolector se lo
  // lleva con su listener; solo se quita si sigue ahí, como cuando se
  // desmonta una isla y su HTML se queda.
  registrarOyente(nodo, evento, manejador);
}

/**
 * Los eventos que se delegan: los que suben por el árbol. Es la lista de
 * Svelte, y la misma idea que Solid.
 */
const DELEGADOS = new Set([
  "beforeinput",
  "click",
  "change",
  "contextmenu",
  "dblclick",
  "focusin",
  "focusout",
  "input",
  "keydown",
  "keyup",
  "mousedown",
  "mousemove",
  "mouseout",
  "mouseover",
  "mouseup",
  "pointerdown",
  "pointermove",
  "pointerout",
  "pointerover",
  "pointerup",
]);

/** Dónde ya se escucha: el documento y los contenedores de `mount`. */
const escuchados = new WeakSet<EventTarget>();
/** Un evento ya repartido: si llega a otra raíz que escucha, no se repite. */
const REPARTIDO = Symbol("ascua.repartido");

/**
 * Escucha los eventos delegados en `raiz`. En el documento basta para todo lo
 * que está dentro; en el contenedor de `mount` cubre además un árbol que
 * todavía no está en el documento.
 */
function escucharEn(raiz: EventTarget): void {
  if (escuchados.has(raiz)) return;
  escuchados.add(raiz);
  for (const tipo of DELEGADOS) raiz.addEventListener(tipo, repartir);
}

/**
 * Sube desde el nodo del evento y llama a los manejadores delegados que
 * encuentre, como lo haría el navegador: `currentTarget` es el nodo de cada
 * uno, y `stopPropagation` corta la subida.
 */
function repartir(evento: Event): void {
  const marcado = evento as Event & { [REPARTIDO]?: true };
  if (marcado[REPARTIDO]) return;
  marcado[REPARTIDO] = true;
  const clave = `$$${evento.type}`;
  for (const nodo of evento.composedPath()) {
    const manejador = (nodo as unknown as Record<string, ((evento: Event) => void) | undefined>)[clave];
    if (!manejador) continue;
    Object.defineProperty(evento, "currentTarget", { configurable: true, value: nodo });
    try {
      manejador.call(nodo, evento);
    } finally {
      delete (evento as unknown as Record<string, unknown>)["currentTarget"];
    }
    if (evento.cancelBubble) break;
  }
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

/** Lo que queda de `T` al quitarle lo que `<Show>` entiende como «no hay». */
export type Present<T> = Exclude<T, null | undefined | false>;

/**
 * `<Show>` que entrega el valor ya estrechado:
 *
 * ```ts
 * view`<div><Show when=${() => club()}>${(club) => view`<h2>${() => club().nombre}</h2>`}</Show></div>`;
 * ```
 *
 * La región se reconstruye solo cuando el valor **aparece o desaparece**. Si
 * cambia por otro —un sondeo que trae el club otra vez—, lo que lo lee dentro
 * se actualiza sin rehacer nada. «No hay» es `null`, `undefined` o `false`; un
 * `0` o una cadena vacía son un valor.
 */
export function showValue<T>(
  padre: Node,
  elegir: () => T,
  // `NoInfer`: `T` sale de `elegir`. Si saliera también de aquí, anotar el
  // parámetro dentro de un componente genérico —`(d: () => Present<U>) => …`—
  // haría que TypeScript dedujera otra `T` y rechazara el `when`.
  construir: NoInfer<(valor: () => Present<T>) => Node | readonly Node[] | null>,
  siNo: (() => Node | readonly Node[] | null) | null = null,
): void {
  const hay = (v: T): v is Present<T> => v !== null && v !== undefined && v !== false;
  let ultimo: Present<T>;
  // Cuando el valor se va, la rama cae en el mismo ciclo, pero un efecto de
  // dentro puede alcanzar a leer antes: recibe el último valor que hubo, nunca
  // un `undefined` que su tipo promete que no llega.
  const valor = () => {
    const actual = elegir();
    if (hay(actual)) ultimo = actual;
    return ultimo;
  };
  show(padre, () => hay(elegir()), (esta) => (esta ? construir(valor) : siNo ? siNo() : null));
}

/**
 * Un componente usado sin props ni hijos: `<Menu/>`.
 *
 * Llamarlo como `Menu({})` obligaría a declarar un parámetro que no usa —si
 * no, TypeScript protesta por el argumento de más—. Así acepta tanto
 * `function Menu()` como uno con props opcionales, y sigue fallando si le
 * faltan props obligatorias.
 */
export function component<R>(construir: (props: Record<never, never>) => R): R {
  return construir({});
}

/** Lo que `bind:` necesita de un signal: leerlo y escribirlo. */
export interface Writable<T> {
  (): T;
  set(valor: T): void;
}

/**
 * Un campo atado a un signal en los dos sentidos: `bind:value=${nombre}`.
 *
 * `value` escucha `input` —texto, `<textarea>`, `<select>`—; `checked`,
 * `change`. `valueAsNumber` es `value` para un `<input type=number>` que
 * guarda un número: vacío es `NaN`.
 */
export function bind(nodo: Element, propiedad: "value", senal: Writable<string>): void;
export function bind(nodo: Element, propiedad: "checked", senal: Writable<boolean>): void;
export function bind(nodo: Element, propiedad: "valueAsNumber", senal: Writable<number>): void;
export function bind(
  nodo: Element,
  propiedad: "value" | "checked" | "valueAsNumber",
  senal: Writable<string> | Writable<boolean> | Writable<number>,
): void {
  const campo = nodo as unknown as Record<string, unknown>;
  const escribir = (senal as Writable<unknown>).set;
  if (propiedad === "valueAsNumber") {
    // Se escribe `value`, no `valueAsNumber`: es lo que el servidor sabe
    // poner en el HTML.
    property(nodo, "value", () => {
      const numero = (senal as Writable<number>)();
      return Number.isNaN(numero) ? "" : String(numero);
    });
  } else {
    property(nodo, propiedad, () => senal());
  }
  on(nodo, propiedad === "checked" ? "change" : "input", () => escribir(campo[propiedad]));
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
  // Cada fila: su nodo y su scope. Sin closure para liberarla: son miles.
  const entradas = new Map<K, { nodo: Node; scope: Scope }>();

  effect(() => {
    const lista = items();
    const claves = lista.map(clave);
    // Si no había nada, no hay nada que quitar: ni conjunto que armar.
    const presentes = orden.length > 0 ? new Set(claves) : null;

    // 1. Fuera los que ya no están: del árbol y del grafo reactivo.
    //
    // Si no sobrevive ninguno y la lista es lo único que hay en el padre —el
    // caso de vaciar una tabla o reemplazarla entera—, se borra de un golpe
    // en vez de nodo a nodo: una sola operación de DOM en lugar de mil.
    if (!presentes) {
      // Nada que quitar.
    } else if (!orden.some((k) => presentes.has(k)) && padre.childNodes.length === entradas.size + 1) {
      padre.textContent = "";
      padre.appendChild(ancla);
      for (const entrada of entradas.values()) liberarScope(entrada.scope, true);
      entradas.clear();
      orden = [];
    } else {
      for (const vieja of orden) {
        if (presentes.has(vieja)) continue;
        const entrada = entradas.get(vieja);
        if (!entrada) continue;
        (entrada.nodo as ChildNode).remove();
        liberarScope(entrada.scope, true);
        entradas.delete(vieja);
      }
      orden = orden.filter((k) => presentes.has(k));
    }

    // Todas nuevas —la lista estaba vacía—: se construyen y entran en orden,
    // sin calcular qué se queda quieto. Directo al padre y no a un
    // fragmento: insertar el fragmento después cuesta lo mismo que insertar
    // las filas, y llenarlo es trabajo de más.
    if (orden.length === 0 && !hidratando && !documento) {
      withScope(scope, () => {
        for (let i = 0; i < lista.length; i++) {
          const k = claves[i]!;
          if (entradas.has(k)) continue;
          const raiz = { nodo: null as Scope };
          const nodo = enRaizNueva(construir, lista[i]!, raiz);
          entradas.set(k, { nodo, scope: raiz.nodo });
          padre.insertBefore(nodo, ancla);
        }
      });
      orden = claves;
      return;
    }

    // 2. Construir los nuevos, cada uno en su propio scope.
    let nuevas: Uint8Array | null = null;
    withScope(scope, () => {
      lista.forEach((item, indice) => {
        const k = claves[indice]!;
        if (entradas.has(k)) return;
        const raiz = { nodo: null as Scope };
        const nodo = enRaizNueva(construir, item, raiz);
        entradas.set(k, { nodo, scope: raiz.nodo });
        (nuevas ??= new Uint8Array(claves.length))[indice] = 1;
      });
    });

    // Lo más común después de crear: quitar una fila, añadir al final. Si las
    // que sobreviven siguen en su orden, no se mueve ninguna y solo entran las
    // nuevas: ni mapa de posiciones ni subsecuencia.
    if (enElMismoOrden(claves, orden, nuevas)) {
      if (nuevas) {
        let siguiente: Node = ancla;
        for (let i = claves.length - 1; i >= 0; i--) {
          const nodo = entradas.get(claves[i]!)!.nodo;
          if (nuevas[i]) colocar(padre, nodo, siguiente);
          siguiente = nodo;
        }
      }
      orden = claves;
      return;
    }

    // Dos que cambian de sitio entre sí, con todo lo demás igual: se mueven
    // esas dos y ya, sin mapa de posiciones ni subsecuencia.
    if (!nuevas && intercambio(claves, orden, padre, entradas)) {
      orden = claves;
      return;
    }

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
 * Si `claves` es `orden` con dos elementos intercambiados, los intercambia en
 * el DOM y devuelve `true`. Se descartan primero el principio y el final que
 * coinciden; lo que queda tiene que empezar y acabar cruzado, e igual en
 * medio.
 */
function intercambio<K>(
  claves: readonly K[],
  orden: readonly K[],
  padre: Node,
  entradas: Map<K, { nodo: Node }>,
): boolean {
  if (claves.length !== orden.length) return false;
  let inicio = 0;
  let fin = claves.length - 1;
  while (inicio < fin && claves[inicio] === orden[inicio]) inicio++;
  while (fin > inicio && claves[fin] === orden[fin]) fin--;
  if (inicio >= fin || claves[inicio] !== orden[fin] || claves[fin] !== orden[inicio]) return false;
  for (let i = inicio + 1; i < fin; i++) if (claves[i] !== orden[i]) return false;

  const primero = entradas.get(orden[inicio]!)!.nodo;
  const ultimo = entradas.get(orden[fin]!)!.nodo;
  const trasUltimo = ultimo.nextSibling;
  colocar(padre, ultimo, primero);
  colocar(padre, primero, trasUltimo);
  return true;
}

/** ¿Las claves que ya estaban aparecen en `claves` en el mismo orden que en `orden`? */
function enElMismoOrden<K>(claves: readonly K[], orden: readonly K[], nuevas: Uint8Array | null): boolean {
  let j = 0;
  for (let i = 0; i < claves.length; i++) {
    if (nuevas && nuevas[i]) continue;
    if (claves[i] !== orden[j]) return false;
    j++;
  }
  return j === orden.length;
}

/**
 * Monta un árbol dentro de una raíz reactiva propia.
 *
 * Devuelve cómo desmontarlo: quita los nodos y libera todos los efectos que
 * los alimentaban.
 */
export function mount(padre: Node, construir: () => Node): () => void {
  // Por si `padre` todavía no está en el documento: los eventos delegados de
  // dentro llegan a él aunque no lleguen más arriba.
  if (!documento) escucharEn(padre);
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
export interface HydratableIsland {
  readonly name: string;
  readonly prepare: (props: string) => (() => Node) | undefined;
}

/** Lo que dejó la hidratación: cuántos nodos se adoptaron y cuántos se crearon. */
export interface Hydrated {
  adopted: number;
  created: number;
  /** Apaga las islas: libera sus efectos y listeners, y deja el HTML. */
  unmount: () => void;
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
  islas: readonly HydratableIsland[] | Record<string, (props: string) => Node>,
  raiz: ParentNode = document,
): Hydrated {
  const resultado: Hydrated = { adopted: 0, created: 0, unmount: () => {} };
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
      ? (islas as readonly HydratableIsland[]).find((isla) => isla.name === nombre)?.prepare(props)
      : sinValidar && (() => sinValidar(props));
    if (!construir) continue;

    const [estado, liberar] = root(() => hidratarEn(contenedor, construir));
    resultado.adopted += estado.adoptados;
    resultado.created += estado.creados;
    liberaciones.push(liberar);
  }

  resultado.unmount = () => {
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

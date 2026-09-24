/**
 * El grafo reactivo.
 *
 * Es el mismo modelo que el núcleo en Rust del que viene Ascua, traducido a
 * JavaScript: marcar es barato, recalcular no. Escribir en un signal no
 * ejecuta nada, solo marca; los efectos afectados se encolan y se ejecutan
 * cuando la marca ha terminado de propagarse.
 *
 * Eso es lo que evita los dos defectos clásicos del patrón: leer un valor
 * intermedio inconsistente en un grafo en diamante, y recalcular ramas cuyo
 * valor no cambió.
 *
 * A diferencia de la versión en Rust, aquí no hace falta arena ni conteo de
 * referencias: el recolector de JavaScript se ocupa de la memoria. Lo que sí
 * se conserva es el **árbol de dueños**, porque de él dependen los `onCleanup`
 * y el desmontaje: liberar un scope libera su subárbol.
 */

/** El valor es válido. */
const LIMPIO = 0;
/** Algo cambió más arriba; hay que preguntar a las fuentes. */
const REVISAR = 1;
/** Una fuente directa cambió; hay que recalcular. */
const SUCIO = 2;

type Estado = typeof LIMPIO | typeof REVISAR | typeof SUCIO;

interface Nodo {
  valor: unknown;
  estado: Estado;
  /** Memo: recalcula y devuelve si el valor cambió. */
  recomputar: ((nodo: Nodo) => boolean) | null;
  /** Efecto: trabajo con efecto lateral. */
  ejecutar: (() => void) | null;
  fuentes: Nodo[];
  observadores: Nodo[];
  dueño: Nodo | null;
  hijos: Nodo[];
  /** Cuántos de `hijos` ya se liberaron por su cuenta. Ver `liberarNodo`. */
  hijosLiberados: number;
  /** Ya no existe: sus efectos no corren y liberarlo otra vez no hace nada. */
  liberado: boolean;
  limpiezas: Array<() => void>;
  /** Quién se hace cargo si algo falla aquí dentro. */
  manejadores: Array<(error: unknown) => void>;
}

/** Observador en ejecución: quien lea un signal ahora queda suscrito a él. */
let observador: Nodo | null = null;
/** Dueño en ejecución: todo nodo creado ahora es hijo suyo. */
let dueño: Nodo | null = null;

let pendientes: Nodo[] = [];
let profundidadLote = 0;
let vaciando = false;

/** Tope de vueltas antes de declarar un ciclo, para no colgar la pestaña. */
const MAX_VUELTAS = 1000;

function crearNodo(valor: unknown, estado: Estado = LIMPIO): Nodo {
  const nodo: Nodo = {
    valor,
    estado,
    recomputar: null,
    ejecutar: null,
    fuentes: [],
    observadores: [],
    dueño,
    hijos: [],
    hijosLiberados: 0,
    liberado: false,
    limpiezas: [],
    manejadores: [],
  };
  if (dueño) dueño.hijos.push(nodo);
  return nodo;
}

/** Registra que el observador actual depende de `fuente`. */
function rastrear(fuente: Nodo): void {
  if (!observador) return;
  if (observador.fuentes.includes(fuente)) return;
  observador.fuentes.push(fuente);
  fuente.observadores.push(observador);
}

/**
 * Marca un nodo y propaga hacia arriba.
 *
 * Solo se encola en la primera transición desde `LIMPIO`, así que un efecto
 * nunca aparece dos veces en la cola.
 */
function marcar(nodo: Nodo, estado: Estado): void {
  // Marcar al que está corriendo ahora mismo solo puede significar una cosa:
  // escribe un signal del que él mismo depende. Sin esto, el guard de
  // reentrancia se lo tragaría en silencio y el bug quedaría escondido.
  if (nodo === observador) {
    throw new Error(
      "ciclo reactivo: este cómputo escribe un signal del que él mismo depende. " +
        "Si la escritura es intencionada, envuélvela en untrack().",
    );
  }
  if (nodo.estado >= estado) return;
  const estabaLimpio = nodo.estado === LIMPIO;
  nodo.estado = estado;
  if (!estabaLimpio) return;

  if (nodo.ejecutar) pendientes.push(nodo);
  for (const observadorDe of nodo.observadores.slice()) {
    marcar(observadorDe, REVISAR);
  }
}

/** Recalcula solo si hace falta de verdad. */
function actualizarSiHaceFalta(nodo: Nodo): void {
  if (nodo.estado === LIMPIO) return;

  if (nodo.estado === REVISAR) {
    for (const fuente of nodo.fuentes.slice()) {
      actualizarSiHaceFalta(fuente);
      if ((nodo.estado as Estado) === SUCIO) break;
    }
  }

  // `recomputar` deja el nodo limpio por su cuenta, y debe hacerlo *antes* de
  // ejecutar el cómputo. Marcarlo aquí borraría las marcas que ese cómputo
  // haya generado sobre sí mismo.
  if (nodo.estado === SUCIO) recomputar(nodo);
  else nodo.estado = LIMPIO;
}

function recomputar(nodo: Nodo): void {
  // Antes de reejecutar: soltar suscripciones viejas, liberar los hijos de la
  // ejecución anterior y correr sus limpiezas. Es lo que hace que las
  // dependencias sean dinámicas.
  limpiarNodo(nodo);

  // Limpio antes de ejecutar: si el cómputo se ensucia a sí mismo —escribe un
  // signal del que depende— esa marca tiene que sobrevivir, para que el ciclo
  // se detecte en vez de perderse en silencio.
  nodo.estado = LIMPIO;

  const observadorPrevio = observador;
  const dueñoPrevio = dueño;
  observador = nodo;
  dueño = nodo;

  let cambió = false;
  try {
    if (nodo.recomputar) cambió = nodo.recomputar(nodo);
    else if (nodo.ejecutar) nodo.ejecutar();
  } catch (error) {
    // Antes de relanzar, se busca quién se hace cargo: si nadie lo hace, el
    // error sigue su camino y la aplicación se entera igual.
    if (!manejar(nodo, error)) throw error;
  } finally {
    observador = observadorPrevio;
    dueño = dueñoPrevio;
  }

  if (cambió) {
    for (const observadorDe of nodo.observadores.slice()) marcar(observadorDe, SUCIO);
  }
}

/**
 * Busca hacia arriba quién se hace cargo de un error, y se lo entrega.
 *
 * El manejador corre en **su** scope, no en el del cómputo que falló: lo que
 * cree allí —un signal para el mensaje, una limpieza— sobrevive a lo que se
 * está derrumbando, que es justo para lo que sirve. Y sin observador activo,
 * así que leer algo ahí no suscribe a nadie.
 */
function manejar(desde: Nodo, error: unknown): boolean {
  let nodo: Nodo | null = desde;
  while (nodo) {
    const manejadores = nodo.manejadores;
    if (manejadores.length > 0) {
      const observadorPrevio = observador;
      const dueñoPrevio = dueño;
      observador = null;
      dueño = nodo;
      try {
        for (const manejador of manejadores.slice()) manejador(error);
      } finally {
        observador = observadorPrevio;
        dueño = dueñoPrevio;
      }
      return true;
    }
    nodo = nodo.dueño;
  }
  return false;
}

/**
 * Deja el nodo listo para reejecutarse. El nodo en sí sobrevive.
 *
 * Se llama mucho —una vez por nodo al desmontar una tabla entera—, así que no
 * copia listas que están vacías, que es lo normal en un nodo hoja.
 */
function limpiarNodo(nodo: Nodo): void {
  if (nodo.fuentes.length > 0) {
    for (const fuente of nodo.fuentes) {
      const indice = fuente.observadores.indexOf(nodo);
      if (indice >= 0) fuente.observadores.splice(indice, 1);
    }
    nodo.fuentes.length = 0;
  }

  if (nodo.hijos.length > 0) {
    const hijos = nodo.hijos;
    nodo.hijos = [];
    nodo.hijosLiberados = 0;
    for (const hijo of hijos) liberarNodo(hijo, true);
  }

  nodo.manejadores.length = 0;
  if (nodo.limpiezas.length > 0) {
    const limpiezas = nodo.limpiezas;
    nodo.limpiezas = [];
    // En orden inverso de registro, como los destructores.
    for (let i = limpiezas.length - 1; i >= 0; i--) limpiezas[i]!();
  }
}

/**
 * Libera un nodo y todo lo que cuelga de él.
 *
 * `desdeElDueño` es que lo está liberando su dueño, que ya lo sacó de su
 * lista. Si no —una raíz que se suelta sola, como la fila de un `<For>` que
 * desaparece—, hay que descolgarlo del dueño: si no, el dueño seguiría
 * reteniendo cada fila que existió, con sus closures y sus nodos del DOM.
 *
 * Descolgar uno a uno con `indexOf` sería cuadrático al vaciar una lista
 * grande. En su lugar se cuentan, y cuando la mitad de los hijos del dueño ya
 * se liberaron, la lista se compacta: cuesta O(1) por nodo y el orden de los
 * que quedan no cambia.
 */
function liberarNodo(nodo: Nodo, desdeElDueño = false): void {
  if (nodo.liberado) return;
  nodo.liberado = true;

  const suyo = nodo.dueño;
  if (!desdeElDueño && suyo && !suyo.liberado) {
    suyo.hijosLiberados++;
    if (suyo.hijosLiberados > 16 && suyo.hijosLiberados * 2 > suyo.hijos.length) {
      suyo.hijos = suyo.hijos.filter((hijo) => !hijo.liberado);
      suyo.hijosLiberados = 0;
    }
  }

  limpiarNodo(nodo);
  if (pendientes.length > 0) {
    const indice = pendientes.indexOf(nodo);
    if (indice >= 0) pendientes.splice(indice, 1);
  }
  nodo.ejecutar = null;
  nodo.recomputar = null;
}

function vaciarCola(): void {
  if (vaciando || profundidadLote > 0) return;
  vaciando = true;

  let vueltas = 0;
  try {
    while (pendientes.length > 0) {
      if (++vueltas > MAX_VUELTAS) {
        throw new Error(
          "ciclo reactivo: la cola de efectos no se vacía. " +
            "¿Un efecto escribe un signal del que él mismo depende?",
        );
      }
      const lote = pendientes;
      pendientes = [];
      for (const nodo of lote) {
        if (nodo.estado !== LIMPIO) actualizarSiHaceFalta(nodo);
      }
    }
  } finally {
    vaciando = false;
  }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/** Estado reactivo. Se lee llamándolo: `count()`. */
export interface Signal<T> {
  (): T;
  /** Reemplaza el valor y avisa a quien dependa de él. */
  set(valor: T): void;
  /** Deriva el valor nuevo del actual. */
  update(fn: (actual: T) => T): void;
  /** Lee sin suscribir al observador actual. */
  peek(): T;
}

/** Valor derivado: se lee llamándolo, y solo recalcula si hace falta. */
export type Memo<T> = () => T;

export function signal<T>(inicial: T): Signal<T> {
  const nodo = crearNodo(inicial);

  const leer = (() => {
    rastrear(nodo);
    return nodo.valor as T;
  }) as Signal<T>;

  leer.set = (valor: T) => {
    if (Object.is(nodo.valor, valor)) return;
    nodo.valor = valor;
    for (const observadorDe of nodo.observadores.slice()) marcar(observadorDe, SUCIO);
    vaciarCola();
  };
  leer.update = (fn: (actual: T) => T) => leer.set(fn(nodo.valor as T));
  leer.peek = () => nodo.valor as T;

  return leer;
}

/**
 * Valor derivado de otros signals.
 *
 * Es perezoso —no recalcula hasta que alguien lo lee— y corta la propagación:
 * si al recalcular obtiene el mismo valor, sus observadores no se enteran.
 */
export function memo<T>(calcular: () => T, iguales = Object.is): Memo<T> {
  const nodo = crearNodo(undefined, SUCIO);
  let inicializado = false;

  nodo.recomputar = (self: Nodo) => {
    const nuevo = calcular();
    const cambió = !inicializado || !iguales(self.valor as T, nuevo);
    self.valor = nuevo;
    inicializado = true;
    return cambió;
  };

  return () => {
    // Recalcular ANTES de suscribir, no al revés. Si el observador ya
    // estuviera apuntado cuando el memo se recalcula, el propio memo lo
    // marcaría como sucio y lo haría correr dos veces por un solo cambio.
    actualizarSiHaceFalta(nodo);
    rastrear(nodo);
    return nodo.valor as T;
  };
}

/**
 * Trabajo que se reejecuta cuando cambia algo que leyó.
 *
 * Las dependencias se descubren en cada ejecución: lo que el cuerpo lea esta
 * vez es a lo que queda suscrito. Una rama que deja de ejecutarse deja de
 * despertarlo.
 */
export function effect(fn: () => void): void {
  const nodo = crearNodo(undefined, SUCIO);
  let corriendo = false;

  nodo.ejecutar = () => {
    // Un efecto que se dispara a sí mismo se omite en vez de recursar.
    if (corriendo) return;
    corriendo = true;
    try {
      fn();
    } finally {
      corriendo = false;
    }
  };

  recomputar(nodo);
  vaciarCola();
}

/**
 * Registra limpieza para el scope actual. Se ejecuta antes de cada
 * reejecución y al liberarlo.
 *
 * Fuera de todo scope se descarta: quien llama acaba de adquirir un recurso, y
 * liberarlo en el acto lo destruiría nada más crearlo.
 */
export function onCleanup(fn: () => void): void {
  if (dueño) dueño.limpiezas.push(fn);
}

/**
 * Se hace cargo de los errores que ocurran en este scope o por debajo.
 *
 * Es lo que evita que un fallo en una vista se lleve por delante la
 * aplicación entera: el manejador recibe el error y decide —enseñar otra cosa,
 * registrarlo—, y lo de fuera sigue funcionando. Sin ninguno registrado, el
 * error se propaga como siempre.
 *
 * Fuera de todo scope se descarta: no habría nada a lo que atender.
 */
export function onError(manejador: (error: unknown) => void): void {
  if (dueño) dueño.manejadores.push(manejador);
}

/**
 * Pregunta «¿es esta la clave elegida?» sin despertar a todas las demás.
 *
 * El caso es la fila seleccionada de una tabla. Si cada fila lee el signal de
 * la selección, cambiarla despierta mil efectos para repintar dos. Con un
 * selector, cada fila se suscribe solo a **su** clave, y un cambio avisa
 * únicamente a la que deja de estar elegida y a la que pasa a estarlo.
 *
 * ```ts
 * const esLaElegida = selector(() => seleccionada());
 * view`<tr class:danger=${() => esLaElegida(fila.id)}>…</tr>`;
 * ```
 */
export function selector<T>(fuente: () => T): (clave: T) => boolean {
  const suscriptores = new Map<T, Set<Nodo>>();
  let actual: T;
  let listo = false;

  effect(() => {
    const nuevo = fuente();
    if (listo && !Object.is(nuevo, actual)) {
      const antes = suscriptores.get(actual);
      const despues = suscriptores.get(nuevo);
      actual = nuevo;
      // Solo los dos implicados. El resto ni se entera.
      if (antes) for (const nodo of antes) marcar(nodo, SUCIO);
      if (despues) for (const nodo of despues) marcar(nodo, SUCIO);
    } else {
      actual = nuevo;
      listo = true;
    }
  });

  return (clave: T) => {
    const quien = observador;
    if (quien) {
      let lista = suscriptores.get(clave);
      if (!lista) suscriptores.set(clave, (lista = new Set()));
      if (!lista.has(quien)) {
        lista.add(quien);
        // Dentro de un cómputo, su dueño es él mismo: la limpieza corre antes
        // de cada reejecución y al liberarlo, así que una fila que desaparece
        // no deja su suscripción colgada del selector.
        const suya = lista;
        onCleanup(() => {
          suya.delete(quien);
          if (suya.size === 0) suscriptores.delete(clave);
        });
      }
    }
    return Object.is(clave, actual);
  };
}

/** Crea una raíz reactiva y devuelve su resultado y cómo liberarla. */
export function root<T>(fn: () => T): [T, () => void] {
  const nodo = crearNodo(undefined);
  const dueñoPrevio = dueño;
  const observadorPrevio = observador;
  dueño = nodo;
  observador = null;

  try {
    return [fn(), () => liberarNodo(nodo)];
  } finally {
    dueño = dueñoPrevio;
    observador = observadorPrevio;
  }
}

/** Agrupa escrituras: los efectos corren una sola vez, al final. */
export function batch<T>(fn: () => T): T {
  profundidadLote++;
  try {
    return fn();
  } finally {
    profundidadLote--;
    vaciarCola();
  }
}

/**
 * Referencia opaca a un scope, para crear cosas dentro de él más tarde.
 *
 * Hace falta cuando algo se crea *desde dentro* de un efecto pero debe
 * sobrevivir a sus reejecuciones. El caso real es la lista con clave: el
 * efecto que la reconcilia se reejecuta en cada cambio y se llevaría por
 * delante los scopes de todos los items.
 */
export type Scope = { readonly __scope: unique symbol } | null;

/** El scope activo ahora mismo. */
export function currentScope(): Scope {
  return dueño as unknown as Scope;
}

/** Ejecuta `fn` con `scope` como dueño, sin rastrear lo que lea. */
export function withScope<T>(scope: Scope, fn: () => T): T {
  const dueñoPrevio = dueño;
  const observadorPrevio = observador;
  dueño = scope as unknown as Nodo | null;
  observador = null;
  try {
    return fn();
  } finally {
    dueño = dueñoPrevio;
    observador = observadorPrevio;
  }
}

/** Ejecuta `fn` sin suscribir nada de lo que lea. */
export function untrack<T>(fn: () => T): T {
  const previo = observador;
  observador = null;
  try {
    return fn();
  } finally {
    observador = previo;
  }
}

/**
 * # ascua-query
 *
 * Datos remotos para Ascua: una caché compartida por clave encima de los
 * signals del runtime. Lo que `resource` hace para una vista —cargar, recargar,
 * cancelar—, aquí lo comparten todas: dos vistas que piden la misma clave
 * hacen una sola petición, una mutación invalida lo que cambió y todo lo que
 * lo muestra se recarga.
 *
 * Sin contexto ni proveedor que instalar, como el router: la caché es del
 * módulo. Los valores por defecto son los de TanStack Query, para que migrar
 * no cambie el comportamiento: los datos caducan al momento (`staleTime: 0`),
 * la caché de lo que nadie mira dura cinco minutos, se reintenta tres veces y
 * se recarga al volver a la pestaña.
 */

import { batch, effect, memo, onCleanup, signal, untrack, type Signal } from "ascua";

/** La clave de una consulta: `["conversations", { page: 2 }]`. */
export type QueryKey = readonly unknown[];

/** En qué está una consulta. Como `ResourceState` del runtime. */
export type QueryState = "idle" | "loading" | "ready" | "error";

/** Lo que recibe `load`: con qué cancelar la petición. */
export interface LoadInfo {
  signal: AbortSignal;
}

/** Lo que se puede configurar para todas las consultas. */
export interface QueryDefaults {
  /** Milisegundos durante los que un dato se da por fresco. Por defecto, 0. */
  staleTime: number;
  /** Cuánto sigue en caché lo que ninguna vista mira. Por defecto, 5 minutos. */
  gcTime: number;
  /** Reintentos tras un fallo. Por defecto, 3. */
  retry: number;
  /** Espera antes del reintento `n` (desde 0). Por defecto, 1 s, 2 s, 4 s… hasta 30 s. */
  retryDelay: (attempt: number) => number;
  /** Recargar lo caducado al volver a la pestaña o a la red. Por defecto, sí. */
  refetchOnFocus: boolean;
}

export interface RemoteOptions<K extends QueryKey, T, R = T> extends Partial<QueryDefaults> {
  /**
   * La clave. Es reactiva: si lee un signal, la consulta sigue a ese signal.
   * `null`, `undefined` o `false` la desactivan (queda en `idle`).
   */
  key: () => K | null | undefined | false;
  /** Carga los datos de una clave. */
  load: (key: K, info: LoadInfo) => Promise<T>;
  /**
   * Recargar cada tantos milisegundos mientras la vista esté montada y la
   * pestaña visible. Puede ser reactivo: `() => polling() ? 5000 : false`.
   */
  interval?: number | false | (() => number | false);
  /** Al cambiar de clave, seguir mostrando los datos anteriores hasta que lleguen los nuevos. */
  keepPrevious?: boolean;
  /** Transforma lo cargado antes de entregarlo. */
  select?: (data: T) => R;
}

/** Una consulta: se lee llamándola, como un signal. */
export interface Remote<R> {
  /** Los datos, o `undefined` hasta que lleguen. Mientras se recarga siguen ahí. */
  (): R | undefined;
  state(): QueryState;
  /** Hay una carga en camino: la primera o una recarga. */
  loading(): boolean;
  /** El error de la última carga, o `undefined` si fue bien. */
  error(): unknown;
  /** Lo que se ve es de la clave anterior (`keepPrevious`) mientras carga la nueva. */
  placeholder(): boolean;
  /** Cuándo llegaron los datos (`Date.now()`), o 0 si aún no. */
  updatedAt(): number;
  /** Vuelve a cargar ahora, aunque los datos estén frescos. */
  reload(): Promise<void>;
}

// ---------------------------------------------------------------------------
// La caché
// ---------------------------------------------------------------------------

const porDefecto: QueryDefaults = {
  staleTime: 0,
  gcTime: 5 * 60_000,
  retry: 3,
  retryDelay: (n) => Math.min(1000 * 2 ** n, 30_000),
  refetchOnFocus: true,
};

/** Cambia los valores por defecto de todas las consultas. */
export function configure(opciones: Partial<QueryDefaults>): void {
  Object.assign(porDefecto, opciones);
}

interface Entrada {
  clave: QueryKey;
  hash: string;
  datos: Signal<unknown>;
  estado: Signal<QueryState>;
  fallo: Signal<unknown>;
  actualizado: Signal<number>;
  /** Una invalidación la dio por caducada aunque sea reciente. */
  invalidada: boolean;
  /** La última función de carga que se registró para esta clave. */
  cargar?: ((clave: QueryKey, info: LoadInfo) => Promise<unknown>) | undefined;
  opciones: QueryDefaults;
  vuelo?: Promise<void> | undefined;
  control?: AbortController | undefined;
  /** Cuántas vistas la miran ahora. */
  oyentes: number;
  gc?: ReturnType<typeof setTimeout> | undefined;
}

const cache = new Map<string, Entrada>();

/** Un texto estable para una clave: los objetos, con las propiedades ordenadas. */
function hashDe(clave: QueryKey): string {
  return JSON.stringify(clave, (_, valor: unknown) =>
    valor && typeof valor === "object" && !Array.isArray(valor)
      ? Object.fromEntries(
          Object.keys(valor)
            .sort()
            .map((k) => [k, (valor as Record<string, unknown>)[k]]),
        )
      : valor,
  );
}

/** ¿Empieza `clave` por `prefijo`? `["users"]` cubre `["users", 4]`. */
function coincide(prefijo: QueryKey, clave: QueryKey): boolean {
  return prefijo.length <= clave.length && prefijo.every((p, i) => hashDe([p]) === hashDe([clave[i]]));
}

function obtener(clave: QueryKey): Entrada {
  const hash = hashDe(clave);
  let e = cache.get(hash);
  if (!e) {
    e = {
      clave,
      hash,
      datos: signal<unknown>(undefined),
      estado: signal<QueryState>("idle"),
      fallo: signal<unknown>(undefined),
      actualizado: signal(0),
      invalidada: false,
      opciones: { ...porDefecto },
      oyentes: 0,
    };
    cache.set(hash, e);
    programarRecogida(e);
  }
  return e;
}

function caducada(e: Entrada): boolean {
  const cuando = e.actualizado.peek();
  return e.invalidada || cuando === 0 || Date.now() - cuando >= e.opciones.staleTime;
}

function esperar(ms: number, señal: AbortSignal): Promise<void> {
  return new Promise((resolver, rechazar) => {
    const t = setTimeout(resolver, ms);
    señal.addEventListener("abort", () => {
      clearTimeout(t);
      rechazar(señal.reason);
    });
  });
}

/** Carga una entrada. Si ya hay una carga en camino, es esa: no se duplica. */
function cargar(e: Entrada): Promise<void> {
  if (e.vuelo) return e.vuelo;
  const fn = e.cargar;
  if (!fn) return Promise.resolve();
  const control = new AbortController();
  const { retry, retryDelay } = e.opciones;
  e.control = control;
  e.estado.set("loading");

  const vuelo = (async () => {
    for (let intento = 0; ; intento++) {
      try {
        return await fn(e.clave, { signal: control.signal });
      } catch (error) {
        if (control.signal.aborted || intento >= retry) throw error;
        await esperar(retryDelay(intento), control.signal);
      }
    }
  })()
    .then(
      (dato) => {
        if (control.signal.aborted) return;
        e.invalidada = false;
        batch(() => {
          e.datos.set(compartir(e.datos.peek(), dato));
          e.fallo.set(undefined);
          e.actualizado.set(Date.now());
          e.estado.set("ready");
        });
      },
      (error: unknown) => {
        if (control.signal.aborted) return;
        batch(() => {
          e.fallo.set(error);
          e.estado.set("error");
        });
      },
    )
    .finally(() => {
      if (e.control === control) {
        e.control = undefined;
        e.vuelo = undefined;
      }
    });
  e.vuelo = vuelo;
  return vuelo;
}

/** Corta la carga en camino y deja el estado como estaba antes de empezarla. */
function abortar(e: Entrada): void {
  if (!e.control) return;
  e.control.abort();
  e.control = undefined;
  e.vuelo = undefined;
  e.estado.set(e.fallo.peek() !== undefined ? "error" : e.datos.peek() !== undefined ? "ready" : "idle");
}

function programarRecogida(e: Entrada): void {
  if (e.gc) clearTimeout(e.gc);
  const t = setTimeout(() => {
    if (e.oyentes > 0 || cache.get(e.hash) !== e) return;
    abortar(e);
    cache.delete(e.hash);
  }, e.opciones.gcTime);
  // En Node, un temporizador de la caché no debe mantener vivo el proceso.
  (t as { unref?: () => void }).unref?.();
  e.gc = t;
}

function suscribir(e: Entrada): void {
  e.oyentes++;
  if (e.gc) {
    clearTimeout(e.gc);
    e.gc = undefined;
  }
  escucharFoco();
}

function soltar(e: Entrada): void {
  e.oyentes--;
  if (e.oyentes === 0) programarRecogida(e);
}

const enNavegador = typeof window !== "undefined" && typeof document !== "undefined";
let escuchando = false;

function escucharFoco(): void {
  if (escuchando || !enNavegador) return;
  escuchando = true;
  const alVolver = () => {
    for (const e of cache.values()) {
      if (e.oyentes > 0 && e.opciones.refetchOnFocus && caducada(e)) void cargar(e);
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") alVolver();
  });
  window.addEventListener("online", alVolver);
}

function esPlano(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Lo nuevo, pero reusando de lo viejo cada objeto que no cambió. Un sondeo que
 * trae lo mismo devuelve el mismo objeto, y nada se vuelve a pintar; si cambió
 * una fila, las demás conservan su identidad.
 */
function compartir(viejo: unknown, nuevo: unknown): unknown {
  if (viejo === nuevo) return viejo;
  const arreglos = Array.isArray(viejo) && Array.isArray(nuevo);
  if (!arreglos && !(esPlano(viejo) && esPlano(nuevo))) return nuevo;
  const a = viejo as Record<string, unknown>;
  const b = nuevo as Record<string, unknown>;
  const claves = Object.keys(b);
  const resultado: Record<string, unknown> = arreglos ? [] as unknown as Record<string, unknown> : {};
  let iguales = claves.length === Object.keys(a).length;
  for (const k of claves) {
    const v = compartir(a[k], b[k]);
    resultado[k] = v;
    if (v !== a[k] || !(k in a)) iguales = false;
  }
  return iguales ? viejo : resultado;
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

/**
 * Datos remotos con caché: `const users = remote({ key: () => ["users"], load: api.users })`.
 *
 * Carga al crearse si no hay datos frescos para la clave, y cada vez que la
 * clave cambia. Se suscribe a la entrada de la caché mientras viva el scope
 * en que se creó: al cerrar la vista la suelta, y lo que nadie mira se borra
 * pasado `gcTime`. En el servidor no carga: se queda en `idle`.
 */
export function remote<K extends QueryKey, T, R = T>(opciones: RemoteOptions<K, T, R>): Remote<R> {
  const actual = signal<Entrada | null>(null);
  /** La última entrada que tenía datos: lo que `keepPrevious` sigue mostrando. */
  let anterior: Entrada | null = null;

  effect(() => {
    const clave = opciones.key();
    if (clave === null || clave === undefined || clave === false) {
      actual.set(null);
      return;
    }
    untrack(() => {
      const e = obtener(clave);
      e.cargar = opciones.load as (clave: QueryKey, info: LoadInfo) => Promise<unknown>;
      e.opciones = {
        staleTime: opciones.staleTime ?? porDefecto.staleTime,
        gcTime: opciones.gcTime ?? porDefecto.gcTime,
        retry: opciones.retry ?? porDefecto.retry,
        retryDelay: opciones.retryDelay ?? porDefecto.retryDelay,
        refetchOnFocus: opciones.refetchOnFocus ?? porDefecto.refetchOnFocus,
      };
      suscribir(e);
      onCleanup(() => soltar(e));
      const previa = actual.peek();
      if (previa && previa !== e && previa.datos.peek() !== undefined) anterior = previa;
      actual.set(e);
      if (enNavegador && !e.vuelo && caducada(e)) void cargar(e);
    });
  });

  if (opciones.interval) {
    effect(() => {
      const e = actual();
      const intervalo = opciones.interval;
      const ms = typeof intervalo === "function" ? intervalo() : intervalo;
      if (!e || !ms || !enNavegador) return;
      const t = setInterval(() => {
        if (document.visibilityState !== "hidden") void cargar(e);
      }, ms);
      onCleanup(() => clearInterval(t));
    });
  }

  const propia = memo(() => actual()?.datos());
  const placeholder = memo(() => {
    if (!opciones.keepPrevious || !actual() || propia() !== undefined) return false;
    return anterior?.datos() !== undefined;
  });
  const crudo = memo(() => (placeholder() ? anterior?.datos() : propia()));
  const seleccion = memo(() => {
    const dato = crudo();
    return dato === undefined || !opciones.select ? dato : opciones.select(dato as T);
  });

  const consulta = (() => seleccion()) as Remote<R>;
  consulta.state = () => actual()?.estado() ?? "idle";
  consulta.loading = () => consulta.state() === "loading";
  consulta.error = () => actual()?.fallo();
  consulta.placeholder = placeholder;
  consulta.updatedAt = () => actual()?.actualizado() ?? 0;
  consulta.reload = () => {
    const e = actual.peek();
    if (!e) return Promise.resolve();
    abortar(e);
    return cargar(e);
  };
  return consulta;
}

// ---------------------------------------------------------------------------
// La caché a mano
// ---------------------------------------------------------------------------

function entradas(prefijo: QueryKey): Entrada[] {
  return [...cache.values()].filter((e) => coincide(prefijo, e.clave));
}

/**
 * Da por caducado todo lo que empieza por `prefix` (`["users"]` cubre
 * `["users", 4]`; sin prefijo, todo). Lo que alguna vista está mirando se
 * recarga ya, cortando la carga en camino si la hay; el resto, la próxima vez
 * que se monte. La promesa se cumple cuando terminan las recargas.
 */
export function invalidate(prefix: QueryKey = [], options: { refetch?: boolean } = {}): Promise<void> {
  const recargas: Promise<void>[] = [];
  for (const e of entradas(prefix)) {
    e.invalidada = true;
    if (e.oyentes > 0 && options.refetch !== false && enNavegador) {
      abortar(e);
      recargas.push(cargar(e));
    }
  }
  return Promise.all(recargas).then(() => undefined);
}

/** Los datos en caché de una clave exacta, sin cargar nada. */
export function getData<T>(key: QueryKey): T | undefined {
  return cache.get(hashDe(key))?.datos.peek() as T | undefined;
}

/**
 * Escribe los datos de una clave como si acabaran de llegar: lo que ya se
 * sabe tras guardar algo, o una actualización optimista.
 */
export function setData<T>(key: QueryKey, value: T | ((old: T | undefined) => T)): T {
  const e = obtener(key);
  const nuevo =
    typeof value === "function" ? (value as (old: T | undefined) => T)(e.datos.peek() as T | undefined) : value;
  e.invalidada = false;
  batch(() => {
    e.datos.set(nuevo);
    e.fallo.set(undefined);
    e.actualizado.set(Date.now());
    if (!e.vuelo) e.estado.set("ready");
  });
  return nuevo;
}

/**
 * Corta las cargas en camino de lo que empieza por `prefix`. Antes de una
 * actualización optimista, para que una respuesta vieja no pise lo escrito.
 */
export function cancel(prefix: QueryKey = []): Promise<void> {
  for (const e of entradas(prefix)) abortar(e);
  return Promise.resolve();
}

/** Carga una clave antes de que una vista la pida (si no hay datos frescos). */
export function prefetch<K extends QueryKey, T>(
  key: K,
  load: (key: K, info: LoadInfo) => Promise<T>,
  options: Partial<QueryDefaults> = {},
): Promise<void> {
  const e = obtener(key);
  e.cargar = load as (clave: QueryKey, info: LoadInfo) => Promise<unknown>;
  e.opciones = { ...porDefecto, ...options };
  return caducada(e) ? cargar(e) : Promise.resolve();
}

/** Vacía la caché entera, cortando lo que esté en camino. Para tests y cierres de sesión. */
export function clearCache(): void {
  for (const e of cache.values()) {
    abortar(e);
    if (e.gc) clearTimeout(e.gc);
  }
  cache.clear();
}

// ---------------------------------------------------------------------------
// Mutaciones
// ---------------------------------------------------------------------------

/** En qué está una mutación. */
export type MutationState = "idle" | "pending" | "success" | "error";

export interface MutationOptions<V, R, C = unknown> {
  /** Lo que guarda: una petición al servidor. */
  run: (variables: V) => Promise<R>;
  /**
   * Antes de `run`. Lo que devuelva llega como contexto a los demás: el
   * estado anterior para deshacer una actualización optimista.
   */
  onMutate?: (variables: V) => C | Promise<C>;
  onSuccess?: (data: R, variables: V, context: C | undefined) => unknown;
  onError?: (error: unknown, variables: V, context: C | undefined) => unknown;
  /** Al terminar, haya ido bien o mal. */
  onSettled?: (data: R | undefined, error: unknown, variables: V, context: C | undefined) => unknown;
}

/**
 * Lo que una llamada concreta quiere hacer al terminar: un aviso, cerrar un
 * formulario. Corren después de los `on…` de la mutación, y solo los de la
 * última llamada: si se lanza otra antes, los de la anterior no corren.
 */
export interface MutateCallbacks<V, R> {
  onSuccess?: (data: R, variables: V) => unknown;
  onError?: (error: unknown, variables: V) => unknown;
  onSettled?: (data: R | undefined, error: unknown, variables: V) => unknown;
}

/** Sin variables, `mutate()` se llama sin argumentos. */
type Variables<V, R> = undefined extends V
  ? [variables?: V, callbacks?: MutateCallbacks<V, R>]
  : [variables: V, callbacks?: MutateCallbacks<V, R>];

export interface Mutation<V, R> {
  /**
   * Lanza la mutación. Un fallo queda en `error()`: no hace falta capturarlo.
   * `mutate(v, { onSuccess, onError })` añade lo que hacer al terminar esta llamada.
   */
  mutate(...args: Variables<V, R>): void;
  /** Igual, pero devuelve el resultado y rechaza si falla. */
  mutateAsync(...args: Variables<V, R>): Promise<R>;
  state(): MutationState;
  pending(): boolean;
  /** El resultado de la última que fue bien. */
  data(): R | undefined;
  error(): unknown;
  /** Vuelve a `idle`, olvidando resultado y error. */
  reset(): void;
}

/**
 * Una escritura con su estado: `const save = mutation({ run: api.save, onSuccess: () => invalidate(["users"]) })`.
 *
 * Los `on…` se esperan si devuelven una promesa: `pending()` sigue siendo
 * `true` mientras `onSuccess` recarga lo que invalidó, así que el botón no se
 * libera antes de que la lista esté al día.
 */
export function mutation<V = void, R = unknown, C = unknown>(opciones: MutationOptions<V, R, C>): Mutation<V, R> {
  const estado = signal<MutationState>("idle");
  const datos = signal<R | undefined>(undefined);
  const fallo = signal<unknown>(undefined);
  /** Si se lanza otra antes de que termine, el estado es de la última. */
  let vuelta = 0;

  const mutateAsync = async (...args: Variables<V, R>): Promise<R> => {
    const variables = args[0] as V;
    const llamada = args[1];
    const esta = ++vuelta;
    batch(() => {
      estado.set("pending");
      fallo.set(undefined);
    });
    let contexto: C | undefined;
    try {
      contexto = await opciones.onMutate?.(variables);
      const resultado = await opciones.run(variables);
      await opciones.onSuccess?.(resultado, variables, contexto);
      await opciones.onSettled?.(resultado, undefined, variables, contexto);
      if (esta === vuelta) {
        batch(() => {
          datos.set(resultado);
          estado.set("success");
        });
        await llamada?.onSuccess?.(resultado, variables);
        await llamada?.onSettled?.(resultado, undefined, variables);
      }
      return resultado;
    } catch (error) {
      if (esta === vuelta) {
        batch(() => {
          fallo.set(error);
          estado.set("error");
        });
      }
      await opciones.onError?.(error, variables, contexto);
      await opciones.onSettled?.(undefined, error, variables, contexto);
      if (esta === vuelta) {
        await llamada?.onError?.(error, variables);
        await llamada?.onSettled?.(undefined, error, variables);
      }
      throw error;
    }
  };

  return {
    mutate: (...args) => {
      mutateAsync(...args).catch(() => {});
    },
    mutateAsync,
    state: () => estado(),
    pending: () => estado() === "pending",
    data: () => datos(),
    error: () => fallo(),
    reset: () => {
      vuelta++;
      batch(() => {
        estado.set("idle");
        datos.set(undefined);
        fallo.set(undefined);
      });
    },
  };
}

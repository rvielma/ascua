/**
 * # ascua/persisted
 *
 * Un signal que se guarda en `localStorage`.
 *
 * El almacén del navegador falla más de lo que parece: lanza al *leer* con las
 * cookies bloqueadas, en algunos modos privados o en un iframe con sandbox;
 * lanza al *escribir* con la cuota llena; y devuelve lo que dejó una versión
 * anterior de la app. Nada de eso tira la página: si el almacén falla, el
 * signal sigue funcionando en memoria y `saved()` pasa a `false`.
 *
 * Va aparte del runtime para que no pese en quien no lo importa.
 */

import { onCleanup, signal, type Signal } from "./reactivo.js";

export interface Persisted<T> extends Signal<T> {
  /** `false` si el último intento de guardar falló, o si no hay almacén. */
  saved(): boolean;
}

export interface PersistedOptions<T> {
  /** Lo guardado con otra versión se descarta y vale `initial`. Por defecto, 1. */
  version?: number;
  /** Comprueba lo leído; si devuelve `false`, vale `initial`. */
  validate?: (value: unknown) => value is T;
  /** El almacén. Por defecto, `localStorage` si existe; `null`, solo en memoria. */
  storage?: Storage | null;
  /**
   * Sigue los cambios de la misma clave en otras pestañas (el evento
   * `storage`). El listener se quita con el scope.
   */
  sync?: boolean;
}

/** Lo que se escribe: el valor con su versión, para poder cambiar la forma. */
interface Envelope {
  v: number;
  d: unknown;
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Leer la propiedad ya puede lanzar (SecurityError).
    return null;
  }
}

/**
 * Un signal guardado bajo `key`. Lee una vez al crearse; cada `set` escribe.
 * Sin almacén —en el servidor, en un test— funciona solo en memoria.
 *
 * ```ts
 * const theme = persisted<"light" | "dark">("app:theme", "light");
 * theme.set("dark");   // en memoria y, si se puede, en localStorage
 * theme.saved();       // false si no se pudo guardar
 * ```
 */
export function persisted<T>(key: string, initial: T, options: PersistedOptions<T> = {}): Persisted<T> {
  const version = options.version ?? 1;
  const storage = options.storage === undefined ? defaultStorage() : options.storage;

  const parse = (text: string | null): T => {
    if (text === null) return initial;
    try {
      const envelope = JSON.parse(text) as Partial<Envelope> | null;
      if (!envelope || envelope.v !== version) return initial;
      if (options.validate && !options.validate(envelope.d)) return initial;
      return envelope.d as T;
    } catch {
      return initial;
    }
  };

  const read = (): T => {
    if (!storage) return initial;
    try {
      return parse(storage.getItem(key));
    } catch {
      return initial;
    }
  };

  const value = signal<T>(read());
  const ok = signal(storage !== null);

  const write = (next: T): void => {
    if (!storage) return;
    try {
      storage.setItem(key, JSON.stringify({ v: version, d: next } satisfies Envelope));
      ok.set(true);
    } catch {
      ok.set(false);
    }
  };

  if (options.sync && storage && typeof window !== "undefined") {
    const listener = (event: StorageEvent) => {
      if (event.storageArea !== storage || (event.key !== key && event.key !== null)) return;
      // `key === null` es un `clear()` en otra pestaña.
      value.set(event.key === null ? initial : parse(event.newValue));
    };
    window.addEventListener("storage", listener);
    onCleanup(() => window.removeEventListener("storage", listener));
  }

  const result = (() => value()) as Persisted<T>;
  result.set = (next: T) => {
    value.set(next);
    write(next);
  };
  result.update = (fn: (current: T) => T) => result.set(fn(value.peek()));
  result.peek = () => value.peek();
  result.saved = () => ok();
  return result;
}

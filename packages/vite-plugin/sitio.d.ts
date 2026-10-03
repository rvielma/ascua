/**
 * Lo que una ruta de `src/routes/` puede importar del sitio.
 */

import type { Infer, StandardSchema } from "ascua";
import type { Cookies } from "ascua-security";

/**
 * Lo que lanza `load()` cuando lo pedido no existe: en desarrollo y en modo
 * `server`, el sitio responde con la página 404.
 */
export function notFound(): Error;

/** El segundo argumento de `load()`. En el build de un sitio estático llega vacío. */
export interface LoadContext {
  url: URL;
  request: Request;
  /** Las cookies de la petición; lo que se escriba va en la respuesta. */
  cookies: Cookies;
}

/** Lo que recibe una acción. */
export interface ActionContext<P = Record<string, string>> {
  /** Los parámetros de la ruta: `{ id }` en `pedidos/[id].ts`. */
  params: P;
  url: URL;
  request: Request;
  cookies: Cookies;
  /** Lo que mandó el formulario. */
  formData: FormData;
}

/**
 * Las acciones de una ruta: reciben los `POST` de sus formularios. `default`
 * atiende `<form method="post">`; las demás, `action="?/nombre"`.
 */
export type Actions<P = Record<string, string>> = Record<string, (context: ActionContext<P>) => unknown>;

/**
 * Manda al navegador a otra página. Por defecto un 303: la pide con GET y
 * recargar no reenvía el formulario. Una acción lo devuelve o lo lanza;
 * `load()`, con servidor, lo lanza.
 */
export function redirect(location: string, status?: 301 | 302 | 303 | 307 | 308): Error;

/** Lo que devuelve `fail`. */
export interface Failure<D> {
  readonly ascuaFallo: true;
  readonly status: number;
  readonly data: D;
}

/** Lo enviado no vale: la página se pinta con `status` y `data` en la prop `form`. */
export function fail<D>(status: number, data: D): Failure<D>;

/** El resultado de `validate`. */
export type FormResult<S extends StandardSchema> =
  | { ok: true; data: Infer<S> }
  | {
      ok: false;
      /** El primer mensaje de cada campo; `""` para lo que no es de ninguno. */
      errors: Partial<Record<string, string>>;
      /** Lo que se escribió, para volver a llenar el formulario. Sin archivos ni contraseñas. */
      values: Partial<Record<string, string | string[]>>;
    };

/** Valida un formulario con un esquema de Standard Schema: los de `fields`, Zod, Valibot… */
export function validate<S extends StandardSchema>(schema: S, form: FormData | URLSearchParams | Record<string, unknown>): Promise<FormResult<S>>;

/** Los campos de un formulario como objeto. Un nombre repetido da una lista. */
export function formValues(form: FormData | URLSearchParams | Record<string, unknown>): Record<string, FormDataEntryValue | FormDataEntryValue[]>;

interface Message {
  /** Reemplaza el mensaje de error. */
  message?: string;
}

/** Esquemas para lo que llega de un formulario, que siempre es texto. */
export declare const field: {
  /** Texto, sin los espacios de los extremos. Obligatorio salvo `min: 0`. */
  text(options?: { min?: number; max?: number; pattern?: RegExp; trim?: boolean } & Message): StandardSchema<string>;
  /** Un correo. Obligatorio. */
  email(options?: Message): StandardSchema<string>;
  /** Un número; acepta coma decimal. Obligatorio. */
  number(options?: { min?: number; max?: number; integer?: boolean } & Message): StandardSchema<number>;
  /** Una casilla: `true` si llegó. */
  checkbox(): StandardSchema<boolean>;
  /** Uno de los valores dados. */
  choice<const T extends string>(options: readonly T[], extra?: Message): StandardSchema<T>;
  /** Vacío o ausente es `undefined`. */
  optional<T>(inner: StandardSchema<T>): StandardSchema<T | undefined>;
};

type Shape = Record<string, StandardSchema>;
type Optional<F extends Shape> = { [K in keyof F]: undefined extends Infer<F[K]> ? K : never }[keyof F];
type Flat<T> = { [K in keyof T]: T[K] } & {};

/** Un objeto de campos que junta los errores de todos. */
export function fields<F extends Shape>(
  shape: F,
): StandardSchema<
  Flat<{ [K in Exclude<keyof F, Optional<F>>]: Infer<F[K]> } & { [K in Optional<F>]?: Infer<F[K]> }>
>;

/**
 * Formularios mejorados desde una isla: `<form method="post">` que, con la
 * isla hidratada, se envía con `fetch` y muestra el resultado sin recargar.
 */

import type { StandardSchema } from "ascua";

export interface EnhanceOptions<R> {
  /** El resultado con el que empieza: el prop `form` de la isla. */
  initial?: R;
  /** Vacía el formulario tras una acción que salió bien. Por defecto, sí. */
  reset?: boolean;
  /** Tras una acción que salió bien, con lo que devolvió. */
  onSuccess?: (data: R | undefined) => void;
  /** Antes de seguir una redirección. Devolver `false` la cancela. */
  onRedirect?: (location: string) => boolean | void;
}

export interface Enhanced<R> {
  /** Va en el `onsubmit` del formulario. */
  submit(event: SubmitEvent): Promise<void>;
  /** Hay un envío en curso. Los envíos de más, mientras tanto, se ignoran. */
  pending(): boolean;
  /** Lo que devolvió la acción, o el `data` de su `fail`. */
  result(): R | undefined;
  /** Si no se pudo enviar, o el servidor lo rechazó (otro origen, una acción que no existe). */
  error(): string | undefined;
  /** El código de la última respuesta: 200, el de `fail`, 403… */
  status(): number | undefined;
}

/**
 * Mejora un formulario desde una isla. `R` es lo que devuelve la acción:
 * `FormResult<typeof Esquema>` si devuelve `fail(400, await validate(…))`.
 */
export function enhance<R = unknown>(options?: EnhanceOptions<R>): Enhanced<R>;

/** El esquema del prop `form` de una isla, para recibir lo de la acción sin JavaScript. */
export function formResult<R = unknown>(): StandardSchema<R | undefined>;

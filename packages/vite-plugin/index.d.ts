/**
 * El plugin de Vite de Ascua: compila las plantillas con el compilador en
 * WebAssembly y, con `site`, convierte `src/routes/` en un sitio.
 */

import type { Plugin } from "vite";

/** `site.security`, solo con servidor salvo `csp`, que también va en el `<meta>` de un sitio estático. */
export interface SiteSecurity {
  /** Suma fuentes a cada directiva; `null` la quita. `false` no manda la política. */
  csp?: false | Record<string, readonly string[] | null>;
  /** Añade o reemplaza cabeceras; `null` quita una. */
  headers?: Record<string, string | null>;
  /** Otros orígenes de confianza para las acciones. */
  origins?: readonly string[];
  /** Bytes aceptados en un `POST`. Por defecto, 1 MiB. */
  bodyLimit?: number;
}

/** Las opciones de un sitio: cada archivo de `routes` es una página. */
export interface SiteOptions {
  /** Por defecto, `src/routes`. */
  routes?: string;
  /** Por defecto, `src/islands`. */
  islands?: string;
  /** El esqueleto HTML. Por defecto, `index.html`. */
  shell?: string;
  /** `static` (por defecto) escribe una página por ruta; `server` deja un servidor en `dist/server/`. */
  mode?: "static" | "server";
  /** CSP, cabeceras, cookies y origen. `false` lo apaga todo. */
  security?: false | SiteSecurity;
}

export interface AscuaOptions {
  /** Ruta a un `ascuac` nativo. Sin esto se usa el compilador en WebAssembly. */
  bin?: string;
  /** `true` o sus opciones: una página HTML por archivo de `src/routes/`. */
  site?: true | SiteOptions;
}

export default function ascua(options?: AscuaOptions): Plugin | Plugin[];

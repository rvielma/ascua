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
  /**
   * El idioma de lo que ve quien usa el sitio: los mensajes de validación de
   * `field` y las respuestas del kit (403, 404, 405, 413). Por defecto, `es`.
   * Los errores de build siguen la variable de entorno `LANG`.
   */
  lang?: "es" | "en";
  /** CSP, cabeceras, cookies y origen. `false` lo apaga todo. */
  security?: false | SiteSecurity;
  /**
   * Navegar entre páginas sin recargar: los enlaces internos reemplazan solo
   * las regiones `data-partial` (o el `<body>`). Pone un script pequeño en
   * todas las páginas, también en las que no tienen islas.
   */
  partials?: boolean;
}

export interface AscuaOptions {
  /** Ruta a un `ascuac` nativo. Sin esto se usa el compilador en WebAssembly. */
  bin?: string;
  /** `true` o sus opciones: una página HTML por archivo de `src/routes/`. */
  site?: true | SiteOptions;
}

export default function ascua(options?: AscuaOptions): Plugin | Plugin[];

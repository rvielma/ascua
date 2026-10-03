/**
 * Seguridad de la capa web, sin dependencias: CSP con hashes, cabeceras,
 * cookies firmadas y la comprobación de origen contra CSRF.
 */

/** Directivas de CSP: cada una, su lista de fuentes. */
export type Directives = Record<string, readonly string[]>;

/** La política de partida de `contentSecurityPolicy`. */
export declare const DEFAULT_DIRECTIVES: Readonly<Directives>;

/** El hash de CSP de un texto: `'sha256-…'`. */
export declare function hash(text: string): Promise<string>;

/** El contenido de los scripts en línea que el navegador ejecutaría. */
export declare function inlineScripts(html: string): string[];

export interface CspOptions {
  /** Una lista se suma a la de partida; `null` quita la directiva. */
  directives?: Record<string, readonly string[] | null | false>;
  /** Añade `'wasm-unsafe-eval'` a `script-src`, para compilar WebAssembly. */
  wasm?: boolean;
}

/** La Content-Security-Policy de una página, con el hash de cada script en línea. */
export declare function contentSecurityPolicy(html?: string, options?: CspOptions): Promise<string>;

export interface SecurityHeadersOptions {
  csp?: string;
  /** Como `Content-Security-Policy-Report-Only`: avisa sin bloquear. */
  reportOnly?: boolean;
  /** `Strict-Transport-Security` de un año. Solo por HTTPS. */
  hsts?: boolean;
  /** Añade o reemplaza; `null` quita una cabecera. */
  headers?: Record<string, string | null | false>;
}

/** Las cabeceras de seguridad de una respuesta HTML, con los nombres en minúsculas. */
export declare function securityHeaders(options?: SecurityHeadersOptions): Record<string, string>;

/** `valor.firma`, con HMAC-SHA256. El secreto, de al menos 32 caracteres. */
export declare function sign(value: string, secret: string): Promise<string>;

/** El valor firmado, o `null` si la firma no es de este secreto. */
export declare function unsign(signed: string, secret: string): Promise<string | null>;

export interface CookieOptions {
  /** Por defecto `/`. */
  path?: string;
  domain?: string;
  /** En segundos. */
  maxAge?: number;
  expires?: Date;
  /** Por defecto `true`: no se lee desde JavaScript. */
  httpOnly?: boolean;
  /** Por defecto `true`. */
  secure?: boolean;
  /** Por defecto `"Lax"`. */
  sameSite?: "Strict" | "Lax" | "None" | "strict" | "lax" | "none" | false;
  partitioned?: boolean;
}

/** Las cookies de una cabecera `Cookie`, por nombre. */
export declare function parseCookies(header: string | null | undefined): Record<string, string>;

/** Una cabecera `Set-Cookie`, con `HttpOnly`, `Secure`, `SameSite=Lax` y `Path=/` por defecto. */
export declare function serializeCookie(name: string, value: string, options?: CookieOptions): string;

/** Las cookies de una petición, para leerlas y para escribir la respuesta. */
export interface Cookies {
  /** El valor que llegó, o el que se acaba de escribir en esta petición. */
  get(name: string): string | undefined;
  /** Todas las que llegaron. */
  all(): Record<string, string>;
  set(name: string, value: string, options?: CookieOptions): void;
  delete(name: string, options?: CookieOptions): void;
  /** El valor si la firma es buena; `undefined` si no hay cookie o la tocaron. */
  getSigned(name: string): Promise<string | undefined>;
  setSigned(name: string, value: string, options?: CookieOptions): Promise<void>;
  /** Las cabeceras `Set-Cookie` que hay que mandar, una por cookie. */
  headers(): string[];
}

export interface CreateCookiesOptions {
  /** El secreto de las firmadas, o cómo obtenerlo cuando haga falta. */
  secret?: string | (() => string | undefined);
  /** `false` quita `Secure` de las que se escriban. Por defecto `true`. */
  secure?: boolean;
}

export declare function createCookies(header: string | null | undefined, options?: CreateCookiesOptions): Cookies;

/** ¿La petición viene de esta misma página? La defensa contra CSRF. */
export declare function checkOrigin(request: Request, options?: { origins?: readonly string[] }): boolean;

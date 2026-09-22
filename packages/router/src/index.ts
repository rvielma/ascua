/**
 * # @ascua/router
 *
 * La ruta es un signal. Eso es todo lo que hay que entender: leerla dentro de
 * una closure hace que ese nodo siga a la URL, igual que con cualquier otro
 * dato, y no hace falta ningún concepto nuevo.
 *
 * No hay componente `<Router>` ni contexto que instalar. Una aplicación monta
 * su vista dentro de un elemento con `enrutarEn`, que por dentro es el mismo
 * `show` del runtime: al cambiar de ruta se libera el scope de la vista
 * anterior —efectos, listeners, `onCleanup`— y se construye la otra.
 */

import { memo, root, show, signal, untrack } from "@ascua/runtime";

/** Los parámetros que captura un patrón: `/pedidos/:id` → `{ id: "4821" }`. */
export type Parametros = Record<string, string>;

export interface Ruta {
  /**
   * `/pedidos`, `/pedidos/:id`, `/archivos/*`. Sin patrón, la ruta hace de
   * fallback: se usa cuando ninguna de las anteriores coincide.
   */
  patron?: string;
  /** Construye la vista. Recibe los parámetros que capturó el patrón. */
  vista: (parametros: Parametros) => Node;
}

const camino = signal(leerCamino());

if (typeof window !== "undefined") {
  // Atrás y adelante del navegador: la URL cambia sin pasar por `navegar`.
  window.addEventListener("popstate", () => camino.set(leerCamino()));
}

function leerCamino(): string {
  if (typeof location === "undefined") return "/";
  return normalizar(location.pathname + location.search);
}

/**
 * Quita la barra final y deja la raíz como `/`, para que `/pedidos` y
 * `/pedidos/` no sean dos rutas distintas.
 */
function normalizar(valor: string): string {
  if (valor.length > 1 && valor.endsWith("/")) return valor.slice(0, -1);
  return valor === "" ? "/" : valor;
}

/** La ruta actual, con su query. Leerla dentro de una closure es reactivo. */
export function ruta(): string {
  return camino();
}

/** Solo el camino, sin la query: lo que compara `coincide`. */
export function sinQuery(valor: string): string {
  const interrogante = valor.indexOf("?");
  return interrogante === -1 ? valor : valor.slice(0, interrogante);
}

/** Lo que va después de `?`, ya parseado. */
export function query(): URLSearchParams {
  const valor = camino();
  const interrogante = valor.indexOf("?");
  return new URLSearchParams(interrogante === -1 ? "" : valor.slice(interrogante));
}

/**
 * Cambia de ruta sin recargar la página.
 *
 * `reemplazar` sustituye la entrada actual del historial en vez de apilar
 * otra: es lo que quieres tras un login, para que el botón atrás no devuelva
 * al formulario.
 */
export function navegar(destino: string, opciones: { reemplazar?: boolean } = {}): void {
  const normalizado = normalizar(destino);
  if (typeof history !== "undefined") {
    if (opciones.reemplazar) history.replaceState(null, "", normalizado);
    else history.pushState(null, "", normalizado);
  }
  camino.set(normalizado);
}

/**
 * Hace que los `<a href="/…">` de dentro naveguen sin recargar.
 *
 * Se respeta lo que el usuario espera de un enlace: un click con ⌘/ctrl, un
 * click central, un `target` o un `download` siguen abriendo como siempre, y
 * los enlaces externos no se tocan. Devuelve cómo soltar el listener.
 */
export function enlaces(raiz: Node = document): () => void {
  const alPulsar = (evento: Event) => {
    const click = evento as MouseEvent;
    if (click.defaultPrevented || click.button !== 0) return;
    if (click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return;

    const destino = (click.target as Element | null)?.closest?.("a");
    if (!destino) return;

    const href = destino.getAttribute("href");
    if (!href || href.startsWith("#")) return;
    if (destino.hasAttribute("download") || destino.hasAttribute("target")) return;
    // Externo: dominio distinto, o un esquema que no es http(s).
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith(location.origin)) return;

    const url = new URL(href, location.href);
    if (url.origin !== location.origin) return;

    evento.preventDefault();
    navegar(url.pathname + url.search);
  };

  raiz.addEventListener("click", alPulsar);
  return () => raiz.removeEventListener("click", alPulsar);
}

/**
 * ¿Este patrón describe la ruta dada? Devuelve sus parámetros, o `null`.
 *
 * `:nombre` captura un segmento y `*` el resto del camino. Sin comodines, la
 * comparación es exacta: un patrón no coincide con una ruta más profunda.
 */
export function coincide(patron: string, contra: string = sinQuery(camino())): Parametros | null {
  const esperados = normalizar(patron).split("/");
  const reales = normalizar(contra).split("/");
  const parametros: Parametros = {};

  for (let i = 0; i < esperados.length; i++) {
    const esperado = esperados[i]!;

    if (esperado === "*") {
      parametros["resto"] = reales.slice(i).join("/");
      return parametros;
    }
    const real = reales[i];
    if (real === undefined) return null;

    if (esperado.startsWith(":")) {
      if (real === "") return null;
      parametros[esperado.slice(1)] = decodeURIComponent(real);
      continue;
    }
    if (esperado !== real) return null;
  }

  return esperados.length === reales.length ? parametros : null;
}

/** La ruta que toca ahora, con sus parámetros ya resueltos. */
function resolver(rutas: readonly Ruta[]): { indice: number; parametros: Parametros } {
  const actual = sinQuery(camino());

  for (let i = 0; i < rutas.length; i++) {
    const { patron } = rutas[i]!;
    if (patron === undefined) return { indice: i, parametros: {} };

    const parametros = coincide(patron, actual);
    if (parametros) return { indice: i, parametros };
  }
  return { indice: -1, parametros: {} };
}

/**
 * Monta dentro de `padre` la vista que corresponde a la ruta actual, y
 * devuelve cómo soltarla.
 *
 * Por debajo es `show`: mientras la ruta resuelva a lo mismo no se toca el
 * DOM, y al cambiar se libera la vista anterior entera antes de construir la
 * siguiente. Navegar a `/pedidos/2` desde `/pedidos/1` sí reconstruye, porque
 * los parámetros forman parte de lo que identifica a la vista.
 */
export function enrutarEn(padre: Node, rutas: readonly Ruta[]): () => void {
  const [, liberar] = root(() => montarRutas(padre, rutas));
  return liberar;
}

function montarRutas(padre: Node, rutas: readonly Ruta[]): void {
  const activa = memo(() => resolver(rutas));
  // La clave es una cadena a propósito: `show` compara con `Object.is`, y un
  // objeto nuevo en cada lectura reconstruiría la vista en cada cambio de
  // cualquier signal que se lea por el camino.
  const clave = memo(() => {
    const { indice, parametros } = activa();
    return `${indice}|${new URLSearchParams(parametros).toString()}`;
  });

  show(padre, clave, () => {
    const { indice, parametros } = untrack(activa);
    const ruta = rutas[indice];
    return ruta ? ruta.vista(parametros) : null;
  });
}

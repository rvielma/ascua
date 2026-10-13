/**
 * Partials: navegar entre páginas del sitio sin recargar, reemplazando solo
 * las regiones marcadas con `data-partial="nombre"`.
 *
 * Se pide la página entera —la misma que vería el navegador, así que vale
 * igual para un sitio estático— y de ella se toman las regiones. Lo que queda
 * fuera de ellas, como una isla en la cabecera, no se toca. Si algo no encaja
 * —la página nueva no tiene las mismas regiones, no es HTML, falla la red—,
 * se navega de la forma de siempre.
 */

/** El atributo que marca una región. */
export const REGION = "data-partial";
/** En un enlace o en un ancestro, `data-partials="false"` lo deja navegar como siempre. */
const NO = '[data-partials="false"]';

/**
 * Activa la navegación por partials.
 *
 * `hydrate(raiz, documento)` hidrata las islas de `raiz` —las que lista
 * `documento`— y devuelve cómo liberarlas. `exclude`, si se pasa, son
 * elementos cuyas islas no le tocan.
 */
export function partials({ hydrate }) {
  /** Región → cómo liberar sus islas. */
  const liberar = new Map();
  let enCurso = null;

  const regiones = (doc) => {
    const marcadas = [...doc.querySelectorAll(`[${REGION}]`)];
    return marcadas.length > 0 ? marcadas : [doc.body];
  };
  const nombreDe = (region) => region.getAttribute(REGION) ?? "body";

  // Lo de fuera de las regiones se hidrata una vez y no se vuelve a tocar.
  const iniciales = regiones(document);
  if (iniciales[0] !== document.body) hydrate(document, document, iniciales);
  for (const region of iniciales) liberar.set(nombreDe(region), hydrate(region, document));

  // La entrada de la página actual en el historial lleva su scroll.
  history.replaceState({ ...history.state, ascua: true, scroll: window.scrollY }, "");

  async function navegar(url, { push }) {
    enCurso?.abort();
    const control = new AbortController();
    enCurso = control;
    const destino = new URL(url, location.href);
    try {
      const respuesta = await fetch(destino, { signal: control.signal, headers: { "x-ascua-partial": "1" } });
      const tipo = respuesta.headers.get("content-type") ?? "";
      if (!tipo.includes("text/html")) return location.assign(destino);
      const doc = new DOMParser().parseFromString(await respuesta.text(), "text/html");
      if (control.signal.aborted) return;

      const actuales = regiones(document);
      const nuevas = new Map(regiones(doc).map((r) => [nombreDe(r), r]));
      if (actuales.some((r) => !nuevas.has(nombreDe(r)))) return location.assign(destino);

      // Una redirección del servidor: la URL es la de llegada.
      const final = new URL(respuesta.url || destino);
      if (push) {
        history.replaceState({ ...history.state, ascua: true, scroll: window.scrollY }, "");
        history.pushState({ ascua: true, scroll: 0 }, "", final.href + destino.hash);
      }

      cabeza(doc);
      for (const vieja of actuales) {
        const nombre = nombreDe(vieja);
        liberar.get(nombre)?.();
        const nueva = document.importNode(nuevas.get(nombre), true);
        vieja.replaceWith(nueva);
        liberar.set(nombre, hydrate(nueva, doc));
      }

      if (push) {
        const ancla = destino.hash && document.getElementById(decodeURIComponent(destino.hash.slice(1)));
        if (ancla) ancla.scrollIntoView();
        else window.scrollTo(0, 0);
        enfocar(regiones(document)[0]);
      }
      document.dispatchEvent(new CustomEvent("ascua:navigate", { detail: { url: final.href } }));
    } catch (error) {
      if (error?.name === "AbortError") return;
      location.assign(destino);
    } finally {
      if (enCurso === control) enCurso = null;
    }
  }

  document.addEventListener("click", (evento) => {
    const enlace = interceptable(evento);
    if (!enlace) return;
    evento.preventDefault();
    navegar(enlace.href, { push: true });
  });

  window.addEventListener("popstate", async (evento) => {
    if (!evento.state?.ascua) return;
    await navegar(location.href, { push: false });
    window.scrollTo(0, evento.state.scroll ?? 0);
  });

  return { navigate: (url) => navegar(url, { push: true }) };
}

/** El enlace de un click que se puede atender sin recargar, o `null`. */
export function interceptable(evento) {
  if (evento.defaultPrevented || evento.button !== 0) return null;
  if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return null;
  const enlace = evento.target instanceof Element ? evento.target.closest("a[href]") : null;
  if (!enlace || enlace.closest(NO)) return null;
  if (enlace.hasAttribute("download")) return null;
  const destino = enlace.getAttribute("target");
  if (destino && destino !== "_self") return null;
  if ((enlace.getAttribute("rel") ?? "").split(/\s+/).includes("external")) return null;
  const url = new URL(enlace.href, location.href);
  if (url.origin !== location.origin) return null;
  // Solo cambia el ancla: eso lo hace el navegador sin pedir nada.
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return null;
  return enlace;
}

/**
 * Lo del `<head>` que cambia con la página: el título, la descripción, el
 * idioma, y las hojas y módulos que traiga de nuevo —los de sus islas—. Lo
 * que ya estaba se queda: quitar una hoja haría parpadear lo de fuera.
 */
function cabeza(doc) {
  document.title = doc.title;
  const lang = doc.documentElement.getAttribute("lang");
  if (lang) document.documentElement.setAttribute("lang", lang);
  const descripcion = doc.querySelector('meta[name="description"]');
  const actual = document.querySelector('meta[name="description"]');
  if (descripcion && actual) actual.setAttribute("content", descripcion.getAttribute("content") ?? "");
  else if (descripcion) document.head.append(document.importNode(descripcion, true));

  for (const enlace of doc.head.querySelectorAll('link[rel="stylesheet"], link[rel="modulepreload"]')) {
    const href = enlace.getAttribute("href");
    if (href && !document.head.querySelector(`link[href="${CSS.escape(href)}"]`)) {
      document.head.append(document.importNode(enlace, true));
    }
  }
}

/** El foco a la región nueva, para que un lector de pantalla empiece por ella. */
function enfocar(region) {
  if (!region || region === document.body) return;
  if (!region.hasAttribute("tabindex")) region.setAttribute("tabindex", "-1");
  region.focus({ preventScroll: true });
}

/**
 * # ascua/servidor
 *
 * Renderizar en servidor no necesita un runtime aparte: es el mismo código de
 * componentes sobre otro documento. Este construye el árbol en memoria y lo
 * serializa, sin navegador y sin dependencias.
 *
 * Implementa solo lo que usan el runtime y el código que emite el compilador,
 * más lo que un componente suele hacer con el nodo que construyó
 * (`querySelector` con selectores simples, `classList`, `textContent`). No es
 * un DOM completo, y no pretende serlo: si un componente necesita algo que
 * falta, el error lo dice.
 */

import { ISLAND_ATTR, SEPARADOR, usarDocumento } from "./dom.js";
import { root } from "./reactivo.js";

export { island } from "./dom.js";
export { defineIsland, p } from "./isla.js";

/**
 * Renderiza un árbol a HTML.
 *
 * Los efectos se ejecutan una vez para producir el HTML y el scope se libera
 * al terminar: en el servidor no queda nada vivo. Lo que vaya dentro de una
 * `island` sale numerado para que el cliente lo hidrate con `hydrate`.
 *
 * ```ts
 * const html = renderToString(() => island("app", () => App()));
 * ```
 */
export function renderToString(construir: () => Node): string {
  const anterior = usarDocumento(new DocumentoServidor() as unknown as Document);
  try {
    const [nodo, liberar] = root(construir);
    const html = serializar(nodo as unknown as NodoServidor);
    liberar();
    return html;
  } finally {
    usarDocumento(anterior);
  }
}

// ---------------------------------------------------------------------------
// Estilos.

/**
 * Las hojas de los componentes que se han cargado en el servidor, con los
 * scopes que contiene cada una.
 *
 * En el cliente, el CSS de una plantilla llega a Vite como un módulo de
 * estilos. En el servidor eso no sirve —una página que solo existe aquí
 * nunca entra en el bundle del cliente—, así que el plugin registra cada hoja
 * con `registerStyle` al cargar el módulo, y `collectStyles` devuelve las que
 * usa una página.
 */
const hojas = new Map<string, readonly Bloque[]>();

/** Una regla de nivel superior de una hoja —o un `@media` entero— y sus scopes. */
interface Bloque {
  css: string;
  scopes: readonly string[];
}

const SCOPE = /data-ascua-([0-9a-f]{6,})\b/g;

/** Los scopes que nombra un trozo de CSS. */
const scopesDe = (css: string) => [...new Set([...css.matchAll(SCOPE)].map((m) => m[1]!))];

/**
 * Parte una hoja en sus bloques de nivel superior.
 *
 * Un archivo con varias plantillas entrega una sola hoja con el CSS de todas;
 * si se registrara entera, una página que usa una traería el de las demás.
 * Partida en reglas, cada una va solo donde aparece su scope.
 */
function partir(css: string): Bloque[] {
  const bloques: Bloque[] = [];
  let profundidad = 0;
  let inicio = 0;
  let comillas: string | null = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i]!;
    if (comillas) {
      if (c === "\\") i++;
      else if (c === comillas) comillas = null;
    } else if (c === '"' || c === "'") {
      comillas = c;
    } else if (c === "{") {
      profundidad++;
    } else if (c === "}" && --profundidad === 0) {
      const texto = css.slice(inicio, i + 1).trim();
      if (texto) bloques.push({ css: texto, scopes: scopesDe(texto) });
      inicio = i + 1;
    }
  }
  return bloques;
}

/**
 * Registra una hoja de estilos con scope. La llama el código que genera el
 * plugin de Vite en el servidor; no hace falta llamarla a mano.
 */
export function registerStyle(css: string): void {
  if (!css || hojas.has(css)) return;
  hojas.set(css, partir(css));
}

/**
 * El CSS que necesita un HTML ya renderizado: el de los componentes que
 * aparecen en él, y nada más.
 *
 * Va en un `<style>` en el `<head>`: los estilos llegan con la página, sin
 * parpadeo y sin otra petición.
 *
 * ```ts
 * const html = renderToString(() => Pagina());
 * const css = collectStyles(html);
 * // `<style>${css}</style>` en el head, `html` en el body.
 * ```
 *
 * Lo que no lleva scope —un `@keyframes`, un `@font-face`— se incluye cuando
 * se usa algo de su hoja: su nombre es global y alguna regla de al lado lo
 * puede estar usando.
 */
export function collectStyles(html: string): string {
  const usados = new Set(scopesDe(html));
  const salida: string[] = [];
  for (const bloques of hojas.values()) {
    if (!bloques.some((b) => b.scopes.some((scope) => usados.has(scope)))) continue;
    for (const bloque of bloques) {
      if (bloque.scopes.length === 0 || bloque.scopes.some((scope) => usados.has(scope))) {
        salida.push(bloque.css);
      }
    }
  }
  return salida.join("\n");
}

// ---------------------------------------------------------------------------
// El documento en memoria.

const ELEMENTO = 1;
const TEXTO = 3;
const COMENTARIO = 8;

abstract class NodoServidor {
  abstract readonly nodeType: number;
  parentNode: ElementoServidor | null = null;
  readonly childNodes: NodoServidor[] = [];

  get parentElement(): ElementoServidor | null {
    return this.parentNode;
  }
  get firstChild(): NodoServidor | null {
    return this.childNodes[0] ?? null;
  }
  get lastChild(): NodoServidor | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }
  get nextSibling(): NodoServidor | null {
    const hermanos = this.parentNode?.childNodes;
    return hermanos?.[hermanos.indexOf(this) + 1] ?? null;
  }
  get previousSibling(): NodoServidor | null {
    const hermanos = this.parentNode?.childNodes;
    return hermanos?.[hermanos.indexOf(this) - 1] ?? null;
  }
  get isConnected(): boolean {
    return false;
  }

  abstract get textContent(): string;
  abstract set textContent(valor: string);

  appendChild<T extends NodoServidor>(hijo: T): T {
    return this.insertBefore(hijo, null);
  }

  insertBefore<T extends NodoServidor>(hijo: T, antes: NodoServidor | null): T {
    if (this.nodeType !== ELEMENTO) throw new Error("Solo un elemento puede tener hijos");
    hijo.remove();
    const indice = antes ? this.childNodes.indexOf(antes) : -1;
    if (antes && indice < 0) throw new Error("El nodo de referencia no es hijo de este padre");
    this.childNodes.splice(indice < 0 ? this.childNodes.length : indice, 0, hijo);
    hijo.parentNode = this as unknown as ElementoServidor;
    return hijo;
  }

  replaceChild<T extends NodoServidor>(nuevo: NodoServidor, viejo: T): T {
    this.insertBefore(nuevo, viejo);
    viejo.remove();
    return viejo;
  }

  removeChild<T extends NodoServidor>(hijo: T): T {
    if (hijo.parentNode !== (this as unknown)) throw new Error("No es hijo de este nodo");
    hijo.remove();
    return hijo;
  }

  remove(): void {
    const padre = this.parentNode;
    if (!padre) return;
    padre.childNodes.splice(padre.childNodes.indexOf(this), 1);
    this.parentNode = null;
  }

  contains(otro: NodoServidor | null): boolean {
    for (let nodo = otro; nodo; nodo = nodo.parentNode) if (nodo === this) return true;
    return false;
  }

  // Sin eventos en el servidor: nadie va a hacer click en un string.
  addEventListener(): void {}
  removeEventListener(): void {}
}

class TextoServidor extends NodoServidor {
  readonly nodeType = TEXTO;
  constructor(public data: string) {
    super();
  }
  get textContent(): string {
    return this.data;
  }
  set textContent(valor: string) {
    this.data = valor;
  }
  get nodeValue(): string {
    return this.data;
  }
}

class ComentarioServidor extends NodoServidor {
  readonly nodeType = COMENTARIO;
  constructor(public data: string) {
    super();
  }
  get textContent(): string {
    return this.data;
  }
  set textContent(valor: string) {
    this.data = valor;
  }
}

class ListaDeClases {
  constructor(private readonly elemento: ElementoServidor) {}

  private leer(): string[] {
    return (this.elemento.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
  }
  private escribir(clases: string[]): void {
    this.elemento.setAttribute("class", clases.join(" "));
  }

  contains(clase: string): boolean {
    return this.leer().includes(clase);
  }
  add(...clases: string[]): void {
    const actuales = this.leer();
    for (const clase of clases) if (!actuales.includes(clase)) actuales.push(clase);
    this.escribir(actuales);
  }
  remove(...clases: string[]): void {
    const actuales = this.leer();
    if (actuales.some((c) => clases.includes(c))) {
      this.escribir(actuales.filter((c) => !clases.includes(c)));
    }
  }
  toggle(clase: string, forzar?: boolean): boolean {
    const poner = forzar ?? !this.contains(clase);
    if (poner) this.add(clase);
    else this.remove(clase);
    return poner;
  }
}

class ElementoServidor extends NodoServidor {
  readonly nodeType = ELEMENTO;
  readonly localName: string;
  readonly atributos = new Map<string, string>();
  readonly classList = new ListaDeClases(this);
  readonly style = {};
  readonly dataset = {};

  // Las propiedades que en el HTML tienen un atributo que las represente.
  // `prop:value` en el servidor tiene que salir en el HTML, o el primer
  // pintado mostraría el campo vacío.
  value: unknown = undefined;
  checked: unknown = undefined;
  selected: unknown = undefined;

  // HTML ya hecho, que se emite tal cual. Es `prop:innerHTML`: para contenido
  // de confianza —Markdown propio, un SVG—, nunca para lo que escribe un
  // usuario. El servidor no lo parsea, así que `querySelector` no lo ve.
  private crudo: string | null = null;
  innerHTMLCrudo(): string | null {
    return this.crudo;
  }
  get innerHTML(): string {
    if (this.crudo !== null) return this.crudo;
    let salida = "";
    for (const hijo of this.childNodes) escribir(hijo, (trozo) => (salida += trozo));
    return salida;
  }
  set innerHTML(valor: string) {
    for (const hijo of [...this.childNodes]) hijo.remove();
    this.crudo = String(valor ?? "");
  }

  constructor(etiqueta: string) {
    super();
    this.localName = etiqueta.toLowerCase();
  }

  get tagName(): string {
    return this.localName.toUpperCase();
  }
  get nodeName(): string {
    return this.tagName;
  }
  get id(): string {
    return this.getAttribute("id") ?? "";
  }
  get className(): string {
    return this.getAttribute("class") ?? "";
  }
  set className(valor: string) {
    this.setAttribute("class", valor);
  }
  get children(): ElementoServidor[] {
    return this.childNodes.filter((n): n is ElementoServidor => n.nodeType === ELEMENTO);
  }
  get firstElementChild(): ElementoServidor | null {
    return this.children[0] ?? null;
  }

  get textContent(): string {
    return this.childNodes
      .filter((n) => n.nodeType !== COMENTARIO)
      .map((n) => n.textContent)
      .join("");
  }
  set textContent(valor: string) {
    for (const hijo of [...this.childNodes]) hijo.remove();
    this.crudo = null;
    if (valor !== "") this.appendChild(new TextoServidor(valor));
  }

  override insertBefore<T extends NodoServidor>(hijo: T, antes: NodoServidor | null): T {
    this.crudo = null;
    return super.insertBefore(hijo, antes);
  }

  getAttribute(nombre: string): string | null {
    return this.atributos.get(nombre.toLowerCase()) ?? null;
  }
  setAttribute(nombre: string, valor: string): void {
    this.atributos.set(nombre.toLowerCase(), String(valor));
  }
  removeAttribute(nombre: string): void {
    this.atributos.delete(nombre.toLowerCase());
  }
  hasAttribute(nombre: string): boolean {
    return this.atributos.has(nombre.toLowerCase());
  }
  toggleAttribute(nombre: string, forzar?: boolean): boolean {
    const poner = forzar ?? !this.hasAttribute(nombre);
    if (poner) this.setAttribute(nombre, "");
    else this.removeAttribute(nombre);
    return poner;
  }

  querySelector(selector: string): ElementoServidor | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  querySelectorAll(selector: string): ElementoServidor[] {
    const opciones = selector.split(",").map((s) => compilarSelector(s.trim()));
    const encontrados: ElementoServidor[] = [];
    const recorrer = (padre: ElementoServidor) => {
      for (const hijo of padre.children) {
        if (opciones.some((cumple) => cumple(hijo))) encontrados.push(hijo);
        recorrer(hijo);
      }
    };
    recorrer(this);
    return encontrados;
  }
  matches(selector: string): boolean {
    return selector.split(",").some((s) => compilarSelector(s.trim())(this));
  }
  closest(selector: string): ElementoServidor | null {
    for (let nodo: ElementoServidor | null = this; nodo; nodo = nodo.parentNode) {
      if (nodo.matches(selector)) return nodo;
    }
    return null;
  }
}

class DocumentoServidor {
  createElement(etiqueta: string): ElementoServidor {
    return new ElementoServidor(etiqueta);
  }
  createTextNode(contenido: string): TextoServidor {
    return new TextoServidor(contenido);
  }
  createComment(contenido: string): ComentarioServidor {
    return new ComentarioServidor(contenido);
  }
}

/**
 * Selectores simples y compuestos: `div`, `.a.b`, `#id`, `[attr]`,
 * `[attr="v"]` y combinaciones de ellos, sin combinadores. Es lo que un
 * componente usa para encontrar un hueco en lo que acaba de construir.
 */
function compilarSelector(selector: string): (el: ElementoServidor) => boolean {
  const partes = /^([a-z][\w-]*|\*)?((?:[.#][\w-]+|\[[\w-]+(?:=(?:"[^"]*"|'[^']*'|[^\]]*))?\])*)$/i.exec(
    selector,
  );
  if (!selector || !partes) {
    throw new Error(
      `El DOM de servidor de Ascua solo entiende selectores simples (div, .clase, #id, [attr]); no «${selector}»`,
    );
  }
  const etiqueta = partes[1] && partes[1] !== "*" ? partes[1].toLowerCase() : null;
  const pruebas: ((el: ElementoServidor) => boolean)[] = [];
  for (const [, clase, id, attr, valor] of (partes[2] ?? "").matchAll(
    /\.([\w-]+)|#([\w-]+)|\[([\w-]+)(?:=("[^"]*"|'[^']*'|[^\]]*))?\]/g,
  )) {
    if (clase) pruebas.push((el) => el.classList.contains(clase));
    else if (id) pruebas.push((el) => el.id === id);
    else if (attr) {
      const esperado = valor?.replace(/^["']|["']$/g, "");
      pruebas.push((el) =>
        esperado === undefined ? el.hasAttribute(attr) : el.getAttribute(attr) === esperado,
      );
    }
  }
  return (el) => (etiqueta === null || el.localName === etiqueta) && pruebas.every((p) => p(el));
}

// ---------------------------------------------------------------------------
// Serializar.

const VACIOS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
]);
const TEXTO_CRUDO = new Set(["script", "style"]);

function serializar(nodo: NodoServidor): string {
  let salida = "";
  escribir(nodo, (trozo) => (salida += trozo));
  return salida;
}

/**
 * `enIsla`: dentro de una isla hace falta todo lo que la hidratación usa para
 * orientarse —marcadores, separadores—. Fuera no se hidrata nada, y eso solo
 * sería ruido en el HTML.
 */
function escribir(nodo: NodoServidor, emitir: (trozo: string) => void, enIsla = false): void {
  if (nodo.nodeType === TEXTO) {
    emitir(escaparTexto((nodo as TextoServidor).data));
    return;
  }
  if (nodo.nodeType === COMENTARIO) {
    if (enIsla) emitir(`<!--${(nodo as ComentarioServidor).data.replace(/--/g, "- -")}-->`);
    return;
  }

  const elemento = nodo as ElementoServidor;
  const etiqueta = elemento.localName;
  enIsla ||= elemento.hasAttribute(ISLAND_ATTR);
  emitir(`<${etiqueta}${atributos(elemento)}>`);
  if (VACIOS.has(etiqueta)) return;

  const crudo = elemento.innerHTMLCrudo();
  if (crudo !== null) {
    emitir(crudo);
  } else if (TEXTO_CRUDO.has(etiqueta)) {
    emitir(elemento.textContent);
  } else if (etiqueta === "textarea" && elemento.value !== undefined) {
    emitir(escaparTexto(String(elemento.value ?? "")));
  } else {
    // Dos textos seguidos, el navegador los lee como uno: la hidratación
    // perdería la cuenta. Se separan con un comentario que ella quita.
    let anteriorEraTexto = false;
    for (const hijo of elemento.childNodes) {
      const esTexto = hijo.nodeType === TEXTO;
      if (esTexto && (hijo as TextoServidor).data === "") continue;
      if (esTexto && anteriorEraTexto && enIsla) emitir(`<!--${SEPARADOR}-->`);
      escribir(hijo, emitir, enIsla);
      anteriorEraTexto = esTexto;
    }
  }
  emitir(`</${etiqueta}>`);
}

function atributos(elemento: ElementoServidor): string {
  const lista = new Map(elemento.atributos);
  // Las propiedades mandan sobre el atributo, igual que en el navegador.
  if (elemento.value !== undefined && elemento.localName !== "textarea") {
    if (elemento.value === null) lista.delete("value");
    else lista.set("value", String(elemento.value));
  }
  for (const booleana of ["checked", "selected"] as const) {
    const valor = elemento[booleana];
    if (valor === undefined) continue;
    if (valor) lista.set(booleana, "");
    else lista.delete(booleana);
  }

  let salida = "";
  for (const [nombre, valor] of lista) {
    salida += valor === "" ? ` ${nombre}` : ` ${nombre}="${escaparAtributo(valor)}"`;
  }
  return salida;
}

function escaparTexto(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escaparAtributo(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

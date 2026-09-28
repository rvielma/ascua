/**
 * # ascua
 *
 * Reactividad fine-grained y operaciones directas de DOM. Sin Virtual DOM: la
 * relación entre un dato y el nodo que lo muestra se establece una vez, así
 * que un cambio de estado ejecuta directamente la operación que le
 * corresponde.
 *
 * Se puede usar a mano, pero está pensado como destino del compilador de
 * Ascua, que traduce plantillas HTML a estas llamadas.
 */

export {
  batch,
  currentScope,
  effect,
  memo,
  onCleanup,
  onError,
  resource,
  root,
  selector,
  signal,
  untrack,
  withScope,
  type Memo,
  type Resource,
  type ResourceInfo,
  type ResourceState,
  type Scope,
  type Signal,
} from "./reactivo.js";

export {
  append,
  attribute,
  bind,
  component,
  cssClass,
  dynamicText,
  element,
  hydrate,
  insert,
  island,
  list,
  marker,
  mount,
  on,
  property,
  show,
  showValue,
  staticAttribute,
  staticText,
  text,
  type Children,
  type Hydrated,
  type HydratableIsland,
  type Present,
  type AttributeValue,
  type Writable,
} from "./dom.js";

export {
  defineIsland,
  p,
  type Infer,
  type InferShape,
  type Island,
  type Shape,
  type StandardSchema,
} from "./isla.js";

declare global {
  /**
   * Una plantilla de Ascua.
   *
   * En tiempo de ejecución no existe: el compilador la sustituye por las
   * llamadas que construyen el árbol. Se declara aquí para que TypeScript la
   * conozca —y para que el editor no la marque en rojo— sin obligar a
   * importarla en cada archivo.
   *
   * Sin pasar por el compilador, `view` no está definida y el error es claro.
   */
  function view(plantilla: TemplateStringsArray, ...valores: unknown[]): HTMLElement;

  /**
   * Lo mismo que `view`, con el nombre que buscan las extensiones de editor
   * para colorear el marcado. El compilador no distingue entre las dos.
   */
  function html(plantilla: TemplateStringsArray, ...valores: unknown[]): HTMLElement;
}

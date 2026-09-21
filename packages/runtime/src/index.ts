/**
 * # @ascua/runtime
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
  root,
  signal,
  untrack,
  withScope,
  type Memo,
  type Scope,
  type Signal,
} from "./reactivo.js";

export {
  append,
  attribute,
  dynamicText,
  element,
  insert,
  list,
  marker,
  mount,
  on,
  property,
  show,
  staticAttribute,
  text,
  type Children,
  type ValorAtributo,
} from "./dom.js";

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
}

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
  show,
  staticAttribute,
  text,
  type ValorAtributo,
} from "./dom.js";

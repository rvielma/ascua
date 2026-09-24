"use strict";
/**
 * Los atributos del HTML, para completarlos.
 *
 * Los tipos del DOM de TypeScript describen propiedades —`className`,
 * `htmlFor`, `tabIndex`—, no atributos, y en una plantilla de Ascua se escribe
 * HTML: `class`, `for`, `tabindex`. Por eso la lista va aquí, tomada del
 * estándar: los globales y los propios de cada etiqueta.
 *
 * Los eventos no están: salen de `HTMLElementEventMap`, y las propiedades de
 * `prop:`, del tipo del elemento.
 */

const GLOBALES = [
  "id",
  "class",
  "style",
  "title",
  "lang",
  "dir",
  "hidden",
  "tabindex",
  "role",
  "accesskey",
  "autofocus",
  "contenteditable",
  "draggable",
  "enterkeyhint",
  "inert",
  "inputmode",
  "popover",
  "spellcheck",
  "translate",
  "slot",
  "part",
];

const POR_ETIQUETA = {
  a: ["href", "target", "rel", "download", "hreflang", "type", "referrerpolicy", "ping"],
  area: ["href", "alt", "coords", "shape", "target", "rel", "download"],
  audio: ["src", "controls", "autoplay", "loop", "muted", "preload", "crossorigin"],
  base: ["href", "target"],
  blockquote: ["cite"],
  button: ["type", "name", "value", "disabled", "form", "formaction", "formmethod", "popovertarget", "popovertargetaction", "command", "commandfor"],
  canvas: ["width", "height"],
  col: ["span"],
  colgroup: ["span"],
  data: ["value"],
  del: ["cite", "datetime"],
  details: ["open", "name"],
  dialog: ["open"],
  embed: ["src", "type", "width", "height"],
  fieldset: ["disabled", "name", "form"],
  form: ["action", "method", "enctype", "novalidate", "target", "autocomplete", "name", "rel", "accept-charset"],
  iframe: ["src", "srcdoc", "title", "name", "allow", "allowfullscreen", "loading", "width", "height", "sandbox", "referrerpolicy"],
  img: ["src", "alt", "width", "height", "loading", "decoding", "srcset", "sizes", "crossorigin", "fetchpriority", "usemap", "ismap", "referrerpolicy"],
  input: [
    "type",
    "name",
    "value",
    "placeholder",
    "required",
    "disabled",
    "readonly",
    "checked",
    "min",
    "max",
    "step",
    "minlength",
    "maxlength",
    "pattern",
    "size",
    "multiple",
    "accept",
    "autocomplete",
    "list",
    "form",
    "capture",
    "src",
    "alt",
    "width",
    "height",
    "dirname",
  ],
  ins: ["cite", "datetime"],
  label: ["for"],
  li: ["value"],
  link: ["href", "rel", "as", "type", "media", "sizes", "crossorigin", "integrity", "hreflang", "fetchpriority"],
  map: ["name"],
  meta: ["name", "content", "charset", "http-equiv", "media"],
  meter: ["value", "min", "max", "low", "high", "optimum"],
  object: ["data", "type", "name", "width", "height", "form"],
  ol: ["start", "reversed", "type"],
  optgroup: ["label", "disabled"],
  option: ["value", "label", "selected", "disabled"],
  output: ["for", "name", "form"],
  progress: ["value", "max"],
  q: ["cite"],
  script: ["src", "type", "async", "defer", "crossorigin", "integrity", "nomodule", "referrerpolicy"],
  select: ["name", "multiple", "required", "disabled", "size", "autocomplete", "form"],
  slot: ["name"],
  source: ["src", "srcset", "sizes", "type", "media", "width", "height"],
  style: ["media"],
  td: ["colspan", "rowspan", "headers"],
  template: ["shadowrootmode"],
  textarea: ["name", "rows", "cols", "placeholder", "required", "disabled", "readonly", "minlength", "maxlength", "wrap", "autocomplete", "form", "dirname"],
  th: ["colspan", "rowspan", "headers", "scope", "abbr"],
  time: ["datetime"],
  track: ["src", "kind", "srclang", "label", "default"],
  video: ["src", "controls", "autoplay", "loop", "muted", "poster", "preload", "playsinline", "width", "height", "crossorigin"],
};

/** Los atributos que admite `etiqueta`: los suyos primero, luego los globales. */
function atributosDe(etiqueta) {
  const propios = POR_ETIQUETA[etiqueta.toLowerCase()] ?? [];
  return { propios, globales: GLOBALES.filter((nombre) => !propios.includes(nombre)) };
}

module.exports = { atributosDe };

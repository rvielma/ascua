import type { Children } from "ascua";

export default function Marco(props: { children: Children }) {
  const marco = view`
    <div class="marco">
      <header><input id="buscar" placeholder="se queda"> <a href="/">Inicio</a> <a href="/b">B</a></header>
      <main data-partial="main"></main>
    </div>`;
  props.children(marco.querySelector("main")!);
  return marco;
}

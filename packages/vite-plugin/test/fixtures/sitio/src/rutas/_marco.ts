import type { Children } from "ascua";

export default function Marco(props: { ruta: string; children: Children }) {
  const marco = view`
    <div class="marco">
      <header>Sitio · ${props.ruta}</header>
      <main></main>
      <style>.marco header { font-weight: bold; }</style>
    </div>`;
  props.children(marco.querySelector("main")!);
  return marco;
}

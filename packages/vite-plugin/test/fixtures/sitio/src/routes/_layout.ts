import type { Children } from "ascua";

export default function Marco(props: { path: string; children: Children }) {
  const marco = view`
    <div class="marco">
      <header>Sitio · ${props.path}</header>
      <main></main>
      <style>.marco header { font-weight: bold; }</style>
    </div>`;
  props.children(marco.querySelector("main")!);
  return marco;
}

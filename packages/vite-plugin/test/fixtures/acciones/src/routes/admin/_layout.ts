import type { LayoutProps } from "vite-plugin-ascua/site";

export default function Admin(props: LayoutProps) {
  const marco = view`<div><header class="quien-layout">${String(props.locals.quien ?? "")}</header><section></section></div>`;
  props.children(marco.querySelector("section")!);
  return marco;
}

import type { LoadContext } from "vite-plugin-ascua/site";

export function load(_: object, { locals }: LoadContext) {
  return { visto: String(locals.visto) };
}

export default function Envuelto({ data }: { data: { visto: string } }) {
  return view`<h1>Envuelto ${data.visto}</h1>`;
}

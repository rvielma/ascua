import type { LoadContext } from "vite-plugin-ascua/site";

export function load(_: object, { url }: LoadContext) {
  return { pedido: url.searchParams.get("pedido") ?? "" };
}

export default function Gracias({ data }: { data: { pedido: string } }) {
  return view`<h1>Gracias por ${data.pedido}</h1>`;
}

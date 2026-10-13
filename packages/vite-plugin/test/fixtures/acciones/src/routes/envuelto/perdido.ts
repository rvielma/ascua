import { notFound } from "vite-plugin-ascua/site";

export function load(): never {
  throw notFound();
}

export default function Perdido() {
  return view`<h1>No se ve</h1>`;
}

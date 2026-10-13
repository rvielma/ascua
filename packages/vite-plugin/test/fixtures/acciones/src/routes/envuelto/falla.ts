export function load(): never {
  throw new Error("la carga se rompió");
}

export default function Falla() {
  return view`<h1>No se ve</h1>`;
}

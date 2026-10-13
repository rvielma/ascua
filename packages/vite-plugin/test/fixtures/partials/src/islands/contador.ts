import { defineIsland, p, signal } from "ascua";

function Contador(props: { inicial: number }) {
  const cuenta = signal(props.inicial);
  return view`<button class="contador" onclick=${() => cuenta.update((c) => c + 1)}>${() => cuenta()}</button>`;
}

export const IslaContador = defineIsland("contador", { inicial: p.number }, Contador);

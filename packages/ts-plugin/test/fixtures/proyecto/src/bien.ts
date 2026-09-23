import { signal } from "@ascua/runtime";

import { Metrica, Tarjeta } from "@/componentes.js";

export function Bien() {
  const cuenta = signal(0);
  let campo: HTMLInputElement | undefined;

  return view`
    <main>
      <Tarjeta titulo="Resumen">
        <Metrica etiqueta="Clicks" valor=${() => cuenta()}/>
      </Tarjeta>
      <input ref=${(nodo: HTMLInputElement) => (campo = nodo)}
             oninput=${(e: Event) => cuenta.set((e.target as HTMLInputElement).value.length)}>
      <button onclick=${(e: MouseEvent) => cuenta.update((c) => c + e.detail)}>+</button>
      <p>${() => campo?.value ?? ""}</p>
    </main>`;
}

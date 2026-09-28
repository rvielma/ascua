import { defineIsland, p, signal } from "ascua";

function Saludo(props: { nombre: string }) {
  const visto = signal(false);
  return view`
    <p class="saludo" onclick=${() => visto.set(true)}>Hola, ${props.nombre}${() => (visto() ? " ✓" : "")}
      <style>.saludo { color: teal; }</style>
    </p>`;
}

export const IslaSaludo = defineIsland("saludo", { nombre: p.string }, Saludo);

import { signal, view } from "ascua";

const x = signal<number | null>(null);

// <Show> no puede ser la raíz: no tiene dónde anclarse.
export const Menu = () =>
  view`<Show when=${() => x() !== null}><span></span><Else><span></span></Else></Show>`;

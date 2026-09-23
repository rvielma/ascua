import { signal } from "@ascua/runtime";

import { Metrica, Tarjeta } from "./componentes.js";

export function Mal() {
  const cuenta = signal(0);

  return view`
    <main>
      <Tarjeta titulo=${42}/>
      <Metrica etiqueta="sin valor"/>
      <Metrica
        etiqueta="valor de otro tipo"
        valor=${() => "cero"}/>
      <button onclick=${(e: KeyboardEvent) => cuenta.set(e.key.length)}>+</button>
    </main>`;
}

export const fuera: number = "las plantillas no son lo único que se comprueba";

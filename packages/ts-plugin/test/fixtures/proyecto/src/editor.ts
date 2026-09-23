import { Metrica, Tarjeta } from "./componentes.js";

export function Editor() {
  return view`
    <main>
      <Tarjeta titulo="uno">
        <Metrica etiqueta="dos" />
      </Tarjeta>
    </main>`;
}

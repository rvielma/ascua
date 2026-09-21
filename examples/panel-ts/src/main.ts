/**
 * Un panel con acceso, en la vía TypeScript de Ascua.
 *
 * La aplicación entera son dos regiones: mientras no hay sesión se muestra el
 * formulario, y cuando la hay, el panel. `<Show>` construye una y libera la
 * otra —nodos, efectos y listeners— así que al salir no queda nada colgando
 * del usuario anterior.
 */

import { mount, signal } from "@ascua/runtime";

import { PEDIDOS } from "./datos.js";
import { Login } from "./login.js";
import { Panel } from "./panel.js";
import type { Sesion } from "./sesion.js";

function Aplicacion() {
  const sesion = signal<Sesion | null>(null);

  return view`
    <div class="raiz">
      <Show when=${() => sesion() !== null}>
        <Panel
          sesion=${() => sesion()!}
          pedidos=${PEDIDOS}
          onsalir=${() => sesion.set(null)}/>
        <Else>
          <Login onentrar=${(nueva: Sesion) => sesion.set(nueva)}/>
        </Else>
      </Show>
    </div>`;
}

mount(document.getElementById("raiz")!, Aplicacion);

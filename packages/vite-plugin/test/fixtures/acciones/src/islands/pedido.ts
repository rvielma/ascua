import { defineIsland } from "ascua";
import { enhance, formResult } from "vite-plugin-ascua/form";
import type { FormResult } from "vite-plugin-ascua/site";

import type { Pedido } from "../routes/isla.js";

type Resultado = FormResult<typeof Pedido> & { guardado?: string };

/** El formulario de pedido: sin JavaScript se envía como siempre; con la isla, sin recargar. */
export function FormularioPedido(props: { form?: Resultado }) {
  const pedido = enhance<Resultado>({ initial: props.form });
  const errores = () => {
    const r = pedido.result();
    return r?.ok === false ? r.errors : {};
  };
  return view`
    <form method="post" onsubmit=${pedido.submit}>
      <input name="nombre">
      <p class="error-nombre">${() => errores().nombre ?? ""}</p>
      <input name="cantidad">
      <p class="error-cantidad">${() => errores().cantidad ?? ""}</p>
      <button name="como" value="isla" disabled=${() => pedido.pending()}>Pedir</button>
      <button formaction="?/redirige">Pedir e ir</button>
      <p class="guardado">${() => pedido.result()?.guardado ?? ""}</p>
      <p class="fallo">${() => pedido.error() ?? ""}</p>
    </form>`;
}

export const IslaPedido = defineIsland("pedido", { form: formResult<Resultado>() }, FormularioPedido);

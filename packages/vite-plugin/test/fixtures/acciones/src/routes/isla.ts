import { fail, field, fields, redirect, validate, type ActionContext, type FormResult } from "vite-plugin-ascua/site";

import { IslaPedido } from "../islands/pedido.js";

export const Pedido = fields({
  nombre: field.text({ max: 20 }),
  cantidad: field.number({ min: 1, integer: true }),
});

export const actions = {
  async default({ formData }: ActionContext) {
    const resultado = await validate(Pedido, formData);
    if (!resultado.ok) return fail(400, resultado);
    // `como` dice qué botón lo envió: lo manda `enhance` junto con los campos.
    return { ok: true, guardado: `${resultado.data.cantidad} ${resultado.data.nombre} (${String(formData.get("como") ?? "")})` };
  },
  async redirige() {
    throw redirect("/gracias?pedido=isla");
  },
};

export default function Isla({ form }: { form?: FormResult<typeof Pedido> }) {
  return view`<main><IslaPedido form=${form}/></main>`;
}

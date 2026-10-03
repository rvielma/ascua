import { fail, field, fields, redirect, validate, type ActionContext, type FormResult } from "vite-plugin-ascua/site";

const Pedido = fields({
  nombre: field.text({ max: 20 }),
  cantidad: field.number({ min: 1, integer: true }),
  urgente: field.checkbox(),
});

export const actions = {
  async default({ formData }: ActionContext) {
    const resultado = await validate(Pedido, formData);
    if (!resultado.ok) return fail(400, resultado);
    const { nombre, cantidad, urgente } = resultado.data;
    throw redirect(`/gracias?pedido=${encodeURIComponent(`${cantidad} ${nombre}${urgente ? " urgente" : ""}`)}`);
  },
  async suscribir({ formData }: ActionContext) {
    return { suscrito: String(formData.get("correo")) };
  },
};

type Props = { form?: FormResult<typeof Pedido> & { suscrito?: string } };

export default function Inicio({ form }: Props) {
  const errores = form?.ok === false ? form.errors : {};
  const valores = form?.ok === false ? form.values : {};
  return view`
    <main>
    <form method="post">
      <input name="nombre" value=${String(valores.nombre ?? "")}>
      <p class="error-nombre">${errores.nombre ?? ""}</p>
      <input name="cantidad" value=${String(valores.cantidad ?? "")}>
      <p class="error-cantidad">${errores.cantidad ?? ""}</p>
      <input type="checkbox" name="urgente">
    </form>
    <p class="suscrito">${form?.suscrito ?? ""}</p>
    </main>`;
}

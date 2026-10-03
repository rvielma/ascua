import { redirect, type ActionContext, type LoadContext } from "vite-plugin-ascua/site";

export async function load(_: object, { cookies }: LoadContext) {
  return { quien: (await cookies.getSigned("sesion")) ?? "nadie" };
}

export const actions = {
  async default({ formData, cookies }: ActionContext) {
    await cookies.setSigned("sesion", String(formData.get("nombre")));
    throw redirect("/sesion");
  },
  async salir({ cookies }: ActionContext) {
    cookies.delete("sesion");
    return redirect("/sesion");
  },
};

export default function Sesion({ data }: { data: { quien: string } }) {
  return view`<p class="quien">${data.quien}</p>`;
}

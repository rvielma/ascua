import type { ActionContext, LoadContext } from "vite-plugin-ascua/site";

export async function load(_: object, { locals }: LoadContext) {
  return { quien: String(locals.quien), visto: String(locals.visto) };
}

export const actions = {
  async default({ locals }: ActionContext) {
    return { hecho: locals.quien };
  },
};

export default function Panel({ data }: { data: { quien: string; visto: string } }) {
  return view`<main><h1>Admin de ${data.quien}</h1><p class="visto">${data.visto}</p></main>`;
}

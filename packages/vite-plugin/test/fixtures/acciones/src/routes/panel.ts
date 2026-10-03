import { redirect, type LoadContext } from "vite-plugin-ascua/site";

/** Sin sesión, a entrar: un redirect lanzado desde load(). */
export async function load(_: object, { cookies }: LoadContext) {
  const quien = await cookies.getSigned("sesion");
  if (!quien) throw redirect("/sesion", 302);
  return { quien };
}

export default function Panel({ data }: { data: { quien: string } }) {
  return view`<h1>Panel de ${data.quien}</h1>`;
}

import { redirect, type MiddlewareContext } from "vite-plugin-ascua/site";

/** Sin sesión, a entrar; con ella, quién es queda en `locals`. */
export default async function ({ cookies, locals }: MiddlewareContext) {
  const quien = await cookies.getSigned("sesion");
  if (!quien) throw redirect("/sesion");
  locals.quien = quien;
}

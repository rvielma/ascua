import type { MiddlewareContext } from "vite-plugin-ascua/site";

/** Envuelve las rutas de su carpeta: ve la respuesta y puede cambiarla. */
export default async function ({ url, cookies, next }: MiddlewareContext) {
  if (url.searchParams.has("corto")) {
    return new Response("corto", { status: 418, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  try {
    const response = await next();
    response.headers.set("x-envuelto", "si");
    response.headers.append("set-cookie", "visita=1; Path=/");
    cookies.set("despues", "1");
    return response;
  } catch {
    return new Response("la ruta falló", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8", "x-envuelto": "error" },
    });
  }
}

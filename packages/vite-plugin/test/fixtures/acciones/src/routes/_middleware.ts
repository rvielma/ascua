import { redirect, type Middleware } from "vite-plugin-ascua/site";

/** Corre en todas las rutas, también en la 404. */
const middleware: Middleware = ({ url, locals, setHeaders }) => {
  setHeaders({ "x-site": "acciones" });
  locals.visto = url.pathname;
  if (url.pathname === "/viejo") throw redirect("/gracias?pedido=viejo", 301);
};

export default middleware;

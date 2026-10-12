import type { Middleware } from "vite-plugin-ascua/site";

/**
 * Runs before every route in this folder and the ones inside: before actions
 * and load(). It can redirect, leave data in `locals` or add headers.
 */
const middleware: Middleware = ({ url, locals, setHeaders }) => {
  locals.path = url.pathname;
  setHeaders({ "x-frame-options": "DENY" });
};

export default middleware;

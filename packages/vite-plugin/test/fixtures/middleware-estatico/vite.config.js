import ascua from "../../../index.js";

import { alias } from "../acciones/vite.config.js";

/** Un middleware necesita servidor: construirlo como estático es un error. */
export default {
  plugins: [ascua({ site: true })],
  resolve: { alias },
  build: { target: "es2022" },
};

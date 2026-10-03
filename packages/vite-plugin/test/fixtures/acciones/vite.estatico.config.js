import ascua from "../../../index.js";

import { alias } from "./vite.config.js";

/** Las acciones necesitan servidor: construirlo como estático es un error. */
export default {
  plugins: [ascua({ site: true })],
  resolve: { alias },
  build: { target: "es2022", outDir: "dist-estatico" },
};

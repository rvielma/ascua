import solid from "vite-plugin-solid";

export default {
  base: "./",
  plugins: [solid()],
  build: { target: "es2022" },
};

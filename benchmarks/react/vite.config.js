export default {
  base: "./",
  build: { target: "es2022" },
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
};

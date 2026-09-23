export default {
  test: {
    include: ["test/**/*.test.ts"],
    // Cada test ejecuta tsc de verdad: con el tiempo por defecto no llegan.
    testTimeout: 60_000,
  },
};

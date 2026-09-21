/**
 * `view` no existe en tiempo de ejecución: el compilador lo sustituye por las
 * llamadas de DOM antes de que TypeScript llegue a verlo. Esta declaración
 * solo sirve para que el editor no se queje.
 */
declare function view(plantilla: TemplateStringsArray, ...huecos: unknown[]): HTMLElement;

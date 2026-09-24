/**
 * El orden de la documentación: la barra lateral, y de paso el «anterior» y
 * el «siguiente» al pie de cada página. Cada entrada es un archivo de
 * `contenido/` con el mismo nombre.
 */

export interface Entrada {
  /** Nombre del archivo sin `.md`, y la ruta bajo `/docs/`. `""` es la portada. */
  slug: string;
  /** Lo que se lee en la barra lateral: más corto que el título de la página. */
  rotulo: string;
}

export interface Grupo {
  titulo: string;
  entradas: Entrada[];
}

export const INDICE: Grupo[] = [
  {
    titulo: "Introducción",
    entradas: [
      { slug: "", rotulo: "Qué es Ascua" },
      { slug: "primeros-pasos", rotulo: "Primeros pasos" },
    ],
  },
  {
    titulo: "Guía",
    entradas: [
      { slug: "reactividad", rotulo: "Reactividad" },
      { slug: "plantillas", rotulo: "Plantillas" },
      { slug: "componentes", rotulo: "Componentes" },
      { slug: "control-de-flujo", rotulo: "Show y For" },
      { slug: "estilos", rotulo: "Estilos" },
      { slug: "router", rotulo: "Rutas" },
      { slug: "ssr", rotulo: "SSR e islas" },
      { slug: "tipos", rotulo: "Tipos" },
      { slug: "testing", rotulo: "Tests" },
      { slug: "errores", rotulo: "Errores y depuración" },
    ],
  },
  {
    titulo: "Referencia",
    entradas: [
      { slug: "api-runtime", rotulo: "ascua" },
      { slug: "api-router", rotulo: "ascua-router" },
      { slug: "api-testing", rotulo: "ascua-testing" },
      { slug: "compilador", rotulo: "Compilador y plugin" },
    ],
  },
  {
    titulo: "A fondo",
    entradas: [
      { slug: "como-funciona", rotulo: "Cómo funciona" },
      { slug: "rendimiento", rotulo: "Rendimiento" },
      { slug: "decisiones", rotulo: "Lo que queda fuera" },
    ],
  },
];

export const ORDEN: Entrada[] = INDICE.flatMap((grupo) => grupo.entradas);

export const ruta = (slug: string) => (slug ? `/docs/${slug}/` : "/docs/");

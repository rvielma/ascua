/** El atributo que marca una región: `<main data-partial="main">`. */
export declare const REGION: "data-partial";

/**
 * Navegar sin recargar, reemplazando las regiones `data-partial`. El kit lo
 * activa solo con `site: { partials: true }`; esto es para quien lo monta a mano.
 *
 * `hydrate(root, doc, exclude?)` hidrata las islas de `root` —las que lista
 * `doc`—, sin las que caen dentro de `exclude`, y devuelve cómo liberarlas.
 */
export declare function partials(options: {
  hydrate: (root: ParentNode, doc: Document, exclude?: Element[]) => () => void;
}): { navigate(url: string): Promise<void> };

/** El enlace de un click que se puede atender sin recargar, o `null`. */
export declare function interceptable(event: MouseEvent): HTMLAnchorElement | null;

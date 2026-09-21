//! Contenido que un componente recibe de quien lo usa.

use crate::backend::Backend;
use crate::dom::Dom;

/// La receta para construir los hijos dentro de un padre dado.
type Constructor<B> = Box<dyn FnOnce(&Dom<B>, &<B as Backend>::Node)>;

/// Los hijos que se le pasan a un componente en el template.
///
/// No son nodos ya construidos, sino la *receta* para construirlos: el
/// componente decide dónde y cuándo, y puede no usarlos.
///
/// La receta recibe el elemento donde debe construir, y no devuelve nodos
/// sueltos. Eso es lo que permite que los hijos sean cualquier cosa que el
/// template admita —incluidos `<Show>` y `<For>`, que necesitan un padre real
/// donde anclar sus marcadores— y no solo elementos con identidad propia.
///
/// ```ignore
/// #[component]
/// fn Panel<B: Backend>(dom: &Dom<B>, titulo: String, children: Children<B>) -> B::Node {
///     let panel = view! { dom, <section><h2>{titulo}</h2></section> };
///     children.render_into(dom, &panel);
///     panel
/// }
/// ```
pub struct Children<B: Backend> {
    build: Constructor<B>,
}

impl<B: Backend> Children<B> {
    pub fn new(build: impl FnOnce(&Dom<B>, &B::Node) + 'static) -> Self {
        Self {
            build: Box::new(build),
        }
    }

    /// Construye los hijos dentro de `parent`. Se consume: los hijos se
    /// materializan una vez.
    pub fn render_into(self, dom: &Dom<B>, parent: &B::Node) {
        (self.build)(dom, parent);
    }
}

/// Unos hijos que no construyen nada. Es lo que recibe un componente con
/// `#[prop(default)] children: Children<B>` al que no se le pasa contenido.
impl<B: Backend> Default for Children<B> {
    fn default() -> Self {
        Self::new(|_, _| {})
    }
}

impl<B: Backend> std::fmt::Debug for Children<B> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("Children(<sin construir>)")
    }
}

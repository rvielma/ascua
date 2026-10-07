//! Referencias a elementos: `ref={campo}` en un `view!`.
//!
//! Hacen falta para lo que el DOM no expresa con atributos ni propiedades:
//! dar el foco, medir un elemento, ubicar un menú bajo su botón. Sin ellas
//! habría que poner un `id` y buscarlo en el documento, que es frágil (dos
//! instancias del mismo componente) y no funciona fuera del navegador.

use ascua_reactive::Signal;

/// Una referencia a un nodo construido por un `view!`.
///
/// Es `Copy`, como un [`Signal`]: se crea antes del template, se pasa con
/// `ref={campo}` y se lee desde cualquier closure. Por dentro **es** un
/// signal, así que un efecto que la lee con [`ElementRef::get`] se entera
/// cuando el nodo aparece (dentro de un `<Show>`, por ejemplo).
///
/// ```
/// use ascua_dom::{Dom, ElementRef, MemoryBackend};
/// use ascua_reactive::create_root;
///
/// let dom = Dom::new(MemoryBackend::new());
/// let (_, root) = create_root(|| {
///     let campo = ElementRef::new();
///     assert!(campo.get_untracked().is_none());
///     let input = dom.element("input");
///     campo.set(input.clone());
///     assert_eq!(campo.get_untracked(), Some(input));
/// });
/// root.dispose();
/// ```
pub struct ElementRef<N: 'static> {
    nodo: Signal<Option<N>>,
}

impl<N: 'static> Clone for ElementRef<N> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<N: 'static> Copy for ElementRef<N> {}

impl<N: Clone + 'static> Default for ElementRef<N> {
    fn default() -> Self {
        Self::new()
    }
}

impl<N: Clone + 'static> ElementRef<N> {
    /// Una referencia vacía, en el scope actual.
    #[must_use]
    pub fn new() -> Self {
        Self {
            nodo: Signal::new(None),
        }
    }

    /// El nodo, si ya se construyó. Suscribe al observador actual.
    #[must_use]
    pub fn get(&self) -> Option<N> {
        self.nodo.get()
    }

    /// El nodo, sin suscribir: lo que se usa en un manejador de eventos.
    #[must_use]
    pub fn get_untracked(&self) -> Option<N> {
        self.nodo.get_untracked()
    }

    /// Apunta la referencia a un nodo. Lo hace `view!` con `ref={…}`.
    pub fn set(&self, nodo: N) {
        self.nodo.set(Some(nodo));
    }
}

#[cfg(feature = "web")]
impl ElementRef<web_sys::Node> {
    /// El nodo como un tipo concreto del DOM (`HtmlInputElement`,
    /// `HtmlElement`…), si ya se construyó y es de ese tipo.
    #[must_use]
    pub fn cast<T: wasm_bindgen::JsCast>(&self) -> Option<T> {
        wasm_bindgen::JsCast::dyn_into(self.get_untracked()?).ok()
    }
}

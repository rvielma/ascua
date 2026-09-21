//! # ascua-router
//!
//! Router de Ascua. La idea entera cabe en una frase: **la ruta actual es un
//! signal**.
//!
//! Eso hace que no haga falta nada más. No hay componente `<Router>` que
//! envuelva la aplicación, ni contexto que propagar, ni re-render de un árbol
//! al navegar. Leer la ruta dentro de un efecto suscribe ese efecto a los
//! cambios de ruta, exactamente igual que con cualquier otro estado:
//!
//! ```
//! use ascua_router::{MemoryHistory, Router};
//! use ascua_reactive::create_root;
//!
//! let (router, root) = create_root(|| Router::new(MemoryHistory::new("/tareas")));
//!
//! assert!(router.matches("/tareas"));
//! router.navigate("/tareas/42");
//!
//! let params = router.params("/tareas/:id").expect("debería casar");
//! assert_eq!(params.get("id"), Some("42"));
//! root.dispose();
//! ```
//!
//! En un template, la ruta se usa como cualquier otra condición:
//!
//! ```ignore
//! view! { dom,
//!     <main>
//!         <Show when={move || router.matches("/")}>
//!             <Portada/>
//!         </Show>
//!         <Show when={move || router.matches("/tareas/:id")}>
//!             <Detalle/>
//!         </Show>
//!     </main>
//! }
//! ```

mod history;
mod pattern;
#[cfg(feature = "web")]
mod web;

use std::rc::Rc;

use ascua_dom::{Backend, Dom};
use ascua_reactive::Signal;

pub use history::{History, MemoryHistory, Oyente};
pub use pattern::{match_path, Params};
#[cfg(feature = "web")]
pub use web::WebHistory;

/// La ruta actual, como estado reactivo.
///
/// Es `Copy`: se mueve a dentro de los closures de un template sin clonar
/// nada, igual que un [`Signal`].
#[derive(Clone, Copy)]
pub struct Router {
    path: Signal<String>,
    /// El historial vive dentro de un signal para que `Router` siga siendo
    /// `Copy` aunque `Rc<dyn History>` no lo sea.
    history: Signal<Rc<dyn History>>,
}

impl Router {
    /// Crea el router y se engancha al historial.
    ///
    /// Debe llamarse dentro de un scope reactivo (un `create_root` o el
    /// montaje de la aplicación): los signals que crea pertenecen a él.
    pub fn new(history: impl History + 'static) -> Self {
        let history: Rc<dyn History> = Rc::new(history);
        let path = Signal::new(history.path());

        // El botón "atrás" del navegador cambia la ruta por fuera de la
        // aplicación: escribir en el signal basta para que todo reaccione.
        history.listen(Rc::new(move |nueva| path.set(nueva)));

        Self {
            path,
            history: Signal::new(history),
        }
    }

    /// Ruta actual. Leerla dentro de un efecto lo suscribe a los cambios.
    #[must_use]
    pub fn path(&self) -> String {
        self.path.get()
    }

    /// El signal de la ruta, por si hace falta pasarlo por ahí.
    #[must_use]
    pub fn path_signal(&self) -> Signal<String> {
        self.path
    }

    /// Navega a una ruta nueva y la apila en el historial.
    pub fn navigate(&self, path: &str) {
        self.history.with_untracked(|history| history.push(path));
        self.path.set(path.to_string());
    }

    /// Navega reemplazando la entrada actual: no añade paso al historial.
    pub fn replace(&self, path: &str) {
        self.history.with_untracked(|history| history.replace(path));
        self.path.set(path.to_string());
    }

    /// `true` si la ruta actual casa con el patrón. Es reactivo.
    #[must_use]
    pub fn matches(&self, pattern: &str) -> bool {
        self.params(pattern).is_some()
    }

    /// Parámetros capturados por el patrón, si casa. Es reactivo.
    #[must_use]
    pub fn params(&self, pattern: &str) -> Option<Params> {
        self.path.with(|path| match_path(pattern, path))
    }

    /// Convierte un elemento en un enlace de navegación interna.
    ///
    /// Pone el `href` (para que el enlace siga siendo un enlace de verdad:
    /// copiable, abrible en otra pestaña, visible para un buscador) y captura
    /// el click para navegar sin recargar la página.
    pub fn link<B: Backend>(&self, dom: &Dom<B>, node: &B::Node, to: &str) {
        dom.set_attr(node, "href", to);

        let router = *self;
        let destino = to.to_string();
        let backend = dom.clone();
        dom.on(node, "click", move |evento| {
            backend.backend().prevent_default(&evento);
            router.navigate(&destino);
        });
    }
}

impl std::fmt::Debug for Router {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Router({})", self.path.get_untracked())
    }
}

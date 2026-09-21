//! Backend de navegador sobre `web-sys`.
//!
//! Es la implementación más fina posible de [`Backend`]: cada método es una
//! llamada a la API del DOM. Toda la inteligencia está en el grafo reactivo, no
//! aquí, que es justo lo que se busca — este archivo es sustituible.
//!
//! Detrás de la feature `web` porque solo tiene sentido en `wasm32`.

use std::rc::Rc;

use wasm_bindgen::closure::Closure;
use wasm_bindgen::JsCast;
use web_sys::{Document, Event, Node};

use crate::backend::{Backend, NodeKind};

/// Backend que opera sobre el DOM real del navegador.
pub struct WebBackend {
    document: Document,
}

impl WebBackend {
    /// Toma el `document` de la ventana actual.
    ///
    /// # Errors
    /// Si no hay `window` o `document`, es decir, si no se está ejecutando en
    /// un navegador.
    pub fn from_window() -> Result<Self, &'static str> {
        let window =
            web_sys::window().ok_or("no hay objeto window: ¿esto corre en un navegador?")?;
        let document = window.document().ok_or("la ventana no tiene document")?;
        Ok(Self { document })
    }

    #[must_use]
    pub fn new(document: Document) -> Self {
        Self { document }
    }

    #[must_use]
    pub fn document(&self) -> &Document {
        &self.document
    }

    /// Busca un elemento por selector, para montar la aplicación en él.
    #[must_use]
    pub fn query_selector(&self, selector: &str) -> Option<Node> {
        self.document
            .query_selector(selector)
            .ok()
            .flatten()
            .map(Into::into)
    }
}

impl Backend for WebBackend {
    type Node = Node;
    type Event = Event;
    /// El `Closure` es el dueño del callback de Rust: mientras viva, el
    /// listener funciona. Guardarlo como token es lo que permite quitar el
    /// listener y liberar la memoria del callback a la vez, sin `forget()`.
    type ListenerToken = Closure<dyn FnMut(Event)>;

    fn create_element(&self, tag: &str) -> Node {
        match self.document.create_element(tag) {
            Ok(element) => element.into(),
            // Un tag inválido es un bug del template, no un caso de ejecución.
            // Se degrada a un nodo de texto vacío en vez de tumbar la página.
            Err(_) => self.create_text(""),
        }
    }

    fn create_text(&self, data: &str) -> Node {
        self.document.create_text_node(data).into()
    }

    fn create_marker(&self) -> Node {
        self.document.create_comment("").into()
    }

    fn set_text(&self, node: &Node, data: &str) {
        node.set_text_content(Some(data));
    }

    fn set_attribute(&self, node: &Node, name: &str, value: &str) {
        if let Some(element) = node.dyn_ref::<web_sys::Element>() {
            let _ = element.set_attribute(name, value);
        }
    }

    fn remove_attribute(&self, node: &Node, name: &str) {
        if let Some(element) = node.dyn_ref::<web_sys::Element>() {
            let _ = element.remove_attribute(name);
        }
    }

    fn insert(&self, parent: &Node, child: &Node, before: Option<&Node>) {
        let _ = parent.insert_before(child, before);
    }

    fn remove(&self, parent: &Node, child: &Node) {
        let _ = parent.remove_child(child);
    }

    fn prevent_default(&self, event: &Event) {
        event.prevent_default();
    }

    fn node_kind(&self, node: &Node) -> NodeKind {
        match node.node_type() {
            Node::ELEMENT_NODE => NodeKind::Element,
            Node::TEXT_NODE => NodeKind::Text,
            Node::COMMENT_NODE => NodeKind::Marker,
            _ => NodeKind::Other,
        }
    }

    fn text_content(&self, node: &Node) -> Option<String> {
        node.text_content()
    }

    fn tag_name(&self, node: &Node) -> Option<String> {
        node.dyn_ref::<web_sys::Element>()
            .map(|element| element.tag_name().to_ascii_lowercase())
    }

    fn attribute(&self, node: &Node, name: &str) -> Option<String> {
        node.dyn_ref::<web_sys::Element>()?.get_attribute(name)
    }

    fn children(&self, node: &Node) -> Vec<Node> {
        let hijos = node.child_nodes();
        (0..hijos.length()).filter_map(|i| hijos.item(i)).collect()
    }

    fn query_all(&self, selector: &str) -> Vec<Node> {
        let Ok(encontrados) = self.document.query_selector_all(selector) else {
            return Vec::new();
        };
        (0..encontrados.length())
            .filter_map(|i| encontrados.item(i))
            .collect()
    }

    fn add_listener(
        &self,
        node: &Node,
        event: &str,
        handler: Rc<dyn Fn(Event)>,
    ) -> Closure<dyn FnMut(Event)> {
        let closure =
            Closure::wrap(Box::new(move |event: Event| handler(event)) as Box<dyn FnMut(Event)>);
        let _ = node.add_event_listener_with_callback(event, closure.as_ref().unchecked_ref());
        closure
    }

    fn remove_listener(&self, node: &Node, event: &str, token: Closure<dyn FnMut(Event)>) {
        let _ = node.remove_event_listener_with_callback(event, token.as_ref().unchecked_ref());
        // Al soltar el `Closure` se libera el callback de Rust. Hacerlo después
        // de quitar el listener es obligatorio: al revés, el navegador podría
        // invocar memoria ya liberada.
        drop(token);
    }
}

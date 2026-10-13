//! Backend de navegador sobre `web-sys`.
//!
//! Es la implementación más fina posible de [`Backend`]: cada método es una
//! llamada a la API del DOM. Toda la inteligencia está en el grafo reactivo, no
//! aquí, que es justo lo que se busca — este archivo es sustituible.
//!
//! Detrás de la feature `web` porque solo tiene sentido en `wasm32`.

use std::rc::Rc;

use wasm_bindgen::closure::Closure;
use wasm_bindgen::{JsCast, JsValue};
use web_sys::{Document, Event, EventTarget, Node};

use crate::backend::{Backend, GlobalTarget, NodeKind, PropValue};

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
    /// La ventana o el documento, como destino de eventos.
    fn global(&self, target: GlobalTarget) -> Option<EventTarget> {
        match target {
            GlobalTarget::Window => self.document.default_view().map(Into::into),
            GlobalTarget::Document => Some(self.document.clone().into()),
        }
    }

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
    /// El número que devuelve el navegador, si es un intervalo, y el
    /// `Closure` que hay que mantener vivo mientras pueda dispararse.
    type TimerToken = (i32, bool, Closure<dyn FnMut()>);

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

    fn warn(&self, message: &str) {
        web_sys::console::error_1(&JsValue::from_str(message));
    }

    fn set_property(&self, node: &Node, name: &str, value: &PropValue) {
        let valor = match value {
            PropValue::Text(texto) => JsValue::from_str(texto),
            PropValue::Bool(si) => JsValue::from_bool(*si),
        };
        let _ = web_sys::js_sys::Reflect::set(node, &JsValue::from_str(name), &valor);
    }

    fn property(&self, node: &Node, name: &str, como_logico: bool) -> Option<PropValue> {
        let valor = web_sys::js_sys::Reflect::get(node, &JsValue::from_str(name)).ok()?;
        if como_logico {
            valor.as_bool().map(PropValue::Bool)
        } else {
            valor.as_string().map(PropValue::Text)
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

    fn set_class(&self, node: &Node, name: &str, on: bool) {
        if let Some(element) = node.dyn_ref::<web_sys::Element>() {
            let _ = element.class_list().toggle_with_force(name, on);
        }
    }

    fn set_style(&self, node: &Node, name: &str, value: Option<&str>) {
        // `style` es de los elementos HTML; un `<svg>` cae al atributo.
        let Some(element) = node.dyn_ref::<web_sys::HtmlElement>() else {
            crate::backend::style_por_atributo(self, node, name, value);
            return;
        };
        let estilo = element.style();
        let _ = match value {
            Some(valor) => estilo.set_property(name, valor),
            None => estilo.remove_property(name).map(drop),
        };
    }

    fn set_timer(
        &self,
        ms: u32,
        repeat: bool,
        callback: Rc<dyn Fn()>,
    ) -> (i32, bool, Closure<dyn FnMut()>) {
        let closure = Closure::wrap(Box::new(move || callback()) as Box<dyn FnMut()>);
        let ms = i32::try_from(ms).unwrap_or(i32::MAX);
        let funcion = closure.as_ref().unchecked_ref();
        let id = self.document.default_view().and_then(|ventana| {
            if repeat {
                ventana
                    .set_interval_with_callback_and_timeout_and_arguments_0(funcion, ms)
                    .ok()
            } else {
                ventana
                    .set_timeout_with_callback_and_timeout_and_arguments_0(funcion, ms)
                    .ok()
            }
        });
        (id.unwrap_or(0), repeat, closure)
    }

    fn clear_timer(&self, (id, repeat, closure): (i32, bool, Closure<dyn FnMut()>)) {
        if let Some(ventana) = self.document.default_view() {
            if repeat {
                ventana.clear_interval_with_handle(id);
            } else {
                ventana.clear_timeout_with_handle(id);
            }
        }
        // Soltarlo dentro de su propia ejecución es seguro: el glue de
        // wasm-bindgen cuenta las invocaciones en curso y libera al terminar.
        drop(closure);
    }

    fn add_global_listener(
        &self,
        target: GlobalTarget,
        event: &str,
        handler: Rc<dyn Fn(Event)>,
    ) -> Closure<dyn FnMut(Event)> {
        let closure =
            Closure::wrap(Box::new(move |event: Event| handler(event)) as Box<dyn FnMut(Event)>);
        if let Some(destino) = self.global(target) {
            let _ =
                destino.add_event_listener_with_callback(event, closure.as_ref().unchecked_ref());
        }
        closure
    }

    fn remove_global_listener(
        &self,
        target: GlobalTarget,
        event: &str,
        token: Closure<dyn FnMut(Event)>,
    ) {
        if let Some(destino) = self.global(target) {
            let _ =
                destino.remove_event_listener_with_callback(event, token.as_ref().unchecked_ref());
        }
        // Igual que en `remove_listener`: soltar el callback después de
        // quitar el listener, nunca antes.
        drop(token);
    }
}

//! Backend de árbol en memoria.
//!
//! Sirve para dos cosas a la vez:
//!
//! 1. **Tests sin navegador**: la suite del runtime DOM corre en Rust nativo.
//! 2. **Base del SSR de la Fase 2**: [`MemoryBackend::html`] serializa el árbol
//!    a HTML, que es exactamente lo que un render en servidor necesita
//!    producir.

use std::cell::RefCell;
use std::rc::Rc;

use crate::backend::{Backend, NodeKind};

/// Referencia a un nodo del árbol en memoria.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct NodeRef(usize);

/// Evento simulado. En el backend web esto es un `web_sys::Event`.
#[derive(Clone, Debug)]
pub struct MemoryEvent {
    pub kind: String,
    /// Se pone a `true` si un manejador llama a `prevent_default`. Los tests lo
    /// usan para comprobar que, por ejemplo, el router cancela la navegación
    /// del navegador.
    pub cancelado: std::rc::Rc<std::cell::Cell<bool>>,
}

struct Listener {
    id: usize,
    event: String,
    handler: Rc<dyn Fn(MemoryEvent)>,
}

enum Kind {
    Element(String),
    Text(String),
    /// Comentario. Su contenido es el número de hidratación, si el servidor
    /// lo está emitiendo.
    Marker(String),
}

struct MemNode {
    kind: Kind,
    parent: Option<NodeRef>,
    children: Vec<NodeRef>,
    /// `Vec` y no `HashMap` para que el HTML salga en orden estable.
    attributes: Vec<(String, String)>,
    listeners: Vec<Listener>,
}

/// Elementos HTML que no llevan etiqueta de cierre.
const VOID_ELEMENTS: &[&str] = &[
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track",
    "wbr",
];

/// Atributo con el número de orden de creación de cada elemento.
///
/// Es lo que permite hidratar sin adivinar: el cliente construye los elementos
/// en el mismo orden que el servidor, así que el número N del cliente y el
/// número N del servidor son el mismo elemento.
pub const HYDRATION_ATTR: &str = "data-ascua-h";

/// Árbol de nodos en memoria que implementa [`Backend`].
#[derive(Default)]
pub struct MemoryBackend {
    nodes: RefCell<Vec<Option<MemNode>>>,
    next_listener_id: std::cell::Cell<usize>,
    /// Contador de elementos dentro de la isla que se está renderizando.
    /// `None` fuera de toda isla: ahí no hay nada que hidratar.
    hydration: std::cell::Cell<Option<u32>>,
    /// Si este backend numera para hidratación.
    hydration_enabled: bool,
}

impl MemoryBackend {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Backend que numera cada elemento con [`HYDRATION_ATTR`], para que el
    /// cliente pueda adoptar el HTML en lugar de reconstruirlo.
    #[must_use]
    pub fn with_hydration_ids() -> Self {
        Self {
            hydration_enabled: true,
            ..Self::default()
        }
    }

    /// Siguiente número de hidratación, si se están emitiendo.
    fn siguiente_numero(&self) -> Option<u32> {
        let numero = self.hydration.get()?;
        self.hydration.set(Some(numero + 1));
        Some(numero)
    }

    fn insert_node(&self, node: MemNode) -> NodeRef {
        let mut nodes = self.nodes.borrow_mut();
        nodes.push(Some(node));
        NodeRef(nodes.len() - 1)
    }

    fn detach(&self, child: NodeRef) {
        let mut nodes = self.nodes.borrow_mut();
        let parent = nodes
            .get(child.0)
            .and_then(Option::as_ref)
            .and_then(|n| n.parent);
        if let Some(parent) = parent {
            if let Some(Some(parent)) = nodes.get_mut(parent.0) {
                parent.children.retain(|c| *c != child);
            }
        }
        if let Some(Some(node)) = nodes.get_mut(child.0) {
            node.parent = None;
        }
    }

    /// Serializa el subárbol como HTML. Los marcadores salen como comentarios
    /// vacíos, igual que hará el SSR para que la hidratación sepa dónde
    /// empieza cada región dinámica.
    #[must_use]
    pub fn html(&self, node: &NodeRef) -> String {
        let mut out = String::new();
        self.write_html(*node, &mut out);
        out
    }

    fn write_html(&self, node: NodeRef, out: &mut String) {
        let (header, children, tag) = {
            let nodes = self.nodes.borrow();
            let Some(Some(node)) = nodes.get(node.0) else {
                return;
            };
            match &node.kind {
                Kind::Text(data) => {
                    out.push_str(&escape_text(data));
                    return;
                }
                Kind::Marker(data) => {
                    out.push_str(&format!("<!--{}-->", escape_text(data)));
                    return;
                }
                Kind::Element(tag) => {
                    let mut header = format!("<{tag}");
                    for (name, value) in &node.attributes {
                        header.push_str(&format!(" {name}=\"{}\"", escape_attr(value)));
                    }
                    header.push('>');
                    (header, node.children.clone(), tag.clone())
                }
            }
        };

        out.push_str(&header);
        if VOID_ELEMENTS.contains(&tag.as_str()) {
            return;
        }
        for child in children {
            self.write_html(child, out);
        }
        out.push_str(&format!("</{tag}>"));
    }

    /// Dispara los manejadores de `event` registrados en `node`. Es el
    /// equivalente a un click del usuario, para los tests. Devuelve `true` si
    /// algún manejador canceló el comportamiento por defecto.
    pub fn dispatch(&self, node: &NodeRef, event: &str) -> bool {
        let handlers: Vec<Rc<dyn Fn(MemoryEvent)>> = {
            let nodes = self.nodes.borrow();
            match nodes.get(node.0).and_then(Option::as_ref) {
                Some(node) => node
                    .listeners
                    .iter()
                    .filter(|l| l.event == event)
                    .map(|l| Rc::clone(&l.handler))
                    .collect(),
                None => Vec::new(),
            }
        };
        // Fuera del préstamo: un manejador puede crear o borrar nodos.
        let evento = MemoryEvent {
            kind: event.to_string(),
            cancelado: std::rc::Rc::new(std::cell::Cell::new(false)),
        };
        for handler in handlers {
            handler(evento.clone());
        }
        evento.cancelado.get()
    }

    /// Número de nodos creados que siguen en el árbol. Los tests lo usan para
    /// verificar que desmontar no deja restos.
    #[must_use]
    pub fn live_nodes(&self) -> usize {
        self.nodes.borrow().iter().filter(|n| n.is_some()).count()
    }
}

impl Backend for MemoryBackend {
    type Node = NodeRef;
    type Event = MemoryEvent;
    type ListenerToken = usize;

    fn create_element(&self, tag: &str) -> NodeRef {
        let node = self.insert_node(MemNode {
            kind: Kind::Element(tag.to_string()),
            parent: None,
            children: Vec::new(),
            attributes: Vec::new(),
            listeners: Vec::new(),
        });
        if let Some(numero) = self.siguiente_numero() {
            self.set_attribute(&node, HYDRATION_ATTR, &numero.to_string());
        }
        node
    }

    fn create_text(&self, data: &str) -> NodeRef {
        self.insert_node(MemNode {
            kind: Kind::Text(data.to_string()),
            parent: None,
            children: Vec::new(),
            attributes: Vec::new(),
            listeners: Vec::new(),
        })
    }

    fn create_marker(&self) -> NodeRef {
        // Los comentarios no admiten atributos, así que el número va dentro.
        let data = self
            .siguiente_numero()
            .map(|numero| numero.to_string())
            .unwrap_or_default();
        self.insert_node(MemNode {
            kind: Kind::Marker(data),
            parent: None,
            children: Vec::new(),
            attributes: Vec::new(),
            listeners: Vec::new(),
        })
    }

    fn set_text(&self, node: &NodeRef, data: &str) {
        let mut nodes = self.nodes.borrow_mut();
        let Some(Some(node)) = nodes.get_mut(node.0) else {
            return;
        };
        // Escribir en un marcador cambia su contenido, no su naturaleza: sigue
        // siendo un comentario.
        node.kind = match &node.kind {
            Kind::Marker(_) => Kind::Marker(data.to_string()),
            _ => Kind::Text(data.to_string()),
        };
    }

    fn set_attribute(&self, node: &NodeRef, name: &str, value: &str) {
        let mut nodes = self.nodes.borrow_mut();
        let Some(Some(node)) = nodes.get_mut(node.0) else {
            return;
        };
        match node.attributes.iter_mut().find(|(n, _)| n == name) {
            Some((_, slot)) => *slot = value.to_string(),
            None => node.attributes.push((name.to_string(), value.to_string())),
        }
    }

    fn remove_attribute(&self, node: &NodeRef, name: &str) {
        let mut nodes = self.nodes.borrow_mut();
        if let Some(Some(node)) = nodes.get_mut(node.0) {
            node.attributes.retain(|(n, _)| n != name);
        }
    }

    fn insert(&self, parent: &NodeRef, child: &NodeRef, before: Option<&NodeRef>) {
        self.detach(*child);
        let mut nodes = self.nodes.borrow_mut();
        let position = {
            let Some(Some(parent)) = nodes.get(parent.0) else {
                return;
            };
            match before {
                Some(before) => parent
                    .children
                    .iter()
                    .position(|c| c == before)
                    .unwrap_or(parent.children.len()),
                None => parent.children.len(),
            }
        };
        if let Some(Some(parent_node)) = nodes.get_mut(parent.0) {
            parent_node.children.insert(position, *child);
        }
        if let Some(Some(child_node)) = nodes.get_mut(child.0) {
            child_node.parent = Some(*parent);
        }
    }

    fn begin_hydration_scope(&self) {
        if self.hydration_enabled {
            self.hydration.set(Some(0));
        }
    }

    fn end_hydration_scope(&self) {
        self.hydration.set(None);
    }

    fn node_kind(&self, node: &NodeRef) -> NodeKind {
        let nodes = self.nodes.borrow();
        match nodes.get(node.0).and_then(Option::as_ref).map(|n| &n.kind) {
            Some(Kind::Element(_)) => NodeKind::Element,
            Some(Kind::Text(_)) => NodeKind::Text,
            Some(Kind::Marker(_)) => NodeKind::Marker,
            None => NodeKind::Other,
        }
    }

    fn text_content(&self, node: &NodeRef) -> Option<String> {
        let nodes = self.nodes.borrow();
        match nodes.get(node.0).and_then(Option::as_ref).map(|n| &n.kind) {
            Some(Kind::Text(data) | Kind::Marker(data)) => Some(data.clone()),
            _ => None,
        }
    }

    fn tag_name(&self, node: &NodeRef) -> Option<String> {
        let nodes = self.nodes.borrow();
        match nodes.get(node.0).and_then(Option::as_ref).map(|n| &n.kind) {
            Some(Kind::Element(tag)) => Some(tag.to_ascii_lowercase()),
            _ => None,
        }
    }

    fn attribute(&self, node: &NodeRef, name: &str) -> Option<String> {
        let nodes = self.nodes.borrow();
        nodes
            .get(node.0)?
            .as_ref()?
            .attributes
            .iter()
            .find(|(n, _)| n == name)
            .map(|(_, valor)| valor.clone())
    }

    fn children(&self, node: &NodeRef) -> Vec<NodeRef> {
        self.nodes
            .borrow()
            .get(node.0)
            .and_then(Option::as_ref)
            .map(|n| n.children.clone())
            .unwrap_or_default()
    }

    /// Solo selectores de atributo: `[nombre]` o `[nombre="valor"]`.
    fn query_all(&self, selector: &str) -> Vec<NodeRef> {
        let Some(interior) = selector
            .strip_prefix('[')
            .and_then(|resto| resto.strip_suffix(']'))
        else {
            return Vec::new();
        };
        let (nombre, valor) = match interior.split_once('=') {
            Some((nombre, valor)) => (nombre, Some(valor.trim_matches(['"', '\'']))),
            None => (interior, None),
        };

        let nodes = self.nodes.borrow();
        (0..nodes.len())
            .filter(|indice| {
                nodes
                    .get(*indice)
                    .and_then(Option::as_ref)
                    .is_some_and(|node| {
                        node.attributes
                            .iter()
                            .any(|(n, v)| n == nombre && valor.is_none_or(|esperado| v == esperado))
                    })
            })
            .map(NodeRef)
            .collect()
    }

    fn remove(&self, parent: &NodeRef, child: &NodeRef) {
        let mut nodes = self.nodes.borrow_mut();
        if let Some(Some(parent)) = nodes.get_mut(parent.0) {
            parent.children.retain(|c| c != child);
        }
        // El nodo se elimina del árbol, no del almacenamiento: `NodeRef` es
        // `Copy` y podría seguir vivo en algún closure. Liberar el slot aquí
        // haría que esa copia apuntase a otro nodo distinto.
        if let Some(Some(child)) = nodes.get_mut(child.0) {
            child.parent = None;
        }
    }

    fn add_listener(&self, node: &NodeRef, event: &str, handler: Rc<dyn Fn(MemoryEvent)>) -> usize {
        let id = self.next_listener_id.get();
        self.next_listener_id.set(id + 1);
        let mut nodes = self.nodes.borrow_mut();
        if let Some(Some(node)) = nodes.get_mut(node.0) {
            node.listeners.push(Listener {
                id,
                event: event.to_string(),
                handler,
            });
        }
        id
    }

    /// No hay navegador que cancelar: el evento simulado se anota como
    /// cancelado y ya está.
    fn prevent_default(&self, event: &MemoryEvent) {
        event.cancelado.set(true);
    }

    fn remove_listener(&self, node: &NodeRef, _event: &str, token: usize) {
        let mut nodes = self.nodes.borrow_mut();
        if let Some(Some(node)) = nodes.get_mut(node.0) {
            node.listeners.retain(|l| l.id != token);
        }
    }
}

fn escape_text(value: &str) -> String {
    value.replace('&', "&amp;").replace('<', "&lt;")
}

fn escape_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
}

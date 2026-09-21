//! Hidratación: adoptar el HTML del servidor en lugar de reconstruirlo.
//!
//! # El problema
//!
//! El cliente ejecuta el mismo código de construcción que el servidor, pero los
//! nodos que necesita **ya existen** en el documento. Hay que emparejar cada
//! `dom.element("li")` del cliente con el `<li>` concreto que el servidor
//! escribió, y no crear nada.
//!
//! Emparejar por posición no basta: el runtime crea sus marcadores antes que
//! los items de una lista, mientras que en el HTML el marcador queda *después*.
//! Cualquier recorrido posicional se desalinea en la primera lista.
//!
//! # La solución
//!
//! El codegen crea los elementos en un orden **determinista** —preorden del
//! template—, así que basta con numerarlos. El servidor escribe ese número en
//! cada elemento ([`HYDRATION_ATTR`]) y el cliente, al crear el elemento
//! número N, busca el elemento número N del documento y lo adopta.
//!
//! Los nodos de texto y los marcadores no llevan atributos, así que se
//! resuelven de otra forma: cuando se insertan en un padre ya adoptado, se
//! comparan con el siguiente hijo pendiente de ese padre y se adoptan si son
//! del mismo tipo.
//!
//! # Degradación
//!
//! Si algo no encaja —el servidor renderizó otro estado, falta un nodo, el
//! HTML se editó— ese nodo se **crea** y la aplicación sigue funcionando. La
//! hidratación no es todo o nada: cada nodo se adopta o se crea por su cuenta.
//! [`HydratingBackend::estadisticas`] dice cuántos de cada.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::rc::Rc;

use crate::backend::{Backend, NodeKind};
use crate::dom::{Dom, Mount};
use crate::memory::HYDRATION_ATTR;
use crate::ssr::{IslandBuilder, ISLAND_ATTR, ISLAND_PROPS_ATTR};

/// Lo que el cliente quiere construir, mientras no se sepa si hay un nodo del
/// servidor que lo cubra.
#[derive(Clone)]
enum Pendiente {
    Element(String),
    Text(String),
    Marker,
}

/// Operaciones aplicadas sobre un nodo que todavía no se ha resuelto.
enum Operacion {
    Text(String),
    Attribute(String, String),
    RemoveAttribute(String),
}

struct Slot<B: Backend> {
    real: Option<B::Node>,
    pendiente: Pendiente,
    /// Hijos del nodo real ya emparejados.
    cursor: usize,
    /// Operaciones a aplicar en cuanto haya nodo real.
    diferidas: Vec<Operacion>,
}

/// Referencia a un nodo que puede estar aún sin resolver.
pub struct HydratedNode<B: Backend>(Rc<RefCell<Slot<B>>>);

impl<B: Backend> Clone for HydratedNode<B> {
    fn clone(&self) -> Self {
        Self(Rc::clone(&self.0))
    }
}

impl<B: Backend> PartialEq for HydratedNode<B> {
    fn eq(&self, otro: &Self) -> bool {
        Rc::ptr_eq(&self.0, &otro.0)
    }
}

/// Cuántos nodos se adoptaron del servidor y cuántos hubo que crear.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Estadisticas {
    pub adoptados: usize,
    pub creados: usize,
}

/// Backend que envuelve a otro y adopta el HTML existente mientras construye.
pub struct HydratingBackend<B: Backend> {
    inner: Rc<B>,
    /// Elementos del servidor indexados por su número de orden. Se escanean
    /// una sola vez: buscar en el documento por cada elemento sería cuadrático.
    candidatos: RefCell<HashMap<u32, B::Node>>,
    contador: Cell<u32>,
    adoptados: Cell<usize>,
    creados: Cell<usize>,
}

impl<B: Backend> HydratingBackend<B> {
    /// Escanea el subárbol de una isla en busca de nodos numerados por el
    /// servidor.
    ///
    /// Se limita a ese subárbol porque la numeración es relativa a la isla:
    /// dos islas distintas tienen elementos con el mismo número.
    pub fn new(inner: Rc<B>, raiz: &B::Node) -> Self {
        let mut candidatos = HashMap::new();
        escanear(inner.as_ref(), raiz, &mut candidatos);

        Self {
            inner,
            candidatos: RefCell::new(candidatos),
            contador: Cell::new(0),
            adoptados: Cell::new(0),
            creados: Cell::new(0),
        }
    }

    /// Backend subyacente.
    pub fn inner(&self) -> &B {
        &self.inner
    }

    #[must_use]
    pub fn estadisticas(&self) -> Estadisticas {
        Estadisticas {
            adoptados: self.adoptados.get(),
            creados: self.creados.get(),
        }
    }

    fn siguiente_numero(&self) -> u32 {
        let numero = self.contador.get();
        self.contador.set(numero + 1);
        numero
    }

    fn envolver(&self, pendiente: Pendiente, real: Option<B::Node>) -> HydratedNode<B> {
        if real.is_some() {
            self.adoptados.set(self.adoptados.get() + 1);
        }
        HydratedNode(Rc::new(RefCell::new(Slot {
            real,
            pendiente,
            cursor: 0,
            diferidas: Vec::new(),
        })))
    }

    /// Devuelve el nodo real, creándolo si todavía no existe.
    fn materializar(&self, handle: &HydratedNode<B>) -> B::Node {
        if let Some(real) = handle.0.borrow().real.clone() {
            return real;
        }

        let (pendiente, diferidas) = {
            let mut slot = handle.0.borrow_mut();
            (slot.pendiente.clone(), std::mem::take(&mut slot.diferidas))
        };

        let real = match &pendiente {
            Pendiente::Element(tag) => self.inner.create_element(tag),
            Pendiente::Text(data) => self.inner.create_text(data),
            Pendiente::Marker => self.inner.create_marker(),
        };
        self.creados.set(self.creados.get() + 1);

        handle.0.borrow_mut().real = Some(real.clone());
        self.aplicar(&real, diferidas);
        real
    }

    fn aplicar(&self, real: &B::Node, operaciones: Vec<Operacion>) {
        for operacion in operaciones {
            match operacion {
                Operacion::Text(data) => self.inner.set_text(real, &data),
                Operacion::Attribute(nombre, valor) => {
                    self.inner.set_attribute(real, &nombre, &valor);
                }
                Operacion::RemoveAttribute(nombre) => {
                    self.inner.remove_attribute(real, &nombre);
                }
            }
        }
    }

    /// Adopta `real` como el nodo de `handle`, aplicando lo que se hubiera
    /// hecho sobre él mientras estaba pendiente.
    fn adoptar(&self, handle: &HydratedNode<B>, real: B::Node) {
        let diferidas = {
            let mut slot = handle.0.borrow_mut();
            slot.real = Some(real.clone());
            std::mem::take(&mut slot.diferidas)
        };
        self.adoptados.set(self.adoptados.get() + 1);
        self.aplicar(&real, diferidas);
    }

    /// Siguiente hijo del padre todavía sin emparejar.
    fn siguiente_hijo(&self, padre: &HydratedNode<B>, padre_real: &B::Node) -> Option<B::Node> {
        let cursor = padre.0.borrow().cursor;
        self.inner.children(padre_real).into_iter().nth(cursor)
    }

    fn avanzar_cursor(&self, padre: &HydratedNode<B>) {
        let mut slot = padre.0.borrow_mut();
        slot.cursor += 1;
    }

    /// `true` si el nodo que dejó el servidor sirve para lo que el cliente
    /// quiere construir.
    fn encaja(&self, candidato: &B::Node, pendiente: &Pendiente) -> bool {
        match (self.inner.node_kind(candidato), pendiente) {
            (NodeKind::Text, Pendiente::Text(_)) | (NodeKind::Marker, Pendiente::Marker) => true,
            (NodeKind::Element, Pendiente::Element(tag)) => {
                self.inner.tag_name(candidato).as_deref() == Some(tag.to_ascii_lowercase().as_str())
            }
            _ => false,
        }
    }

    /// Aplica una operación sobre el nodo real, o la guarda si aún no lo hay.
    fn operar(&self, handle: &HydratedNode<B>, operacion: Operacion) {
        let real = handle.0.borrow().real.clone();
        match real {
            Some(real) => self.aplicar(&real, vec![operacion]),
            None => handle.0.borrow_mut().diferidas.push(operacion),
        }
    }
}

impl<B: Backend> Backend for HydratingBackend<B> {
    type Node = HydratedNode<B>;
    type Event = B::Event;
    type ListenerToken = B::ListenerToken;

    fn create_element(&self, tag: &str) -> Self::Node {
        // El elemento número N del cliente es el elemento número N del
        // servidor: los dos ejecutan el mismo código de construcción.
        let numero = self.siguiente_numero();
        let candidato = self.candidatos.borrow_mut().remove(&numero);
        let real = candidato.filter(|nodo| {
            self.inner.tag_name(nodo).as_deref() == Some(tag.to_ascii_lowercase().as_str())
        });

        if let Some(real) = &real {
            // Ya cumplió su función: fuera del DOM final.
            self.inner.remove_attribute(real, HYDRATION_ATTR);
        }

        self.envolver(Pendiente::Element(tag.to_string()), real)
    }

    fn create_text(&self, data: &str) -> Self::Node {
        self.envolver(Pendiente::Text(data.to_string()), None)
    }

    fn create_marker(&self) -> Self::Node {
        // Los marcadores se numeran con el mismo contador que los elementos,
        // así que el marcador número N del cliente es el comentario número N
        // que escribió el servidor.
        let numero = self.siguiente_numero();
        let real = self
            .candidatos
            .borrow_mut()
            .remove(&numero)
            .filter(|nodo| self.inner.node_kind(nodo) == NodeKind::Marker);

        if let Some(real) = &real {
            // El número ya cumplió su función: el comentario queda vacío.
            self.inner.set_text(real, "");
        }

        self.envolver(Pendiente::Marker, real)
    }

    fn set_text(&self, node: &Self::Node, data: &str) {
        self.operar(node, Operacion::Text(data.to_string()));
    }

    fn set_attribute(&self, node: &Self::Node, name: &str, value: &str) {
        self.operar(
            node,
            Operacion::Attribute(name.to_string(), value.to_string()),
        );
    }

    fn remove_attribute(&self, node: &Self::Node, name: &str) {
        self.operar(node, Operacion::RemoveAttribute(name.to_string()));
    }

    fn insert(&self, parent: &Self::Node, child: &Self::Node, before: Option<&Self::Node>) {
        let padre_real = self.materializar(parent);
        let hijo_resuelto = child.0.borrow().real.clone();

        // Caso 1: el hijo ya está resuelto y resulta que el servidor lo dejó
        // justo donde toca. No se toca el DOM.
        if before.is_none() {
            if let Some(candidato) = self.siguiente_hijo(parent, &padre_real) {
                if hijo_resuelto.as_ref() == Some(&candidato) {
                    self.avanzar_cursor(parent);
                    return;
                }

                // Caso 2: el hijo aún no tiene nodo y el que hay en esa
                // posición sirve. Se adopta en vez de crear uno nuevo.
                if hijo_resuelto.is_none() {
                    let pendiente = child.0.borrow().pendiente.clone();
                    if self.encaja(&candidato, &pendiente) {
                        self.adoptar(child, candidato);
                        self.avanzar_cursor(parent);
                        return;
                    }
                }
            }
        }

        // Caso 3: no hay nada que aprovechar. Se construye e inserta.
        let hijo_real = self.materializar(child);
        let antes_real = before.map(|nodo| self.materializar(nodo));
        self.inner
            .insert(&padre_real, &hijo_real, antes_real.as_ref());
    }

    fn remove(&self, parent: &Self::Node, child: &Self::Node) {
        let padre_real = self.materializar(parent);
        let hijo_real = self.materializar(child);
        self.inner.remove(&padre_real, &hijo_real);
    }

    fn attribute(&self, node: &Self::Node, name: &str) -> Option<String> {
        let real = node.0.borrow().real.clone()?;
        self.inner.attribute(&real, name)
    }

    fn node_kind(&self, node: &Self::Node) -> NodeKind {
        match node.0.borrow().real.clone() {
            Some(real) => self.inner.node_kind(&real),
            None => match node.0.borrow().pendiente {
                Pendiente::Element(_) => NodeKind::Element,
                Pendiente::Text(_) => NodeKind::Text,
                Pendiente::Marker => NodeKind::Marker,
            },
        }
    }

    fn text_content(&self, node: &Self::Node) -> Option<String> {
        match node.0.borrow().real.clone() {
            Some(real) => self.inner.text_content(&real),
            None => match &node.0.borrow().pendiente {
                Pendiente::Text(data) => Some(data.clone()),
                _ => None,
            },
        }
    }

    fn tag_name(&self, node: &Self::Node) -> Option<String> {
        match node.0.borrow().real.clone() {
            Some(real) => self.inner.tag_name(&real),
            None => match &node.0.borrow().pendiente {
                Pendiente::Element(tag) => Some(tag.to_ascii_lowercase()),
                _ => None,
            },
        }
    }

    fn children(&self, node: &Self::Node) -> Vec<Self::Node> {
        let Some(real) = node.0.borrow().real.clone() else {
            return Vec::new();
        };
        self.inner
            .children(&real)
            .into_iter()
            .map(|hijo| self.envolver_resuelto(hijo))
            .collect()
    }

    fn query_all(&self, selector: &str) -> Vec<Self::Node> {
        self.inner
            .query_all(selector)
            .into_iter()
            .map(|nodo| self.envolver_resuelto(nodo))
            .collect()
    }

    fn add_listener(
        &self,
        node: &Self::Node,
        event: &str,
        handler: Rc<dyn Fn(Self::Event)>,
    ) -> Self::ListenerToken {
        let real = self.materializar(node);
        self.inner.add_listener(&real, event, handler)
    }

    fn remove_listener(&self, node: &Self::Node, event: &str, token: Self::ListenerToken) {
        let real = self.materializar(node);
        self.inner.remove_listener(&real, event, token);
    }

    fn prevent_default(&self, event: &Self::Event) {
        self.inner.prevent_default(event);
    }
}

impl<B: Backend> HydratingBackend<B> {
    /// Envuelve un nodo que ya existe, sin contarlo como adopción: no viene de
    /// emparejar nada, es un nodo que el propio backend acaba de devolver.
    fn envolver_resuelto(&self, real: B::Node) -> HydratedNode<B> {
        HydratedNode(Rc::new(RefCell::new(Slot {
            real: Some(real),
            pendiente: Pendiente::Marker,
            cursor: 0,
            diferidas: Vec::new(),
        })))
    }
}

/// Activa las islas de una página **adoptando** el HTML que llegó del
/// servidor, en vez de sustituirlo.
///
/// Es el equivalente de [`crate::mount_islands`] con hidratación: para cada
/// isla registrada, construye su árbol reactivo emparejándolo con los nodos
/// que ya están en el documento.
///
/// Devuelve los montajes y las estadísticas de adopción, útiles para verificar
/// en desarrollo que la hidratación está funcionando de verdad.
pub fn hydrate_islands<B: Backend>(
    backend: Rc<B>,
    islas: &[(&str, IslandBuilder<HydratingBackend<B>>)],
) -> (Vec<Mount<HydratingBackend<B>>>, Estadisticas) {
    let mut montajes = Vec::new();
    let mut total = Estadisticas {
        adoptados: 0,
        creados: 0,
    };

    for contenedor in backend.query_all(&format!("[{ISLAND_ATTR}]")) {
        let Some(nombre) = backend.attribute(&contenedor, ISLAND_ATTR) else {
            continue;
        };
        let Some((_, constructor)) = islas.iter().find(|(n, _)| *n == nombre) else {
            continue;
        };
        let props = backend
            .attribute(&contenedor, ISLAND_PROPS_ATTR)
            .unwrap_or_default();

        // Un backend de hidratación por isla: cada una numera desde cero.
        let hidratante = Rc::new(HydratingBackend::new(Rc::clone(&backend), &contenedor));
        let dom = Dom::from_rc(Rc::clone(&hidratante));
        let contenedor = hidratante.envolver_resuelto(contenedor);

        // Sin vaciar el contenedor: eso es justo lo que se quiere evitar.
        montajes.push(dom.mount(&contenedor, |dom| constructor(dom, &props)));

        let parcial = hidratante.estadisticas();
        total.adoptados += parcial.adoptados;
        total.creados += parcial.creados;
    }

    (montajes, total)
}

/// Recorre el subárbol anotando los nodos que el servidor numeró: los
/// elementos por su atributo, y los marcadores por su contenido.
fn escanear<B: Backend>(inner: &B, nodo: &B::Node, candidatos: &mut HashMap<u32, B::Node>) {
    for hijo in inner.children(nodo) {
        let numero = match inner.node_kind(&hijo) {
            NodeKind::Element => inner.attribute(&hijo, HYDRATION_ATTR),
            NodeKind::Marker => inner.text_content(&hijo),
            _ => None,
        };

        if let Some(numero) = numero.and_then(|valor| valor.trim().parse::<u32>().ok()) {
            candidatos.insert(numero, hijo.clone());
        }
        escanear(inner, &hijo, candidatos);
    }
}

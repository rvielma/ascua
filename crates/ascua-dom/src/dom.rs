//! Construcción de árbol y bindings reactivos.
//!
//! Aquí está la idea central del framework, y cabe en una función:
//! [`Dom::bind_text`] crea un efecto que captura **el nodo concreto** que debe
//! actualizar. Cuando el signal cambia, el efecto ya sabe su destino. No hay
//! árbol que recorrer ni diff que calcular porque la correspondencia entre
//! dato y nodo se estableció una sola vez, al construir.

use std::cell::RefCell;
use std::rc::Rc;

use ascua_reactive::{create_effect, create_memo, create_root, current_owner, on_cleanup, Root};

use crate::backend::Backend;

/// Handle sobre un backend, clonable a coste de un `Rc`.
///
/// Se clona dentro de cada binding reactivo, así que clonarlo tiene que ser
/// barato: es justo lo que hace un `Rc`.
pub struct Dom<B: Backend> {
    backend: Rc<B>,
}

impl<B: Backend> Clone for Dom<B> {
    fn clone(&self) -> Self {
        Self {
            backend: Rc::clone(&self.backend),
        }
    }
}

impl<B: Backend> Dom<B> {
    pub fn new(backend: B) -> Self {
        Self {
            backend: Rc::new(backend),
        }
    }

    #[must_use]
    pub fn from_rc(backend: Rc<B>) -> Self {
        Self { backend }
    }

    #[must_use]
    pub fn backend(&self) -> &B {
        &self.backend
    }

    // --- construcción estática -------------------------------------------

    pub fn element(&self, tag: &str) -> B::Node {
        self.backend.create_element(tag)
    }

    pub fn text(&self, data: &str) -> B::Node {
        self.backend.create_text(data)
    }

    pub fn marker(&self) -> B::Node {
        self.backend.create_marker()
    }

    pub fn append(&self, parent: &B::Node, child: &B::Node) {
        self.backend.insert(parent, child, None);
    }

    /// Añade varios hijos en orden. Azúcar para el codegen del compilador.
    pub fn append_all(&self, parent: &B::Node, children: &[B::Node]) {
        for child in children {
            self.backend.insert(parent, child, None);
        }
    }

    pub fn insert_before(&self, parent: &B::Node, child: &B::Node, before: Option<&B::Node>) {
        self.backend.insert(parent, child, before);
    }

    pub fn remove(&self, parent: &B::Node, child: &B::Node) {
        self.backend.remove(parent, child);
    }

    pub fn set_attr(&self, node: &B::Node, name: &str, value: &str) {
        self.backend.set_attribute(node, name, value);
    }

    // --- bindings reactivos ----------------------------------------------

    /// Crea un nodo de texto cuyo contenido sigue a `f`.
    ///
    /// El nodo devuelto ya está actualizado con el primer valor; solo queda
    /// insertarlo donde corresponda.
    pub fn dynamic_text(&self, f: impl FnMut() -> String + 'static) -> B::Node {
        let node = self.backend.create_text("");
        self.bind_text(&node, f);
        node
    }

    /// Ata el contenido de un nodo de texto existente a `f`.
    ///
    /// Esta función es el framework entero en miniatura: un efecto, el nodo
    /// capturado, una llamada al backend.
    pub fn bind_text(&self, node: &B::Node, mut f: impl FnMut() -> String + 'static) {
        let backend = Rc::clone(&self.backend);
        let node = node.clone();
        create_effect(move || {
            let value = f();
            backend.set_text(&node, &value);
        });
    }

    /// Ata un atributo a `f`. Devolver `None` quita el atributo, que es como
    /// se expresan los atributos booleanos (`disabled`, `checked`).
    pub fn bind_attr(
        &self,
        node: &B::Node,
        name: impl Into<String>,
        mut f: impl FnMut() -> Option<String> + 'static,
    ) {
        let backend = Rc::clone(&self.backend);
        let node = node.clone();
        let name = name.into();
        create_effect(move || match f() {
            Some(value) => backend.set_attribute(&node, &name, &value),
            None => backend.remove_attribute(&node, &name),
        });
    }

    /// Registra un manejador de eventos. Se quita solo cuando el scope actual
    /// se libera, así que desmontar no deja listeners colgando.
    pub fn on(
        &self,
        node: &B::Node,
        event: impl Into<String>,
        handler: impl Fn(B::Event) + 'static,
    ) {
        let event = event.into();
        let token = self.backend.add_listener(node, &event, Rc::new(handler));

        let backend = Rc::clone(&self.backend);
        let node = node.clone();
        on_cleanup(move || backend.remove_listener(&node, &event, token));
    }

    /// Contenido que puede cambiar de identidad, no solo de valor.
    ///
    /// `bind_text` cubre el caso de un nodo que cambia de contenido. Esto cubre
    /// el otro: una región cuyo contenido se **sustituye** —un `if`, un
    /// `match`, una pestaña seleccionada—, donde el nodo viejo desaparece y
    /// aparece otro distinto.
    ///
    /// Está partido en dos funciones a propósito:
    ///
    /// - `selector` es lo reactivo, y se envuelve en un memo: si devuelve el
    ///   mismo valor, **no se reconstruye nada**. Alternar un booleano que ya
    ///   era `true` no toca el DOM.
    /// - `render` construye el contenido en un scope propio y **sin trackear**:
    ///   lo que lea dentro no vuelve a disparar esta sustitución, solo sus
    ///   propios bindings.
    ///
    /// Al sustituir, el scope anterior se libera entero: sus efectos, sus
    /// memos, sus listeners y sus `on_cleanup`.
    pub fn dynamic_child<T, S, R>(&self, parent: &B::Node, selector: S, mut render: R)
    where
        T: PartialEq + Clone + 'static,
        S: FnMut() -> T + 'static,
        R: FnMut(&Dom<B>, &T) -> Option<B::Node> + 'static,
    {
        let anchor = self.marker();
        self.append(parent, &anchor);

        // Igual que en las listas: el dueño se captura fuera del efecto para
        // que el scope del contenido no muera en cada reejecución.
        let owner = current_owner();
        let dom = self.clone();
        let parent = parent.clone();
        let memo = create_memo(selector);
        let actual: RefCell<Option<(B::Node, Root)>> = RefCell::new(None);

        create_effect(move || {
            let valor = memo.get();

            let anterior = actual.borrow_mut().take();
            if let Some((nodo, root)) = anterior {
                dom.remove(&parent, &nodo);
                root.dispose();
            }

            let mut construir = || create_root(|| render(&dom, &valor));
            let (nodo, root) = match owner {
                Some(owner) => owner.with(construir),
                None => construir(),
            };

            match nodo {
                Some(nodo) => {
                    dom.insert_before(&parent, &nodo, Some(&anchor));
                    *actual.borrow_mut() = Some((nodo, root));
                }
                // El render decidió no mostrar nada: el scope vacío se libera.
                None => root.dispose(),
            }
        });
    }

    // --- montaje ----------------------------------------------------------

    /// Construye un árbol dentro de una raíz reactiva propia y lo inserta en
    /// `parent`.
    ///
    /// El [`Mount`] devuelto es lo que permite desmontarlo entero: quita los
    /// nodos del árbol y libera todos los efectos que los alimentaban.
    pub fn mount(&self, parent: &B::Node, build: impl FnOnce(&Dom<B>) -> B::Node) -> Mount<B> {
        let dom = self.clone();
        let (node, root) = create_root(move || build(&dom));
        self.append(parent, &node);
        Mount {
            dom: self.clone(),
            parent: parent.clone(),
            node,
            root: Some(root),
        }
    }
}

/// Un árbol montado. Desmontarlo libera su subárbol reactivo completo.
#[must_use = "si se descarta sin llamar a unmount(), el árbol sigue montado y reaccionando"]
pub struct Mount<B: Backend> {
    dom: Dom<B>,
    parent: B::Node,
    node: B::Node,
    root: Option<Root>,
}

impl<B: Backend> Mount<B> {
    /// Nodo raíz de lo montado.
    pub fn node(&self) -> &B::Node {
        &self.node
    }

    /// Quita el árbol del documento y libera sus efectos, memos y listeners.
    pub fn unmount(mut self) {
        self.dom.remove(&self.parent, &self.node);
        if let Some(root) = self.root.take() {
            root.dispose();
        }
    }
}

/// Conversión al valor de un atributo.
///
/// `None` significa "quita el atributo", que es como se expresan los atributos
/// booleanos del HTML: `disabled` existe o no existe, no vale `disabled=false`.
pub trait IntoAttrValue {
    fn into_attr_value(self) -> Option<String>;
}

impl IntoAttrValue for String {
    fn into_attr_value(self) -> Option<String> {
        Some(self)
    }
}

impl IntoAttrValue for &str {
    fn into_attr_value(self) -> Option<String> {
        Some(self.to_string())
    }
}

/// `true` pone el atributo vacío (`disabled=""`), `false` lo quita.
impl IntoAttrValue for bool {
    fn into_attr_value(self) -> Option<String> {
        self.then(String::new)
    }
}

impl<T: IntoAttrValue> IntoAttrValue for Option<T> {
    fn into_attr_value(self) -> Option<String> {
        self.and_then(IntoAttrValue::into_attr_value)
    }
}

macro_rules! impl_into_attr_value_display {
    ($($tipo:ty),* $(,)?) => {
        $(
            impl IntoAttrValue for $tipo {
                fn into_attr_value(self) -> Option<String> {
                    Some(self.to_string())
                }
            }
        )*
    };
}

impl_into_attr_value_display!(
    i8, i16, i32, i64, i128, isize, u8, u16, u32, u64, u128, usize, f32, f64, char
);

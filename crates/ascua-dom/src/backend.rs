//! El contrato con el árbol de nodos.
//!
//! El runtime no habla con `web-sys` directamente: habla con este trait. Eso
//! tiene dos consecuencias prácticas:
//!
//! - **Se puede testear sin navegador.** [`crate::MemoryBackend`] implementa el
//!   mismo contrato sobre un árbol en memoria, así que las garantías del
//!   runtime se verifican con `cargo test` en Rust nativo.
//! - **SSR no obligará a reescribir componentes.** Renderizar en servidor es
//!   otro backend, no otro runtime; el mismo código de componente sirve.

use std::rc::Rc;

/// Qué clase de nodo es. Lo necesita la hidratación para comprobar que lo que
/// el servidor dejó en el HTML encaja con lo que el cliente va a construir.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum NodeKind {
    Element,
    Text,
    /// Comentario: los marcadores de posición del runtime.
    Marker,
    Other,
}

/// Operaciones mínimas sobre un árbol de nodos.
///
/// Deliberadamente pequeño: son las únicas operaciones que el codegen del
/// compilador de templates puede emitir. Si algo no se puede expresar aquí, no
/// se puede compilar, y eso es una propiedad deseable.
pub trait Backend: 'static {
    /// Referencia a un nodo. Debe ser barata de clonar: cada binding reactivo
    /// guarda una copia dentro de su closure.
    ///
    /// `PartialEq` compara **identidad**: dos referencias son iguales si
    /// apuntan al mismo nodo. La hidratación lo necesita para saber si el nodo
    /// que ya está en el documento es justo el que iba a insertar, y así no
    /// tocarlo.
    type Node: Clone + PartialEq + 'static;

    /// Evento que reciben los manejadores.
    type Event: 'static;

    /// Token que identifica un listener registrado, para poder quitarlo.
    type ListenerToken: 'static;

    fn create_element(&self, tag: &str) -> Self::Node;
    fn create_text(&self, data: &str) -> Self::Node;

    /// Nodo invisible que marca una posición en el árbol. Las listas
    /// dinámicas lo usan como ancla: saben dónde insertar aunque el contenido
    /// que las rodea cambie.
    fn create_marker(&self) -> Self::Node;

    fn set_text(&self, node: &Self::Node, data: &str);
    fn set_attribute(&self, node: &Self::Node, name: &str, value: &str);
    fn remove_attribute(&self, node: &Self::Node, name: &str);

    /// Inserta `child` antes de `before`, o al final de `parent` si es `None`.
    /// Si `child` ya tenía padre, esto lo mueve.
    fn insert(&self, parent: &Self::Node, child: &Self::Node, before: Option<&Self::Node>);

    fn remove(&self, parent: &Self::Node, child: &Self::Node);

    /// Valor de un atributo, si lo tiene.
    fn attribute(&self, node: &Self::Node, name: &str) -> Option<String>;

    /// Clase del nodo.
    fn node_kind(&self, node: &Self::Node) -> NodeKind;

    /// Empieza a numerar elementos para hidratación, desde cero.
    ///
    /// La numeración es **relativa a cada isla**, no al documento: el cliente
    /// solo construye el contenido de la isla, así que si el servidor contara
    /// desde el principio del documento los números no coincidirían. Fuera de
    /// las islas no se numera nada, porque nada se va a hidratar.
    ///
    /// Por defecto no hace nada: solo importa en el backend que emite los ids.
    fn begin_hydration_scope(&self) {}

    /// Deja de numerar. Ver [`Backend::begin_hydration_scope`].
    fn end_hydration_scope(&self) {}

    /// Nombre de etiqueta en minúsculas, para los elementos.
    fn tag_name(&self, node: &Self::Node) -> Option<String>;

    /// Contenido de un nodo de texto o de un marcador.
    ///
    /// La hidratación lo usa para localizar los marcadores: como los
    /// comentarios no admiten atributos, el servidor escribe su número dentro
    /// del propio comentario.
    fn text_content(&self, node: &Self::Node) -> Option<String>;

    /// Hijos directos, en orden.
    fn children(&self, node: &Self::Node) -> Vec<Self::Node>;

    /// Busca nodos por selector.
    ///
    /// Solo hace falta para encontrar islas en un HTML que ya existe, así que
    /// el contrato es deliberadamente mínimo: **basta con soportar selectores
    /// de atributo** del tipo `[data-ascua-island]`. El backend en memoria no
    /// implementa CSS entero, ni le hace falta.
    fn query_all(&self, selector: &str) -> Vec<Self::Node>;

    fn add_listener(
        &self,
        node: &Self::Node,
        event: &str,
        handler: Rc<dyn Fn(Self::Event)>,
    ) -> Self::ListenerToken;

    fn remove_listener(&self, node: &Self::Node, event: &str, token: Self::ListenerToken);

    /// Cancela el comportamiento por defecto del navegador para este evento.
    /// Lo necesita cualquier cosa que intercepte un `<a>` o un `<form>`, como
    /// el router.
    fn prevent_default(&self, event: &Self::Event);
}

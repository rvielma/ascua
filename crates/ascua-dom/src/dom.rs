//! Construcción de árbol y bindings reactivos.
//!
//! Aquí está la idea central del framework, y cabe en una función:
//! [`Dom::bind_text`] crea un efecto que captura **el nodo concreto** que debe
//! actualizar. Cuando el signal cambia, el efecto ya sabe su destino. No hay
//! árbol que recorrer ni diff que calcular porque la correspondencia entre
//! dato y nodo se estableció una sola vez, al construir.

use std::cell::RefCell;
use std::rc::Rc;

use ascua_reactive::{
    create_effect, create_memo, create_root, current_owner, on_cleanup, Root, Signal,
};

use crate::backend::{Backend, GlobalTarget, PropValue};
use crate::seguro::valor_seguro;

/// [`valor_seguro`] para una propiedad: solo un texto puede ser una URL.
fn prop_segura<B: Backend>(
    backend: &B,
    node: &B::Node,
    name: &str,
    value: &PropValue,
) -> PropValue {
    match value {
        PropValue::Text(texto) => {
            PropValue::Text(valor_seguro(backend, node, name, texto).into_owned())
        }
        otro => otro.clone(),
    }
}

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

    /// Un elemento de SVG (`<svg>`, `<circle>`…). El `view!` lo usa solo dentro
    /// de un `<svg>` o para las etiquetas que solo existen en SVG.
    pub fn element_svg(&self, tag: &str) -> B::Node {
        self.backend.create_element_svg(tag)
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

    /// Como [`Dom::set_attr`], para un valor que llega por una expresión: no
    /// escribe una URL `javascript:` ni un `srcdoc` sin `sandbox`.
    pub fn set_attr_value(&self, node: &B::Node, name: &str, value: &str) {
        let valor = valor_seguro(&*self.backend, node, name, value);
        self.backend.set_attribute(node, name, &valor);
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
            Some(value) => {
                let valor = valor_seguro(&*backend, &node, &name, &value);
                backend.set_attribute(&node, &name, &valor);
            }
            None => backend.remove_attribute(&node, &name),
        });
    }

    /// Pone o quita una clase una vez (`class:activa={expr}`).
    pub fn set_class(&self, node: &B::Node, name: &str, on: bool) {
        self.backend.set_class(node, name, on);
    }

    /// Ata una clase a `f` (`class:activa={move || …}`): la pone cuando `f`
    /// devuelve `true` y la quita cuando devuelve `false`, sin tocar las
    /// demás clases del elemento.
    pub fn bind_class(
        &self,
        node: &B::Node,
        name: impl Into<String>,
        mut f: impl FnMut() -> bool + 'static,
    ) {
        let backend = Rc::clone(&self.backend);
        let node = node.clone();
        let name = name.into();
        create_effect(move || backend.set_class(&node, &name, f()));
    }

    /// Escribe una propiedad de estilo una vez (`style:left={expr}`); `None`
    /// la quita.
    pub fn set_style(&self, node: &B::Node, name: &str, value: Option<&str>) {
        self.backend.set_style(node, name, value);
    }

    /// Ata una propiedad de estilo a `f` (`style:left={move || …}`).
    /// Devolver `None` la quita.
    pub fn bind_style(
        &self,
        node: &B::Node,
        name: impl Into<String>,
        mut f: impl FnMut() -> Option<String> + 'static,
    ) {
        let backend = Rc::clone(&self.backend);
        let node = node.clone();
        let name = name.into();
        create_effect(move || backend.set_style(&node, &name, f().as_deref()));
    }

    /// Escribe una propiedad del nodo una vez (`prop:value={expr}`).
    pub fn set_prop(&self, node: &B::Node, name: &str, value: &PropValue) {
        self.backend
            .set_property(node, name, &prop_segura(&*self.backend, node, name, value));
    }

    /// Ata una propiedad a `f` (`prop:value={move || …}`).
    ///
    /// Solo escribe si el nodo tiene otro valor: reescribir el `value` de un
    /// campo con lo mismo que ya tiene movería el cursor al final mientras el
    /// usuario escribe.
    pub fn bind_prop(
        &self,
        node: &B::Node,
        name: impl Into<String>,
        mut f: impl FnMut() -> PropValue + 'static,
    ) {
        let backend = Rc::clone(&self.backend);
        let node = node.clone();
        let name = name.into();
        create_effect(move || {
            let valor = prop_segura(&*backend, &node, &name, &f());
            let logico = matches!(valor, PropValue::Bool(_));
            if backend.property(&node, &name, logico).as_ref() != Some(&valor) {
                backend.set_property(&node, &name, &valor);
            }
        });
    }

    /// `bind:value={signal}`: el texto de un campo y un `Signal<String>`,
    /// atados. Escucha `input`, que también dispara un `<select>`.
    pub fn bind_input(&self, node: &B::Node, signal: Signal<String>) {
        self.bind_value(node, "value", "input", signal);
    }

    /// `bind:checked={signal}`: una casilla y un `Signal<bool>`, atados.
    /// Escucha `change`.
    ///
    /// Tiene su propia función para que el tipo lo compruebe el compilador:
    /// con un `Signal<String>`, el navegador recibiría `checked = "false"`,
    /// que en JS es verdadero.
    ///
    /// ```compile_fail
    /// use ascua_dom::{Dom, MemoryBackend};
    /// use ascua_reactive::Signal;
    ///
    /// let dom = Dom::new(MemoryBackend::new());
    /// let casilla = dom.element("input");
    /// dom.bind_checked(&casilla, Signal::new(String::new()));
    /// ```
    pub fn bind_checked(&self, node: &B::Node, signal: Signal<bool>) {
        self.bind_value(node, "checked", "change", signal);
    }

    /// Ata una propiedad a un signal en los dos sentidos: el signal escribe
    /// la propiedad y `evento` (lo que hace el usuario) escribe el signal.
    pub fn bind_value<T: BindableProp>(
        &self,
        node: &B::Node,
        name: &str,
        evento: &str,
        signal: Signal<T>,
    ) {
        self.bind_prop(node, name, move || signal.get().into_prop_value());
        let backend = Rc::clone(&self.backend);
        let destino = node.clone();
        let nombre = name.to_string();
        self.on(node, evento, move |_| {
            let leido = backend
                .property(&destino, &nombre, T::LOGICO)
                .and_then(T::from_prop_value);
            if let Some(v) = leido {
                if signal.with_untracked(|actual| *actual != v) {
                    signal.set(v);
                }
            }
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

    /// Registra un manejador en la ventana (`keydown` para un atajo,
    /// `resize`, el `mouseup` que cierra un arrastre). Como [`Dom::on`], se
    /// quita solo cuando el scope actual se libera: no hace falta
    /// `Closure::forget` ni quitarlo a mano.
    ///
    /// ```
    /// use ascua_dom::{Dom, GlobalTarget, MemoryBackend};
    /// use ascua_reactive::Signal;
    ///
    /// let dom = Dom::new(MemoryBackend::new());
    /// let body = dom.element("body");
    /// let pulsadas = Signal::new(0);
    ///
    /// let vista = dom.mount(&body, |dom| {
    ///     dom.on_window("keydown", move |_| pulsadas.update(|n| *n += 1));
    ///     dom.element("main")
    /// });
    ///
    /// dom.backend().dispatch_global(GlobalTarget::Window, "keydown");
    /// assert_eq!(pulsadas.get(), 1);
    ///
    /// vista.unmount();
    /// assert_eq!(dom.backend().global_listener_count(GlobalTarget::Window), 0);
    /// ```
    pub fn on_window(&self, event: impl Into<String>, handler: impl Fn(B::Event) + 'static) {
        self.on_global(GlobalTarget::Window, event, handler);
    }

    /// Registra un manejador en el documento (`selectionchange`,
    /// `visibilitychange`, un clic fuera de un menú). Se quita solo, como
    /// [`Dom::on_window`].
    pub fn on_document(&self, event: impl Into<String>, handler: impl Fn(B::Event) + 'static) {
        self.on_global(GlobalTarget::Document, event, handler);
    }

    fn on_global(
        &self,
        target: GlobalTarget,
        event: impl Into<String>,
        handler: impl Fn(B::Event) + 'static,
    ) {
        let event = event.into();
        let token = self
            .backend
            .add_global_listener(target, &event, Rc::new(handler));

        let backend = Rc::clone(&self.backend);
        on_cleanup(move || backend.remove_global_listener(target, &event, token));
    }

    /// Ejecuta `f` una vez, dentro de `ms` milisegundos (`setTimeout`).
    ///
    /// Si el scope se libera antes —se desmonta el componente, se cierra el
    /// `<Show>`—, se cancela: un aviso que se oculta a los tres segundos no
    /// escribe en un signal de un componente que ya no está. El [`Timer`]
    /// devuelto permite cancelarlo antes, que es como se hace un *debounce*:
    ///
    /// ```
    /// use std::cell::Cell;
    /// use ascua_dom::{Dom, MemoryBackend, Timer};
    /// use ascua_reactive::{create_root, Signal};
    ///
    /// let dom = Dom::new(MemoryBackend::new());
    /// let guardados = Signal::new(0);
    ///
    /// let (_, root) = create_root(|| {
    ///     // Cada cambio reprograma el guardado; solo el último llega a correr.
    ///     let pendiente: Cell<Option<Timer>> = Cell::new(None);
    ///     for _ in 0..3 {
    ///         if let Some(anterior) = pendiente.take() {
    ///             anterior.cancel();
    ///         }
    ///         pendiente.set(Some(dom.timeout(500, move || guardados.update(|n| *n += 1))));
    ///         dom.backend().advance_time(100);
    ///     }
    /// });
    ///
    /// dom.backend().advance_time(500);
    /// assert_eq!(guardados.get(), 1);
    /// root.dispose();
    /// ```
    pub fn timeout(&self, ms: u32, f: impl FnOnce() + 'static) -> Timer {
        let f = RefCell::new(Some(f));
        self.timer(ms, false, move || {
            if let Some(f) = f.borrow_mut().take() {
                f();
            }
        })
    }

    /// Ejecuta `f` cada `ms` milisegundos (`setInterval`) hasta que el scope
    /// se libere o se llame a [`Timer::cancel`].
    pub fn interval(&self, ms: u32, f: impl FnMut() + 'static) -> Timer {
        let f = RefCell::new(f);
        self.timer(ms, true, move || {
            // Un intervalo que se dispara mientras su callback sigue en
            // marcha no puede pasar en el navegador, pero sí si el callback
            // avanza el reloj de un backend de prueba: se salta.
            if let Ok(mut f) = f.try_borrow_mut() {
                f();
            }
        })
    }

    fn timer(&self, ms: u32, repeat: bool, f: impl Fn() + 'static) -> Timer {
        // El token vive en una casilla compartida entre el callback, la
        // cancelación y el cleanup del scope: el primero que llegue lo saca.
        let casilla: Rc<RefCell<Option<B::TimerToken>>> = Rc::new(RefCell::new(None));

        let propia = Rc::clone(&casilla);
        let callback: Rc<dyn Fn()> = Rc::new(move || {
            if !repeat {
                // Un timeout que ya corrió no hay que cancelarlo: se suelta
                // su token para no retenerlo hasta que se libere el scope.
                let token = propia.borrow_mut().take();
                drop(token);
            }
            f();
        });
        *casilla.borrow_mut() = Some(self.backend.set_timer(ms, repeat, callback));

        let backend = Rc::clone(&self.backend);
        let cancel: Rc<dyn Fn()> = Rc::new(move || {
            let token = casilla.borrow_mut().take();
            if let Some(token) = token {
                backend.clear_timer(token);
            }
        });
        let al_liberar = Rc::clone(&cancel);
        on_cleanup(move || al_liberar());
        Timer { cancel }
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

/// Un temporizador de [`Dom::timeout`] o [`Dom::interval`].
///
/// No hace falta guardarlo: se cancela solo cuando se libera el scope en que
/// se creó. Sirve para cancelarlo antes.
#[derive(Clone)]
pub struct Timer {
    cancel: Rc<dyn Fn()>,
}

impl Timer {
    /// Cancela el temporizador. Si ya se disparó, o ya se canceló, no hace
    /// nada.
    pub fn cancel(&self) {
        (self.cancel)();
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

/// Conversión al valor de una propiedad (`prop:value={…}`).
pub trait IntoPropValue {
    fn into_prop_value(self) -> PropValue;
}

impl IntoPropValue for PropValue {
    fn into_prop_value(self) -> PropValue {
        self
    }
}

impl IntoPropValue for String {
    fn into_prop_value(self) -> PropValue {
        PropValue::Text(self)
    }
}

impl IntoPropValue for &String {
    fn into_prop_value(self) -> PropValue {
        PropValue::Text(self.clone())
    }
}

impl IntoPropValue for &str {
    fn into_prop_value(self) -> PropValue {
        PropValue::Text(self.to_string())
    }
}

impl IntoPropValue for bool {
    fn into_prop_value(self) -> PropValue {
        PropValue::Bool(self)
    }
}

macro_rules! impl_into_prop_value_display {
    ($($tipo:ty),* $(,)?) => {
        $(
            impl IntoPropValue for $tipo {
                fn into_prop_value(self) -> PropValue {
                    PropValue::Text(self.to_string())
                }
            }
        )*
    };
}

impl_into_prop_value_display!(
    i8, i16, i32, i64, i128, isize, u8, u16, u32, u64, u128, usize, f32, f64, char
);

/// Lo que se puede atar con `bind:`: un texto (`bind:value`) o un lógico
/// (`bind:checked`).
pub trait BindableProp: IntoPropValue + Clone + PartialEq + 'static {
    /// Se lee como lógico (`checked`) o como texto (`value`).
    const LOGICO: bool;
    fn from_prop_value(v: PropValue) -> Option<Self>;
}

impl BindableProp for String {
    const LOGICO: bool = false;
    fn from_prop_value(v: PropValue) -> Option<Self> {
        match v {
            PropValue::Text(t) => Some(t),
            PropValue::Bool(_) => None,
        }
    }
}

impl BindableProp for bool {
    const LOGICO: bool = true;
    fn from_prop_value(v: PropValue) -> Option<Self> {
        match v {
            PropValue::Bool(b) => Some(b),
            PropValue::Text(_) => None,
        }
    }
}

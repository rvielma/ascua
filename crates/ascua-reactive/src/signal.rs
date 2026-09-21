//! `Signal<T>`: la unidad atómica de estado reactivo.

use std::marker::PhantomData;

use crate::runtime::{self, Computation, NodeId, State};

/// Estado reactivo de tipo `T`.
///
/// Leerlo dentro de un `Effect` o un `Memo` crea la suscripción automáticamente
/// (tracking en tiempo de ejecución, no declarativo). Escribirlo marca a los
/// suscriptores y programa su reejecución.
///
/// Es `Copy` con independencia de `T`: solo guarda un identificador de nodo,
/// así que se puede mover libremente a dentro de closures sin clonar nada.
///
/// ```
/// use ascua_reactive::{create_root, Signal};
///
/// let (_, root) = create_root(|| {
///     let count = Signal::new(0);
///     count.set(count.get() + 1);
///     assert_eq!(count.get(), 1);
/// });
/// root.dispose();
/// ```
pub struct Signal<T: 'static> {
    id: NodeId,
    /// `fn() -> T` en vez de `T` para que `Signal<T>` sea `Copy` aunque `T` no
    /// lo sea, y para no heredar restricciones de varianza de `T`.
    ty: PhantomData<fn() -> T>,
}

impl<T: 'static> Clone for Signal<T> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<T: 'static> Copy for Signal<T> {}

impl<T: 'static> std::fmt::Debug for Signal<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Signal#{}", self.id.index())
    }
}

impl<T: 'static> Signal<T> {
    /// Crea un signal en el scope actual. Se libera cuando se libera su dueño.
    pub fn new(value: T) -> Self {
        let id = runtime::create_node(Computation::Inert, Some(Box::new(value)), State::Clean);
        Self {
            id,
            ty: PhantomData,
        }
    }

    /// Lee el valor por referencia y suscribe al observador actual.
    ///
    /// Dentro de `f` se puede leer cualquier signal, incluido este mismo:
    /// las lecturas solo comparten préstamos inmutables. Lo que no se puede es
    /// **escribir** dentro de `f`; para eso está [`Signal::update`].
    ///
    /// # Panics
    /// Si el scope dueño del signal ya fue liberado. Usa [`Signal::try_with`]
    /// si esa posibilidad es legítima en tu caso.
    pub fn with<R>(&self, f: impl FnOnce(&T) -> R) -> R {
        self.try_with(f).expect(
            "Signal leído después de liberar su scope: el nodo ya no existe en el grafo reactivo",
        )
    }

    /// Como [`Signal::with`], pero devuelve `None` si el signal ya fue liberado.
    pub fn try_with<R>(&self, f: impl FnOnce(&T) -> R) -> Option<R> {
        runtime::track(self.id);
        runtime::with_value(self.id, f)
    }

    /// Lee sin suscribir al observador actual.
    ///
    /// # Panics
    /// Si el scope dueño del signal ya fue liberado.
    pub fn with_untracked<R>(&self, f: impl FnOnce(&T) -> R) -> R {
        runtime::with_value(self.id, f).expect(
            "Signal leído después de liberar su scope: el nodo ya no existe en el grafo reactivo",
        )
    }

    /// Reemplaza el valor y notifica a los suscriptores.
    pub fn set(&self, value: T) {
        runtime::set_value(self.id, value);
        runtime::notify_subscribers(self.id);
    }

    /// Muta el valor en el sitio y notifica. Evita clonar estructuras grandes:
    /// `items.update(|v| v.push(x))`.
    pub fn update(&self, f: impl FnOnce(&mut T)) {
        let applied = runtime::update_value(self.id, f).is_some();
        if applied {
            runtime::notify_subscribers(self.id);
        }
    }

    /// Escribe sin notificar a nadie. Para estado que no debe disparar render.
    pub fn set_silent(&self, value: T) {
        runtime::set_value(self.id, value);
    }

    /// Libera el signal explícitamente. Normalmente no hace falta: lo libera
    /// su scope.
    pub fn dispose(self) {
        runtime::dispose(self.id);
    }
}

impl<T: Clone + 'static> Signal<T> {
    /// Clona el valor y suscribe al observador actual.
    pub fn get(&self) -> T {
        self.with(Clone::clone)
    }

    /// Clona el valor sin suscribir.
    pub fn get_untracked(&self) -> T {
        self.with_untracked(Clone::clone)
    }
}

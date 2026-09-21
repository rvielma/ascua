//! `Memo<T>`: valor derivado con memoización e invalidación fina.

use std::cell::RefCell;
use std::marker::PhantomData;
use std::rc::Rc;

use crate::runtime::{self, Computation, NodeId, State};

/// Valor derivado de otros signals.
///
/// Dos propiedades que lo distinguen de una simple closure:
///
/// 1. **Perezoso**: no recalcula al invalidarse, sino la próxima vez que
///    alguien lo lee. Si nadie lo lee, no se ejecuta.
/// 2. **Corta la propagación**: si al recalcular obtiene un valor igual
///    (`PartialEq`), sus suscriptores no se marcan sucios. Un `Memo` sobre
///    `count() > 10` solo despierta a la UI cuando el booleano cambia de
///    verdad, no en cada incremento.
///
/// ```
/// use ascua_reactive::{create_memo, create_root, Signal};
///
/// let (_, root) = create_root(|| {
///     let count = Signal::new(2);
///     let doble = create_memo(move || count.get() * 2);
///     assert_eq!(doble.get(), 4);
///     count.set(5);
///     assert_eq!(doble.get(), 10);
/// });
/// root.dispose();
/// ```
pub struct Memo<T: 'static> {
    id: NodeId,
    ty: PhantomData<fn() -> T>,
}

impl<T: 'static> Clone for Memo<T> {
    fn clone(&self) -> Self {
        *self
    }
}

impl<T: 'static> Copy for Memo<T> {}

impl<T: 'static> std::fmt::Debug for Memo<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Memo#{}", self.id.index())
    }
}

/// Crea un valor derivado. `f` se ejecuta por primera vez en la primera
/// lectura, no aquí.
pub fn create_memo<T, F>(f: F) -> Memo<T>
where
    T: PartialEq + 'static,
    F: FnMut() -> T + 'static,
{
    let f = RefCell::new(f);
    let compute: Rc<dyn Fn(NodeId) -> bool> = Rc::new(move |id| {
        // `try_borrow_mut` en vez de `borrow_mut`: si el cómputo se lee a sí
        // mismo de forma reentrante preferimos conservar el valor anterior
        // antes que un pánico de `RefCell` sin contexto.
        let Ok(mut f) = f.try_borrow_mut() else {
            return false;
        };
        let value = f();
        drop(f);
        runtime::set_value_if_changed(id, value)
    });

    let id = runtime::create_node(Computation::Memo(compute), None, State::Dirty);
    Memo {
        id,
        ty: PhantomData,
    }
}

impl<T: 'static> Memo<T> {
    /// Lee el valor (recalculándolo si es necesario) y suscribe al observador
    /// actual.
    ///
    /// # Panics
    /// Si el scope dueño del memo ya fue liberado. Usa [`Memo::try_with`] si
    /// esa posibilidad es legítima en tu caso.
    pub fn with<R>(&self, f: impl FnOnce(&T) -> R) -> R {
        self.try_with(f)
            .expect("Memo leído después de liberar su scope: el nodo ya no existe")
    }

    /// Como [`Memo::with`], pero devuelve `None` si el memo ya fue liberado.
    pub fn try_with<R>(&self, f: impl FnOnce(&T) -> R) -> Option<R> {
        runtime::track(self.id);
        runtime::run_now(self.id);
        runtime::with_value(self.id, f)
    }

    /// Lee sin suscribir al observador actual.
    ///
    /// # Panics
    /// Si el scope dueño del memo ya fue liberado.
    pub fn with_untracked<R>(&self, f: impl FnOnce(&T) -> R) -> R {
        runtime::run_now(self.id);
        runtime::with_value(self.id, f)
            .expect("Memo leído después de liberar su scope: el nodo ya no existe")
    }

    /// Libera el memo explícitamente.
    pub fn dispose(self) {
        runtime::dispose(self.id);
    }
}

impl<T: Clone + 'static> Memo<T> {
    pub fn get(&self) -> T {
        self.with(Clone::clone)
    }

    pub fn get_untracked(&self) -> T {
        self.with_untracked(Clone::clone)
    }
}

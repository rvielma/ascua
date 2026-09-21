//! `Effect`: cómputo que se reejecuta cuando cambia algo que leyó.

use std::cell::RefCell;
use std::rc::Rc;

use crate::runtime::{self, Computation, NodeId, State};

/// Manejador de un efecto vivo.
///
/// Normalmente se descarta: el efecto vive mientras viva su scope. Guardarlo
/// solo hace falta para liberarlo antes de tiempo.
#[derive(Clone, Copy, Debug)]
pub struct Effect {
    id: NodeId,
}

/// Registra un efecto y lo ejecuta una primera vez de inmediato.
///
/// Las dependencias se descubren en cada ejecución: lo que el cuerpo lea esta
/// vez es a lo que queda suscrito. Una rama que deja de ejecutarse deja de
/// despertar al efecto.
///
/// En el runtime DOM, cada punto de un template que referencia un signal es
/// exactamente uno de estos efectos, con la referencia al nodo DOM capturada
/// en su closure. Por eso no hace falta VDOM ni diffing: el efecto ya sabe qué
/// nodo tocar.
///
/// ```
/// use ascua_reactive::{create_effect, create_root, Signal};
/// use std::cell::RefCell;
/// use std::rc::Rc;
///
/// let vistos = Rc::new(RefCell::new(Vec::new()));
/// let registro = Rc::clone(&vistos);
///
/// let (count, root) = create_root(move || {
///     let count = Signal::new(0);
///     create_effect(move || registro.borrow_mut().push(count.get()));
///     count
/// });
/// count.set(1);
///
/// assert_eq!(*vistos.borrow(), vec![0, 1]);
/// root.dispose();
/// ```
pub fn create_effect<F>(f: F) -> Effect
where
    F: FnMut() + 'static,
{
    let f = RefCell::new(f);
    let run: Rc<dyn Fn(NodeId)> = Rc::new(move |_id| {
        // Reentrada: un efecto que se dispara a sí mismo se omite en vez de
        // provocar un pánico de `RefCell` sin contexto.
        if let Ok(mut f) = f.try_borrow_mut() {
            f();
        }
    });

    let id = runtime::create_node(Computation::Effect(run), None, State::Dirty);
    runtime::run_now(id);
    Effect { id }
}

impl Effect {
    /// Libera el efecto: deja de reaccionar y ejecuta sus cleanups.
    pub fn dispose(self) {
        runtime::dispose(self.id);
    }
}

/// Registra trabajo de limpieza para el scope actual (un efecto, un memo o una
/// raíz). Se ejecuta antes de cada reejecución del scope y al liberarlo.
///
/// Es el gancho para soltar recursos externos: listeners del DOM, timers,
/// subscripciones a websockets.
///
/// Fuera de todo scope el cleanup se **descarta**, y lo que registró vive
/// hasta el final del hilo. Es deliberado: quien llama a `on_cleanup` acaba de
/// adquirir un recurso, y ejecutar su liberación en el acto lo destruiría nada
/// más crearlo.
///
/// ```
/// use ascua_reactive::{create_effect, create_root, on_cleanup, Signal};
/// use std::cell::Cell;
/// use std::rc::Rc;
///
/// let limpiezas = Rc::new(Cell::new(0));
/// let contador = Rc::clone(&limpiezas);
///
/// let (count, root) = create_root(move || {
///     let count = Signal::new(0);
///     create_effect(move || {
///         count.get();
///         let contador = Rc::clone(&contador);
///         on_cleanup(move || contador.set(contador.get() + 1));
///     });
///     count
/// });
///
/// count.set(1); // limpia la ejecución anterior antes de reejecutar
/// assert_eq!(limpiezas.get(), 1);
/// root.dispose(); // limpia la última
/// assert_eq!(limpiezas.get(), 2);
/// ```
pub fn on_cleanup(f: impl FnOnce() + 'static) {
    runtime::push_cleanup(Box::new(f));
}

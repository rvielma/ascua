//! Runtime del grafo reactivo.
//!
//! Todo el mecanismo cabe en este archivo a propósito: el objetivo declarado
//! del proyecto es poder auditar la reactividad completa en una sesión de
//! lectura. Los tipos públicos (`Signal`, `Memo`, `Effect`) son envoltorios
//! delgados y tipados sobre lo que hay aquí.
//!
//! # Modelo
//!
//! El grafo tiene un único tipo de nodo. Un nodo es una *fuente* (tiene
//! suscriptores), un *observador* (tiene fuentes) o ambas cosas:
//!
//! - `Signal`  -> nodo inerte con valor. Solo fuente.
//! - `Memo`    -> nodo con valor y cómputo. Fuente y observador.
//! - `Effect`  -> nodo con cómputo y sin valor. Solo observador.
//! - raíz      -> nodo inerte sin valor, solo sirve de dueño (`owner`).
//!
//! # Propagación (push marcado / pull recálculo)
//!
//! Escribir en un signal no recalcula nada: solo *marca*. La marca viaja hacia
//! arriba por los suscriptores y los efectos afectados se encolan. Solo al
//! ejecutar la cola (o al leer un memo) se recalcula, y únicamente lo que de
//! verdad cambió. Tres estados:
//!
//! - `Clean` — el valor es válido.
//! - `Check` — alguna fuente *indirecta* cambió; hay que preguntar a las
//!   fuentes antes de decidir si recalcular.
//! - `Dirty` — una fuente directa cambió; hay que recalcular.
//!
//! Esto es lo que evita los dos defectos clásicos del patrón: el *glitch*
//! (leer un valor intermedio inconsistente en un grafo en diamante) y el
//! recálculo en cascada de ramas cuyo valor no cambió.
//!
//! # Memoria
//!
//! Las dependencias son bidireccionales, así que un grafo de `Rc` sería un
//! grafo de ciclos, es decir, fugas. En su lugar los nodos viven en una arena
//! ([`crate::slab`]) y cada nodo pertenece a un dueño. Liberar un dueño libera
//! su subárbol de forma determinista: sin recuento de referencias, sin GC.

use std::any::Any;
use std::cell::{Cell, RefCell};
use std::rc::Rc;

use crate::slab::{Key, Slab};

pub(crate) type NodeId = Key;

/// Tope de vueltas de la cola de efectos antes de declarar un ciclo. Colgar el
/// hilo del navegador sería peor que fallar con un mensaje claro.
const MAX_FLUSH_PASSES: usize = 1_000;

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub(crate) enum State {
    Clean,
    Check,
    Dirty,
}

#[derive(Clone)]
pub(crate) enum Computation {
    /// Signal o raíz: no se recalcula nunca.
    Inert,
    /// Devuelve `true` si el valor recalculado difiere del anterior.
    Memo(Rc<dyn Fn(NodeId) -> bool>),
    Effect(Rc<dyn Fn(NodeId)>),
}

struct Node {
    state: State,
    computation: Computation,
    /// Nodos que este observador leyó en su última ejecución.
    sources: Vec<NodeId>,
    /// Observadores que leyeron este nodo.
    subscribers: Vec<NodeId>,
    owner: Option<NodeId>,
    children: Vec<NodeId>,
    cleanups: Vec<Box<dyn FnOnce()>>,
}

impl Node {
    fn new(computation: Computation, state: State) -> Self {
        Self {
            state,
            computation,
            sources: Vec::new(),
            subscribers: Vec::new(),
            owner: None,
            children: Vec::new(),
            cleanups: Vec::new(),
        }
    }
}

pub(crate) struct Runtime {
    nodes: RefCell<Slab<Node>>,
    /// Los valores viven **fuera** del grafo, indexados por el índice del nodo.
    ///
    /// Es una separación obligada, no una optimización: leer un signal presta
    /// su valor mientras dura la lectura, y a la vez tiene que registrar la
    /// dependencia, que muta el grafo. Con una sola arena, leer un signal
    /// dentro de la lectura de otro —`a.with(|x| b.with(|y| ...))`, algo
    /// perfectamente normal— chocaría con el préstamo exterior y provocaría un
    /// pánico de `RefCell`. Con los valores aparte, las lecturas anidadas solo
    /// comparten préstamos inmutables y el registro de dependencias toca otro
    /// `RefCell` distinto.
    values: RefCell<Vec<Option<Box<dyn Any>>>>,
    /// Observador en ejecución: quien lea un signal ahora queda suscrito a él.
    observer: Cell<Option<NodeId>>,
    /// Dueño en ejecución: todo nodo creado ahora es hijo suyo.
    owner: Cell<Option<NodeId>>,
    pending: RefCell<Vec<NodeId>>,
    batch_depth: Cell<u32>,
    flushing: Cell<bool>,
}

impl Runtime {
    fn new() -> Self {
        Self {
            nodes: RefCell::new(Slab::new()),
            values: RefCell::new(Vec::new()),
            observer: Cell::new(None),
            owner: Cell::new(None),
            pending: RefCell::new(Vec::new()),
            batch_depth: Cell::new(0),
            flushing: Cell::new(false),
        }
    }
}

thread_local! {
    static RUNTIME: Runtime = Runtime::new();
}

/// El runtime es `thread_local`: en el navegador solo hay un hilo y en los
/// tests cada hilo obtiene un grafo propio, así que los tests no interfieren
/// entre sí aunque `cargo test` los ejecute en paralelo.
pub(crate) fn with_runtime<R>(f: impl FnOnce(&Runtime) -> R) -> R {
    RUNTIME.with(f)
}

/// Variante que no falla si el runtime ya se destruyó (puede pasar si un
/// `Drop` toca el grafo durante el teardown del hilo).
fn try_with_runtime(f: impl FnOnce(&Runtime)) {
    let _ = RUNTIME.try_with(f);
}

// ---------------------------------------------------------------------------
// Creación de nodos
// ---------------------------------------------------------------------------

pub(crate) fn create_node(
    computation: Computation,
    value: Option<Box<dyn Any>>,
    state: State,
) -> NodeId {
    with_runtime(|rt| {
        let owner = rt.owner.get();
        let mut node = Node::new(computation, state);
        node.owner = owner;
        let id = rt.nodes.borrow_mut().insert(node);
        store_value(rt, id, value);
        if let Some(owner) = owner {
            if let Some(parent) = rt.nodes.borrow_mut().get_mut(owner) {
                parent.children.push(id);
            }
        }
        id
    })
}

// ---------------------------------------------------------------------------
// Lectura y escritura de valores
// ---------------------------------------------------------------------------

/// Registra que el observador actual depende de `source`.
pub(crate) fn track(source: NodeId) {
    with_runtime(|rt| {
        let Some(observer) = rt.observer.get() else {
            return;
        };
        let mut nodes = rt.nodes.borrow_mut();
        if !nodes.contains(source) {
            return;
        }
        match nodes.get_mut(observer) {
            Some(obs) if !obs.sources.contains(&source) => obs.sources.push(source),
            _ => return,
        }
        if let Some(src) = nodes.get_mut(source) {
            src.subscribers.push(observer);
        }
    });
}

/// Guarda el valor de un nodo en el almacén paralelo, creciéndolo si hace
/// falta. El valor anterior se suelta fuera del préstamo: su `Drop` es código
/// de usuario y podría tocar el runtime.
fn store_value(rt: &Runtime, id: NodeId, value: Option<Box<dyn Any>>) {
    let index = id.index() as usize;
    let previous = {
        let mut values = rt.values.borrow_mut();
        if values.len() <= index {
            values.resize_with(index + 1, || None);
        }
        std::mem::replace(&mut values[index], value)
    };
    drop(previous);
}

fn take_value(rt: &Runtime, id: NodeId) -> Option<Box<dyn Any>> {
    if !rt.nodes.borrow().contains(id) {
        return None;
    }
    rt.values.borrow_mut().get_mut(id.index() as usize)?.take()
}

/// Lee el valor de un nodo sin trackear.
///
/// El préstamo del almacén de valores sigue vivo durante `f`, pero es
/// inmutable: dentro se puede leer cualquier otro signal, y también este
/// mismo. Lo que no se puede es **escribir** dentro de `f`; para eso está
/// `update_value`.
pub(crate) fn with_value<T: 'static, R>(id: NodeId, f: impl FnOnce(&T) -> R) -> Option<R> {
    with_runtime(|rt| {
        if !rt.nodes.borrow().contains(id) {
            return None;
        }
        let values = rt.values.borrow();
        let value = values.get(id.index() as usize)?.as_ref()?;
        let value = value
            .downcast_ref::<T>()
            .expect("el tipo del nodo reactivo no coincide: bug del runtime");
        Some(f(value))
    })
}

/// Muta el valor en el sitio. El valor se extrae de la arena antes de ejecutar
/// `f`, así que `f` puede leer y escribir otros signals con libertad; lo único
/// prohibido es leer *este mismo* signal de forma reentrante.
pub(crate) fn update_value<T: 'static, R>(id: NodeId, f: impl FnOnce(&mut T) -> R) -> Option<R> {
    let mut boxed = with_runtime(|rt| take_value(rt, id))?;
    let result = {
        let value = boxed
            .downcast_mut::<T>()
            .expect("el tipo del nodo reactivo no coincide: bug del runtime");
        f(value)
    };
    with_runtime(|rt| store_value(rt, id, Some(boxed)));
    Some(result)
}

/// Reemplaza el valor almacenado y devuelve el anterior, que se suelta fuera
/// del préstamo (su `Drop` podría tocar el runtime).
pub(crate) fn set_value<T: 'static>(id: NodeId, value: T) {
    with_runtime(|rt| {
        if rt.nodes.borrow().contains(id) {
            store_value(rt, id, Some(Box::new(value)));
        }
    });
}

/// Escribe el valor solo si difiere del actual. Devuelve `true` si cambió.
/// Es la puerta que corta la propagación en los memos: un memo que recalcula
/// al mismo valor no ensucia a nadie.
pub(crate) fn set_value_if_changed<T: PartialEq + 'static>(id: NodeId, value: T) -> bool {
    let previous = with_runtime(|rt| take_value(rt, id));
    let changed = match previous.as_ref().and_then(|b| b.downcast_ref::<T>()) {
        Some(old) => *old != value,
        None => true,
    };
    drop(previous);
    with_runtime(|rt| store_value(rt, id, Some(Box::new(value))));
    changed
}

// ---------------------------------------------------------------------------
// Propagación
// ---------------------------------------------------------------------------

/// Marca a los suscriptores de `id` como sucios y ejecuta la cola de efectos
/// si no estamos dentro de un `batch`.
pub(crate) fn notify_subscribers(id: NodeId) {
    with_runtime(|rt| {
        let subscribers = rt
            .nodes
            .borrow()
            .get(id)
            .map(|n| n.subscribers.clone())
            .unwrap_or_default();
        for subscriber in subscribers {
            mark(rt, subscriber, State::Dirty);
        }
        flush_effects(rt);
    });
}

fn mark(rt: &Runtime, id: NodeId, state: State) {
    let (was_clean, is_effect) = {
        let mut nodes = rt.nodes.borrow_mut();
        let Some(node) = nodes.get_mut(id) else {
            return;
        };
        if node.state >= state {
            return;
        }
        let was_clean = node.state == State::Clean;
        node.state = state;
        (
            was_clean,
            matches!(node.computation, Computation::Effect(_)),
        )
    };

    // Solo se encola en la primera transición desde `Clean`; así un nodo nunca
    // aparece dos veces en la cola.
    if !was_clean {
        return;
    }
    if is_effect {
        rt.pending.borrow_mut().push(id);
    }
    let subscribers = rt
        .nodes
        .borrow()
        .get(id)
        .map(|n| n.subscribers.clone())
        .unwrap_or_default();
    for subscriber in subscribers {
        mark(rt, subscriber, State::Check);
    }
}

/// Recalcula `id` solo si hace falta de verdad. Con `Check` pregunta primero a
/// las fuentes: si ninguna acabó cambiando, no se recalcula nada.
pub(crate) fn update_if_necessary(rt: &Runtime, id: NodeId) {
    let Some(state) = node_state(rt, id) else {
        return;
    };
    if state == State::Clean {
        return;
    }

    if state == State::Check {
        let sources = rt
            .nodes
            .borrow()
            .get(id)
            .map(|n| n.sources.clone())
            .unwrap_or_default();
        for source in sources {
            update_if_necessary(rt, source);
            if node_state(rt, id) == Some(State::Dirty) {
                break;
            }
        }
    }

    if node_state(rt, id) == Some(State::Dirty) {
        recompute(rt, id);
    }
    if let Some(node) = rt.nodes.borrow_mut().get_mut(id) {
        node.state = State::Clean;
    }
}

fn node_state(rt: &Runtime, id: NodeId) -> Option<State> {
    rt.nodes.borrow().get(id).map(|n| n.state)
}

fn recompute(rt: &Runtime, id: NodeId) {
    let Some(computation) = rt.nodes.borrow().get(id).map(|n| n.computation.clone()) else {
        return;
    };

    // Antes de reejecutar: soltar suscripciones viejas, disponer los nodos
    // hijos creados en la ejecución anterior y correr sus cleanups. Es lo que
    // permite que las dependencias sean dinámicas (una rama `if` que deja de
    // ejecutarse deja de trackearse).
    cleanup_node(rt, id);

    let changed = {
        let _scope = ExecutionScope::enter(rt, Some(id), Some(id));
        match computation {
            Computation::Inert => false,
            Computation::Memo(f) => f(id),
            Computation::Effect(f) => {
                f(id);
                false
            }
        }
    };

    if let Some(node) = rt.nodes.borrow_mut().get_mut(id) {
        node.state = State::Clean;
    }

    if changed {
        let subscribers = rt
            .nodes
            .borrow()
            .get(id)
            .map(|n| n.subscribers.clone())
            .unwrap_or_default();
        for subscriber in subscribers {
            mark(rt, subscriber, State::Dirty);
        }
    }
}

/// Guard que restaura observador y dueño aunque el cómputo entre en pánico.
struct ExecutionScope {
    observer: Option<NodeId>,
    owner: Option<NodeId>,
}

impl ExecutionScope {
    fn enter(rt: &Runtime, observer: Option<NodeId>, owner: Option<NodeId>) -> Self {
        Self {
            observer: rt.observer.replace(observer),
            owner: rt.owner.replace(owner),
        }
    }
}

impl Drop for ExecutionScope {
    fn drop(&mut self) {
        try_with_runtime(|rt| {
            rt.observer.set(self.observer);
            rt.owner.set(self.owner);
        });
    }
}

fn flush_effects(rt: &Runtime) {
    if rt.flushing.get() || rt.batch_depth.get() > 0 {
        return;
    }
    rt.flushing.set(true);

    let mut passes = 0usize;
    loop {
        let batch = std::mem::take(&mut *rt.pending.borrow_mut());
        if batch.is_empty() {
            break;
        }
        passes += 1;
        assert!(
            passes <= MAX_FLUSH_PASSES,
            "ciclo reactivo: la cola de efectos no se vacía tras {MAX_FLUSH_PASSES} vueltas \
             (¿un efecto escribe un signal del que él mismo depende?)"
        );
        for id in batch {
            if rt.nodes.borrow().contains(id) {
                update_if_necessary(rt, id);
            }
        }
    }

    rt.flushing.set(false);
}

// ---------------------------------------------------------------------------
// Ciclo de vida
// ---------------------------------------------------------------------------

/// Deja el nodo listo para reejecutarse: sin suscripciones, sin hijos y con
/// sus cleanups ya ejecutados. El nodo en sí sobrevive.
fn cleanup_node(rt: &Runtime, id: NodeId) {
    let (cleanups, children, sources) = {
        let mut nodes = rt.nodes.borrow_mut();
        let Some(node) = nodes.get_mut(id) else {
            return;
        };
        (
            std::mem::take(&mut node.cleanups),
            std::mem::take(&mut node.children),
            std::mem::take(&mut node.sources),
        )
    };

    {
        let mut nodes = rt.nodes.borrow_mut();
        for source in sources {
            if let Some(src) = nodes.get_mut(source) {
                src.subscribers.retain(|s| *s != id);
            }
        }
    }

    for child in children {
        dispose_node(rt, child);
    }
    // En orden inverso de registro, como los destructores de Rust.
    for cleanup in cleanups.into_iter().rev() {
        cleanup();
    }
}

/// Libera el nodo y todo su subárbol. Tras esto su `NodeId` deja de resolver.
pub(crate) fn dispose_node(rt: &Runtime, id: NodeId) {
    cleanup_node(rt, id);

    let owner = rt.nodes.borrow().get(id).and_then(|n| n.owner);
    if let Some(owner) = owner {
        if let Some(parent) = rt.nodes.borrow_mut().get_mut(owner) {
            parent.children.retain(|c| *c != id);
        }
    }

    rt.pending.borrow_mut().retain(|p| *p != id);
    let removed = rt.nodes.borrow_mut().remove(id);
    let value = rt
        .values
        .borrow_mut()
        .get_mut(id.index() as usize)
        .and_then(Option::take);
    drop(removed);
    drop(value);
}

pub(crate) fn push_cleanup(f: Box<dyn FnOnce()>) {
    with_runtime(|rt| {
        // Sin dueño no hay nada que pueda ejecutarlo más tarde, así que el
        // cleanup se descarta: lo que registró vive hasta el final del hilo.
        //
        // Ejecutarlo en el acto sería mucho peor. Quien registra un cleanup
        // acaba de adquirir un recurso —un listener, un timer— y correr su
        // liberación de inmediato lo destruiría nada más crearlo.
        let Some(owner) = rt.owner.get() else {
            drop(f);
            return;
        };
        if let Some(node) = rt.nodes.borrow_mut().get_mut(owner) {
            node.cleanups.push(f);
        }
    });
}

// ---------------------------------------------------------------------------
// Control de ejecución
// ---------------------------------------------------------------------------

/// Ejecuta `f` sin suscribir nada de lo que lea.
pub fn untrack<R>(f: impl FnOnce() -> R) -> R {
    with_runtime(|rt| {
        let _scope = ExecutionScope::enter(rt, None, rt.owner.get());
        f()
    })
}

/// Agrupa escrituras: los efectos se ejecutan una sola vez, al final.
pub fn batch<R>(f: impl FnOnce() -> R) -> R {
    with_runtime(|rt| {
        rt.batch_depth.set(rt.batch_depth.get() + 1);
        let _guard = BatchGuard { rt };
        f()
    })
}

struct BatchGuard<'a> {
    rt: &'a Runtime,
}

impl Drop for BatchGuard<'_> {
    fn drop(&mut self) {
        self.rt.batch_depth.set(self.rt.batch_depth.get() - 1);
        flush_effects(self.rt);
    }
}

/// Número de nodos vivos en el grafo del hilo actual. Existe para que los
/// tests puedan afirmar que un `dispose` no deja huérfanos.
#[must_use]
pub fn live_node_count() -> usize {
    with_runtime(|rt| rt.nodes.borrow().len())
}

/// Fuerza el recálculo de un nodo si está sucio, y vacía la cola de efectos.
/// Lo usan `Effect` al crearse y `Memo` al leerse.
pub(crate) fn run_now(id: NodeId) {
    with_runtime(|rt| {
        update_if_necessary(rt, id);
        flush_effects(rt);
    });
}

/// `dispose` sobre un id concreto, desde fuera del runtime.
pub(crate) fn dispose(id: NodeId) {
    with_runtime(|rt| dispose_node(rt, id));
}

/// Ejecuta `f` con `id` como dueño y sin observador (un scope no trackea).
pub(crate) fn run_in_scope<R>(id: NodeId, f: impl FnOnce() -> R) -> R {
    with_runtime(|rt| {
        let _scope = ExecutionScope::enter(rt, None, Some(id));
        f()
    })
}

pub(crate) fn current_owner() -> Option<NodeId> {
    with_runtime(|rt| rt.owner.get())
}

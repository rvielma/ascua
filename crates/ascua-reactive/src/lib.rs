//! # ascua-reactive
//!
//! Núcleo de reactividad *fine-grained* del framework **Ascua**. Cero
//! dependencias, Rust puro: no necesita WASM ni un navegador para ejecutarse ni
//! para testearse.
//!
//! ## La idea en cuatro líneas
//!
//! Un [`Signal`] guarda un valor. Un [`Effect`] ejecuta código y *observa* qué
//! signals lee mientras lo hace. Cuando uno de esos signals cambia, ese efecto
//! —y solo ese— vuelve a ejecutarse. Un [`Memo`] es un efecto que además
//! guarda el valor que devuelve y no se lo pasa a nadie si no cambió.
//!
//! No hay Virtual DOM ni diffing porque no hacen falta: si cada punto del
//! template que depende de un signal es un efecto con la referencia a su nodo
//! DOM capturada, un cambio de estado sabe exactamente qué nodo tocar. El
//! trabajo que otros frameworks hacen recorriendo un árbol en cada render, aquí
//! ya está hecho en tiempo de compilación del template.
//!
//! ## Ejemplo completo
//!
//! ```
//! use ascua_reactive::{batch, create_effect, create_memo, create_root, Signal};
//! use std::cell::RefCell;
//! use std::rc::Rc;
//!
//! let log = Rc::new(RefCell::new(Vec::new()));
//! let salida = Rc::clone(&log);
//!
//! let (count, root) = create_root(move || {
//!     let count = Signal::new(0);
//!     let etiqueta = create_memo(move || {
//!         if count.get() > 2 { "muchos" } else { "pocos" }
//!     });
//!
//!     create_effect(move || salida.borrow_mut().push(etiqueta.get()));
//!     count
//! });
//!
//! count.set(1); // el memo recalcula, pero devuelve "pocos": el efecto NO corre
//! count.set(5); // ahora sí cambia
//!
//! batch(|| {      // varias escrituras, una sola ejecución del efecto
//!     count.set(6);
//!     count.set(7);
//! });
//!
//! assert_eq!(*log.borrow(), vec!["pocos", "muchos"]);
//! root.dispose();
//! ```
//!
//! ## Mapa del crate
//!
//! | Módulo | Qué contiene |
//! |---|---|
//! | [`runtime`] (privado) | El grafo, la propagación y el ciclo de vida. Todo el mecanismo está ahí. |
//! | `slab` (privado) | Arena con generaciones donde viven los nodos. |
//! | [`Signal`] / [`Memo`] / [`Effect`] | Envoltorios tipados sobre nodos del grafo. |
//!
//! El orden de lectura recomendado para auditar el sistema es
//! `slab.rs` → `runtime.rs` → el resto.

mod effect;
mod memo;
mod runtime;
mod scope;
mod signal;
mod slab;

pub use effect::{create_effect, on_cleanup, Effect};
pub use memo::{create_memo, Memo};
pub use runtime::{batch, live_node_count, untrack};
pub use scope::{create_root, current_owner, Owner, Root};
pub use signal::Signal;

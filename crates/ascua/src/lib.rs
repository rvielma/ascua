//! # Ascua
//!
//! Framework de UI en Rust y WebAssembly con reactividad fine-grained y sin
//! Virtual DOM.
//!
//! Este crate es la fachada: reúne el núcleo reactivo, el runtime DOM y la
//! macro de templates. Es el único que una aplicación necesita declarar.
//!
//! ```
//! use ascua::{view, Dom, MemoryBackend, Signal};
//!
//! let dom = Dom::new(MemoryBackend::new());
//! let body = dom.element("body");
//!
//! let count = Signal::new(0);
//! let app = dom.mount(&body, |dom| {
//!     view! { dom,
//!         <button on:click={move |_| count.update(|c| *c += 1)}>
//!             "Clicks: " {move || count.get()}
//!         </button>
//!     }
//! });
//!
//! assert_eq!(
//!     dom.backend().html(&body),
//!     "<body><button>Clicks: 0</button></body>"
//! );
//!
//! dom.backend().dispatch(app.node(), "click");
//! assert_eq!(
//!     dom.backend().html(&body),
//!     "<body><button>Clicks: 1</button></body>"
//! );
//! ```
//!
//! ## Las tres capas
//!
//! | Crate | Responsabilidad |
//! |---|---|
//! | `ascua-reactive` | El grafo: signals, effects, memos. Rust puro, sin DOM. |
//! | `ascua-dom` | Operaciones de nodo y bindings. Habla con un `Backend`. |
//! | `ascua-macro` | Las macros `view!` y `#[component]`. |
//! | `ascua-router` | La ruta actual como signal. |
//!
//! Cada capa se usa por separado si hace falta. El núcleo reactivo no sabe que
//! existe el DOM, y el runtime DOM no sabe que existe la macro.

pub use ascua_dom::{
    hydrate_islands, island, keyed_list, mount_islands, render_to_string,
    render_to_string_hydratable, Backend, Children, Dom, Estadisticas, HydratingBackend,
    IntoAttrValue, IslandBuilder, MemoryBackend, MemoryEvent, Mount, NodeKind, NodeRef,
    ISLAND_ATTR, ISLAND_PROPS_ATTR,
};
pub use ascua_macro::{component, view};
pub use ascua_reactive::{
    batch, create_effect, create_memo, create_root, current_owner, live_node_count, on_cleanup,
    untrack, Effect, Memo, Owner, Root, Signal,
};
pub use ascua_router::{match_path, History, MemoryHistory, Params, Router};

#[cfg(feature = "web")]
pub use ascua_dom::WebBackend;
#[cfg(feature = "web")]
pub use ascua_router::WebHistory;

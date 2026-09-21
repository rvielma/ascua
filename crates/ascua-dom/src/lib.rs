//! # ascua-dom
//!
//! Runtime DOM de Ascua: la capa que convierte cambios de estado en
//! operaciones sobre nodos reales.
//!
//! No hay Virtual DOM ni diffing global. Cada punto dinámico de un template es
//! un efecto de [`ascua_reactive`] que captura el nodo que debe actualizar, así
//! que un cambio de estado ejecuta directamente la operación de DOM que le
//! corresponde. El único lugar con reconciliación es [`keyed_list`], y compara
//! una lista de claves, no un árbol.
//!
//! ## Backends
//!
//! El runtime habla con el trait [`Backend`], no con `web-sys`. Eso permite
//! testear el comportamiento completo en Rust nativo con [`MemoryBackend`], y
//! es lo que hará que añadir SSR en la Fase 2 sea un backend más y no una
//! reescritura.
//!
//! ```
//! use ascua_dom::{Dom, MemoryBackend};
//! use ascua_reactive::Signal;
//!
//! let dom = Dom::new(MemoryBackend::new());
//! let body = dom.element("body");
//!
//! let count = Signal::new(0);
//! let vista = dom.mount(&body, |dom| {
//!     let p = dom.element("p");
//!     let texto = dom.dynamic_text(move || format!("Clicks: {}", count.get()));
//!     dom.append(&p, &texto);
//!     p
//! });
//!
//! assert_eq!(dom.backend().html(&body), "<body><p>Clicks: 0</p></body>");
//!
//! count.set(3); // actualiza ese nodo de texto y nada más
//! assert_eq!(dom.backend().html(&body), "<body><p>Clicks: 3</p></body>");
//!
//! vista.unmount();
//! ```

mod backend;
mod children;
mod dom;
mod hydrate;
mod list;
mod memory;
mod ssr;
#[cfg(feature = "web")]
mod web;

pub use backend::{Backend, NodeKind};
pub use children::Children;
pub use dom::{Dom, IntoAttrValue, Mount};
pub use hydrate::{hydrate_islands, Estadisticas, HydratedNode, HydratingBackend};
pub use list::keyed_list;
pub use memory::{MemoryBackend, MemoryEvent, NodeRef, HYDRATION_ATTR};
pub use ssr::{
    island, mount_islands, render_to_string, render_to_string_hydratable, IslandBuilder,
    ISLAND_ATTR, ISLAND_PROPS_ATTR,
};
#[cfg(feature = "web")]
pub use web::WebBackend;

//! Raíces y ciclo de vida.

use crate::runtime::{self, Computation, NodeId, State};

/// Raíz de un árbol reactivo: el dueño de todo lo que se cree dentro.
///
/// Todo nodo reactivo pertenece a un dueño, y liberar al dueño libera el
/// subárbol completo de forma determinista. Esto es lo que sustituye al
/// recolector de basura: no hay recuento de referencias que pueda quedarse
/// atrapado en un ciclo, hay un árbol de pertenencia explícito.
///
/// En la aplicación real habrá una raíz por montaje (`mount`) y cada
/// componente desmontado liberará su subárbol.
#[derive(Debug)]
#[must_use = "si se descarta la raíz sin llamar a dispose(), su subárbol queda vivo"]
pub struct Root {
    id: NodeId,
}

/// Ejecuta `f` dentro de una raíz nueva y devuelve su resultado junto al
/// manejador para liberarla.
///
/// Lo que `f` lea no queda trackeado: una raíz no es un observador.
pub fn create_root<T>(f: impl FnOnce() -> T) -> (T, Root) {
    let id = runtime::create_node(Computation::Inert, None, State::Clean);
    let value = runtime::run_in_scope(id, f);
    (value, Root { id })
}

impl Root {
    /// Libera la raíz y todo su subárbol: efectos, memos, signals y cleanups.
    pub fn dispose(self) {
        runtime::dispose(self.id);
    }
}

/// Referencia a un scope para crear nodos dentro de él más tarde.
///
/// Hace falta cuando algo se crea *desde dentro* de un efecto pero debe
/// sobrevivir a las reejecuciones de ese efecto. El caso real es la lista con
/// clave: el efecto que la reconcilia se reejecuta en cada cambio y liberaría
/// los scopes de todos los items; con un `Owner` capturado fuera, cada item
/// pertenece a la lista y solo muere cuando se le elimina a él.
#[derive(Clone, Copy, Debug)]
pub struct Owner {
    id: NodeId,
}

/// Dueño activo en este momento, si lo hay.
#[must_use]
pub fn current_owner() -> Option<Owner> {
    runtime::current_owner().map(|id| Owner { id })
}

impl Owner {
    /// Ejecuta `f` con este scope como dueño. Lo que `f` lea no queda
    /// trackeado.
    pub fn with<T>(&self, f: impl FnOnce() -> T) -> T {
        runtime::run_in_scope(self.id, f)
    }
}

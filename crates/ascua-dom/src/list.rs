//! Listas con clave: el único sitio donde Ascua hace algo parecido a un diff.
//!
//! Para texto y atributos no hace falta comparar nada: el efecto sabe qué nodo
//! tocar. Con una lista dinámica no se puede saber de antemano qué le pasó a
//! cada elemento —se insertó, se borró, se movió—, así que hay que deducirlo.
//! La diferencia con un VDOM es el alcance: esto compara **una lista de
//! claves**, no un árbol de elementos, y solo cuando esa lista cambia.

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::hash::Hash;

use ascua_reactive::{create_effect, create_root, current_owner, Root};

use crate::backend::Backend;
use crate::dom::Dom;

struct Entry<B: Backend> {
    node: B::Node,
    /// Scope reactivo del item: al eliminarlo se liberan sus efectos y sus
    /// listeners. Es `Option` porque `Root::dispose` consume el valor.
    root: Option<Root>,
}

/// Renderiza una lista reactiva de items identificados por clave.
///
/// - `items` es la fuente reactiva: se reejecuta cuando cambia lo que lee.
/// - `key` debe devolver una clave **única y estable** por item. Dos items con
///   la misma clave dejan el resultado indefinido.
/// - `render` construye el nodo de un item. Se ejecuta una sola vez por clave:
///   mientras la clave siga en la lista, su nodo se conserva y se mueve, no se
///   reconstruye. Para que el contenido de un item cambie, el item debe
///   contener signals propios.
///
/// Los nodos se insertan antes de un marcador que la función ancla en
/// `parent`, así que puede convivir con hermanos estáticos alrededor.
pub fn keyed_list<B, T, K>(
    dom: &Dom<B>,
    parent: &B::Node,
    mut items: impl FnMut() -> Vec<T> + 'static,
    key: impl Fn(&T) -> K + 'static,
    render: impl Fn(&Dom<B>, &T) -> B::Node + 'static,
) where
    B: Backend,
    T: 'static,
    K: Eq + Hash + Clone + 'static,
{
    let anchor = dom.marker();
    dom.append(parent, &anchor);

    // El dueño se captura *fuera* del efecto: los scopes de los items deben
    // sobrevivir a las reejecuciones del efecto que reconcilia la lista.
    let owner = current_owner();
    let dom = dom.clone();
    let parent = parent.clone();

    let order: RefCell<Vec<K>> = RefCell::new(Vec::new());
    let entries: RefCell<HashMap<K, Entry<B>>> = RefCell::new(HashMap::new());

    create_effect(move || {
        let next_items = items();
        let next_keys: Vec<K> = next_items.iter().map(&key).collect();
        let next_set: HashSet<K> = next_keys.iter().cloned().collect();

        let mut order = order.borrow_mut();
        let mut entries = entries.borrow_mut();

        // 1. Fuera los que ya no están: del árbol y del grafo reactivo.
        for stale in order.iter().filter(|k| !next_set.contains(*k)) {
            if let Some(mut entry) = entries.remove(stale) {
                dom.remove(&parent, &entry.node);
                if let Some(root) = entry.root.take() {
                    root.dispose();
                }
            }
        }
        order.retain(|k| next_set.contains(k));

        // 2. Construir los nuevos, cada uno en su propio scope.
        for (item, item_key) in next_items.iter().zip(&next_keys) {
            if entries.contains_key(item_key) {
                continue;
            }
            let build = || create_root(|| render(&dom, item));
            let (node, root) = match owner {
                Some(owner) => owner.with(build),
                None => build(),
            };
            entries.insert(
                item_key.clone(),
                Entry {
                    node,
                    root: Some(root),
                },
            );
        }

        // 3. Colocar en orden, de derecha a izquierda.
        //
        // Se recorre desde el final porque así siempre se conoce el nodo que
        // debe quedar a la derecha (`before`). Si la cola de la lista actual ya
        // coincide con la esperada, esos nodos no se tocan: reordenar una lista
        // que no cambió no produce ni una sola operación de DOM.
        let mut before: Option<B::Node> = Some(anchor.clone());
        let mut tail = order.len();
        let mut moved: HashSet<K> = HashSet::new();

        for item_key in next_keys.iter().rev() {
            while tail > 0 && moved.contains(&order[tail - 1]) {
                tail -= 1;
            }
            let in_place = tail > 0 && &order[tail - 1] == item_key;
            if in_place {
                tail -= 1;
            } else if let Some(entry) = entries.get(item_key) {
                dom.insert_before(&parent, &entry.node, before.as_ref());
                moved.insert(item_key.clone());
            }
            if let Some(entry) = entries.get(item_key) {
                before = Some(entry.node.clone());
            }
        }

        *order = next_keys;
    });
}

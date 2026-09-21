//! Arena genérica con generaciones (`generational arena`).
//!
//! El grafo reactivo vive aquí en lugar de en un grafo de `Rc<RefCell<..>>`
//! porque las dependencias reactivas son *cíclicas por naturaleza* (una fuente
//! apunta a sus suscriptores y cada suscriptor apunta de vuelta a sus fuentes).
//! Con `Rc` eso serían ciclos de referencias fuertes, es decir, fugas de memoria
//! garantizadas. Con una arena, la liberación es explícita y determinista:
//! `dispose` borra el slot y punto.
//!
//! La generación permite detectar claves colgantes: si un nodo se libera y el
//! slot se reutiliza, una clave antigua deja de resolver en lugar de apuntar
//! silenciosamente a un nodo ajeno.

/// Clave estable de un elemento de la arena.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct Key {
    index: u32,
    generation: u32,
}

impl Key {
    /// Índice crudo del slot. Solo para depuración.
    pub fn index(self) -> u32 {
        self.index
    }
}

enum Entry<T> {
    Occupied { value: T, generation: u32 },
    Vacant { generation: u32 },
}

/// Arena de elementos `T` direccionables por [`Key`].
pub struct Slab<T> {
    entries: Vec<Entry<T>>,
    free: Vec<u32>,
}

impl<T> Default for Slab<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T> Slab<T> {
    pub fn new() -> Self {
        Self {
            entries: Vec::new(),
            free: Vec::new(),
        }
    }

    /// Inserta un valor y devuelve su clave.
    pub fn insert(&mut self, value: T) -> Key {
        match self.free.pop() {
            Some(index) => {
                let slot = self
                    .entries
                    .get_mut(index as usize)
                    .expect("slot libre fuera de rango: la lista de libres está corrupta");
                let generation = match slot {
                    Entry::Vacant { generation } => generation.wrapping_add(1),
                    Entry::Occupied { generation, .. } => *generation,
                };
                *slot = Entry::Occupied { value, generation };
                Key { index, generation }
            }
            None => {
                let index = u32::try_from(self.entries.len())
                    .expect("la arena reactiva superó los 2^32 nodos vivos");
                self.entries.push(Entry::Occupied {
                    value,
                    generation: 0,
                });
                Key {
                    index,
                    generation: 0,
                }
            }
        }
    }

    pub fn get(&self, key: Key) -> Option<&T> {
        match self.entries.get(key.index as usize) {
            Some(Entry::Occupied { value, generation }) if *generation == key.generation => {
                Some(value)
            }
            _ => None,
        }
    }

    pub fn get_mut(&mut self, key: Key) -> Option<&mut T> {
        match self.entries.get_mut(key.index as usize) {
            Some(Entry::Occupied { value, generation }) if *generation == key.generation => {
                Some(value)
            }
            _ => None,
        }
    }

    pub fn contains(&self, key: Key) -> bool {
        self.get(key).is_some()
    }

    /// Libera el slot y devuelve el valor, que el llamador debe soltar *fuera*
    /// del préstamo de la arena (su `Drop` puede tocar el runtime).
    pub fn remove(&mut self, key: Key) -> Option<T> {
        let slot = self.entries.get_mut(key.index as usize)?;
        match slot {
            Entry::Occupied { generation, .. } if *generation == key.generation => {
                let generation = *generation;
                let previous = std::mem::replace(slot, Entry::Vacant { generation });
                self.free.push(key.index);
                match previous {
                    Entry::Occupied { value, .. } => Some(value),
                    Entry::Vacant { .. } => None,
                }
            }
            _ => None,
        }
    }

    /// Número de elementos vivos. Se usa en los tests para verificar que no
    /// quedan nodos huérfanos tras un `dispose`.
    pub fn len(&self) -> usize {
        self.entries.len() - self.free.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reutiliza_slots_y_invalida_claves_viejas() {
        let mut slab = Slab::new();
        let a = slab.insert("a");
        assert_eq!(slab.remove(a), Some("a"));
        assert!(!slab.contains(a));

        let b = slab.insert("b");
        assert_eq!(b.index(), a.index(), "el slot debería reutilizarse");
        assert!(!slab.contains(a), "la clave vieja no puede resolver a 'b'");
        assert_eq!(slab.get(b), Some(&"b"));
        assert_eq!(slab.len(), 1);
    }
}

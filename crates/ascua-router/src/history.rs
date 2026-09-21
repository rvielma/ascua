//! De dónde sale la ruta y adónde van las navegaciones.

use std::cell::RefCell;
use std::rc::Rc;

/// Fuente de la ruta actual.
///
/// Está detrás de un trait por el mismo motivo que el DOM: para poder probar
/// el router entero sin navegador, y para que renderizar en servidor sea usar
/// otra implementación, no otro router.
/// Callback al que se avisa cuando la ruta cambia por fuera de la aplicación.
pub type Oyente = Rc<dyn Fn(String)>;

pub trait History {
    /// Ruta actual, incluida la query si la hay.
    fn path(&self) -> String;

    /// Registra una navegación nueva.
    fn push(&self, path: &str);

    /// Reemplaza la entrada actual en vez de añadir una.
    fn replace(&self, path: &str);

    /// Avisa cuando el usuario navega por fuera de la aplicación (botón atrás
    /// del navegador). El callback recibe la ruta nueva.
    fn listen(&self, callback: Oyente);
}

/// Historial en memoria: para tests y para renderizar en servidor, donde la
/// ruta viene de la petición.
pub struct MemoryHistory {
    entradas: RefCell<Vec<String>>,
    oyentes: RefCell<Vec<Oyente>>,
}

impl MemoryHistory {
    #[must_use]
    pub fn new(inicial: &str) -> Self {
        Self {
            entradas: RefCell::new(vec![inicial.to_string()]),
            oyentes: RefCell::new(Vec::new()),
        }
    }

    /// Simula el botón "atrás" del navegador.
    pub fn back(&self) {
        let quedan = {
            let mut entradas = self.entradas.borrow_mut();
            if entradas.len() > 1 {
                entradas.pop();
            }
            entradas.last().cloned()
        };
        if let Some(path) = quedan {
            self.avisar(&path);
        }
    }

    /// Número de entradas apiladas.
    #[must_use]
    pub fn len(&self) -> usize {
        self.entradas.borrow().len()
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entradas.borrow().is_empty()
    }

    fn avisar(&self, path: &str) {
        let oyentes = self.oyentes.borrow().clone();
        for oyente in oyentes {
            oyente(path.to_string());
        }
    }
}

impl History for MemoryHistory {
    fn path(&self) -> String {
        self.entradas
            .borrow()
            .last()
            .cloned()
            .unwrap_or_else(|| "/".to_string())
    }

    fn push(&self, path: &str) {
        self.entradas.borrow_mut().push(path.to_string());
    }

    fn replace(&self, path: &str) {
        let mut entradas = self.entradas.borrow_mut();
        match entradas.last_mut() {
            Some(ultima) => *ultima = path.to_string(),
            None => entradas.push(path.to_string()),
        }
    }

    fn listen(&self, callback: Oyente) {
        self.oyentes.borrow_mut().push(callback);
    }
}

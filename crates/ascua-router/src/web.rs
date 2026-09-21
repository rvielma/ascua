//! Historial del navegador: `history.pushState` y el evento `popstate`.

use wasm_bindgen::closure::Closure;
use wasm_bindgen::{JsCast, JsValue};

use crate::history::{History, Oyente};

/// Historial respaldado por la barra de direcciones.
pub struct WebHistory {
    window: web_sys::Window,
}

impl WebHistory {
    /// # Errors
    /// Si no hay objeto `window`, es decir, si esto no corre en un navegador.
    pub fn from_window() -> Result<Self, &'static str> {
        let window =
            web_sys::window().ok_or("no hay objeto window: ¿esto corre en un navegador?")?;
        Ok(Self { window })
    }
}

impl History for WebHistory {
    fn path(&self) -> String {
        let location = self.window.location();
        let pathname = location.pathname().unwrap_or_else(|_| "/".to_string());
        let search = location.search().unwrap_or_default();
        format!("{pathname}{search}")
    }

    fn push(&self, path: &str) {
        if let Ok(history) = self.window.history() {
            let _ = history.push_state_with_url(&JsValue::NULL, "", Some(path));
        }
    }

    fn replace(&self, path: &str) {
        if let Ok(history) = self.window.history() {
            let _ = history.replace_state_with_url(&JsValue::NULL, "", Some(path));
        }
    }

    fn listen(&self, callback: Oyente) {
        let window = self.window.clone();
        let closure = Closure::wrap(Box::new(move |_evento: web_sys::Event| {
            let location = window.location();
            let pathname = location.pathname().unwrap_or_else(|_| "/".to_string());
            let search = location.search().unwrap_or_default();
            callback(format!("{pathname}{search}"));
        }) as Box<dyn FnMut(web_sys::Event)>);

        let _ = self
            .window
            .add_event_listener_with_callback("popstate", closure.as_ref().unchecked_ref());

        // El listener vive tanto como la página: no hay nada que lo desmonte,
        // así que el `Closure` se cede al runtime de JS en lugar de morir aquí.
        closure.forget();
    }
}

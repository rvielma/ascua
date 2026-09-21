//! Emparejado de rutas.
//!
//! Un patrón es una ruta con huecos:
//!
//! | Patrón | Casa con | No casa con |
//! |---|---|---|
//! | `/tareas` | `/tareas` | `/tareas/1` |
//! | `/tareas/:id` | `/tareas/1` | `/tareas` |
//! | `/archivos/*resto` | `/archivos/a/b/c` | `/archivos` |
//!
//! Sin expresiones regulares ni compilación previa: comparar dos listas de
//! segmentos es suficiente y se lee de una sentada.

use std::collections::HashMap;

/// Valores capturados por los huecos de un patrón.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Params(HashMap<String, String>);

impl Params {
    #[must_use]
    pub fn get(&self, nombre: &str) -> Option<&str> {
        self.0.get(nombre).map(String::as_str)
    }

    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

/// Empareja `path` contra `pattern`. Devuelve los parámetros capturados, o
/// `None` si no casa.
#[must_use]
pub fn match_path(pattern: &str, path: &str) -> Option<Params> {
    let path = path.split(['?', '#']).next().unwrap_or(path);

    let esperados: Vec<&str> = segmentos(pattern);
    let reales: Vec<&str> = segmentos(path);
    let mut params = HashMap::new();

    for (indice, esperado) in esperados.iter().enumerate() {
        // `*resto` se traga todo lo que queda, y por eso tiene que ser el
        // último segmento del patrón.
        if let Some(nombre) = esperado.strip_prefix('*') {
            if reales.len() <= indice {
                return None;
            }
            if !nombre.is_empty() {
                params.insert(nombre.to_string(), reales[indice..].join("/"));
            }
            return Some(Params(params));
        }

        let real = reales.get(indice)?;
        match esperado.strip_prefix(':') {
            Some(nombre) => {
                params.insert(nombre.to_string(), (*real).to_string());
            }
            None if esperado == real => {}
            None => return None,
        }
    }

    if reales.len() != esperados.len() {
        return None;
    }
    Some(Params(params))
}

fn segmentos(path: &str) -> Vec<&str> {
    path.split('/').filter(|s| !s.is_empty()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn casa_rutas_literales() {
        assert!(match_path("/tareas", "/tareas").is_some());
        assert!(match_path("/tareas", "/tareas/").is_some());
        assert!(match_path("/tareas", "/tareas/1").is_none());
        assert!(match_path("/tareas", "/otra").is_none());
        assert!(match_path("/", "/").is_some());
    }

    #[test]
    fn captura_parametros() {
        let params = match_path("/tareas/:id", "/tareas/42").expect("debería casar");
        assert_eq!(params.get("id"), Some("42"));
        assert!(match_path("/tareas/:id", "/tareas").is_none());
    }

    #[test]
    fn captura_el_resto_con_comodin() {
        let params = match_path("/archivos/*resto", "/archivos/a/b/c.txt").expect("debería casar");
        assert_eq!(params.get("resto"), Some("a/b/c.txt"));
        assert!(
            match_path("/archivos/*resto", "/archivos").is_none(),
            "el comodín exige al menos un segmento"
        );
    }

    #[test]
    fn ignora_query_y_fragmento() {
        let params = match_path("/buscar/:termino", "/buscar/rust?pagina=2#top")
            .expect("la query no forma parte de la ruta");
        assert_eq!(params.get("termino"), Some("rust"));
    }
}

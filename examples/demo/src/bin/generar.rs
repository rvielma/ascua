//! Generador del HTML: el "servidor" de este demo.
//!
//! Corre en Rust nativo, sin WASM y sin navegador, y usa exactamente los
//! mismos componentes que el cliente. Escribe una página por ruta.

use std::fs;
use std::path::{Path, PathBuf};

use ascua::{island, render_to_string_hydratable, Dom, MemoryBackend, MemoryHistory, Router};

use demo::app::{app, Estado};

fn main() -> std::io::Result<()> {
    let destino = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let css = css_extraido();

    for (ruta, archivo, titulo) in [
        ("/", "index.html", "Tareas"),
        ("/acerca/", "acerca/index.html", "Acerca de"),
    ] {
        let contenido = render_to_string_hydratable(|dom| pagina(dom, ruta));
        let html = plantilla(titulo, &contenido, &css);

        let salida = destino.join(archivo);
        if let Some(carpeta) = salida.parent() {
            fs::create_dir_all(carpeta)?;
        }
        fs::write(&salida, html)?;
        println!("generado {} ({} bytes)", salida.display(), contenido.len());
    }

    Ok(())
}

/// La estructura de la página: cabecera y pie estáticos, y la aplicación
/// dentro de una isla.
fn pagina(dom: &Dom<MemoryBackend>, ruta: &str) -> ascua::NodeRef {
    let router = Router::new(MemoryHistory::new(ruta));
    let estado = Estado::nuevo(router);

    let cuerpo = dom.element("div");
    dom.set_attr(&cuerpo, "class", "pagina");

    // Esto no se hidrata nunca: es HTML y se queda como HTML.
    let intro = dom.element("p");
    dom.set_attr(&intro, "class", "intro");
    dom.append(
        &intro,
        &dom.text("Renderizado en el servidor. La lista de abajo es una isla."),
    );

    let isla = island(dom, "app", "", |dom| app(dom, estado));

    let pie = dom.element("footer");
    dom.append(&pie, &dom.text("Ascua · Rust + WebAssembly, sin Virtual DOM"));

    dom.append(&cuerpo, &isla);
    dom.append(&cuerpo, &intro);
    dom.append(&cuerpo, &pie);
    cuerpo
}

/// Junta el CSS que la macro `view!` extrajo en tiempo de compilación.
fn css_extraido() -> String {
    let directorio = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join("ascua-css");

    let Ok(entradas) = fs::read_dir(&directorio) else {
        eprintln!(
            "aviso: no hay CSS extraído en {}; ¿se compiló el proyecto?",
            directorio.display()
        );
        return String::new();
    };

    let mut hojas: Vec<String> = entradas
        .filter_map(Result::ok)
        .map(|entrada| entrada.path())
        .filter(|ruta| ruta.extension().is_some_and(|ext| ext == "css"))
        .filter_map(|ruta| fs::read_to_string(ruta).ok())
        .collect();
    hojas.sort(); // orden estable entre ejecuciones
    hojas.join("\n")
}

fn plantilla(titulo: &str, contenido: &str, css_componentes: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ascua — {titulo}</title>
<style>
:root {{ color-scheme: dark; --acento: #e2703a; }}
body {{
  margin: 0; min-height: 100vh; display: grid; place-items: start center;
  padding: 4rem 1rem; gap: 2rem;
  font-family: ui-sans-serif, system-ui, sans-serif;
  background: #11100f; color: #f5f1ec;
}}
.pagina {{ width: min(32rem, 100%); display: grid; gap: 2rem; }}
.intro, footer {{ opacity: .45; font-size: .85rem; margin: 0; }}
button {{
  font: inherit; padding: .45rem 1rem; border-radius: 8px; cursor: pointer;
  border: 1px solid #ffffff26; background: #ffffff0f; color: inherit;
}}
button:hover {{ border-color: var(--acento); }}
/* Extraído de los bloques <style> de los componentes, en build time. */
{css_componentes}
</style>
</head>
<body>
{contenido}
<script>
  // Marca los nodos que vinieron del servidor, antes de que arranque el WASM.
  // Si tras hidratar siguen marcados, es que se adoptaron y no se recrearon.
  for (const nodo of document.querySelectorAll('ascua-island *')) {{
    nodo.dataset.delServidor = '1';
  }}
</script>
<script type="module">
  import init from '/pkg/demo.js';
  init();
</script>
</body>
</html>
"#
    )
}

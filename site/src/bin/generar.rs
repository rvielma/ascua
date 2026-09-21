//! Genera el HTML del sitio.
//!
//! Corre en Rust nativo, sin navegador y sin WASM, con los mismos componentes
//! que luego hidrata el cliente. La salida es un `index.html` autocontenido:
//! el CSS que la macro `view!` extrajo en tiempo de compilación va incrustado.

use std::fs;
use std::path::{Path, PathBuf};

use ascua::render_to_string_hydratable;

use sitio::contenido::{pagina, VERSION};

fn main() -> std::io::Result<()> {
    let raiz = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let contenido = render_to_string_hydratable(|dom| pagina(dom));
    let html = plantilla(&contenido, &css_extraido(&raiz));

    let destino = raiz.join("index.html");
    fs::write(&destino, &html)?;
    println!(
        "generado {} ({:.1} KB de HTML, sin JavaScript por delante)",
        destino.display(),
        html.len() as f64 / 1024.0
    );
    Ok(())
}

/// Junta las hojas que la macro dejó en `target/ascua-css/` al compilar.
fn css_extraido(raiz: &Path) -> String {
    let directorio = raiz.join("target").join("ascua-css");
    let Ok(entradas) = fs::read_dir(&directorio) else {
        eprintln!("aviso: no hay CSS extraído en {}", directorio.display());
        return String::new();
    };

    let mut hojas: Vec<String> = entradas
        .filter_map(Result::ok)
        .map(|entrada| entrada.path())
        .filter(|ruta| ruta.extension().is_some_and(|ext| ext == "css"))
        .filter_map(|ruta| fs::read_to_string(ruta).ok())
        .collect();
    hojas.sort();
    hojas.join("\n")
}

fn plantilla(contenido: &str, css_componentes: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ascua — framework de UI en Rust y WebAssembly</title>
<meta name="description" content="Framework de UI escrito desde cero en Rust y compilado a WebAssembly. Reactividad fine-grained, sin Virtual DOM, con SSR e hidratación que no recrea un solo nodo.">
<meta property="og:title" content="Ascua">
<meta property="og:description" content="Un framework de UI que sabe exactamente qué nodo tocar.">
<meta property="og:type" content="website">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='8' r='5' fill='%23e2703a'/></svg>">
<style>
:root {{
  color-scheme: dark;
  --brasa: #e2703a;
  --fondo: #0c0b09;
  --texto: #f3eee7;
  --tenue: #b8b0a5;
  --borde: #ffffff14;
  --mono: ui-monospace, "SF Mono", Menlo, monospace;
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0;
  padding: 0 1.25rem;
  background: var(--fondo);
  color: var(--texto);
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}}
body::before {{
  content: ""; position: fixed; inset: 0 0 auto; height: 22rem; z-index: -1;
  background: radial-gradient(60% 100% at 15% 0%, rgba(226, 112, 58, .13), transparent 70%);
  pointer-events: none;
}}
.pagina {{ max-width: 46rem; margin: 0 auto; }}
button {{
  font: inherit; font-size: .85rem; padding: .45rem 1rem; border-radius: 8px;
  cursor: pointer; border: 1px solid var(--borde); background: #ffffff0d;
  color: inherit; transition: border-color .15s, color .15s;
}}
button:hover:not([disabled]) {{ border-color: var(--brasa); color: var(--brasa); }}
button[disabled] {{ opacity: .3; cursor: default; }}
button.principal {{ border-color: #e2703a66; color: var(--brasa); }}
a {{ color: var(--brasa); }}
::selection {{ background: #e2703a44; }}

/* Extraído de los bloques <style> de los componentes, en tiempo de compilación. */
{css_componentes}
</style>
</head>
<body>
{contenido}
<script type="module">
  import init from './pkg/sitio.js';
  init();
</script>
<!-- v{VERSION} · esta página se renderizó en el servidor con los mismos
     componentes que la hidratan. -->
</body>
</html>
"#
    )
}

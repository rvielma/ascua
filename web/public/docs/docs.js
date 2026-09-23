// Lo poco de la documentación que necesita JavaScript: copiar el código,
// abrir el índice en el móvil, marcar la sección que se está leyendo y
// buscar. Sin él, todo lo demás funciona igual: son páginas de HTML.

// ---- copiar ------------------------------------------------------------
for (const bloque of document.querySelectorAll(".codigo")) {
  const boton = document.createElement("button");
  boton.className = "copiar";
  boton.type = "button";
  boton.textContent = "copiar";
  boton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(bloque.querySelector("pre").innerText);
      boton.textContent = "copiado";
      boton.classList.add("hecho");
    } catch {
      boton.textContent = "no se pudo";
    }
    setTimeout(() => {
      boton.textContent = "copiar";
      boton.classList.remove("hecho");
    }, 1400);
  });
  bloque.appendChild(boton);
}

// ---- índice en el móvil -----------------------------------------------
const abrirMenu = document.querySelector(".abrir-menu");
abrirMenu?.addEventListener("click", () => {
  const abierto = document.body.classList.toggle("menu-abierto");
  abrirMenu.setAttribute("aria-expanded", String(abierto));
});

// ---- la sección que se está leyendo ------------------------------------
const enlacesToc = [...document.querySelectorAll(".en-esta-pagina a")];
if (enlacesToc.length) {
  const titulos = enlacesToc
    .map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1))))
    .filter(Boolean);
  const marcar = () => {
    // La última sección cuyo título ya pasó por arriba.
    let actual = titulos[0];
    for (const titulo of titulos) if (titulo.getBoundingClientRect().top < 120) actual = titulo;
    for (const a of enlacesToc) a.classList.toggle("activa", a.hash === `#${actual?.id}`);
  };
  addEventListener("scroll", marcar, { passive: true });
  marcar();
}

// ---- buscar ------------------------------------------------------------
const capa = document.querySelector(".busqueda");
const campo = capa.querySelector("input");
const lista = capa.querySelector(".resultados");
let indice = null;
let elegido = 0;

async function abrirBusqueda() {
  capa.hidden = false;
  campo.focus();
  campo.select();
  if (!indice) {
    try {
      indice = (await import("/docs/busqueda.js")).default;
    } catch {
      indice = [];
    }
    buscar();
  }
}

function cerrarBusqueda() {
  capa.hidden = true;
}

const normalizar = (texto) =>
  texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const escapar = (texto) =>
  texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function resaltar(texto, terminos) {
  let html = escapar(texto);
  for (const termino of terminos) {
    if (!termino) continue;
    const patron = new RegExp(`(${termino.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    html = html.replace(patron, "<mark>$1</mark>");
  }
  return html;
}

function extracto(texto, termino) {
  const posicion = normalizar(texto).indexOf(termino);
  if (posicion < 0) return texto.slice(0, 110);
  const desde = Math.max(0, posicion - 40);
  return (desde > 0 ? "…" : "") + texto.slice(desde, desde + 130) + "…";
}

function contar(texto, termino) {
  let veces = 0;
  for (let i = texto.indexOf(termino); i !== -1; i = texto.indexOf(termino, i + termino.length)) veces++;
  return veces;
}

function buscar() {
  const consulta = normalizar(campo.value.trim());
  const terminos = consulta.split(/\s+/).filter(Boolean);
  lista.innerHTML = "";
  elegido = 0;
  if (!indice || terminos.length === 0) return;

  // Puntuación sencilla: la sección pesa más que la página, y las dos más que
  // el texto. Todos los términos tienen que aparecer en algún sitio.
  //
  // Un término como `prop:value` se parte además en sus palabras: la sección
  // «Formularios: prop:» no lo contiene entero en el título, pero es la que
  // habla de él, y tiene que ganar a otra que solo lo menciona de pasada.
  // Por eso cuentan también las veces que aparece en el texto.
  const encontrados = [];
  for (const entrada of indice) {
    const pagina = normalizar(entrada.p);
    const seccion = normalizar(entrada.s);
    const texto = normalizar(entrada.t);
    let puntos = 0;
    let todos = true;
    for (const termino of terminos) {
      const veces = contar(texto, termino);
      const enTitulo = (pagina.includes(termino) ? 6 : 0) + (seccion.includes(termino) ? 10 : 0);
      if (enTitulo === 0 && veces === 0) {
        todos = false;
        continue;
      }
      const palabras = termino.split(/[^a-z0-9]+/).filter((p) => p.length > 2);
      const partes = palabras.length > 1 ? palabras.filter((p) => seccion.includes(p)).length * 4 : 0;
      puntos += enTitulo + partes + Math.min(veces, 6);
    }
    if (todos) encontrados.push({ entrada, puntos });
  }
  encontrados.sort((a, b) => b.puntos - a.puntos);

  if (encontrados.length === 0) {
    lista.innerHTML = `<li class="vacio">Nada para «${escapar(campo.value.trim())}».</li>`;
    return;
  }
  for (const { entrada } of encontrados.slice(0, 12)) {
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    const titulo = entrada.s || entrada.p;
    li.innerHTML =
      `<a href="${entrada.u}">` +
      `<div class="donde">${escapar(entrada.p)}</div>` +
      `<div class="que">${resaltar(titulo, terminos)}</div>` +
      `<div class="extracto">${resaltar(extracto(entrada.t, terminos[0]), terminos)}</div>` +
      `</a>`;
    lista.appendChild(li);
  }
  seleccionar(0);
}

function seleccionar(n) {
  const opciones = lista.querySelectorAll('[role="option"]');
  if (opciones.length === 0) return;
  elegido = (n + opciones.length) % opciones.length;
  opciones.forEach((li, i) => li.setAttribute("aria-selected", String(i === elegido)));
  opciones[elegido].scrollIntoView({ block: "nearest" });
}

campo.addEventListener("input", buscar);
campo.addEventListener("keydown", (evento) => {
  if (evento.key === "ArrowDown") seleccionar(elegido + 1);
  else if (evento.key === "ArrowUp") seleccionar(elegido - 1);
  else if (evento.key === "Enter") {
    const enlace = lista.querySelectorAll('[role="option"] a')[elegido];
    if (enlace) {
      cerrarBusqueda();
      location.href = enlace.href;
    }
  } else return;
  evento.preventDefault();
});
capa.addEventListener("click", (evento) => {
  if (evento.target === capa) cerrarBusqueda();
});
lista.addEventListener("click", (evento) => {
  if (evento.target.closest("a")) cerrarBusqueda();
});
document.querySelector(".barra .buscar")?.addEventListener("click", abrirBusqueda);
addEventListener("keydown", (evento) => {
  const escribiendo = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName ?? "");
  if (evento.key === "Escape" && !capa.hidden) cerrarBusqueda();
  else if (!escribiendo && (evento.key === "/" || (evento.key === "k" && (evento.metaKey || evento.ctrlKey)))) {
    evento.preventDefault();
    abrirBusqueda();
  }
});

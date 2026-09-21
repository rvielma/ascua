/**
 * El fondo de la portada: brasas subiendo.
 *
 * Es canvas y no un GIF ni un vídeo porque pesa lo que pesa este archivo, se
 * adapta al ancho y no obliga a decidir una resolución. Si el visitante pidió
 * menos movimiento, se dibuja un fotograma y se para.
 */

interface Chispa {
  x: number;
  y: number;
  radio: number;
  velocidad: number;
  deriva: number;
  brillo: number;
  fase: number;
}

const CHISPAS_POR_MEGAPIXEL = 130;

export function brasas(lienzo: HTMLCanvasElement): void {
  const ctx = lienzo.getContext("2d");
  if (!ctx) return;

  const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let ancho = 0;
  let alto = 0;
  let chispas: Chispa[] = [];

  const nacer = (alturaInicial?: number): Chispa => ({
    // Cargadas hacia la derecha: es donde el texto deja sitio, igual que el
    // paisaje de condor o los contenedores de hull.
    x: ancho * (0.25 + Math.random() * 0.85),
    y: alturaInicial ?? alto + Math.random() * 40,
    radio: 0.7 + Math.random() * 2.4,
    velocidad: 10 + Math.random() * 34,
    deriva: (Math.random() - 0.5) * 14,
    brillo: 0.25 + Math.random() * 0.75,
    fase: Math.random() * Math.PI * 2,
  });

  const medir = () => {
    const escala = Math.min(devicePixelRatio || 1, 2);
    ancho = lienzo.clientWidth;
    alto = lienzo.clientHeight;
    lienzo.width = Math.round(ancho * escala);
    lienzo.height = Math.round(alto * escala);
    ctx.setTransform(escala, 0, 0, escala, 0, 0);

    const cuantas = Math.round(((ancho * alto) / 1_000_000) * CHISPAS_POR_MEGAPIXEL);
    chispas = Array.from({ length: cuantas }, () => nacer(Math.random() * alto));
  };

  /** El rescoldo del que salen: un resplandor bajo, a la derecha. */
  const rescoldo = () => {
    const x = ancho * 0.72;
    const y = alto * 0.86;
    const brasa = ctx.createRadialGradient(x, y, 0, x, y, Math.max(ancho, alto) * 0.55);
    brasa.addColorStop(0, "rgba(242, 181, 68, .34)");
    brasa.addColorStop(0.18, "rgba(226, 112, 58, .20)");
    brasa.addColorStop(0.55, "rgba(226, 112, 58, .05)");
    brasa.addColorStop(1, "rgba(226, 112, 58, 0)");
    ctx.fillStyle = brasa;
    ctx.fillRect(0, 0, ancho, alto);

    // Un segundo foco, más arriba y más frío, para que el degradado no se lea
    // como un círculo pegado al fondo.
    const halo = ctx.createRadialGradient(
      ancho * 0.88,
      alto * 0.3,
      0,
      ancho * 0.88,
      alto * 0.3,
      Math.max(ancho, alto) * 0.45,
    );
    halo.addColorStop(0, "rgba(226, 112, 58, .10)");
    halo.addColorStop(1, "rgba(226, 112, 58, 0)");
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, ancho, alto);
  };

  const pintar = (tiempo: number) => {
    ctx.clearRect(0, 0, ancho, alto);
    rescoldo();

    for (const chispa of chispas) {
      // El parpadeo es lo que las hace brasa y no confeti.
      const parpadeo = 0.55 + 0.45 * Math.sin(tiempo * 0.003 + chispa.fase);
      const alfa = chispa.brillo * parpadeo * Math.min(chispa.y / alto + 0.15, 1);

      ctx.beginPath();
      ctx.arc(chispa.x, chispa.y, chispa.radio, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(242, 181, 68, ${alfa.toFixed(3)})`;
      ctx.shadowColor = "rgba(226, 112, 58, .9)";
      ctx.shadowBlur = chispa.radio * 5;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  };

  let anterior = performance.now();
  const paso = (ahora: number) => {
    const delta = Math.min((ahora - anterior) / 1000, 0.05);
    anterior = ahora;

    for (const chispa of chispas) {
      chispa.y -= chispa.velocidad * delta;
      chispa.x += Math.sin(ahora * 0.0006 + chispa.fase) * chispa.deriva * delta;
      if (chispa.y < -10) Object.assign(chispa, nacer());
    }

    pintar(ahora);
    requestAnimationFrame(paso);
  };

  medir();
  addEventListener("resize", medir);

  if (quieto) {
    pintar(0);
    return;
  }
  requestAnimationFrame(paso);
}

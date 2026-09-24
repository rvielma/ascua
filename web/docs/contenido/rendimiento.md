---
titulo: Rendimiento
descripcion: Ascua frente a vanilla, Solid y React en las operaciones de js-framework-benchmark. Cerca de Solid, y muy por delante de React.
---

## El resultado

Tiempo de cada operación dividido por el de **vanilla** —el mismo DOM escrito a
mano— en la misma ronda. `1,00` es tan rápido como el código a mano; más bajo
es mejor.

| Operación | Ascua | Solid | React |
|---|---|---|---|
| Crear 1.000 filas | 1,11 | 1,00 | 1,19 |
| Reemplazar 1.000 | 1,15 | 1,03 | 1,42 |
| Actualizar 1 de cada 10 | 0,98 | 0,93 | 1,12 |
| Intercambiar dos filas | 1,28 | 1,24 | 13,47 |
| Quitar una fila | 1,27 | 1,13 | 1,56 |
| Crear 10.000 filas | 1,09 | 1,04 | 1,86 |
| Añadir 1.000 a 1.000 | 1,10 | 1,00 | 1,19 |
| Vaciar 1.000 filas | 1,31 | 1,14 | 2,11 |
| **Media geométrica** | **1,16** | **1,06** | **1,92** |

**Ascua queda a un 10 % de Solid y React tarda un 65 % más que Ascua.** La
media geométrica es la que usa js-framework-benchmark para resumir: una
operación diez veces más lenta no se compensa con diez que van un poco más
rápido. Por debajo de 1,00 hay ruido: una operación que tarda lo mismo que
vanilla sale a veces un poco por debajo.

Donde más se nota la diferencia con React es en lo que un Virtual DOM hace peor:
intercambiar dos filas de mil —React mueve casi todas, Ascua mueve dos— y crear
diez mil.

Ascua 0.1.2, Solid 1.9.15, React 19.3.0. Chrome 153 en un Apple M3 con macOS
27, el 24 de septiembre de 2026, con 5 rondas. Los datos crudos, en milisegundos y por ronda,
están en [`benchmarks/resultados/`](https://github.com/rvielma/ascua/tree/main/benchmarks/resultados).

> **Nota:** «seleccionar una fila» no está en la tabla ni en la media. Tarda
> entre 0,1 y 0,3 ms en Ascua, Solid y vanilla, que es la resolución del reloj
> del navegador sin aislamiento de origen cruzado: su factor mide el redondeo,
> no la operación. React tarda alrededor de 1 ms.

## Lo que cambió con estas cifras

La primera medición publicada dejaba «vaciar 1.000 filas» en 1,60. Al estudiarlo
apareció algo peor que la lentitud: **una fuga de memoria**. Cada fila de un
`<For>` quedaba colgada del scope de la lista después de liberarse, con sus
closures y sus nodos del DOM; tras diez ciclos de llenar y vaciar la tabla, el
scope retenía diez mil filas muertas. La 0.1.2 las descuelga al liberarlas, deja
de copiar listas vacías en cada nodo que se libera y no quita uno a uno los
listeners de los nodos que ya salieron del documento. Vaciar bajó a 1,31.

Lo que queda está en el DOM, no en Ascua: de los ~5 ms, unos 4 son el propio
`textContent = ""`, y menos de uno, liberar las mil filas.

## Qué se mide

Las operaciones de [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark),
sobre la misma tabla y los mismos datos para los cuatro: filas con un id y una
etiqueta de tres palabras al azar, un botón por operación y un enlace para
seleccionar o quitar cada fila.

Cada contendiente está escrito **como dice su documentación**, sin atajos que
un usuario no tomaría:

- **Ascua**: un signal por etiqueta, `<For>` con clave y
  [`selector`](/docs/reactividad/#selector-elegir-uno-entre-mil) para la fila
  elegida.
- **Solid**: `createSignal`, `<For>` y `createSelector`, como su versión en
  js-framework-benchmark.
- **React**: estado en un reducer y filas memoizadas con `memo`, como la suya.
- **Vanilla**: el DOM a mano, que es el suelo.

## Cómo se mide

El tiempo va **desde el click hasta que el DOM está actualizado y maquetado**:
tras la operación se deja correr lo que el framework haya programado y se fuerza
el layout leyendo `offsetHeight`. Entra el recálculo de estilos y la
maquetación; no entra el pintado. js-framework-benchmark sí lo incluye —mide
con trazas de Chrome—, así que **los números absolutos no son comparables con
los suyos, y los relativos sí**.

Después de cada vuelta se comprueba que el DOM quedó como debe. Si un framework
deja trabajo pendiente —React programa el suyo en una microtarea—, la
comprobación falla y no sale un número falso.

La máquina cambia de velocidad mientras se mide: temperatura, lo que haya
abierto. En esta máquina, dos pasadas seguidas llegaron a diferir un 30 %. Por
eso nada se compara entre pasadas:

- Cada **ronda** mide a los cuatro seguidos, rotando el orden.
- Cada tiempo se expresa como **factor sobre vanilla de esa misma ronda**: la
  deriva afecta a todos por igual y se cancela en el cociente.
- Por operación, 5 vueltas de calentamiento y 15 medidas; se toma la
  **mediana**. Entre rondas, la mediana de los factores.

## Reproducirlo

```sh
for d in vanilla ascua solid react; do
  (cd benchmarks/$d && stil install && stil exec vite build)
done
bash scripts/enlazar-paquetes.sh
python3 -m http.server 5191 --directory benchmarks
```

Y en `http://localhost:5191/`, el botón **correr**, o en la consola:

```js
await correr({ rondas: 3, vueltas: 15, calentamiento: 5 });
```

Tarda unos cinco minutos. Los resultados cambian de una máquina a otra; los
factores, bastante menos.

## Lo que no dice

Una tabla de mil filas es un caso concreto. Mide el coste de crear, mover y
quitar nodos, que es donde los frameworks se diferencian, pero no el arranque,
ni la memoria, ni cómo se comporta una aplicación de verdad con cien
componentes distintos. El tamaño, en cambio, se mide solo:
[2,23 kB](/docs/como-funciona/#lo-que-cuesta) de runtime frente a los ~45 kB de
React.

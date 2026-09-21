/** Los pedidos que pinta el panel. Datos quietos: el movimiento lo pone la vista. */

export type Estado = "pendiente" | "enviado" | "entregado";

export interface Pedido {
  id: number;
  cliente: string;
  ciudad: string;
  total: number;
  estado: Estado;
}

export const PEDIDOS: Pedido[] = [
  { id: 4821, cliente: "Talleres Andes", ciudad: "Santiago", total: 184_900, estado: "pendiente" },
  { id: 4822, cliente: "Frutícola Maipo", ciudad: "Buin", total: 92_400, estado: "enviado" },
  { id: 4823, cliente: "Imprenta Norte", ciudad: "Antofagasta", total: 341_000, estado: "entregado" },
  { id: 4824, cliente: "Café Valparaíso", ciudad: "Valparaíso", total: 58_300, estado: "pendiente" },
  { id: 4825, cliente: "Viña Colchagua", ciudad: "Santa Cruz", total: 730_500, estado: "enviado" },
  { id: 4826, cliente: "Pesquera Chiloé", ciudad: "Castro", total: 219_750, estado: "entregado" },
  { id: 4827, cliente: "Metalúrgica Bío-Bío", ciudad: "Concepción", total: 455_200, estado: "pendiente" },
];

/** El siguiente estado del ciclo, para el botón de cada fila. */
export function siguienteEstado(estado: Estado): Estado {
  return estado === "pendiente" ? "enviado" : estado === "enviado" ? "entregado" : "pendiente";
}

const PESOS = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function pesos(monto: number): string {
  return PESOS.format(monto);
}

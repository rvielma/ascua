/** `[[v]]` es opcional: /versiones y /versiones/:v. */
export function paths() {
  return [{ v: "1" }, { v: "2" }];
}

export const title = ({ v }: { v?: string }) => `Versión ${v ?? "última"}`;

export default function Version({ v }: { v?: string }) {
  return view`<h1>${v ?? "última"}</h1>`;
}

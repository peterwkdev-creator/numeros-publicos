import Link from "next/link";
import { slugUf } from "../../../lib/estado";
import type { Contexto } from "./contexto";

/**
 * Os links para os outros estados.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoOutrosEstados({ c }: { c: Contexto }) {
  const { snapshot, r, estilos } = c;
  return (
    <section className={estilos.texto} id="outros-estados">
      <h2>Outros estados</h2>
      <ul className={estilos.estados}>
        {snapshot.ufs
          .filter((u) => u.sigla !== r.uf.sigla)
          .map((u) => (
            <li key={u.sigla}>
              <Link href={`/estado/${slugUf(u.sigla)}/`} prefetch={false}>
                {u.nome}
              </Link>
            </li>
          ))}
      </ul>
    </section>
  );
}

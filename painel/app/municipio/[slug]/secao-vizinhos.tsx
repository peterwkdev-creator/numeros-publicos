import Link from "next/link";
import { br } from "../../../lib/dados";
import { deEstado, slugUf } from "../../../lib/estado";
import type { Contexto } from "./contexto";

/**
 * Os outros municípios da região imediata (ou do estado).
 * Extraído de `page.tsx` em 15/10/2026 (item 19 da revisão de 11/10/2026): o HTML é o mesmo, byte a byte.
 */
export default function SecaoVizinhos({ c }: { c: Contexto }) {
  const { snapshot, m, uf, regiao, pelaRegiao, vizinhos , estilos } = c;
  if (!(vizinhos.length > 0)) return null;
  // `pelaRegiao` já garante `regiao`; o `!` é só para o TypeScript, que não
  // propaga o estreitamento por um booleano desestruturado.
  return (
    <section className={estilos.texto} id="outros-municipios">
      <h2>
        {pelaRegiao
          ? `Outros municípios da região de ${regiao!.nome}`
          : `Outros municípios ${deEstado(m.uf)}`}
      </h2>
      {pelaRegiao && (
        <p>
          A <strong>região imediata</strong>, do IBGE, reúne os municípios
          ligados a uma mesma cidade-polo, aonde a população vai para
          comprar, trabalhar, estudar e se tratar. Nesta são{" "}
          {br(regiao!.vizinhos.length + 1)} municípios, {m.nome} incluído.
          Fonte: IBGE, Divisão Regional do Brasil em Regiões Geográficas
          Imediatas (2017).
        </p>
      )}
      <ul className={estilos.vizinhos}>
        {vizinhos.map((v) => (
          <li key={v.codigo}>
            {/* Sem pré-busca automática. Medido em 03/09/2026: numa
                página curta, os doze vizinhos cabem na primeira tela e o
                Next pré-buscava quatro deles — 186 KB antes de qualquer
                clique. `prefetch={false}` no App Router não desliga a
                pré-busca ao passar o mouse; desliga só a especulativa.
                Quem demonstra intenção continua ganhando o adiantamento. */}
            <Link href={`/municipio/${v.slug}/`} prefetch={false}>
              {v.nome}
            </Link>
          </li>
        ))}
      </ul>
      <p>
        <Link href={`/estado/${slugUf(m.uf)}/`} prefetch={false}>
          Ver os {br(uf?.municipios ?? 0)} municípios {deEstado(m.uf)}
        </Link>{" "}
        ·{" "}
        <Link href="/" prefetch={false}>
          os {br(snapshot.municipios.length)} do país
        </Link>
      </p>
    </section>
  );
}

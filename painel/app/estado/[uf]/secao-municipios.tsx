import Link from "next/link";
import Termo from "../../componentes/termo";
import { br } from "../../../lib/dados";
import { ROTULO_FAIXA } from "../../../lib/fiscal";
import type { Contexto } from "./contexto";

/**
 * A lista dos municípios do estado, em tabela.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoMunicipios({ c }: { c: Contexto }) {
  const { r, de, quadrimestre, estilos } = c;
  return (
    <>
      <section className={estilos.texto} id="municipios">
        <h2>
          {r.uf.municipios === 1
            ? `O município ${de}`
            : `Os ${br(r.uf.municipios)} municípios ${de}`}
        </h2>
        <p>
          Em ordem alfabética. O percentual é o que o próprio município
          declarou ao SICONFI no {quadrimestre}; travessão significa que o
          relatório não foi entregue — não zero.
        </p>
      </section>

      <div className={`${estilos.rolagem} rola-x`}>
        <table className={estilos.lista}>
          <caption className="so-leitor">
            Municípios {de}, com a população do Censo 2022 e o gasto com
            pessoal no {quadrimestre}, em % da receita corrente líquida.
          </caption>
          <thead>
            <tr>
              <th scope="col">Município</th>
              <th scope="col" className={estilos.num}>População (Censo 2022)</th>
              <th scope="col" className={estilos.num}>
                Gasto com pessoal{" "}
                (% da <Termo chave="rcl">RCL</Termo>)
              </th>
              <th scope="col" className={estilos.situacao}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {r.municipios.map((m) => {
              const faixa = m.fiscal?.faixa ?? "nao-consultado";
              return (
                <tr key={m.codigo}>
                  <th scope="row">
                    {/* Ver a nota em `municipio/[slug]/page.tsx`: 645 links
                        nesta tabela, e a pré-busca especulativa dos que cabem
                        na tela custa centenas de KB antes de qualquer clique. */}
                    <Link href={`/municipio/${m.slug}/`} prefetch={false}>
                      {m.nome}
                    </Link>
                  </th>
                  <td>
                    {br(m.valores["populacao-censo-2022"] ?? null)}
                  </td>
                  <td>
                    {m.fiscal?.percentual === null ||
                    m.fiscal?.percentual === undefined
                      ? "—"
                      : `${br(m.fiscal.percentual, 2)}%`}
                  </td>
                  <td className={estilos.situacao}>
                    <span className={`${estilos.selo} ${estilos[faixa]}`}>
                      {ROTULO_FAIXA[faixa]}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

import type { ReactNode } from "react";

import { dataCurta } from "../../lib/dados";
import type { Mandato } from "../../lib/brasil";
import estilos from "./brasil.module.css";

/**
 * O que a `/brasil/` e a página de cada série dizem igual: o nome da seção, a
 * nota de que as faixas não medem efeito e a tabela de quem ocupou a
 * Presidência. Desde 16/10/2026, quando cada série ganhou página própria
 * (item 12 da modernização): quem chega a uma série pela busca não passa
 * pelo índice, e a nota e as datas das faixas têm de estar lá também.
 */
export const CAMINHO = "/brasil/";
export const TITULO = "O Brasil ao longo do tempo";

/** A nota fixa da espec (seção 4, item 2), no topo da página. */
export function NotaFaixas({ children }: { children?: ReactNode }) {
  return (
    <div className={estilos.nota} role="note">
      <p>
        <strong>As faixas mostram quem ocupava o cargo, e não medem
        efeito.</strong> Estas séries se movem por muitos fatores, de dentro e
        de fora do país, e nenhum gráfico aqui separa um do outro. Por isso a
        página não soma, não tira média e não compara mandatos.
      </p>
      {children}
    </div>
  );
}

/** Quem ocupou a Presidência, com a fonte de cada data. */
export function Presidencia({ mandatos }: { mandatos: Mandato[] }) {
  return (
    <section aria-labelledby="presidencia">
      <h2 id="presidencia" className={estilos.secao}>
        Quem ocupou a Presidência
      </h2>
      <p className={estilos.texto}>
        Cada período começa no dia em que a pessoa passou a exercer o cargo e
        termina no dia em que a seguinte assumiu. A data de cada linha vem da
        página oficial indicada nela.
      </p>
      <div className={`${estilos.rolagem} rola-x`}>
        <table className={estilos.tabela}>
          <caption className="so-leitor">
            Quem ocupou a Presidência da República, com as datas e a fonte
          </caption>
          <thead>
            <tr>
              <th scope="col">Quem</th>
              <th scope="col">De</th>
              <th scope="col">Até</th>
              <th scope="col">Como</th>
              <th scope="col">Fonte</th>
            </tr>
          </thead>
          <tbody>
            {mandatos.map((m) => (
              <tr key={m.inicio} data-mandato={m.inicio}>
                <th scope="row">{m.nome}</th>
                <td>{dataCurta(m.inicio)}</td>
                <td>{m.fim ? dataCurta(m.fim) : "no cargo"}</td>
                <td>{m.como}</td>
                <td>
                  <a href={m.fonte} rel="noopener">
                    {new URL(m.fonte).hostname.replace(/^www\d*\./, "")}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

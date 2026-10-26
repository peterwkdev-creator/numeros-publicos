import { br } from "../../../lib/dados";
import {
  CAMINHO, CAMINHO_DADOS, dataDoTurno, urlMunicipio,
  type EleicaoDoMunicipio,
} from "../../../lib/eleicoes";
import type { Contexto } from "./contexto";
import paleta from "../../componentes/partidos.module.css";
import est from "./secao-eleicoes.module.css";

/**
 * A cor da barra: em presidente (chaves `p1`, `p2`), Lula (PT) em vermelho e
 * Flávio (PL) em azul, os tons do PT e do PL na paleta dos partidos
 * (`partidos.module.css`), como na página das eleições (26/10/2026); os outros e
 * o governador ficam cinza, sem cor de partido entre vários partidos.
 */
function corDe(chave: string, partido: string): string {
  if (chave[0] !== "p") return "";
  return (partido === "PT" ? est.pt : partido === "PL" ? est.pl : "") ?? "";
}

/**
 * Eleições 2026 no município: presidente nos dois turnos e governador, do
 * resultado oficial do TSE gravado no build (`lib/eleicoes.ts`). O
 * `public/eleicoes-municipio.js` pede o mesmo arquivo ao TSE no navegador e,
 * se ele responder, troca os números e diz a hora; sem resposta, fica o do
 * build com a data da coleta (decisão do Peter, 26/10/2026).
 *
 * Município sem par no TSE (instalado depois da eleição): nota, nunca zero.
 */
export default function SecaoEleicoes(
  { c, ele, coleta }: { c: Contexto; ele: EleicaoDoMunicipio | null; coleta: string },
) {
  const { m, estilos } = c;
  if (!ele) {
    return (
      <section className={estilos.texto} id="eleicoes-2026">
        <h2>Eleições 2026 em {m.nome}</h2>
        <p>
          O TSE não publica resultado separado para {m.nome} em 2026: o
          município não tem código correspondente na tabela de municípios da
          eleição. O resultado nacional e por estado está na{" "}
          <a href={CAMINHO}>página das eleições</a>.
        </p>
      </section>
    );
  }
  return (
    <section className={`${estilos.texto} ${paleta.paleta}`} id="eleicoes-2026" data-eleicao-municipio>
      <h2>Eleições 2026 em {m.nome}</h2>
      <p>
        Resultado oficial do TSE no município, com o percentual como o TSE o
        publica (sobre os votos de todos os candidatos). País e estados na{" "}
        <a href={CAMINHO}>página das eleições</a>; a prorrogação de 25/10 e a
        consulta de seção em <a href={`${CAMINHO_DADOS}#prorrogacao`}>todos os dados</a>.
      </p>
      {ele.cargos.map((g) => {
        // A barra escala pela maior fatia do cargo (`numeros-publicos-desenho.md`,
        // "Barra em tabela"); o JS ao vivo refaz a largura com o número do TSE.
        const maior = Math.max(...g.linhas.map((l) => l.pct ?? 0));
        return (
        <div key={g.chave} data-cargo={g.chave} data-url={urlMunicipio(g.chave, ele.uf, ele.tse)}>
          <h3 className={est.cargo}>{g.cargo}, {g.turno}º turno ({dataDoTurno(g.turno)})</h3>
          <table className={est.tabela}>
            <caption className="so-leitor">
              {g.cargo}, {g.turno}º turno, em {m.nome}: votos e percentual dos válidos
            </caption>
            <thead>
              <tr>
                <th scope="col">Candidato</th>
                <th scope="col">Votos</th>
                <th scope="col">%</th>
                <th scope="col" className={est.colBarra}><span className="so-leitor">Barra</span></th>
              </tr>
            </thead>
            <tbody>
              {g.linhas.map((l) => (
                <tr key={l.n} data-n={l.n}>
                  <th scope="row">{l.nome} <span className={est.partido}>({l.partido})</span></th>
                  <td data-v>{br(l.votos)}</td>
                  <td data-p>{l.pct === null ? "anulado" : `${br(l.pct, 2)}%`}</td>
                  <td className={est.colBarra} aria-hidden="true">
                    {/* Anulado não tem barra: um filete diria 0%. */}
                    {l.pct !== null && <span className={`${est.barra} ${corDe(g.chave, l.partido)}`} data-b
                      style={{ width: `${maior > 0 ? (l.pct / maior) * 100 : 0}%` }} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={est.rodape}>
            Comparecimento <span data-c>{br(g.comparecimento)}</span> de{" "}
            <span data-te>{br(g.eleitorado)}</span> eleitores; brancos{" "}
            <span data-vb>{br(g.brancos)}</span>, nulos <span data-vn>{br(g.nulos)}</span>.
          </p>
        </div>
        );
      })}
      <p className={est.rodape} role="status" aria-atomic="true" data-eleicao-status>
        Dados do TSE coletados em {coleta}.
      </p>
      <script type="module" src="/eleicoes-municipio.js" />
    </section>
  );
}

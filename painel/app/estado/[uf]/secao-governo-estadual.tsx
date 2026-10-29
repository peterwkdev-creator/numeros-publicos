import ComposicaoBarras from "../../componentes/composicao-barras";
import Termo from "../../componentes/termo";
import { br, dataCurta, escala, escalaDaTabela } from "../../../lib/dados";
import { emContracao } from "../../../lib/estado";
import {
  FUNCOES_DA_SERIE, fatiasDoAno, serieDaFuncao, ultimoAno,
} from "../../../lib/estados-fiscal";
import { brLimite } from "../../../lib/titulo";
import type { Contexto } from "./contexto";

/**
 * As contas do próprio governo estadual (SICONFI, RREO 02 e RGF 01), ao lado
 * das seções que somam os municípios e nunca somadas a elas: ver o topo de
 * `lib/estados-fiscal.ts`. Espec: `especs/painel-fiscal-estados.md`.
 */
export default function SecaoGovernoEstadual({ c }: { c: Contexto }) {
  const { governo, estadosFiscal: snap, de, estilos } = c;
  if (!governo) return null;

  const anoPessoal = ultimoAno(governo.pessoal);
  const pessoal = anoPessoal !== null ? governo.pessoal[String(anoPessoal)] : null;
  const anoFuncoes = ultimoAno(governo.funcoes);
  const barras = anoFuncoes !== null ? fatiasDoAno(snap, governo, anoFuncoes) : null;
  const series = FUNCOES_DA_SERIE.map((nome) => ({
    nome, serie: serieDaFuncao(snap, governo, nome),
  }));
  // As linhas da tabela: os anos do arquivo, do mais velho ao mais novo.
  const anos = [...snap.exercicios].sort((a, b) => a - b);
  // Uma unidade para a tabela inteira, no cabeçalho (`escalaDaTabela`).
  const reais = escalaDaTabela(series.flatMap(({ serie }) => serie.map((p) => p?.valor)));

  return (
    <section className={estilos.texto} id="governo-estadual">
      <h2>As contas do governo {de}</h2>
      {/* O Distrito Federal não tem municípios: presta contas ao Tesouro como
          estado (`comoEstado`), as seções acima não têm a conta dele e não há
          repasse a municípios a contar duas vezes. */}
      {c.r.comoEstado > 0 ? (
        <p>
          O Distrito Federal não se divide em municípios: o governo distrital
          faz o papel de estado e de prefeitura e presta contas ao Tesouro
          Nacional como estado. Esta seção traz essas contas, como ele mesmo
          as declarou.
        </p>
      ) : (
        <p>
          Até aqui, a página somou os municípios. Esta seção é do{" "}
          <strong>governo estadual</strong>, como ele mesmo declarou ao Tesouro
          Nacional. Os dois não se somam: parte do que o estado gasta é dinheiro
          transferido aos municípios (a cota deles no ICMS e no IPVA, convênios,
          repasses da saúde), que o município gasta de novo, e a soma contaria
          esse dinheiro duas vezes.
        </p>
      )}
      {pessoal && anoPessoal !== null && (() => {
        const [rcl, despesa, percentual, prudencial, legal] = pessoal;
        const situacao = percentual > legal
          ? <>acima do teto</>
          : percentual > prudencial
            ? <>acima do limite prudencial, abaixo do teto</>
            : <>abaixo do limite prudencial</>;
        return (
          <p>
            Em {anoPessoal}, o Poder Executivo {de} gastou{" "}
            <strong>{escala(despesa).curto}</strong> com pessoal:{" "}
            <strong className="tabular">{br(percentual, 2)}%</strong> da
            receita corrente líquida ajustada, de {escala(rcl).curto}. A Lei
            de Responsabilidade Fiscal fixa <strong>{brLimite(legal)}%</strong>{" "}
            como teto para o Executivo {c.r.comoEstado > 0 ? "distrital" : "estadual"} e{" "}
            <strong>{brLimite(prudencial)}%</strong> como{" "}
            <Termo chave="limite-prudencial">limite prudencial</Termo>: o
            governo {de} ficou <strong>{situacao}</strong>.
            {legal < 49 && (
              <>
                {" "}O teto é menor que os 49% dos outros estados porque{" "}
                {emContracao(de)} há tribunal de contas dos municípios, cuja
                parte sai da do Executivo (LRF, art. 20, §4º).
              </>
            )}
          </p>
        );
      })()}
      <div className={`${estilos.rolagem} rola-x`}>
        <table className={estilos.lista}>
          <caption>
            O governo {de} ano a ano: a despesa liquidada em{" "}
            {FUNCOES_DA_SERIE.join(", ").toLowerCase().replace(/, ([^,]*)$/, " e $1")}{" "}
            e o gasto do Executivo com pessoal, em % da receita corrente
            líquida ajustada
          </caption>
          <thead>
            <tr>
              <th scope="col">Ano</th>
              {series.map(({ nome }) => (
                <th key={nome} scope="col" className={estilos.num}>{nome} ({reais.unidade})</th>
              ))}
              <th scope="col" className={estilos.num}>Pessoal (% da receita)</th>
            </tr>
          </thead>
          <tbody>
            {anos.map((ano, i) => {
              const p = governo.pessoal[String(ano)];
              return (
                <tr key={ano}>
                  <th scope="row">{ano}</th>
                  {series.map(({ nome, serie }) => (
                    <td key={nome} title={escala(serie[i]?.valor).exato}>{reais.numero(serie[i]?.valor)}</td>
                  ))}
                  <td>{p ? `${br(p[2], 2)}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {barras && anoFuncoes !== null && (
        <>
          <p>
            No ano inteiro de {anoFuncoes}, o governo {de} liquidou{" "}
            <strong>{escala(barras.total).curto}</strong> de despesa. Para
            onde foi:
          </p>
          <div className={`${estilos.rolagem} rola-x`}>
            <ComposicaoBarras
              fatias={barras.fatias}
              total={barras.total}
              municipio={governo.nome}
              legenda="Despesa liquidada por função pelo governo"
              local={`${de}, em ${anoFuncoes}`}
            />
          </div>
        </>
      )}
      <p className={estilos.ressalva}>
        Valores nominais, sem descontar a inflação. A despesa por função é a
        do ano inteiro (6º bimestre); a de pessoal, a do Poder Executivo no
        3º quadrimestre, com os limites que o próprio relatório declara.
        Travessão: ano sem o dado. Fontes: {snap.fonte.funcoes};{" "}
        {snap.fonte.pessoal}. Coletado em {dataCurta(snap.coletadoEm)}.
      </p>
    </section>
  );
}

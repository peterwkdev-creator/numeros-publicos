import FonteGrafico from "../../componentes/fonte-grafico";
import Termo from "../../componentes/termo";
import { br, dataCurta, escalaComSinal, escalaDaTabela } from "../../../lib/dados";
import { anosDoEixo, escala, type SerieBrasil } from "../../../lib/brasil";
import {
  anosEmTexto, emAnos, fatorIpca, governoEm31, linhasDe, notaDoLimite, temDado,
  type DividaEstado, type LinhaDivida, type MandatoEstado, type SnapshotDivida,
} from "../../../lib/divida";
import desenho from "./secao-divida.module.css";
import type { Contexto } from "./contexto";

/**
 * A dívida do governo estadual (SICONFI, RGF Anexo 02, 3º quadrimestre), logo
 * depois das contas dele e, como elas, nunca somada aos municípios. Espec:
 * `especs/numeros-publicos-divida-estados.md`, §7.1; o contrato com o arquivo
 * e as contas puras estão em `lib/divida.ts`.
 *
 * ## O que o desenho se recusa a fazer
 *
 * - **Semáforo.** A série tem uma cor só; "acima do limite" vai escrito, e só
 *   quando o % declarado passa o limite declarado do mesmo ano.
 * - **Limite constante.** A linha é o limite que o relatório declara em cada
 *   ano (90% em Roraima, ~170% em São Paulo em 2025), com nota abaixo.
 * - **Interpolar o ano sem dívida líquida publicada.** A linha quebra (Amapá,
 *   2017: o RGF saiu sem a DCL nem o %).
 * - **Faixa de quem já tinha saído.** Cada ano leva a faixa de quem governava
 *   em 31/12, o dia do ponto; quem passou pelo cargo entre dois 31/12 está
 *   só na tabela "Quem governava", com as datas exatas (decisão de
 *   27/10/2026; espec §6.3). Nome digitado à mão, nunca: vem do
 *   `estados_mandatos.csv`, validado por UF.
 */

const L = 360;
const A = 206;
// O topo guarda as duas linhas dos nomes de quem governava, acima das faixas.
const M = { topo: 30, base: 18, esq: 38, dir: 8 };
const FONTE = 10;
/** A largura média de um caractere, em fração do corpo (a do `/brasil/`). */
const CARACTERE = 0.56;

/** % com o sinal tipográfico: a DCL pode ser negativa (RO, AP). */
const pct = (v: number) => (v < 0 ? `−${br(-v, 2)}%` : `${br(v, 2)}%`);

export default function SecaoDivida({
  c, snap, estado, ipca, governadores,
}: {
  c: Contexto;
  snap: SnapshotDivida;
  estado: DividaEstado | null;
  /** O número-índice do IPCA (`auxiliares` do `brasil.json`). */
  ipca: SerieBrasil | null;
  /** Quem governava o estado desde 2015 (`estados-governadores.json`). */
  governadores: MandatoEstado[];
}) {
  if (!estado) return null;
  const { de, estilos } = c;
  const linhas = linhasDe(snap, estado);
  const comDado = linhas.filter(temDado);
  const ultima = comDado[comDado.length - 1];
  if (!ultima) return null;
  // Reais de dezembro do último ano da série, e não do último deste estado:
  // a coluna tem o mesmo poder de compra nas 27 páginas.
  const ate = Math.max(...snap.exercicios);
  // Uma unidade para a tabela inteira, no cabeçalho (`escalaDaTabela`).
  const reais = escalaDaTabela(comDado.flatMap((l) => {
    const f = fatorIpca(ipca, l.ano, ate);
    return [l.dc, l.deducoes, l.dcl, l.receita, f === null ? null : l.dcl * f];
  }));
  const nota = notaDoLimite(linhas);
  const acima = comDado.filter((l) => l.percentual > l.limite);
  const semDado = linhas.filter((l) => !temDado(l)).map((l) => l.ano);
  const ajustada = comDado.filter((l) => l.base === "rclAjustada").map((l) => l.ano);

  return (
    <section className={estilos.texto} id="divida">
      <h2>A dívida do governo {de}</h2>
      {ultima.dcl >= 0 ? (
        <p>
          Em 31/12/{ultima.ano}, o governo {de} devia{" "}
          <strong>{escalaComSinal(ultima.dcl).curto}</strong>, já descontado o
          dinheiro em caixa. Isso é{" "}
          <strong className="tabular">{pct(ultima.percentual)}</strong> da{" "}
          <Termo chave="rcl">receita</Termo> do ano
          {ultima.percentual >= 100 ? (
            <>
              , ou{" "}
              <strong className="tabular">{br(ultima.percentual / 100, 2)} vezes</strong>{" "}
              o que ele arrecada em 12 meses
            </>
          ) : null}
          .
        </p>
      ) : (
        <p>
          Em 31/12/{ultima.ano}, o governo {de} tinha mais em caixa e a receber
          do que devia: <strong>{escalaComSinal(-ultima.dcl).curto}</strong> a
          mais. Por isso a <Termo chave="divida-liquida">dívida líquida</Termo>{" "}
          é negativa:{" "}
          <strong className="tabular">{pct(ultima.percentual)}</strong> da{" "}
          <Termo chave="rcl">receita</Termo> do ano.
        </p>
      )}
      {acima.length > 0 && (
        <p>
          {acima.length === 1 ? "Ano" : "Anos"} em que a dívida líquida passou
          do <Termo chave="limite-do-senado">limite</Termo> que o próprio
          relatório declara:{" "}
          {acima.map((l, i) => (
            <span key={l.ano}>
              {i > 0 && (i === acima.length - 1 ? " e " : "; ")}
              {l.ano} (<span className="tabular">{pct(l.percentual)}</span> da
              receita, para um limite de {br(l.limiteDeclarado, 0)}%)
            </span>
          ))}
          .
        </p>
      )}

      <figure className={desenho.figura}>
        <Grafico linhas={linhas} de={de} governadores={governadores} />
        <figcaption className={desenho.legenda}>
          <p>
            Linha tracejada: limite fixado pelo Senado; mais fina, o limite de
            alerta da Lei de Responsabilidade Fiscal, a 90% dele.
            {governadores.length > 0 && (
              <> Faixas ao fundo: quem governava em 31/12 de cada ano, o dia
                do ponto; todos os que passaram pelo cargo, com as datas, estão
                na tabela <a href="#quem-governava">Quem governava</a>.</>
            )}
          </p>
          {nota.map((g) => (
            <p key={g.limite}>
              {emAnos(g.anos)}, o relatório do governo {de} declara o
              limite em {br(g.limite, 0)}% da receita, e não em 200%.
            </p>
          ))}
          {semDado.length > 0 && (
            <p>
              {emAnos(semDado)}, não há dívida líquida publicada pelo
              governo {de}: a linha fica interrompida.
            </p>
          )}
          <FonteGrafico
            fonte={`${snap.fonte}; coletado em ${dataCurta(snap.coletadoEm)}`}
          />
        </figcaption>
      </figure>

      <div className={`${estilos.rolagem} rola-x`}>
        <table className={estilos.lista}>
          <caption>
            A dívida do governo {de} em 31/12 de cada ano, em valores
            nominais; a última coluna, em reais de dezembro de {ate},
            corrigidos pelo IPCA (IBGE)
          </caption>
          <thead>
            <tr>
              <th scope="col">Ano</th>
              <th scope="col" className={estilos.num}>Dívida total ({reais.unidade})</th>
              <th scope="col" className={estilos.num}>Descontos (caixa e créditos, {reais.unidade})</th>
              <th scope="col" className={estilos.num}>Dívida líquida ({reais.unidade})</th>
              <th scope="col" className={estilos.num}>Receita corrente líquida ({reais.unidade})</th>
              <th scope="col" className={estilos.num}>Dívida líquida ÷ receita</th>
              <th scope="col" className={estilos.num}>Dívida líquida em {reais.unidade} de dez/{ate}</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              if (!temDado(l)) {
                return (
                  <tr key={l.ano}>
                    <th scope="row">{l.ano}</th>
                    <td colSpan={6} className={desenho.semDado}>sem dado publicado</td>
                  </tr>
                );
              }
              const fator = fatorIpca(ipca, l.ano, ate);
              return (
                <tr key={l.ano}>
                  <th scope="row">{l.ano}</th>
                  <td title={escalaComSinal(l.dc).exato}>{reais.numero(l.dc)}</td>
                  <td title={escalaComSinal(l.deducoes).exato}>{reais.numero(l.deducoes)}</td>
                  <td title={escalaComSinal(l.dcl).exato}>{reais.numero(l.dcl)}</td>
                  <td title={escalaComSinal(l.receita).exato}>{reais.numero(l.receita)}</td>
                  <td>{pct(l.percentual)}</td>
                  <td>{fator === null ? "—" : reais.numero(l.dcl * fator)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <dl className={desenho.rotulos}>
        <dt><Termo chave="divida-consolidada">Dívida total</Termo></dt>
        <dd>
          Tudo o que o governo deve com prazo acima de 1 ano: empréstimos,
          renegociações, parcelamentos, precatórios vencidos.
        </dd>
        <dt>Descontos (caixa e créditos)</dt>
        <dd>
          Dinheiro em caixa e valores a receber, que a lei desconta da dívida.
        </dd>
        <dt><Termo chave="divida-liquida">Dívida líquida</Termo></dt>
        <dd>
          A dívida total menos os descontos; é a que a lei limita.
        </dd>
        <dt><Termo chave="rcl">Receita corrente líquida</Termo></dt>
        <dd>
          O que o estado arrecada em 12 meses, já descontado o que repassa por
          lei aos municípios.
          {ajustada.length > 0 && ajustada.length < comDado.length && (
            <> É a receita sobre a qual o relatório calcula o percentual: a
              ajustada em {anosEmTexto(ajustada)}, e a sem ajuste antes.</>
          )}
        </dd>
        <dt><Termo chave="limite-do-senado">Dívida líquida ÷ receita</Termo></dt>
        <dd>
          Quantas vezes a receita de um ano a dívida líquida representa; o
          limite do Senado é 200%.
        </dd>
        <dt><Termo chave="ipca">Em reais de dez/{ate}</Termo></dt>
        <dd>
          A dívida líquida de cada ano em reais de dezembro de {ate},
          corrigidos pelo IPCA (IBGE): o índice de dezembro de {ate} dividido
          pelo de dezembro do ano.
        </dd>
      </dl>
      <FonteGrafico
        fonte={`${snap.fonte}; IPCA, número-índice (IBGE, SIDRA 1737)`}
        periodo={`coletados em ${dataCurta(snap.coletadoEm)}${
          ipca ? ` e ${dataCurta(ipca.coletadoEm)}` : ""}`}
      />
      <QuemGovernava de={de} governadores={governadores} estilos={estilos} />
    </section>
  );
}

/**
 * O `<svg>`: o % declarado por ano, o limite e o alerta de cada ano em
 * degraus, e as faixas de quem governava em 31/12. Cada ponto de 31/12 fica no
 * meio do seu ano; o ano sem relatório deixa o vão e quebra as três linhas.
 */
function Grafico({ linhas, de, governadores }: {
  linhas: ReturnType<typeof linhasDe>;
  de: string;
  governadores: MandatoEstado[];
}) {
  const comDado = linhas.filter(temDado);
  const primeiro = linhas[0]!.ano;
  const ultimo = linhas[linhas.length - 1]!.ano;
  const x = (t: number) =>
    M.esq + ((t - primeiro) * (L - M.esq - M.dir)) / (ultimo + 1 - primeiro);
  // Os limites e o zero entram na escala: a régua nunca fica cortada.
  const { baixo, alto, marcas } = escala([
    0, ...comDado.flatMap((l) => [l.percentual, l.limite, l.alerta]),
  ]);
  const y = (v: number) => M.topo + ((alto - v) / (alto - baixo)) * (A - M.topo - M.base);
  const f = (n: number) => n.toFixed(2);

  // Um traço por trecho contínuo: `M` onde o ano anterior não tem dado.
  const segue = (l: LinhaDivida) => comDado.some((o) => o.ano === l.ano - 1);
  const serie = comDado
    .map((l) => `${segue(l) ? "L" : "M"}${f(x(l.ano + 0.5))},${f(y(l.percentual))}`)
    .join(" ");
  const degraus = (v: (l: LinhaDivida) => number) => comDado
    .map((l) => `${segue(l) ? "L" : "M"}${f(x(l.ano))},${f(y(v(l)))} L${f(x(l.ano + 1))},${f(y(v(l)))}`)
    .join(" ");

  const fs = governoEm31(governadores, primeiro, ultimo + 1);
  const menor = comDado.reduce((a, b) => (b.percentual < a.percentual ? b : a));
  const maior = comDado.reduce((a, b) => (b.percentual > a.percentual ? b : a));
  const limites = [...new Set(comDado.map((l) => Math.round(l.limiteDeclarado)))];
  const vazios = linhas.filter((l) => !temDado(l)).map((l) => l.ano);
  const p0 = comDado[0]!;
  const pN = comDado[comDado.length - 1]!;
  const rotulo =
    `Dívida líquida do governo ${de} em % da receita corrente líquida, de ` +
    `${p0.ano} a ${pN.ano}. Primeiro valor ${pct(p0.percentual)}, último ` +
    `${pct(pN.percentual)}. Menor ${pct(menor.percentual)}, em ${menor.ano}; ` +
    `maior ${pct(maior.percentual)}, em ${maior.ano}. ` +
    (vazios.length ? `Sem dívida líquida publicada em ${anosEmTexto(vazios)}. ` : "") +
    `A linha tracejada é o limite fixado pelo Senado, ` +
    (limites.length === 1
      ? `${br(limites[0]!, 0)}% da receita; `
      : "o que o relatório declara em cada ano; ") +
    "a mais fina, o limite de alerta. " +
    (fs.length
      ? "As faixas ao fundo marcam quem governava em 31/12 de cada ano: " +
        fs.map((f) => `${f.rotulo}, ${anosEmTexto(range(f.de, f.ate))}`).join("; ") + ". "
      : "") +
    "Os valores estão na tabela abaixo do gráfico.";

  return (
    <svg className={desenho.grafico} viewBox={`0 0 ${L} ${A}`} role="img" aria-label={rotulo}>
      {fs.map((b) => (
        <rect key={`f-${b.de}`} className={desenho.faixa} data-faixa={b.tom}
          x={x(b.de)} y={M.topo} width={x(b.ate) - x(b.de)} height={A - M.topo - M.base} />
      ))}

      {/* Os nomes em duas linhas, pela alternância do tom (como no
          `/brasil/`): dois vizinhos nunca dividem a linha, e o nome mais
          largo que a faixa de um ano só não cobre o do lado. */}
      {fs.map((b) => {
        const largura = b.rotulo.length * FONTE * CARACTERE;
        const meio = Math.min(
          Math.max((x(b.de) + x(b.ate)) / 2, M.esq + largura / 2),
          L - M.dir - largura / 2,
        );
        return (
          <text key={`n-${b.de}`} className={desenho.rotulo} x={meio}
            y={b.tom === 0 ? 11 : 24} textAnchor="middle" fontSize={FONTE}>
            {b.rotulo}
          </text>
        );
      })}

      {marcas.map((v) => (
        <g key={`m-${v}`}>
          <line className={v === 0 ? desenho.zero : desenho.grade}
            x1={M.esq} x2={L - M.dir} y1={y(v)} y2={y(v)} />
          <text className={desenho.eixo} x={M.esq - 4} y={y(v) + 3.5}
            textAnchor="end" fontSize={FONTE}>
            {br(v, Number.isInteger(v) ? 0 : 1)}%
          </text>
        </g>
      ))}

      {anosDoEixo([primeiro, ultimo]).map((a) => (
        <g key={`a-${a}`}>
          <line className={desenho.marca}
            x1={x(a + 0.5)} x2={x(a + 0.5)} y1={A - M.base} y2={A - M.base + 3} />
          <text className={desenho.eixo} x={x(a + 0.5)} y={A - 4}
            textAnchor="middle" fontSize={FONTE}>
            {a}
          </text>
        </g>
      ))}

      <path className={desenho.alerta} d={degraus((l) => l.alerta)} />
      <path className={desenho.limite} d={degraus((l) => l.limite)} />
      <path className={desenho.linha} d={serie} />
      {comDado.map((l) => (
        <circle key={`p-${l.ano}`} className={desenho.ponto}
          cx={x(l.ano + 0.5)} cy={y(l.percentual)} r="2.2" />
      ))}

      {/* Os rótulos das duas réguas, sobre o primeiro ano: o do limite acima
          da linha, o do alerta abaixo, para não se cobrirem. */}
      <text className={desenho.rotulo} x={M.esq + 4} y={y(p0.limite) - 4} fontSize={FONTE}>
        Limite fixado pelo Senado
      </text>
      <text className={desenho.rotulo} x={M.esq + 4} y={y(p0.alerta) + 11} fontSize={FONTE}>
        Limite de alerta (LRF)
      </text>
    </svg>
  );
}

/** Os anos de `[de, ate)`. */
const range = (de: number, ate: number) =>
  Array.from({ length: ate - de }, (_, i) => de + i);

/** O texto do link da fonte: o ano do TSE ou o endereço do site oficial. */
function nomeDaFonte(m: MandatoEstado): string {
  const ano = /candidatos-(\d{4})/.exec(m.fonte)?.[1];
  if (m.conferido === "tse" && ano) return `TSE, candidatos de ${ano}`;
  return new URL(m.fonte).hostname.replace(/^www\./, "");
}

/**
 * Todos os que passaram pelo governo desde 2015, com as datas exatas: a faixa
 * do gráfico mostra só quem estava no cargo em 31/12. O dia que não está em
 * ato oficial publicado vai marcado, e a data que só a Agência Brasil dá
 * também (`conferido`, espec §6.3).
 */
function QuemGovernava({ de, governadores, estilos }: {
  de: string;
  governadores: MandatoEstado[];
  estilos: { [k: string]: string };
}) {
  if (governadores.length === 0) return null;
  const aprox = (i: number) => governadores[i]?.conferido === "data-aproximada";
  const temAprox = governadores.some((m) => m.conferido === "data-aproximada");
  const temImprensa = governadores.some((m) => m.conferido === "imprensa-publica");
  return (
    <>
      <h3 className={estilos.subtitulo} id="quem-governava">Quem governava</h3>
      <div className={`${estilos.rolagem} rola-x`}>
        <table className={estilos.lista}>
          <caption>
            Quem chefiou o governo {de} desde 1º/1/2015: do dia em que assumiu
            ao dia em que o seguinte assumiu
          </caption>
          <thead>
            <tr>
              <th scope="col">Quem governava</th>
              <th scope="col">De</th>
              <th scope="col">Até</th>
              <th scope="col">Como</th>
              <th scope="col">Fonte</th>
            </tr>
          </thead>
          <tbody>
            {governadores.map((m, i) => (
              <tr key={m.inicio}>
                <th scope="row">{m.nome}</th>
                <td className="tabular">
                  {dataCurta(m.inicio)}{aprox(i) && <> (dia aproximado)</>}
                </td>
                <td className="tabular">
                  {m.fim === null ? "hoje" : dataCurta(m.fim)}
                  {m.fim !== null && aprox(i + 1) && <> (dia aproximado)</>}
                </td>
                <td>{m.como}</td>
                <td>
                  <a href={m.fonte} rel="noopener">{nomeDaFonte(m)}</a>
                  {m.conferido === "imprensa-publica" && <> (imprensa pública)</>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(temAprox || temImprensa) && (
        <ul className={desenho.legenda}>
          {temAprox && (
            <li>
              Dia aproximado: a troca é certa, mas o dia não está em ato
              oficial publicado; vale a data mais bem documentada.
            </li>
          )}
          {temImprensa && (
            <li>
              Imprensa pública: sem ato oficial publicado na internet, a data
              vem da Agência Brasil (EBC).
            </li>
          )}
        </ul>
      )}
    </>
  );
}

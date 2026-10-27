import Link from "next/link";
import { br, dataCurta } from "../../../lib/dados";
import { contarMetas, periodoEdicoes } from "../../../lib/ideb";
import IdebSvg from "../../componentes/ideb-svg";
import Termo from "../../componentes/termo";
import type { Contexto } from "./contexto";
import FonteGrafico from "../../componentes/fonte-grafico";

/**
 * Educação: o IDEB das duas etapas ao lado da fatia do orçamento; sem IDEB da rede municipal, a seção diz por quê.
 * Extraído de `page.tsx` em 15/10/2026 (item 19 da revisão de 11/10/2026): o HTML é o mesmo, byte a byte.
 *
 * Sem IDEB, a seção inteira sumia e a página não dizia por quê — a
 * pessoa não sabia se faltava coleta, se o município era pequeno demais
 * ou se havia outro motivo. Ausência sem explicação é a mesma falha que
 * "não entregou o relatório" tem, uma casa adiante.
 *
 * **O motivo foi verificado, não suposto.** Reingerindo o arquivo do
 * INEP com `--rede Estadual` em 04/09/2026: dos 138 municípios sem rede
 * municipal nos anos iniciais, **133 aparecem com rede estadual**. Os
 * outros 5 (RS 3, MT 1, SC 1) não aparecem em nenhuma das duas, e sobre
 * eles não se sabe — por isso o texto diz "quase sempre" e não afirma o
 * caso específico.
 */
export default function SecaoEducacao({ c }: { c: Contexto }) {
  const { snapshot, ideb, m, aberturaBimestre, iniciais, finais, medianaIniciais, medianaFinais, educacao , estilos } = c;
  if (!iniciais) {
    return (
      <section className={estilos.texto} id="educacao">
        <h2>Educação</h2>
        <p>
          O INEP publica o IDEB <strong>por rede</strong>, e não há rede
          municipal de anos iniciais em {m.nome} no dado de{" "}
          {ideb.edicoes[ideb.edicoes.length - 1]}. Quem administra essas
          escolas é outra rede — <strong>quase sempre a estadual</strong>.
        </p>
        <p className={estilos.ressalva}>
          <strong>Isto não é lacuna da coleta.</strong> É como a educação
          básica está dividida ali, e acontece em{" "}
          <strong>{br(snapshot.municipios.length - ideb.cobertura.municipios)}</strong>{" "}
          dos {br(snapshot.municipios.length)} municípios do país,
          concentrados no Sul e no Sudeste. O gasto do município com educação
          continua acima, porque ele existe mesmo onde a rede é de outro ente.
        </p>
      </section>
    );
  }
  return (
    <section className={estilos.texto} id="educacao">
      <h2>Educação: gasto e IDEB</h2>
      <p>
        {educacao && educacao.percentual !== null ? (
          <>
            {aberturaBimestre}, {m.nome} destinou{" "}
            <strong>{br(educacao.percentual, 1)}%</strong> do que gastou (despesa liquidada) à
            educação. O{" "}
            <Termo chave="ideb">
              IDEB
            </Termo>{" "}
            mede outra coisa: o aprendizado e a aprovação dos alunos, de 0
            a 10.
          </>
        ) : (
          <>
            O IDEB mede aprendizado e fluxo escolar numa escala de 0 a 10,
            por rede e por etapa.
          </>
        )}{" "}
        Abaixo, a <strong>rede municipal</strong> nos{" "}
        {iniciais.rotuloEtapa} — a que a prefeitura administra e financia.
      </p>

      <h3 className={estilos.subtitulo}>
        IDEB nos {iniciais.rotuloEtapa}, nota de 0 a 10
      </h3>

      <div className={estilos.grafico}>
        <IdebSvg trajetoria={iniciais} municipio={m.nome} />
        <FonteGrafico
          fonte={ideb.fonte}
          periodo={periodoEdicoes(iniciais)}
        >
          {ideb.coletadoEm ? `Coletado em ${dataCurta(ideb.coletadoEm)}.` : null}
        </FonteGrafico>
      </div>

      <p>
        De <strong>{br(iniciais.primeiro.observado, 1)}</strong> em{" "}
        {iniciais.primeiro.edicao} para{" "}
        <strong>{br(iniciais.ultimo.observado, 1)}</strong> em{" "}
        {iniciais.ultimo.edicao}
        {iniciais.variacao !== 0 && (
          <>
            {" "}— {iniciais.variacao > 0 ? "alta" : "queda"} de{" "}
            {br(Math.abs(iniciais.variacao), 1)} ponto
            {Math.abs(iniciais.variacao) >= 2 ? "s" : ""}
          </>
        )}
        .{" "}
        {contarMetas(iniciais).comMeta > 0 && (
          <>
            O município bateu a meta do INEP em{" "}
            <strong>
              {contarMetas(iniciais).bateu} das{" "}
              {contarMetas(iniciais).comMeta}
            </strong>{" "}
            edições que tiveram meta.
          </>
        )}
      </p>

      <div className={`${estilos.rolagem} rola-x`}>
        <table className={estilos.serie}>
          <caption className={estilos.legenda}>
            IDEB da rede municipal de {m.nome}, {iniciais.rotuloEtapa}
          </caption>
          <thead>
            <tr>
              <th scope="col">Edição</th>
              <th scope="col" className={estilos.num}>IDEB</th>
              <th scope="col" className={estilos.num}>Meta</th>
              <th scope="col">Situação</th>
            </tr>
          </thead>
          <tbody>
            {iniciais.pontos.map((p) => (
              <tr key={p.edicao}>
                <th scope="row">{p.edicao}</th>
                <td className={`${estilos.num} tabular`}>
                  {br(p.observado, 1)}
                </td>
                <td className={`${estilos.num} tabular`}>
                  {p.projecao === null ? "—" : br(p.projecao, 1)}
                </td>
                <td>
                  {p.bateuMeta === null
                    ? "sem meta"
                    : p.bateuMeta
                      ? "atingiu a meta"
                      : "abaixo da meta"}
                  {p.ressalva && (
                    <>
                      {" "}
                      <span className={estilos.marca} title={p.ressalva}>
                        com ressalva do INEP
                      </span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {finais && (
        <>
          <h3 className={estilos.subtitulo}>
            IDEB nos {finais.rotuloEtapa}, nota de 0 a 10
          </h3>
          <p>
            A mesma rede saiu de{" "}
            <strong>{br(finais.primeiro.observado, 1)}</strong> em{" "}
            {finais.primeiro.edicao} para{" "}
            <strong>{br(finais.ultimo.observado, 1)}</strong> em{" "}
            {finais.ultimo.edicao}
            {finais.variacao !== 0 && (
              <>
                {" "}— {finais.variacao > 0 ? "alta" : "queda"} de{" "}
                {br(Math.abs(finais.variacao), 1)} ponto
                {Math.abs(finais.variacao) >= 2 ? "s" : ""}
              </>
            )}
            .{" "}
            {contarMetas(finais).comMeta > 0 && (
              <>
                Bateu a meta em{" "}
                <strong>
                  {contarMetas(finais).bateu} das{" "}
                  {contarMetas(finais).comMeta}
                </strong>{" "}
                edições que tiveram meta.
              </>
            )}
          </p>

          {/* Gráfico SEPARADO, e não uma segunda linha no gráfico de cima.
              As duas etapas têm provas e escalas próprias, e as
              medianas dos dois conjuntos ficam a mais de um ponto de
              distância -- diferença de instrumento, não de desempenho. Duas
              linhas no mesmo eixo convidariam exatamente a leitura errada
              -- "os anos finais são piores" --, que é a mesma classe do
              erro do Tesouro Selic: grandezas diferentes na mesma régua.

              Desde 15/10/2026 cada gráfico ajusta o eixo aos próprios
              valores (`eixoJusto`, preso entre 0 e 10, vão mínimo de 2):
              cada um se lê contra a sua meta, pelas marcas escritas. */}
          <div className={estilos.grafico}>
            <IdebSvg trajetoria={finais} municipio={m.nome} />
            <FonteGrafico
              fonte={ideb.fonte}
              periodo={periodoEdicoes(finais)}
            >
              {ideb.coletadoEm ? `Coletado em ${dataCurta(ideb.coletadoEm)}.` : null}
            </FonteGrafico>
          </div>

          <p className={estilos.ressalva}>
            As duas etapas <strong>não se comparam entre si</strong> — têm
            provas e escalas próprias, e por isso aparecem em gráficos
            separados.
            {medianaIniciais && medianaFinais && (
              <>
                {" "}Entre os municípios cobertos, a mediana de{" "}
                {medianaIniciais.edicao} é{" "}
                <strong>{br(medianaIniciais.mediana, 1)}</strong> nos anos
                iniciais e <strong>{br(medianaFinais.mediana, 1)}</strong>{" "}
                nos finais: a diferença é do instrumento, não um veredito
                sobre os alunos mais velhos.
              </>
            )}
          </p>
        </>
      )}


      {ideb.edicoesSemMeta.length > 0 && (
        <p className={estilos.ressalva}>
          <strong>Sem meta</strong> em {new Intl.ListFormat("pt-BR").format(ideb.edicoesSemMeta.map(String))}{" "}
          porque o INEP não publicou uma: 2005 é a linha de base, e o
          primeiro ciclo do IDEB encerrou em 2021, com as novas metas ainda
          em definição (Portaria MEC 26/2024). Travessão aqui é ausência de
          alvo, não alvo não atingido.
        </p>
      )}

      <p className={estilos.ressalva}>
        Gasto e nota estão lado a lado porque{" "}
        <strong>nenhuma das duas fontes os publica juntos</strong> — não
        porque um explique o outro. Quanto um município gasta e o que os
        seus alunos aprendem dependem de muita coisa que não está nesta
        página.{" "}
        <Link href="/ajuda/#ideb">O que é o IDEB?</Link>
      </p>
    </section>
  );
}

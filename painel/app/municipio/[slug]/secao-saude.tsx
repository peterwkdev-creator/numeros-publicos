import { br, dataCurta } from "../../../lib/dados";
import { deEstado } from "../../../lib/estado";
import Termo from "../../componentes/termo";
import SaudeSvg, { ANO_DO_PISO_CHEIO, PISO } from "./saude-svg";
import type { Contexto } from "./contexto";

/**
 * A aplicação em saúde (SIOPS), 26 exercícios.
 * Extraído de `page.tsx` em 15/10/2026 (item 19 da revisão de 11/10/2026): o HTML é o mesmo, byte a byte.
 */
export default function SecaoSaude({ c }: { c: Contexto }) {
  const { m, uf, saude , estilos } = c;
  if (!(saude)) return null;
  return (
    <section className={estilos.texto} id="saude">
      {/* A série mais longa do site: 26 exercícios, contra 15 quadrimestres
          do gasto com pessoal e 6 exercícios da despesa por função.
          O que esta fonte dá é NÍVEL e TRAJETÓRIA, não denúncia -- medido
          em 08/09/2026: só 6 municípios do país ficaram abaixo do mínimo em
          2025, e uma lista de seis nomes é anedota, não panorama. Em 2004,
          primeiro ano em que os 15% valeram cheios, eram 737. */}
      <h2>Quanto {m.nome} aplica em saúde, e como isso mudou em 26 anos</h2>
      <p>
        Em {saude.ultimo[0]}, {m.nome} aplicou{" "}
        <strong className="tabular">{br(saude.ultimo[1], 2)}%</strong> da
        receita própria de impostos em ações e serviços de saúde
        {saude.primeiro[0] < saude.ultimo[0] && (
          <>
            {" "}— em {saude.primeiro[0]} eram{" "}
            <span className="tabular">{br(saude.primeiro[1], 2)}%</span>
          </>
        )}
        .{" "}
        {/* O piso muda com o ano, e a frase precisa dizer qual. Comparar a
            série inteira contra 15% acusaria o município de descumprir uma
            regra que só passou a valer em 2004. */}
        {saude.ultimo[1] >= 15 ? (
          <>
            Está <strong>acima do <Termo chave="minimo-saude">mínimo constitucional</Termo> de 15%</strong>, que
            vale desde 2004.
          </>
        ) : (
          <>
            Está <strong>abaixo do <Termo chave="minimo-saude">mínimo constitucional</Termo> de 15%</strong>, que
            vale desde 2004.
          </>
        )}{" "}
        A Emenda Constitucional 29, de 2000, começou exigindo 7% e escalonou
        até os 15% de hoje, então os primeiros anos da série{" "}
        <strong>não se comparam a essa régua</strong>.
        {/* O terceiro número, e o que dá sentido aos outros dois: 25,14%
            sozinho não diz se é muito ou pouco. É o que a pesquisa da
            fonte apontou como o valor dela -- comparação, não denúncia.
            A mediana é do MESMO ano, não da série inteira. */}
        {saude.medianaUf !== null && uf && (
          <>
            {" "}
            A mediana {deEstado(m.uf)} no mesmo ano foi{" "}
            <strong className="tabular">{br(saude.medianaUf, 2)}%</strong>,
            então {m.nome} aplica{" "}
            <strong>
              {Math.abs(saude.ultimo[1] - saude.medianaUf) < 0.005
                ? "praticamente o mesmo que a metade dos municípios do estado"
                : saude.ultimo[1] > saude.medianaUf
                  ? `mais que a metade dos municípios do estado`
                  : `menos que a metade dos municípios do estado`}
            </strong>
            {Math.abs(saude.ultimo[1] - saude.medianaUf) >= 0.005 && (
              <>
                {" "}— uma diferença de{" "}
                <span className="tabular">
                  {br(Math.abs(saude.ultimo[1] - saude.medianaUf), 2)}
                </span>{" "}
                ponto{Math.abs(saude.ultimo[1] - saude.medianaUf) >= 2 ? "s" : ""}
              </>
            )}
            .
          </>
        )}
      </p>
      <div className={estilos.grafico}>
        <SaudeSvg pontos={saude.pontos} municipio={m.nome} />
      </div>
      {/* A tabela que o texto do gráfico promete. Até 11/10/2026 ele dizia
          "os mesmos valores estão na tabela abaixo" e não havia tabela: o
          eixo não tem número, e quem quisesse o valor de um ano não tinha
          onde ler. A marca segue a régua do gráfico, 15% desde 2004. */}
      <div className={estilos.rolagem}>
        <table className={estilos.serie}>
          <caption className={estilos.legenda}>
            Recursos próprios aplicados em saúde por {m.nome}, em % da
            receita própria de impostos, ano a ano. Fonte: {saude.fonte}.
          </caption>
          <thead>
            <tr>
              <th scope="col">Ano</th>
              <th scope="col" className={estilos.num}>Aplicado em saúde</th>
            </tr>
          </thead>
          <tbody>
            {saude.pontos.map(([ano, v]) => (
              <tr key={ano}>
                <th scope="row">{ano}</th>
                <td className={`${estilos.num} tabular`}>
                  {br(v, 2)}%
                  {ano >= ANO_DO_PISO_CHEIO && v < PISO && (
                    <span className={estilos.marca}> abaixo do mínimo</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={estilos.ressalva}>
        {saude.rotulo}. Fonte: {saude.fonte}
        {saude.coletadoEm ? `, coleta de ${dataCurta(saude.coletadoEm)}` : ""}.
      </p>
    </section>
  );
}

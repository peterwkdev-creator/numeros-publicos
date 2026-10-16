import type { Contexto } from "./contexto";

/**
 * Posso usar estes dados?
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoLicenca({ ctx }: { ctx: Contexto }) {
  const { estilos } = ctx;
  return (
    <section className={estilos.bloco} id="licenca">
      <h2>Posso usar estes dados?</h2>
      <p>
        Sim, e cada fonte diz em que termos. Os dados não são deste site: são
        de quem os publica, e é a licença de cada um que vale.
      </p>
      <ul className={estilos.lista}>
        <li>
          <strong>SICONFI/Tesouro Nacional</strong> (gasto com pessoal,
          despesa por função e receita): publicados pelo Tesouro sob a{" "}
          <a href="https://opendatacommons.org/licenses/odbl/1-0/" rel="noopener">
            Open Database License (ODbL) 1.0
          </a>
          . A base que este site monta a partir deles, incluídas as planilhas
          para baixar, segue sob a mesma ODbL: pode usar, adaptar e
          redistribuir, citando a fonte e mantendo a licença no que publicar.
        </li>
        <li>
          <strong>IBGE e INEP</strong> (população, PIB, Censo 2022 e IDEB):
          dados abertos do governo federal, de livre utilização desde que se
          cite a fonte (Decreto 8.777/2016).
        </li>
        <li>
          <strong>SIOPS/Ministério da Saúde</strong> (aplicação em saúde): o
          Portal de Dados Abertos do SUS publica o conjunto sob a licença{" "}
          <a href="https://creativecommons.org/licenses/by-nd/3.0/deed.pt_BR" rel="noopener">
            Creative Commons Atribuição-SemDerivações 3.0
          </a>
          . O percentual de cada município aparece aqui como o SIOPS o publica.
        </li>
      </ul>
      <p>
        O código do site é outra coisa: é software livre sob{" "}
        <a href="https://www.gnu.org/licenses/agpl-3.0.html" rel="noopener">
          AGPL-3.0
        </a>
        , que vale para o programa, e não para os dados.
      </p>
      <p>
        Se for republicar, cite as fontes originais (IBGE, SICONFI/Tesouro
        Nacional, SIOPS/Ministério da Saúde e INEP), e não só este site. É
        delas que o número vem.
      </p>
    </section>
  );
}

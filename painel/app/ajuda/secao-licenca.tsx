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
        <li>
          <strong>Banco Central</strong> (Selic, câmbio, dívida, reservas,
          resultado primário e balança comercial): o portal de dados abertos
          do Banco Central publica as séries sob a{" "}
          <a href="https://opendatacommons.org/licenses/odbl/1-0/" rel="noopener">
            ODbL
          </a>
          , e o CSV de cada uma, aqui, segue sob a mesma licença.
        </li>
        <li>
          <strong>INPE</strong> (desmatamento na Amazônia Legal, PRODES): sob a{" "}
          <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.pt_BR" rel="noopener">
            Creative Commons Atribuição-CompartilhaIgual 4.0
          </a>
          . O CSV dessa série segue sob a mesma licença: cite o INPE e publique
          sob ela o que fizer a partir dele.
        </li>
        <li>
          <strong>INSS</strong> (a fila de pedidos e os indeferimentos): o
          portal de dados abertos do INSS publica os requerimentos pendentes
          sob a Creative Commons Atribuição, sem dizer a versão; o conjunto
          dos indeferidos não declara licença.
        </li>
        <li>
          <strong>Portal da Transparência/CGU</strong> (emendas
          parlamentares): o catálogo do dados.gov.br registra o conjunto sob a{" "}
          <a href="https://creativecommons.org/publicdomain/zero/1.0/deed.pt_BR" rel="noopener">
            CC0
          </a>
          , sem condição de uso.
        </li>
        <li>
          <strong>Ipea</strong> (salário mínimo real): o Ipeadata declara as
          séries de uso público, com a reprodução permitida desde que o
          Ipeadata seja citado.
        </li>
        <li>
          <strong>Novo Caged/Ministério do Trabalho e SIM/Ministério da
          Saúde</strong> (emprego com carteira e mortes por agressão): nenhuma
          licença declarada no conjunto que este site usa. São dados públicos
          do governo federal (Lei 12.527/2011); cite a fonte.
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
        Se for republicar, cite as fontes originais (a de cada número está escrita
        ao lado dele), e não só este site. É delas que o número
        vem.
      </p>
    </section>
  );
}

import { br } from "../../lib/dados";
import type { Contexto } from "./contexto";

/**
 * O que é o IDEB, e por que só a rede municipal.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoIdeb({ ctx }: { ctx: Contexto }) {
  const { snapshot, ideb, idebFinais, estilos } = ctx;
  return (
    <section className={estilos.bloco} id="ideb">
      <h2>O que é o IDEB, e por que só a rede municipal</h2>
      <p>
        O <strong>IDEB</strong> é o índice do INEP que combina duas coisas:
        quanto os alunos aprenderam (a prova do SAEB) e quantos avançaram de
        ano sem reprovar ou abandonar. Vai de <strong>0 a 10</strong>, e essa
        escala é a mesma em todo município do país. O gráfico de cada página
        ajusta o eixo aos valores daquele município, com as marcas escritas:
        para comparar duas páginas, compare os números, não a altura da
        linha.
      </p>
      <p>
        Este site publica a <strong>rede municipal</strong>, e não a rede
        &ldquo;pública&rdquo;. A diferença importa: a rede pública inclui as
        escolas <em>estaduais</em>, que a prefeitura não administra nem
        financia. Como a página mostra ao lado quanto do orçamento{" "}
        <em>municipal</em> foi para educação, usar o índice da rede pública
        creditaria à prefeitura um resultado que não é dela.
      </p>
      <p>
        As <strong>etapas são separadas e não se comparam entre si</strong>.
        Anos iniciais (1º ao 5º) e anos finais (6º ao 9º) têm provas e
        escalas próprias, e as medianas dos dois conjuntos ficam a mais de um
        ponto de distância. Um número não é &ldquo;pior&rdquo; que o outro;
        eles medem coisas diferentes.
      </p>
      <p>
        <strong>2005 e {ideb.edicoes[ideb.edicoes.length - 1]} não têm
        meta</strong>, e travessão ali é ausência de alvo, não alvo não
        atingido. 2005 é a linha de base do índice; e o primeiro ciclo do
        IDEB encerrou em 2021, com as novas metas ainda em definição
        (Portaria MEC 26/2024).
      </p>
      <p>
        Algumas edições aparecem marcadas como{" "}
        <strong>&ldquo;com ressalva do INEP&rdquo;</strong>. É o próprio INEP
        avisando que aquela média foi calculada em condição atípica — por
        exemplo, com participação inferior a 50% na prova, ou a partir de
        avaliações estaduais por extravio das provas. O número é publicado
        como veio, com o aviso junto.
      </p>
      <p>
        Cobertura, contra os <strong>{br(snapshot.municipios.length)}</strong>{" "}
        municípios do país:
      </p>
      <ul className={estilos.lista}>
        <li>
          <strong>{br(ideb.cobertura.municipios)}</strong> têm rede municipal
          nos <strong>anos iniciais</strong> — faltam{" "}
          {br(snapshot.municipios.length - ideb.cobertura.municipios)}.
        </li>
        <li>
          <strong>{br(idebFinais.cobertura.municipios)}</strong> têm nos{" "}
          <strong>anos finais</strong> — faltam{" "}
          {br(snapshot.municipios.length - idebFinais.cobertura.municipios)},
          e essa é a diferença que surpreende: no Paraná,{" "}
          <strong>388 dos 399</strong> municípios não administram o 6º ao 9º
          ano.
        </li>
      </ul>
      <p>
        {/* "a rede é do estado" era afirmação categórica. Verificado em
            04/09/2026 reingerindo o arquivo do INEP com `--rede Estadual`:
            dos 138 sem rede municipal nos anos iniciais, 133 aparecem na
            estadual e 5 em nenhuma das duas. "Quase sempre" é o que o dado
            sustenta; "é" não era. */}
        Onde o município não administra aquela etapa, a rede é de outro ente
        — <strong>quase sempre a estadual</strong>. Conferimos: dos{" "}
        {br(snapshot.municipios.length - ideb.cobertura.municipios)} sem rede
        municipal nos anos iniciais, <strong>133 aparecem no próprio arquivo
        do INEP como rede estadual</strong>; cinco não aparecem em nenhuma das
        duas, e sobre esses não sabemos.
      </p>
      <p>
        Isso <strong>não é lacuna da coleta</strong>, e a página do município
        e a do estado dizem isso onde acontece — ver{" "}
        <a href="#faltando">meu município não aparece</a>.
      </p>
    </section>
  );
}

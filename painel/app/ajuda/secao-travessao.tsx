import { br } from "../../lib/dados";
import type { Contexto } from "./contexto";

/**
 * Por que aparece um travessão no lugar de um número.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoTravessao({ ctx }: { ctx: Contexto }) {
  const { naoInstalados, obrigados, naoPublicaram, simplificados, quadrimestre, estilos } = ctx;
  return (
    <section className={estilos.bloco} id="travessao">
      <h2>Por que aparece “—” no lugar de um número</h2>
      <p>
        Porque o dado <strong>não existe</strong> na fonte — e isso é
        diferente de ser zero.
      </p>
      <p>
        No {quadrimestre}, <strong>{br(naoPublicaram)}</strong> dos{" "}
        {br(obrigados)} municípios consultados
        {naoInstalados > 0 && " que já estavam instalados"} não têm no
        SICONFI nem o Relatório de Gestão Fiscal quadrimestral nem o
        semestral simplificado. Isso não significa que gastem zero com
        pessoal: significa que o site não tem o número. Outros{" "}
        <strong>{br(simplificados)}</strong> entregaram só o simplificado, e o
        número deles aparece normalmente (veja{" "}
        <a href="#relatorios">os relatórios fiscais</a>).
      </p>
      <p>
        Escrever “0” ali seria inventar um número, e é assim que um painel
        passa a mentir sem que ninguém perceba. O travessão é a recusa a
        fazer isso.
      </p>
      <p>
        <strong>Mas nem todo travessão quer dizer a mesma coisa</strong>, e o
        site diz qual é qual em vez de juntar os três:
      </p>
      <ul className={estilos.lista}>
        <li>
          <strong>Sem relatório entregue</strong> — perguntamos pelo
          relatório quadrimestral e pelo semestral simplificado, e nenhum dos
          dois está no SICONFI.
        </li>
        <li>
          <strong>Ainda não consultado</strong> — nós é que ainda não
          perguntamos. É afirmação sobre nós, e some quando a coleta fecha.
        </li>
        <li>
          <strong>Presta contas como estado</strong> — o ente entrega o
          relatório, só que na esfera estadual. É o caso do{" "}
          <strong>Distrito Federal</strong>, que a estatística conta como
          município mas que não é um: ele publica o Relatório de Gestão
          Fiscal como estado. Marcá-lo como “não entregou” seria acusar de
          não prestar contas quem presta.
        </li>
        <li>
          <strong>Ainda não instalado no período</strong> — o município
          existe na lista do IBGE, mas só passou a ter prefeitura depois do
          exercício do relatório. É o caso de{" "}
          <strong>Boa Esperança do Norte (MT)</strong>, instalado em
          1º de janeiro de 2025: o relatório de 2024 não tinha quem o
          entregasse.
        </li>
      </ul>
    </section>
  );
}

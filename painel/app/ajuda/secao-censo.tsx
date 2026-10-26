import type { Contexto } from "./contexto";

/**
 * Censo, PIB e as outras estatísticas do IBGE.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoCenso({ ctx }: { ctx: Contexto }) {
  const { estilos } = ctx;
  return (
    <section className={estilos.bloco} id="censo">
      <h2>Censo, PIB e as outras estatísticas do IBGE</h2>
      <ul className={estilos.lista}>
        <li>
          <strong>Censo Demográfico</strong> — a contagem de toda a
          população e de todos os domicílios, a mais recente em 2022. Conta
          as pessoas onde elas <strong>moram</strong>. Dele vêm a seção
          “Como se vive” e parte de “Trabalho e renda”.
        </li>
        <li>
          <strong>PIB</strong> — o valor de tudo o que se produziu no
          município num ano, a preços do próprio ano. O IBGE o publica com
          alguns anos de atraso, e a página diz de que ano é.{" "}
          <strong>PIB por habitante</strong> é o PIB dividido pela
          população.
        </li>
        <li>
          <strong>Cadastro Central de Empresas (Cempre)</strong> — conta
          empresas, órgãos públicos e entidades, e os empregos formais
          deles, onde a <strong>empresa</strong> está. Não inclui quem
          trabalha por conta própria sem CNPJ.
        </li>
        <li>
          <strong>PNAD Contínua</strong> — a pesquisa por amostra que mede
          o desemprego do país, dos estados e das capitais a cada
          trimestre. Não é desenhada para medir cada município.
        </li>
      </ul>
      <p>
        <strong>Não existe taxa de desemprego atual por município</strong> em
        nenhuma fonte oficial. A do Censo é de 2022, e a da PNAD mede de
        outro jeito: as duas não se comparam. E os recortes não precisam
        bater: o Censo conta quem mora no município; o cadastro de empresas
        e o Caged, quem trabalha numa empresa dele. Numa cidade vizinha de um
        polo, muita gente trabalha fora.
      </p>
    </section>
  );
}

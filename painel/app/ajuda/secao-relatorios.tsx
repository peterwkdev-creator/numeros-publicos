import { br } from "../../lib/dados";
import type { Contexto } from "./contexto";

/**
 * Os relatórios fiscais: RGF, RREO e o SICONFI.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoRelatorios({ ctx }: { ctx: Contexto }) {
  const { fiscal, simplificados, estilos } = ctx;
  return (
    <section className={estilos.bloco} id="relatorios">
      <h2>Os relatórios fiscais: RGF, RREO e o SICONFI</h2>
      <p>
        A Lei de Responsabilidade Fiscal obriga todo município a publicar
        dois relatórios e a entregá-los ao <strong>SICONFI</strong>, o
        sistema do Tesouro Nacional. É de lá que vêm os números fiscais deste
        site, como o próprio município os declarou.
      </p>
      <ul className={estilos.lista}>
        <li>
          <strong>RGF, o Relatório de Gestão Fiscal</strong> — a cada{" "}
          <strong>quadrimestre</strong> (janeiro a abril, maio a agosto,
          setembro a dezembro). Traz a despesa com pessoal e a compara com
          os limites da lei. O município com menos de 50 mil habitantes pode
          optar por publicá-lo a cada <strong>semestre</strong>, numa versão
          simplificada (art. 63 da lei).{" "}
          Para quem optou pelo semestral, o site lê o{" "}
          <strong>do 2º semestre</strong>, que cobre os mesmos 12 meses do 3º
          quadrimestre: foram <strong>{br(simplificados)}</strong> municípios
          em {fiscal.exercicio}. Nos dois primeiros quadrimestres eles ficam
          sem ponto na série, porque nenhum semestre coincide com eles.
        </li>
        <li>
          <strong>RREO, o Relatório Resumido da Execução
          Orçamentária</strong> — a cada <strong>bimestre</strong>, com a
          receita e a despesa acumuladas desde janeiro. Dele vêm{" "}
          <a href="#funcao">a despesa por função</a> e a composição da
          receita. O último bimestre do ano traz o ano inteiro. Quem optou
          pelo RGF semestral entrega o <strong>RREO Simplificado</strong>,
          que continua bimestral e tem as mesmas contas: o site lê os dois.
        </li>
      </ul>
      <p>
        Os dois são entregues em datas diferentes, e um município pode ter um
        e não o outro. Por isso cada seção da página aparece, ou some, de
        acordo com o seu próprio relatório.
      </p>
    </section>
  );
}

import type { Contexto } from "./contexto";

/**
 * O índice "Nesta página", com um link para cada seção.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function Sumario({ ctx }: { ctx: Contexto }) {
  const { estilos } = ctx;
  return (
    <nav className={estilos.sumario} aria-label="Nesta página">
      <h2>Nesta página</h2>
      <ul>
        <li><a href="#como-ler">Como ler as páginas</a></li>
        <li><a href="#travessao">Por que aparece “—” no lugar de um número</a></li>
        <li><a href="#mediana">Média, mediana e pontos percentuais</a></li>
        <li><a href="#relatorios">Os relatórios fiscais: RGF, RREO e o SICONFI</a></li>
        <li><a href="#pessoal">Gasto com pessoal, RCL e os dois limites</a></li>
        <li><a href="#implausivel">O que quer dizer “valor implausível”</a></li>
        <li><a href="#funcao">Despesa por função, e o que é “liquidada”</a></li>
        <li><a href="#comparacao">Por que a comparação é entre anos</a></li>
        <li><a href="#saude">Saúde: o mínimo da Constituição e o SIOPS</a></li>
        <li><a href="#emendas">Emendas parlamentares: o que entra na conta</a></li>
        <li><a href="#ideb">O que é o IDEB, e por que só a rede municipal</a></li>
        <li><a href="#censo">Censo, PIB e as outras estatísticas do IBGE</a></li>
        <li><a href="#caged">Emprego com carteira: o Novo Caged</a></li>
        <li><a href="#brasil">Como ler o Brasil ao longo do tempo</a></li>
        <li><a href="#ranking">Como ler o ranking do gasto com pessoal</a></li>
        <li><a href="#inss">Quanto tempo o INSS está levando</a></li>
        <li><a href="#inflacao">Os valores estão corrigidos pela inflação?</a></li>
        <li><a href="#quando">De quando são os dados</a></li>
        <li><a href="#faltando">Meu município não aparece</a></li>
        <li><a href="#cobertura">Quais municípios estão cobertos</a></li>
        <li><a href="#baixar">Como baixar e abrir os dados</a></li>
        <li><a href="#licenca">Posso usar estes dados?</a></li>
        <li><a href="#erro">Achei um número errado</a></li>
        <li><a href="#outras">Onde perguntar o que este site não responde</a></li>
        <li><a href="#glossario">Glossário de A a Z</a></li>
      </ul>
    </nav>
  );
}

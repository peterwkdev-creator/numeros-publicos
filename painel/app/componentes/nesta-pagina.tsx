import e from "./nesta-pagina.module.css";

/** Uma seção que existe nesta página; `false` ou `null` é a que não existe. */
export type ItemSumario = { id: string; titulo: string } | false | null | undefined;

/**
 * O "Nesta página" das páginas longas: município e estado.
 *
 * ## O problema
 *
 * A auditoria de usabilidade de 05/10/2026 (M4) mediu a página de Fortaleza em
 * 18,6 telas no celular, com 17 seções e nenhuma âncora: quem queria "Trabalho
 * e renda" rolava 8.531 px no desktop. A /ajuda/ já tinha um sumário, e é o
 * padrão que este repete.
 *
 * ## Cada item vem da MESMA condição que mostra a seção
 *
 * As seções são condicionais (sem Censo, sem saúde, sem rede municipal), e um
 * item cuja seção não saiu seria um link para lugar nenhum, bem formado e
 * silencioso. Por isso a página passa a condição da seção, e o
 * `scripts/conferir-links.mjs` reprova, em todas as páginas, âncora sem alvo e
 * seção com `id` fora do sumário.
 *
 * Sem JavaScript: as páginas são desidratadas, e uma lista de links não
 * precisa de nenhum. Com menos de três seções não há o que resumir.
 */
export default function NestaPagina({ itens }: { itens: ItemSumario[] }) {
  const lista = itens.filter((i): i is Exclude<ItemSumario, false | null | undefined> => !!i);
  if (lista.length < 3) return null;
  return (
    <nav className={e.sumario} aria-label="Nesta página">
      <h2>Nesta página</h2>
      <ul>
        {lista.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`}>{i.titulo}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

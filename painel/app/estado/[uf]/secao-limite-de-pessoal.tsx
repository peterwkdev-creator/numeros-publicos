import Link from "next/link";
import Termo from "../../componentes/termo";
import { br } from "../../../lib/dados";
import { ROTULO_FAIXA } from "../../../lib/fiscal";
import type { Contexto } from "./contexto";

/**
 * Onde os municípios do estado estão em relação ao limite de gasto com pessoal.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoLimiteDePessoal({ c }: { c: Contexto }) {
  const { fiscal, r, de, quadrimestre, estilos } = c;
  return (
    <section className={estilos.texto} id="limite-de-pessoal">
      <h2>
        {r.comoEstado === r.uf.municipios
          ? `O limite de pessoal ${de}`
          : `Onde os municípios ${de} estão em relação ao limite`}
      </h2>
      <p>
        A Lei de Responsabilidade Fiscal fixa{" "}
        <strong>{br(fiscal.limites.legal, 2)}%</strong> da receita corrente
        líquida ajustada como <Termo chave="teto-legal">teto</Termo> para o Executivo municipal, e{" "}
        <strong>{br(fiscal.limites.prudencial, 2)}%</strong> como{" "}
        <Termo chave="limite-prudencial">limite prudencial</Termo>. No {quadrimestre}:
      </p>
      <ul className={estilos.faixas}>
        {(["acima-legal", "acima-prudencial", "abaixo", "implausivel",
          "sem-dado", "nao-consultado", "como-estado", "nao-instalado"] as const)
          // Faixa vazia não vira linha: "0 ainda não consultado" é ruído
          // depois que a varredura fecha, e some sozinho quando fecha.
          .filter((f) => r.porFaixa[f] > 0)
          .map((f) => (
          <li key={f} className={estilos[f]}>
            <strong className="tabular">{br(r.porFaixa[f])}</strong>{" "}
            {ROTULO_FAIXA[f].toLowerCase()}
          </li>
        ))}
      </ul>
      {/* O caminho para a lista NACIONAL, e só quando este estado tem
          alguém nela. Medido em 07/09/2026: a página de ranking era
          alcançável apenas da capa, e as 27 páginas de estado -- que têm
          "Acima do limite legal" como título -- não levavam a ela.

          Condicionado porque num estado sem ninguém acima do teto o link
          prometeria uma lista que não fala daquele estado. */}
      {r.porFaixa["acima-legal"] > 0 && (
        <p className={estilos.ressalva}>
          <Link href="/ranking/gasto-com-pessoal/" prefetch={false}>
            Quais municípios do país estão acima do limite
          </Link>{" "}
          — a lista nacional, na mesma coleta.
        </p>
      )}
      {/* Só quando há o que excluir. Com zero implausíveis a frase virava
          "exclui os 0 fora da faixa", que anuncia uma correção que não
          aconteceu e faz o leitor procurar um problema inexistente. */}
      {r.porFaixa.implausivel > 0 ? (
        <p className={estilos.ressalva}>
          {/* Sem número de exemplo digitado: o texto dizia "371%" e "quase
              dois pontos", verdade num caso e repetido nos 27 estados. */}
          A média acima <strong>deixa de fora {r.porFaixa.implausivel === 1
            ? "o município" : `os ${br(r.porFaixa.implausivel)} municípios`}</strong>{" "}
          com percentual impossível: fora da faixa de 0 a 100% da receita, ou
          calculado sobre uma receita corrente líquida que a declaração de
          receita do próprio município desmente. É erro de preenchimento, e um
          só pode mover a média do estado inteiro.
        </p>
      ) : r.baseMedia > 0 ? (
        <p className={estilos.ressalva}>
          Nenhum município {de} declarou percentual implausível, então a
          média acima usa {r.baseMedia === 1 ? "o único" : `todos os ${br(r.baseMedia)}`}{" "}
          que {r.baseMedia === 1 ? "entregou" : "entregaram"} o relatório.
        </p>
      ) : null}
    </section>
  );
}

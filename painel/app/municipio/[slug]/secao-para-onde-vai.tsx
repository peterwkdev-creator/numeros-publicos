import Link from "next/link";
import { br, escala } from "../../../lib/dados";
import { FUNCOES_DA_PORTARIA } from "../../../lib/fiscal";
import ComposicaoBarras from "../../componentes/composicao-barras";
import Termo from "../../componentes/termo";
import type { Contexto } from "./contexto";

/**
 * A despesa por função (RREO).
 * Extraído de `page.tsx` em 15/10/2026 (item 19 da revisão de 11/10/2026): o HTML é o mesmo, byte a byte.
 */
export default function SecaoParaOndeVai({ c }: { c: Contexto }) {
  const { fiscal, m, funcoes, bimestre, exercicioColetado, atrasado, maior , estilos } = c;
  if (!(funcoes && funcoes.fatias.length > 0)) return null;
  return (
    <section className={estilos.texto} id="para-onde-vai">
      {/* O título carrega a PERGUNTA, e não só a promessa.
          Medido em 07/09/2026: "quanto a prefeitura de X gasta com
          educação" é a única consulta desta família que ninguém responde
          bem -- o portal da própria prefeitura lista pagamentos avulsos e
          o jornal local dá a manchete, mas a fatia do orçamento não tem
          dono. É a cunha do site.
          E a página não a dizia: o título prometia ("para onde vai o
          dinheiro") e o texto respondia com precisão ("liquidou R$ 1,43
          bilhão... a maior fatia foi saúde"), mas em nenhum lugar estava
          a forma verbal que a pessoa digita.
          A frase de sempre fica; ganha a pergunta ao lado. Encher de
          palavra-chave estragaria a voz, que é o ativo -- e o concorrente
          medido no mesmo dia perde justamente por não ter voz nenhuma. */}
      <h2>Para onde vai o dinheiro: quanto {m.nome} gasta com cada área</h2>
      <p>
        No {bimestre}, {m.nome} liquidou{" "}
        <strong>{escala(funcoes.total).curto}</strong> de despesa
        {maior && maior.percentual !== null && (
          <>
            , e a maior fatia foi <strong>{maior.nome.toLowerCase()}</strong>,
            com <strong>{br(maior.percentual, 1)}%</strong> do total
          </>
        )}
        . Este é um relatório <em>diferente</em> do que traz o gasto com
        pessoal: o percentual acima responde se a folha cabe no limite, e a
        tabela abaixo responde no que o dinheiro foi gasto. Um não prevê o
        outro.
      </p>
      {atrasado && (
        <p className={estilos.ressalva}>
          <strong>
            {m.nome} não entregou o RREO de {exercicioColetado}.
          </strong>{" "}
          Os números acima são de <strong>{funcoes.exercicio}</strong>, o
          exercício mais recente que o município declarou — por isso esta
          seção mostra um ano diferente do que aparece na maioria das outras
          páginas. Não entregar não é não gastar: é não ter prestado contas
          daquele ano.
        </p>
      )}
      <div className={estilos.rolagem}>
        <ComposicaoBarras
          fatias={funcoes.fatias}
          total={funcoes.total}
          municipio={m.nome}
        />
      </div>
      {funcoes.fatias.some((x) => x.valor < 0) && (
        <p className={estilos.ressalva}>
          Com valor negativo entre as funções:{" "}
          {funcoes.fatias.filter((x) => x.valor < 0).map((x) => x.nome).join(", ")}
          . É o que {m.nome} declarou ao SICONFI no período; o painel não
          o corrige.
        </p>
      )}
      <p className={estilos.ressalva}>
        Despesa{" "}
        <Termo chave="liquidada">
          <strong>liquidada</strong>
        </Termo>{" "}
        até o bimestre — o que de fato foi gasto, não o que foi orçado nem o
        que foi <Termo chave="empenhada">empenhado</Termo>. {m.nome}{" "}
        declarou gasto em <strong>{funcoes.fatias.length}</strong> das{" "}
        {FUNCOES_DA_PORTARIA} <Termo chave="funcao">funções</Termo> previstas na Portaria MOG 42/1999, e a
        soma delas fecha com o total que o próprio município declarou.
        Fonte: {fiscal.funcoes?.fonte}.{" "}
        <Link href="/ajuda/#funcao">O que é despesa liquidada?</Link>
      </p>
    </section>
  );
}

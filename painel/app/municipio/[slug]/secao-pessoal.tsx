import Link from "next/link";
import { br, escala } from "../../../lib/dados";
import { brLimite } from "../../../lib/titulo";
import { deEstado, slugUf } from "../../../lib/estado";
import { SALTO_MINIMO } from "../../../lib/fiscal";
import Termo from "../../componentes/termo";
import type { Contexto } from "./contexto";

/**
 * O que o gasto com pessoal significa: o veredito do município (implausível, declarado, como estado, não instalado, não entregou).
 * Extraído de `page.tsx` em 15/10/2026 (item 19 da revisão de 11/10/2026): o HTML é o mesmo, byte a byte.
 */
export default function SecaoPessoal({ c }: { c: Contexto }) {
  const { fiscal, m, uf, naoEntregaramNoEstado, consultadosNoEstado, f, instaladoEm, receitaContraRcl, saltoRcl, quadrimestre, periodoRgf, aberturaRgf , estilos } = c;
  return (
    <section className={estilos.texto} id="gasto-com-pessoal">
      <h2>O que o gasto com pessoal significa aqui</h2>
      {f?.faixa === "implausivel" ? (
        <p>
          {m.nome} declarou <strong>{br(f.percentual, 2)}%</strong> da sua
          receita corrente líquida ajustada comprometidos com pessoal no{" "}
          {periodoRgf} —{" "}
          {/* Três causas, e cada uma pede a sua frase. A terceira entrou em
              22/09/2026: oito municípios com 71% a 99% declarados estavam
              no ranking de "acima do limite legal", e a frase antiga diria
              deles "mais do que toda a receita", o que é falso. */}
          {receitaContraRcl !== null && f.rclAjustada !== null ? (
            <>
              calculados sobre{" "}
              <strong>{escala(f.rclAjustada).curto}</strong> de receita
              corrente líquida, quando o próprio município declarou{" "}
              <strong>{escala(receitaContraRcl).curto}</strong> de receita
              corrente no mesmo ano,{" "}
              <strong>
                {br(receitaContraRcl / f.rclAjustada, 1)} vezes mais
              </strong>
              . No país inteiro essas duas declarações batem — a mediana da
              razão entre elas é 1,04 —, então aqui uma delas não descreve o
              município, e o percentual depende justamente da que está baixa
              demais
              {saltoRcl !== null && saltoRcl > SALTO_MINIMO &&
                f.percentual !== null && (
                <>
                  ; e o próprio percentual saltou para{" "}
                  <strong>{br(f.percentual, 2)}%</strong> vindo de uma
                  mediana de <strong>{br(f.percentual / saltoRcl, 1)}%</strong>{" "}
                  nos períodos anteriores — o salto que uma receita líquida
                  subdeclarada produz
                </>
              )}
            </>
          ) : (f.percentual ?? 0) < 0
            ? "um gasto negativo com pessoal, que nenhuma prefeitura pode ter"
            : "mais do que toda a receita do município"}
          . Isso não descreve uma prefeitura em crise: descreve um relatório
          preenchido errado.
          {receitaContraRcl === null &&
            (f.despesa ?? 0) > 0 && (f.rclAjustada ?? 0) > 0 && (
            <>
              {" "}Em reais, o relatório traz {escala(f.despesa).curto} de
              despesa sobre {escala(f.rclAjustada).curto} de receita.
            </>
          )}
          <br />
          <br />
          O número acima é <strong>o que o município enviou ao <Termo chave="siconfi">SICONFI</Termo></strong>,
          conferido linha a linha contra a API. Este painel não o corrige —
          corrigir seria inventar um valor — mas também não o apresenta como se
          fosse verdade sobre o gasto real.
        </p>
      ) : f?.percentual !== null && f?.percentual !== undefined ? (
        <p>
          {aberturaRgf}, {m.nome} declarou{" "}
          <strong>{br(f.percentual, 2)}%</strong> da sua receita corrente líquida
          ajustada comprometidos com pessoal.
          {f.simplificado && (
            <>
              {" "}O número vem do{" "}
              <Termo chave="rgf-simplificado">RGF Simplificado</Termo>, o
              relatório semestral que municípios com menos de 50 mil habitantes
              podem entregar no lugar do quadrimestral; o do 2º semestre cobre
              os mesmos 12 meses, até dezembro.
            </>
          )} A Lei de Responsabilidade Fiscal
          fixa <strong>{brLimite(fiscal.limites.legal)}%</strong> como teto para o
          Executivo municipal, e{" "}
          <strong>{brLimite(f.limitePrudencial ?? fiscal.limites.prudencial)}%</strong>{" "}
          como{" "}
          <Termo chave="limite-prudencial">
            limite prudencial
          </Termo>{" "}
          — passar dele já proíbe criar cargo, conceder aumento e contratar.
          {/* Guarda contra o relatorio inconsistente: Sao Bernardo/MA
              declarou receita AJUSTADA negativa (-R$ 208 mi) com percentual
              plausivel. Imprimir "sobre R$ -208.239.413,34 de receita"
              pareceria defeito do painel, e nao do relatorio. */}
          {(f.despesa ?? 0) > 0 && (f.rclAjustada ?? 0) > 0 ? (
            <>
              {" "}Em reais: <strong>{escala(f.despesa).curto}</strong> de
              despesa sobre <strong>{escala(f.rclAjustada).curto}</strong> de
              receita.
            </>
          ) : f.rclAjustada !== null && (f.rclAjustada ?? 0) <= 0 ? (
            <>
              {" "}Os valores em reais deste relatório são inconsistentes: a
              receita foi declarada como zero ou negativa, o que nenhum
              município pode ter. O percentual acima é o que foi publicado; os
              valores absolutos não são exibidos porque não descrevem nada.
            </>
          ) : null}
        </p>
      ) : f?.faixa === "como-estado" ? (
        // Não é ausência, e chamá-la assim é acusação sem lastro: o ente
        // entrega o Anexo 01 normalmente, na esfera em que presta contas.
        // Conferido na fonte em 04/09/2026. Ver `PRESTA_COMO_ESTADO`.
        <p>
          <strong>{m.nome} presta contas como estado</strong>, e não como
          município — o Distrito Federal não é um município, e por isso não
          entrega o Relatório de Gestão Fiscal na esfera municipal. Ele{" "}
          <strong>entrega o relatório</strong>, na esfera estadual, e este
          painel cobre municípios: por isso o número não aparece aqui.{" "}
          <em>Ausência de dado municipal não é ausência de prestação de
          contas.</em>
        </p>
      ) : f?.faixa === "nao-instalado" && instaladoEm !== undefined ? (
        // Não é ausência: até o ano da instalação não havia prefeitura para
        // entregar. Conferido no IBGE em 06/10/2026. Ver `INSTALADO_EM`.
        <p>
          <strong>{m.nome} só foi instalado em {instaladoEm}</strong>: até lá
          não havia prefeitura, e por isso não havia quem entregasse o
          Relatório de Gestão Fiscal do {quadrimestre}. O número não aparece
          aqui porque o relatório não lhe cabia.{" "}
          <em>Ausência de dado não é ausência de prestação de contas.</em>
        </p>
      ) : f?.publicou === false ? (
        <>
          <p>
            <strong>{m.nome} não entregou</strong> ao SICONFI o Relatório de
            Gestão Fiscal do {quadrimestre}, nem o RGF Simplificado do 2º
            semestre, que cobre o mesmo período. Isso não significa que o município
            gaste zero com pessoal — significa que o dado <em>não existe</em> na
            base do Tesouro Nacional. Ausência não é número, e este painel não a
            converte em um.
          </p>
          {/* A ausência sozinha parece caso isolado; com o estado ao lado,
              vira padrão — e padrão é informação. Só entra na página de quem
              não entregou, porque é sobre esse fato específico. */}
          {naoEntregaramNoEstado > 1 && consultadosNoEstado > 0 && uf && (
            <p>
              Não é um caso isolado:{" "}
              <strong>{br(naoEntregaramNoEstado)}</strong> dos{" "}
              <strong>{br(consultadosNoEstado)}</strong> municípios{" "}
              {deEstado(m.uf)} consultados também não entregaram —{" "}
              <strong>
                {br((naoEntregaramNoEstado * 100) / consultadosNoEstado, 0)}%
              </strong>
              . <Link href={`/estado/${slugUf(m.uf)}/#comparacao`} prefetch={false}>
                Como {uf.nome} se compara ao país
              </Link>.
            </p>
          )}
        </>
      ) : (
        <p>
          O Relatório de Gestão Fiscal do {quadrimestre} deste município ainda
          não foi consultado nesta rodada de coleta.
        </p>
      )}
      <p className={estilos.ressalva}>
        O percentual <strong>não é recalculado aqui</strong>: ele vem
        calculado e declarado pelo próprio município. Este painel não
        interpreta, não acusa e não declara ninguém em descumprimento —
        mostra o número publicado ao lado do teto legal.{" "}
        <Link href="/ajuda/#pessoal">O que é RCL ajustada?</Link>
      </p>
    </section>
  );
}

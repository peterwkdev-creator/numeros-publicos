import Link from "next/link";
import { br } from "../../../lib/dados";
import { deEstado } from "../../../lib/estado";
import { comSinal, contagem, nomeCompetencia } from "../../../lib/caged";
import { EMPRESAS } from "../../../lib/trabalho";
import TabelaCenso from "../../componentes/tabela-censo";
import TabelaValores from "../../componentes/tabela-valores";
import TabelaCaged from "../../componentes/tabela-caged";
import Termo from "../../componentes/termo";
import type { Contexto } from "./contexto";

/**
 * Trabalho e renda: Censo, cadastro de empresas e Novo Caged.
 * Extraído de `page.tsx` em 15/10/2026 (item 19 da revisão de 11/10/2026): o HTML é o mesmo, byte a byte.
 */
export default function SecaoTrabalho({ c }: { c: Contexto }) {
  const { caged, m, medidasTrabalho, medianasTrabalho, taxasTrabalho, renda, medianaRenda, salario, medianaSalario, medianasTrabalhoUf, medianaRendaUf, medianaSalarioUf, legendaMedianas, anoEmpresas, temCensoTrabalho, temEmpresas, cagedM , estilos } = c;
  if (!(temCensoTrabalho || temEmpresas || cagedM !== null)) return null;
  return (
    <section className={estilos.texto} id="trabalho-e-renda">
      <h2>Trabalho e renda em {m.nome}</h2>
      {temCensoTrabalho && (
        <>
          <p>
            Do <strong><Termo chave="censo">Censo de 2022</Termo></strong>, que conta as pessoas onde
            elas <strong>moram</strong>, trabalhem ali ou numa cidade
            vizinha.
          </p>
          <TabelaCenso
            medidas={medidasTrabalho}
            comparacoes={[
              ...(medianasTrabalhoUf
                ? [{ rotulo: "Mediana do estado", valores: medianasTrabalhoUf }] : []),
              { rotulo: "Mediana do país", valores: medianasTrabalho },
            ]}
            rotuloValor={m.nome}
            legenda={`${m.nome} (${m.uf}) no Censo 2022, ${legendaMedianas}`}
          />
          {renda !== null && (
            <p>
              Quem trabalhava e tinha rendimento recebia, em média,{" "}
              <strong>{"R$ "}{br(renda)} por mês</strong>, somados todos os
              trabalhos
              {medianaRenda !== null && (
                <>
                  {" "}(a mediana dos municípios
                  {medianaRendaUf !== null && (
                    <> {deEstado(m.uf)} é {"R$ "}{br(medianaRendaUf)}; a do país,</>
                  )}
                  {medianaRendaUf === null && <> do país é</>}
                  {" "}{"R$ "}{br(medianaRenda)})
                </>
              )}
              . É a média que o IBGE publica, e uma média se move com
              poucos rendimentos altos.
              {/* NÃO dizer "a maioria recebe menos que a média": medido
                  em 29/09/2026, em 92 municípios a mediana é igual ou
                  maior (é o salário mínimo, R$ 1.212, e a média fica logo
                  abaixo). A frase seria falsa em 92 páginas. */}
            </p>
          )}
        </>
      )}
      {temEmpresas && (
        <>
          <h3 className={estilos.subtitulo}>
            Empresas e empregos em {anoEmpresas}
          </h3>
          <p>
            Do <strong><Termo chave="cempre">Cadastro Central de Empresas</Termo></strong> do IBGE, que
            conta os empregos onde a <strong>empresa</strong> está. Inclui
            prefeitura, câmara e outros órgãos públicos, e não inclui quem
            trabalha por conta própria sem CNPJ.
          </p>
          <TabelaValores
            linhas={EMPRESAS}
            valores={m.valores}
            rotuloValor={m.nome}
            legenda={`${m.nome} (${m.uf}) no Cadastro Central de ` +
                     `Empresas de ${anoEmpresas}`}
          />
          {salario !== null && medianaSalario !== null && (
            <p>
              Pondo os municípios do país em ordem de salário médio, o
              do meio paga{" "}
              <strong>{"R$ "}{br(medianaSalario)}</strong>: metade fica
              abaixo disso, metade acima.
              {medianaSalarioUf !== null && (
                <>
                  {" "}Entre os municípios {deEstado(m.uf)}, o do meio paga{" "}
                  <strong>{"R$ "}{br(medianaSalarioUf)}</strong>.
                </>
              )}
            </p>
          )}
        </>
      )}
      {cagedM && (
        <>
          <h3 className={estilos.subtitulo}>
            Emprego com carteira de {nomeCompetencia(caged.competencias[0]!)} a{" "}
            {nomeCompetencia(caged.competencia)}
          </h3>
          <p>
            Do <strong><Termo chave="caged">Novo Caged</Termo></strong>, do Ministério do Trabalho, que
            registra cada contratação e cada desligamento com carteira
            assinada, no município da empresa. Em 12 meses foram{" "}
            <strong>{contagem(cagedM.admissoes, "admissão", "admissões")}</strong>{" "}
            e{" "}
            <strong>
              {contagem(cagedM.desligamentos, "desligamento", "desligamentos")}
            </strong>
            : <Termo chave="saldo">saldo</Termo> de <strong>{comSinal(cagedM.saldo)}</strong>{" "}
            {Math.abs(cagedM.saldo) === 1 ? "vaga" : "vagas"}. Só em{" "}
            {nomeCompetencia(caged.competencia)}, o saldo foi de{" "}
            <strong>{comSinal(cagedM.ultimo.saldo)}</strong>{" "}
            {Math.abs(cagedM.ultimo.saldo) === 1 ? "vaga" : "vagas"}.{" "}
            <Link href="/ranking/emprego-com-carteira/" prefetch={false}>
              Os municípios que mais abriram e mais fecharam vagas
            </Link>.
          </p>
          <TabelaCaged
            meses={cagedM.meses}
            legenda={`${m.nome} (${m.uf}) no Novo Caged, mês a mês`}
          />
          <p className={estilos.ressalva}>
            Só emprego <Termo chave="celetista">celetista</Termo>: servidor{" "}
            <Termo chave="estatutario">estatutário</Termo> e quem trabalha por
            conta própria não entram. Os meses já incluem as declarações
            entregues fora do prazo e as exclusões feitas até{" "}
            {nomeCompetencia(caged.competencia)}, como o número oficial
            &ldquo;com ajustes&rdquo;, e o mês mais recente ainda pode mudar.
            Zero admissões e zero desligamentos num mês querem dizer que
            nenhuma movimentação foi declarada, e não que falta o dado. No
            país, os mesmos 12 meses somam{" "}
            <strong>{comSinal(caged.conferencia.doze.saldo)}</strong> vagas,
            o número que o Ministério do Trabalho publica e que esta base
            reproduz exatamente.{" "}
            {/* Do dado conferido, e não do teclado: `caged-exportar` só
                grava o arquivo quando o mês, o ano e os 12 meses batem
                com o sumário executivo, e um teste cobra que a soma dos
                municípios dá este número. */}
            <a href={caged.conferencia.sumario}>Sumário executivo do MTE</a>.
          </p>
        </>
      )}
      <p className={estilos.ressalva}>
        <strong>
          Não existe taxa de desemprego atual por município
        </strong>{" "}
        em nenhuma fonte oficial. A do Censo é de 2022; a{" "}
        <Termo chave="pnad">PNAD Contínua</Termo>,
        que o IBGE publica a cada trimestre, vai só até os estados e as
        capitais, e mede de outro jeito — as duas não se comparam. No
        Censo, a desocupação do país inteiro foi de{" "}
        <strong>{br(taxasTrabalho["desocupacao"] ?? 0, 1)}%</strong>.{" "}
        {/* Do dado, e não do teclado: é a regra que o teste de
            percentual literal cobra desta página. */}
        E os recortes desta seção não precisam bater: o Censo conta quem
        mora aqui; o cadastro de empresas e o Caged, quem trabalha numa
        empresa daqui. Numa cidade vizinha de um polo, muita gente
        trabalha fora. Fontes: IBGE, Censo Demográfico 2022 e Cadastro
        Central de Empresas, pelas APIs públicas de agregados; Ministério
        do Trabalho e Emprego, microdados do Novo Caged.
      </p>
    </section>
  );
}

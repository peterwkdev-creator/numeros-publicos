import Link from "next/link";
import TabelaCaged from "../../componentes/tabela-caged";
import Termo from "../../componentes/termo";
import { comSinal, contagem, nomeCompetencia } from "../../../lib/caged";
import { br, concorda, fracaoDe } from "../../../lib/dados";
import { deEstado, emContracao } from "../../../lib/estado";
import type { Contexto } from "./contexto";

/**
 * O Novo Caged somado nos municípios do estado.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoEmprego({ c }: { c: Contexto }) {
  const { caged, r, de, cagedUf, semMunicipio, estilos } = c;
  if (!(cagedUf)) return null;
  return (
    <section className={estilos.texto} id="emprego">
      <h2>Emprego com carteira {emContracao(de)}</h2>
      <p>
        Do <strong><Termo chave="caged">Novo Caged</Termo></strong>, do
        Ministério do Trabalho,{" "}
        {r.uf.municipios > 1 ? `somando os municípios ${de}` : emContracao(de)}. De{" "}
        {nomeCompetencia(caged.competencias[0]!)} a{" "}
        {nomeCompetencia(caged.competencia)} foram{" "}
        <strong>{contagem(cagedUf.admissoes, "admissão", "admissões")}</strong>{" "}
        e{" "}
        <strong>
          {contagem(cagedUf.desligamentos, "desligamento", "desligamentos")}
        </strong>
        : <Termo chave="saldo">saldo</Termo> de{" "}
        <strong>{comSinal(cagedUf.saldo)}</strong>{" "}
        {Math.abs(cagedUf.saldo) === 1 ? "emprego com carteira" : "empregos com carteira"}. Só em{" "}
        {nomeCompetencia(caged.competencia)}, o saldo foi de{" "}
        <strong>{comSinal(cagedUf.ultimo.saldo)}</strong>{" "}
        {Math.abs(cagedUf.ultimo.saldo) === 1 ? "emprego com carteira" : "empregos com carteira"}.
        {cagedUf.comDado > 1 && (
          <>
            {" "}
            <strong>{fracaoDe(cagedUf.positivos, cagedUf.comDado)}</strong>{" "}
            {concorda(cagedUf.positivos, cagedUf.comDado, "fechou", "fecharam")}{" "}
            os 12 meses com mais contratações que desligamentos.
          </>
        )}{" "}
        <Link
          href={`/ranking/emprego-com-carteira/?uf=${r.uf.sigla.toLowerCase()}`}
          prefetch={false}
        >
          O ranking dos municípios, com as cidades grandes {deEstado(r.uf.sigla)} por habitante
        </Link>.
      </p>
      <TabelaCaged
        meses={cagedUf.meses}
        legenda={`${r.uf.nome} no Novo Caged, mês a mês` +
          (r.uf.municipios > 1 ? ", somando os municípios" : "")}
      />
      <p className={estilos.ressalva}>
        Só emprego <Termo chave="celetista">celetista</Termo>: servidor{" "}
        <Termo chave="estatutario">estatutário</Termo> e quem trabalha por
        conta própria não entram. Os meses já incluem as declarações
        entregues fora do prazo e as exclusões feitas até{" "}
        {nomeCompetencia(caged.competencia)}, e o mês mais recente ainda
        pode mudar. Aqui só entra o que tem município: as{" "}
        {br(semMunicipio)} movimentações que o Ministério não atribui a
        município nenhum entram só no total do país, e por isso o número
        que ele publica para o estado pode diferir um pouco. No país, os
        mesmos 12 meses somam{" "}
        <strong>{comSinal(caged.conferencia.doze.saldo)}</strong> empregos com carteira.{" "}
        <a href={caged.conferencia.sumario}>Sumário executivo do MTE</a>.
        A taxa de desemprego é outra medida, a da PNAD Contínua, do IBGE:{" "}
        <Link href="/brasil/desemprego/" prefetch={false}>
          o desemprego no Brasil desde 2012
        </Link>
        .
      </p>
    </section>
  );
}

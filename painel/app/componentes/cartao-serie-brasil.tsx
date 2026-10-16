import Link from "next/link";

import {
  APRESENTACAO, caminhoDaSerie, miniatura, partesDoValor, resumo, rotuloPeriodo, SELO,
  type SerieBrasil,
} from "@/lib/brasil";
import estilos from "./cartao-serie-brasil.module.css";

const L = 240;
const A = 44;

/**
 * Uma série do país no índice de `/brasil/`: o nome, para que lado é melhor,
 * o último valor com o período, a forma da série inteira e a fonte. O
 * gráfico com as faixas de quem ocupava a Presidência, a tabela e o CSV
 * ficam na página da série (item 12 da modernização, 16/10/2026: as 15 juntas
 * pesavam 102 KB comprimidos, e quem queria uma baixava as 15).
 *
 * **A miniatura não leva faixa nem eixo, de propósito.** Sem as faixas ela
 * não diz nada sobre quem ocupava o cargo; com elas, mas sem a nota e as
 * datas, diria pela metade. É só a forma, e o número está escrito ao lado.
 *
 * O cartão inteiro é clicável pelo link do título (o `::after` cobre o
 * cartão), e o leitor de tela ouve um link só, com o nome da série.
 */
export default function CartaoSerieBrasil({ serie }: { serie: SerieBrasil }) {
  if (serie.pontos.length < 2) return null;
  const ap = APRESENTACAO[serie.codigo];
  const titulo = ap?.titulo ?? serie.nome;
  const r = resumo(serie);
  const [numero, unidade] = partesDoValor(serie)(r.ultimo[1]);
  return (
    <article className={estilos.cartao} id={serie.codigo} data-cartao={serie.codigo}>
      <h3 className={estilos.titulo}>
        <Link href={caminhoDaSerie(serie.codigo)} prefetch={false}>{titulo}</Link>
      </h3>
      {ap && (
        <p className={estilos.selo} data-melhor={ap.melhor}>
          <span aria-hidden="true">
            {{ alto: "↑ ", baixo: "↓ ", meta: "▭ ", nenhum: "↕ " }[ap.melhor]}
          </span>
          {SELO[ap.melhor]}
        </p>
      )}
      <p className={`${estilos.valor} tabular`} data-ultimo={r.ultimo[0]}>
        {numero}
        {unidade && <span className={estilos.unidade}>{unidade}</span>}
      </p>
      <p className={estilos.periodo}>
        Último dado: {rotuloPeriodo(r.ultimo[0])}. Série desde{" "}
        {rotuloPeriodo(r.primeiro[0])}.
      </p>
      <svg className={estilos.miniatura} viewBox={`0 0 ${L} ${A}`}
        preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <path d={miniatura(serie, L, A)} />
      </svg>
      <p className={estilos.fonte}>Fonte: {serie.fonte}</p>
    </article>
  );
}

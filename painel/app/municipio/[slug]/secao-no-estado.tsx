import { br } from "../../../lib/dados";
import { deEstado } from "../../../lib/estado";
import Termo from "../../componentes/termo";
import type { Contexto } from "./contexto";

/**
 * Onde o município cai entre os do seu estado.
 * Extraído de `page.tsx` em 15/10/2026 (item 19 da revisão de 11/10/2026): o HTML é o mesmo, byte a byte.
 *
 * Um número sozinho não responde a pergunta que a pessoa tem, que é se
 * aquilo é grande ou pequeno. Esta seção põe a régua do estado ao lado —
 * e vai em todas as páginas, não só nas curtas: contexto que só aparece
 * onde falta texto é enchimento, e é o que a política de conteúdo em
 * escala do Google chama de abuso. Ver `posicaoNoEstado`.
 */
export default function SecaoNoEstado({ c }: { c: Contexto }) {
  const { m, uf, perCapita, posPop, posPerCapita , estilos } = c;
  if (!((posPop || posPerCapita) && uf)) return null;
  return (
    <section className={estilos.texto} id="no-estado">
      <h2>{m.nome} no seu estado</h2>
      {/* Nas pontas a conta vira frase: "mais habitantes que 0 dos 853"
          é verdade e não se lê (Serra da Saudade, o menor do país). */}
      {posPop && (
        <p>
          Em população, {m.nome}{" "}
          {posPop.abaixo === 0 ? (
            <>é <strong>o menos populoso</strong> dos</>
          ) : posPop.abaixo === posPop.de - 1 ? (
            <>é <strong>o mais populoso</strong> dos</>
          ) : (
            <>tem <strong>mais habitantes que{" "}
            {br(posPop.abaixo)}</strong> dos</>
          )}{" "}
          <strong>{br(posPop.de)}</strong>{" "}
          municípios {deEstado(m.uf)} — a <Termo chave="mediana">mediana</Termo> do estado é{" "}
          <strong>{br(posPop.mediana, 0)}</strong> habitantes.
        </p>
      )}
      {posPerCapita && perCapita !== null && (
        <p>
          O <Termo chave="pib-por-habitante">PIB por habitante</Termo>, <strong>R$ {br(perCapita, 0)}</strong>, fica{" "}
          <strong>
            {perCapita >= posPerCapita.mediana ? "acima" : "abaixo"}
          </strong>{" "}
          da mediana {deEstado(m.uf)}, que é{" "}
          <strong>R$ {br(posPerCapita.mediana, 0)}</strong>.
        </p>
      )}
      <p className={estilos.ressalva}>
        Municípios sem o valor na fonte <strong>ficam fora da conta</strong>,
        não no fim dela: não saber a população de um município não o torna o
        menor do estado. E isto <em>situa</em>, não classifica — população e
        PIB não são mérito, e o site não os apresenta como se fossem.
      </p>
    </section>
  );
}

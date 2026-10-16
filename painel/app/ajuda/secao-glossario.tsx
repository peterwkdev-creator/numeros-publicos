import { glossarioAZ, idDoVerbete } from "../../lib/glossario";
import type { Contexto } from "./contexto";

/**
 * O glossário de A a Z.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoGlossario({ ctx }: { ctx: Contexto }) {
  const { estilos } = ctx;
  // O mesmo texto da explicação que abre no lugar do termo, nas outras
  // páginas (`lib/glossario.ts`). O `id` de cada termo vem de
  // `idDoVerbete`, com prefixo para não colidir com o de uma seção de
  // mesmo nome (`caged`, `ideb`): é para ele que o "Ler mais" leva
  // quando o termo não tem seção própria aqui.
  return (
    <section className={estilos.bloco} id="glossario">
      <h2>Glossário de A a Z</h2>
      <dl className={estilos.glossario}>
        {glossarioAZ().map(({ chave, verbete }) => (
          <div key={chave} id={idDoVerbete(chave)} className={estilos.verbete}>
            <dt>{verbete.termo}</dt>
            <dd>
              {verbete.curta}
              {verbete.secao && (
                <>
                  {" "}
                  <a href={`#${verbete.secao}`}>Mais sobre isto</a>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

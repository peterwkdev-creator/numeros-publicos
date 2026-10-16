import Link from "next/link";
import MapaUf from "../../componentes/mapa-uf";
import { camadasPadrao } from "../../../lib/mapa";
import type { Contexto } from "./contexto";

/**
 * O mapa do país com a UF contornada.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoNoPais({ c }: { c: Contexto }) {
  const { snapshot, r, panorama, estilos } = c;
  // O mesmo mapa da capa, com a UF contornada. Ele responde a pergunta
  // que a página do município levanta e não fecha — "e o meu estado, como
  // está?" — sem custar coleta nova nem componente novo. As camadas vêm de
  // `camadasPadrao` para que capa e estado não divirjam.
  return (
    <section className={estilos.texto} aria-labelledby="no-pais">
      <h2 id="no-pais">{r.uf.nome} no país</h2>
      <p>
        Os 27 estados no mesmo indicador, com {r.uf.sigla} em destaque. Os
        valores de cada um estão na tabela logo após o mapa.
      </p>
      <MapaUf
        camadas={camadasPadrao(snapshot.ufs, panorama)}
        destaque={r.uf.sigla}
        nomes={Object.fromEntries(snapshot.ufs.map((u) => [u.sigla, u.nome]))}
      />
      <p>
        O país inteiro, ano a ano:{" "}
        <Link href="/brasil/" prefetch={false}>
          o Brasil ao longo do tempo
        </Link>
        .
      </p>
    </section>
  );
}

import Link from "next/link";
import { br } from "../../lib/dados";
import type { Contexto } from "./contexto";

/**
 * Meu município não aparece.
 * Extraído de `page.tsx` em 16/10/2026 (item 10 da modernização): o HTML é o mesmo, byte a byte.
 */
export default function SecaoFaltando({ ctx }: { ctx: Contexto }) {
  const { snapshot, ideb, idebFinais, total, estilos } = ctx;
  return (
    <section className={estilos.bloco} id="faltando">
      <h2>Meu município não aparece, ou aparece sem alguns números</h2>
      <p>
        O site cobre <strong>{br(total)} municípios</strong> — todos os do
        Brasil segundo o IBGE. Se o seu não estiver, o mais provável é
        diferença de grafia na busca; tente pela{" "}
        <Link href="/" prefetch={false}>lista completa</Link> ou pela página do estado.
      </p>
      <p>
        Um caso é real e proposital: <strong>Fernando de Noronha</strong> tem
        página de município no IBGE mas é <em>distrito estadual</em> de
        Pernambuco, não município. Sem Executivo municipal, não entrega
        relatório fiscal — por isso aparece sem os números do Tesouro. As duas
        fontes estão certas: o IBGE conta território, o SICONFI conta quem
        presta contas.
      </p>
      <p>
        Município que existe mas está sem os números fiscais provavelmente não
        entregou o relatório — ver{" "}
        <a href="#travessao">por que aparece “—”</a>.
      </p>
      <p>
        E <strong>sem o IDEB é outra coisa</strong>, não a mesma ausência: o
        INEP publica por rede, e onde a prefeitura não administra aquelas
        escolas não há número municipal a publicar. Acontece em{" "}
        {br(snapshot.municipios.length - ideb.cobertura.municipios)}{" "}
        municípios nos anos iniciais e em{" "}
        {br(snapshot.municipios.length - idebFinais.cobertura.municipios)} nos
        anos finais — ver <a href="#ideb">o que é o IDEB</a>.
      </p>
    </section>
  );
}

import { br, dataCurta, escala, escalaComSinal } from "../../../lib/dados";
import { deEstado } from "../../../lib/estado";
import { mesDeCorte, SEM_PREFEITURA } from "../../../lib/emendas";
import { planosEmTexto, type PlanoPix } from "../../../lib/pix";
import ComposicaoBarras from "../../componentes/composicao-barras";
import Termo from "../../componentes/termo";
import type { Contexto } from "./contexto";

/**
 * Emendas parlamentares pagas à prefeitura.
 * Extraído de `page.tsx` em 15/10/2026 (item 19 da revisão de 11/10/2026): o HTML é o mesmo, byte a byte.
 *
 * Emendas parlamentares pagas à prefeitura (Portal da Transparência,
 * 09/10/2026). SÓ o último ano cheio e o corrente: até 2024 parte do
 * dinheiro ia ao Banco do Brasil sem município, e uma série de 2015 a
 * 2026 mostraria em 2025 um salto que é em boa parte mudança de
 * registro (especs/numeros-publicos-emendas.md, armadilha 2). A série
 * inteira vai no download, com a mesma nota.
 */
export default function SecaoEmendas({ c }: { c: Contexto }) {
  const { emendas, m, emendasM, emendasPh, posEmendas, anoEstimada , estilos } = c;
  if (!(emendasM)) return null;
  return (
    <section className={estilos.texto} id="emendas">
      <h2>Emendas parlamentares pagas a {m.nome}</h2>
      {emendasM.temRecente ? (
        <p>
          {emendasM.cheio.reais === null ? (
            <>
              Em {emendasM.cheio.ano}, nenhum pagamento de emenda
              parlamentar à prefeitura de {m.nome} ou a fundo municipal
              foi registrado.
            </>
          ) : emendasM.cheio.reais < 0 ? (
            <>
              Em {emendasM.cheio.ano}, os estornos de emendas
              parlamentares superaram os pagamentos à prefeitura de{" "}
              {m.nome} e aos fundos municipais: o saldo do ano é{" "}
              <strong title={escalaComSinal(emendasM.cheio.reais).exato}>
                {escalaComSinal(emendasM.cheio.reais).curto}
              </strong>.
            </>
          ) : (
            <>
              Em {emendasM.cheio.ano}, a prefeitura de {m.nome} e os
              fundos municipais receberam{" "}
              <strong title={escalaComSinal(emendasM.cheio.reais).exato}>
                {escalaComSinal(emendasM.cheio.reais).curto}
              </strong>{" "}
              em pagamentos de emendas parlamentares.
            </>
          )}
          {emendasM.parcial && (
            emendasM.parcial.reais === null ? (
              <>
                {" "}Em {emendasM.parcial.ano}, até {mesDeCorte(emendas.ultimoMes)},
                nenhum pagamento foi registrado.
              </>
            ) : (
              <>
                {" "}Em {emendasM.parcial.ano}, até {mesDeCorte(emendas.ultimoMes)},{" "}
                {emendasM.parcial.reais < 0
                  ? "os estornos superam os pagamentos: o saldo é de"
                  : "o total pago soma"}{" "}
                <strong title={escalaComSinal(emendasM.parcial.reais).exato}>
                  {escalaComSinal(emendasM.parcial.reais).curto}
                </strong>.
              </>
            )
          )}
        </p>
      ) : SEM_PREFEITURA.has(m.codigo) ? (
        <p>
          {m.nome} não tem prefeitura: {SEM_PREFEITURA.get(m.codigo)}, e
          esta seção conta só o que vai a prefeituras e fundos municipais.
        </p>
      ) : (
        <p>
          Nenhum pagamento de emenda parlamentar à prefeitura de {m.nome} ou
          a fundo municipal foi registrado em {emendasM.cheio.ano}
          {emendasM.parcial && (
            <> nem em {emendasM.parcial.ano}, até {mesDeCorte(emendas.ultimoMes)}</>
          )}.
        </p>
      )}
      {emendasM.cheio.reais !== null && emendasM.cheio.reais > 0 &&
        emendasPh !== null && (
        <p>
          Por habitante, são <strong>{"R$ "}{br(emendasPh, 2)}</strong> em{" "}
          {emendasM.cheio.ano}, pela população estimada de {anoEstimada}
          {posEmendas ? (
            <>
              : fica{" "}
              <strong>
                {emendasPh > posEmendas.mediana ? "acima da"
                  : emendasPh < posEmendas.mediana ? "abaixo da" : "igual à"}
              </strong>{" "}
              <Termo chave="mediana">mediana</Termo> dos{" "}
              {br(posEmendas.de)} municípios {deEstado(m.uf)} com pagamento
              no ano, que é <strong>{"R$ "}{br(posEmendas.mediana, 2)}</strong>.
            </>
          ) : "."}
        </p>
      )}
      {emendasM.cheio.reais !== null && emendasM.cheio.reais > 0 &&
        emendasM.tipos.length > 0 && (
        <>
          <h3 className={estilos.subtitulo}>
            Por tipo de emenda, em {emendasM.cheio.ano}
          </h3>
          <div className={`${estilos.rolagem} rola-x`}>
            <ComposicaoBarras
              fatias={emendasM.tipos}
              total={emendasM.cheio.reais}
              municipio={m.nome}
              legenda={`Emendas parlamentares pagas em ${emendasM.cheio.ano} por tipo`}
              cabecalho="Tipo de emenda"
              cabecalhoPercentual={`% de ${emendasM.cheio.ano}`}
              nomeDaCauda={["tipo", "tipos"]}
            />
          </div>
          {emendasM.tipos.some((t) => t.valor < 0) && (
            <p className={estilos.ressalva}>
              Valor negativo: no ano, os estornos daquele tipo de emenda
              superaram os pagamentos.
            </p>
          )}
        </>
      )}
      <p className={estilos.ressalva}>
        Conta o que a União <strong>pagou</strong> à prefeitura e aos
        fundos municipais (como o de saúde) por{" "}
        <Termo chave="emenda-parlamentar">emendas parlamentares</Termo> ao
        orçamento federal, pelo mês do pagamento, e não o que foi
        empenhado. Não entram os pagamentos a outros favorecidos no
        município, como o governo do estado, entidades e empresas.{" "}
        <strong>Até 2024, parte do dinheiro de emendas era paga ao Banco do
        Brasil, sem o município de destino</strong>; por isso a série desde
        2015, no download desta página, mostra só o que foi pago
        diretamente à prefeitura e não se compara com {emendasM.cheio.ano}.
        Fonte: {emendas.fonte}, arquivo de {dataCurta(emendas.dataArquivo)}.
      </p>
      <BlocoPix c={c} />
    </section>
  );
}

/** "R$ 1,2 milhão", com o valor exato no `title`. */
function Reais({ v }: { v: number }) {
  const e = escala(v);
  return <span title={e.exato}>{e.curto}</span>;
}

/** O relatório de gestão de um plano, como a prefeitura declarou, ou a falta dele. */
function Relatorio({ p }: { p: PlanoPix }) {
  const r = p.relatorio;
  if (!r) return <>Sem relatório de gestão.</>;
  return (
    <>
      Relatório de gestão {r.tipo} de {dataCurta(r.data.slice(0, 10))},
      declarado pela prefeitura: <Reais v={r.executado} /> executados e{" "}
      <Reais v={r.pendente} /> pendentes
      {r.executado > p.reais && <>, acima do valor do plano, como foi declarado</>}.
    </>
  );
}

/**
 * Em que a prefeitura declarou aplicar a emenda Pix: as áreas, com o NÚMERO
 * de planos que as citam (área não tem valor na fonte), e os planos um a um,
 * com o objeto literal (espec `especs/numeros-publicos-emendas-pix.md`).
 */
function BlocoPix({ c }: { c: Contexto }) {
  const { m, pix, pixM, estilos } = c;
  if (!pixM || pixM.planos.length === 0) return null;
  const porAno = pixM.anos.map((ano) => {
    const doAno = pixM.planos.filter((p) => p.ano === ano);
    return { ano, n: doAno.length, reais: doAno.reduce((s, p) => s + p.reais, 0) };
  });
  const varias = pixM.planos.some((p) => new Set(p.objetos.flatMap((o) => o.areas)).size > 1);
  const anos = pixM.anos.join(" e ");
  return (
    <>
      <h3 className={estilos.subtitulo} id="emenda-pix">
        Em que a prefeitura declarou aplicar a emenda Pix
      </h3>
      <p>
        {porAno.map((a, i) => (
          <span key={a.ano}>
            {i === 0 ? "Em " : "; em "}{a.ano}, {i === 0 ? "a prefeitura de " + m.nome + " cadastrou " : ""}
            <strong>{planosEmTexto(a.n)}</strong>
            {i === 0 && <>{" "}de ação de{" "}
              <Termo chave="emenda-transferencia-especial">emenda Pix</Termo></>}
            {", no valor de "}<strong><Reais v={a.reais} /></strong>
          </span>
        ))}
        . Áreas e objetos como a prefeitura cadastrou no plano de ação do
        Transferegov.
      </p>
      {pixM.areas.length > 0 && (
        <div className={`${estilos.rolagem} rola-x`}>
          <table className={estilos.serie}>
            <caption className={estilos.legenda}>
              Áreas citadas nos planos de ação da emenda Pix de {m.nome}, em{" "}
              {anos}, pelo número de planos que citam cada uma.
            </caption>
            <thead>
              <tr>
                <th scope="col">Área</th>
                <th scope="col" className={estilos.num}>Planos</th>
              </tr>
            </thead>
            <tbody>
              {pixM.areas.map((a) => (
                <tr key={a.nome}>
                  <th scope="row">{a.nome}</th>
                  <td className={estilos.num}>{br(a.planos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {varias && (
        <p className={estilos.ressalva}>
          Um plano pode citar mais de uma área: por isso a área vem com o
          número de planos, sem valor em reais, e a coluna soma mais que o
          total de planos.
        </p>
      )}
      <ul className={estilos.lista}>
        {pixM.planos.map((p) => (
          <li key={`${p.ano}-${p.codigo}`}>
            <strong>
              {p.ano}, plano {p.codigo}, <Reais v={p.reais} />
            </strong>
            {p.objetos.length === 0 && <>: sem objeto cadastrado.</>}
            {p.objetos.map((o, i) => (
              <span key={i}>
                {i === 0 ? ": " : " "}
                {o.executor && <>executado por {o.executor}: </>}
                {o.objeto}
                {o.areas.length > 0 && <> ({o.areas.join(", ")})</>}.
              </span>
            ))}{" "}
            <Relatorio p={p} />
          </li>
        ))}
      </ul>
      <p className={estilos.ressalva}>
        O valor é o do plano de ação, e não o que foi pago no ano: por isso
        não se soma nem se compara com os pagamentos acima. O relatório de
        gestão é declaração da prefeitura, e recente: plano sem relatório não
        é plano sem execução. A série desde {pix.anos[0]} está no download
        desta página. Fonte: {pix.fonte}, coletado em{" "}
        {dataCurta(pix.coletadoEm)}.
      </p>
    </>
  );
}

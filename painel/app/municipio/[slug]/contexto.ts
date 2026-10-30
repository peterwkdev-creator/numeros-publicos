import { br, milReaisParaReais, periodoDe } from "../../../lib/dados";
import { atualizadoEm } from "../../../lib/sitemap";
import { daMesmaRegiao, deEstado, vizinhosDe } from "../../../lib/estado";
import { MINIMO_MEDIANA, medianasSaudeCache, rankingCache } from "../../../lib/nacional";
import { posicaoEntre, posicaoNoEstado } from "../../../lib/posicao";
import { aberturaDe, escolherFatos } from "../../../lib/abertura";
import { compararFuncoes, DESLOCAMENTO_MINIMO, funcoesRecentesDe, INSTALADO_EM, interrupcoes, rclDesmentida, receitaDe, receitaRecenteDe, saltoSobreAHistoria, nomeQuadrimestre, fraseBimestre, fraseDozeMeses, saudeDe, serieDePessoal, variacao, atualDeFuncoes, serieFuncoesDe } from "../../../lib/fiscal";
import { medianaGeral, trajetoriaDe } from "../../../lib/ideb";
import { linhasDaUf, medianasCache, medidasDe, taxasCache } from "../../../lib/censo";
import { cagedAnosDe, cagedDe } from "../../../lib/caged";
import { EMPRESAS, medianaDaColunaCache, PARES_TRABALHO, RENDA_CENSO } from "../../../lib/trabalho";
import { indiceSimei, simeiDe } from "../../../lib/simei";
import { emendasDe, porHabitante, porHabitanteDaUf } from "../../../lib/emendas";
import type { Dados, Municipio } from "./apoio";
import type Estilos from "./municipio.module.css";

/**
 * Tudo o que a página deriva dos dados para UM município, calculado uma vez e entregue às seções.
 * Extraído de `page.tsx` em 15/10/2026 (item 19 da revisão de 11/10/2026): o HTML é o mesmo, byte a byte.
 */
export function montarContexto(dados: Dados, m: Municipio) {
  // O `generateMetadata` (a abertura na descrição) e a página pedem o mesmo
  // contexto, um logo depois do outro no mesmo processo. Sem guardar o último,
  // o build local com `cpus: 4` foi de 8 min 40 s a 14 min 11 s (30/10/2026).
  // A chave é o snapshot (mesmo objeto enquanto o dado não muda, pelo cache
  // de `lerSnapshot`) e o código: se a ordem for outra, só se perde o acerto.
  if (ultimo && ultimo.snapshot === dados.snapshot && ultimo.codigo === m.codigo) return ultimo.c;
  const c = calcularContexto(dados, m);
  ultimo = { snapshot: dados.snapshot, codigo: m.codigo, c };
  return c;
}

let ultimo: { snapshot: Dados["snapshot"]; codigo: Municipio["codigo"]; c: ReturnType<typeof calcularContexto> } | null = null;

function calcularContexto(dados: Dados, m: Municipio) {
  const { snapshot, fiscal, ideb, idebFinais, caged, cagedAnos, emendas, regioes, simei, municipios } = dados;
  // Os mesmos argumentos de `app/municipio/sitemap.ts`.
  const atualizado = atualizadoEm(snapshot, fiscal, caged.coletadoEm);

  const uf = snapshot.ufs.find((u) => u.sigla === m.uf);
  // **Vizinhos na ordem alfabética do estado, não os 12 maiores.** A versão
  // anterior mandava toda página do Maranhão para os mesmos 12 municípios, e a
  // medição de 03/09/2026 mostrou o resultado: 1.677 das 1.794 páginas (93%)
  // sem nenhum link interno entrando, enquanto Salvador recebia 416. Uma janela
  // que anda com o município espalha os links pelo estado inteiro.
  const doEstado = municipios
    .filter((x) => x.uf === m.uf)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  // Desde 11/10/2026, os vizinhos são os da mesma região imediata do IBGE,
  // que espalha os links igual e é a lista que o leitor quer comparar; a
  // janela alfabética fica só para município que o regioes.json não tenha.
  const regiao = daMesmaRegiao(regioes, doEstado, m.codigo);
  const pelaRegiao = !!regiao && regiao.vizinhos.length > 0;
  const vizinhos = pelaRegiao ? regiao.vizinhos : vizinhosDe(doEstado, m.codigo);

  // O Censo 2022, em pares numerador/denominador. As medianas vêm do cache:
  // recalculá-las em cada uma das 5.571 páginas seriam 186 milhões de operações
  // para chegar sempre aos mesmos seis números. Ver `medianasCache`.
  const medidas = medidasDe(m.valores);
  const medianas = medianasCache(snapshot.municipios, snapshot.colunas);
  const serieFuncoes = serieFuncoesDe(fiscal, m.codigo);
  const taxasPais = taxasCache(snapshot.municipios, snapshot.colunas);

  // Trabalho e renda: dois pares do Censo (na mesma tabela dos seis acima) e
  // as médias do IBGE, que não são conta nossa. Ver `lib/trabalho.ts`.
  const medidasTrabalho = medidasDe(m.valores, PARES_TRABALHO);
  const medianasTrabalho = medianasCache(
    snapshot.municipios, snapshot.colunas, PARES_TRABALHO);
  const taxasTrabalho = taxasCache(
    snapshot.municipios, snapshot.colunas, PARES_TRABALHO);
  const renda = m.valores[RENDA_CENSO.codigo] ?? null;
  const medianaRenda = medianaDaColunaCache(
    snapshot.municipios, snapshot.colunas, RENDA_CENSO.codigo);
  const salario = m.valores["salario-medio-empresas"] ?? null;
  const medianaSalario = medianaDaColunaCache(
    snapshot.municipios, snapshot.colunas, "salario-medio-empresas");
  // A régua do estado ao lado da do país, como no resto da página. Com menos
  // de MINIMO_MEDIANA municípios ela diria pouco, e no DF, com um só, seria o
  // próprio município: ali fica só a do país.
  const linhasUf = linhasDaUf(snapshot.municipios, snapshot.colunas, m.uf);
  const comUf = linhasUf.length >= MINIMO_MEDIANA;
  const medianasUf = comUf ? medianasCache(linhasUf, snapshot.colunas) : null;
  const medianasTrabalhoUf = comUf
    ? medianasCache(linhasUf, snapshot.colunas, PARES_TRABALHO) : null;
  const medianaRendaUf = comUf
    ? medianaDaColunaCache(linhasUf, snapshot.colunas, RENDA_CENSO.codigo) : null;
  const medianaSalarioUf = comUf
    ? medianaDaColunaCache(linhasUf, snapshot.colunas, "salario-medio-empresas") : null;
  const legendaMedianas = comUf
    ? `com a mediana dos ${br(linhasUf.length)} municípios ${deEstado(m.uf)} ` +
      `e a dos ${br(snapshot.municipios.length)} do país`
    : `com a mediana dos ${br(snapshot.municipios.length)} municípios do país`;
  // O ano vem do snapshot: o cadastro ganha um ano novo por ano, e escrito
  // aqui ele envelheceria calado, como a "estimativa mais recente" de 2024.
  const anoEmpresas = periodoDe(snapshot, "empresas-atuantes");
  const temCensoTrabalho =
    medidasTrabalho.some((x) => x.percentual !== null) || renda !== null;
  const temEmpresas = EMPRESAS.some((e) => (m.valores[e.codigo] ?? null) !== null);
  // O Novo Caged: 12 meses, com os ajustes. `null` só se o município não
  // estiver no arquivo; município sem movimento vem com ZEROS, e é mostrado.
  const cagedM = cagedDe(caged, m.codigo);
  // A série por ano fechado (desde 2020), com os ajustes até o último dezembro.
  const cagedAnosM = cagedAnosDe(cagedAnos, m.codigo);
  // Os MEI do SIMEI: a série (`null` onde a fonte omitiu o município, nunca
  // zero) e, na posição atual, por mil habitantes e o lugar no estado.
  const simeiM = simeiDe(simei, m.codigo);
  const indiceMei = indiceSimei(simei, municipios);
  const simeiPos = indiceMei.porCodigo.get(m.codigo) ?? null;
  const simeiTaxaPais = indiceMei.taxaPais;
  // As emendas: `null` só se o município não estiver no arquivo (estão os
  // 5.571); sem pagamento, a seção diz isso, e não mostra zero.
  const emendasM = emendasDe(emendas, m.codigo);

  // `?? null` porque o acesso indexado num Record pode devolver `undefined`
  // quando a coluna não existe no snapshot -- e `undefined` e `null` precisam
  // colapsar num único "não sei" antes de qualquer conta.
  const pib = m.valores["pib-municipal"] ?? null;
  const pop = m.valores["populacao-censo-2022"] ?? null;
  const estimada = m.valores["populacao-estimada"] ?? null;
  // O PIB vem em MIL reais no agregado do IBGE; per capita em reais inteiros.
  const pibReais = milReaisParaReais(pib);
  const perCapita = pibReais !== null && pop !== null && pop ? pibReais / pop : null;
  // As emendas por habitante, e onde isso cai entre os municípios do estado
  // com pagamento no mesmo ano. Pela população estimada, a mais perto do ano
  // do dinheiro; a frase diz o ano dela.
  const emendasPh = porHabitante(emendasM?.cheio.reais, estimada);
  const posEmendas = posicaoNoEstado(
    emendasPh, porHabitanteDaUf(emendas, snapshot, m.uf));

  // Onde este município cai entre os do estado. Vai em TODAS as páginas: se o
  // contexto vale numa página curta, vale numa longa — e acrescentar só onde
  // falta texto seria engordar para o buscador. Ver `posicaoNoEstado`.
  const posPop = posicaoNoEstado(
    pop, doEstado.map((x) => x.valores["populacao-censo-2022"] ?? null));
  const posPerCapita = posicaoNoEstado(
    perCapita,
    doEstado.map((x) => {
      const p = milReaisParaReais(x.valores["pib-municipal"] ?? null);
      const q = x.valores["populacao-censo-2022"] ?? null;
      return p !== null && q ? p / q : null;
    }),
  );
  // Quantos municípios do estado também não entregaram. Só faz sentido na
  // página de quem não entregou: ali transforma um vazio isolado num padrão.
  //
  // Pela FAIXA, e não pelo `publicou` cru: quem presta contas como estado ou
  // ainda não estava instalado no exercício também traz `publicou === false`,
  // e contá-lo aqui seria repetir a acusação que essas faixas existem para
  // impedir. Até 06/10/2026 Boa Esperança do Norte, instalado em 2025, entrava
  // nos "64 dos 142" de Mato Grosso que não entregaram o RGF de 2024.
  const naoEntregaramNoEstado = doEstado.filter(
    (x) => x.fiscal?.faixa === "sem-dado").length;
  const consultadosNoEstado = doEstado.filter(
    (x) => x.fiscal?.publicou !== null && x.fiscal?.publicou !== undefined &&
      x.fiscal.faixa !== "como-estado" && x.fiscal.faixa !== "nao-instalado").length;

  const f = m.fiscal;
  const instaladoEm = INSTALADO_EM.get(m.codigo);
  // A receita corrente que DESMENTE a RCL, quando desmente — `null` nos
  // outros casos. Vem de `receitaDe` (exercício da coleta, sem recuar), o
  // mesmo recorte que `rclDesmentida` usou para marcar o município: se os
  // dois lessem anos diferentes, a frase citaria um número e a marca outro.
  const receitaContraRcl =
    f && f.faixa === "implausivel" &&
    rclDesmentida(fiscal, m.codigo, f.rclAjustada, f.percentual)
      ? receitaDe(fiscal, m.codigo)?.total ?? null
      : null;
  // A segunda prova, quando existe: o salto do percentual sobre a própria
  // história. É ela que decide os casos com razão entre 1,4 e 2,0, e a página
  // tem de mostrá-la — senão o leitor vê "1,9 vezes mais" e não tem como saber
  // por que 1,9 condena e 1,4 não.
  const saltoRcl =
    receitaContraRcl !== null && f?.percentual != null
      ? saltoSobreAHistoria(fiscal, m.codigo, f.percentual)
      : null;

  // Onde este município cai entre os do seu estado. Responde a pergunta que o
  // limite legal deixa intacta: "isso é muito?" -- um teto absoluto não diz se
  // o município é caso isolado ou se metade do estado está no mesmo lugar, e as
  // duas situações pedem leituras opostas da mesma porcentagem.
  //
  // A FAIXA decide quem entra, e não a faixa numérica que `posicaoEntre`
  // aplica por dentro (0 a 100%). Em 22/09/2026 oito municípios passaram a
  // ser implausíveis com percentuais DENTRO de 0–100% — calculados sobre uma
  // RCL que a receita deles desmente —, e sem este filtro continuariam aqui:
  // Aparecida/SP sairia do ranking e apareceria como "acima de 99% dos
  // municípios do estado", e entraria na distribuição dos vizinhos.
  const comparavelNaFaixa = (x: typeof f) =>
    x?.faixa === "implausivel" ? null : x?.percentual;
  const posicao = posicaoEntre(
    comparavelNaFaixa(f),
    municipios.filter((x) => x.uf === m.uf).map((x) => comparavelNaFaixa(x.fiscal)),
  );

  const quadrimestre = nomeQuadrimestre(fiscal.exercicio, fiscal.periodo);
  // Quem tem menos de 50 mil habitantes pode entregar o RGF Simplificado
  // semestral (art. 63 da LRF). O do 2º semestre cobre os mesmos 12 meses até
  // dezembro do 3º quadrimestre, e é dele que vem o número desses municípios.
  const periodoRgf = f?.simplificado
    ? `2º semestre de ${fiscal.exercicio}`
    : quadrimestre;
  const aberturaRgf = fraseDozeMeses(fiscal.exercicio, fiscal.periodo, f?.simplificado === true);

  // A abertura (Fase 1 da visibilidade, 30/10/2026): os dois fatos acima em
  // que o município fica mais perto de uma ponta do estado. Ver `lib/abertura.ts`.
  const pessoalComparavel = comparavelNaFaixa(f);
  const fatos = escolherFatos([
    posPop && pop !== null
      ? { tema: "populacao", valor: pop, ...posPop, periodo: null } : null,
    posPerCapita && perCapita !== null
      ? { tema: "pib", valor: perCapita, ...posPerCapita,
          periodo: periodoDe(snapshot, "pib-municipal") } : null,
    posEmendas && emendasPh !== null && emendasM
      ? { tema: "emendas", valor: emendasPh, ...posEmendas,
          periodo: String(emendasM.cheio.ano) } : null,
    posicao && typeof pessoalComparavel === "number"
      ? { tema: "pessoal", valor: pessoalComparavel, mediana: posicao.mediana,
          abaixo: posicao.abaixo,
          acima: posicao.valores.filter((v) => v > pessoalComparavel).length,
          de: posicao.base, periodo: periodoRgf } : null,
  ]);
  const abertura = aberturaDe(m.nome, m.uf, fatos);
  // `serieDePessoal`, e não a série crua: o ponto que o cartão condena pela
  // RCL desmentida não pode sustentar a variação nem o traço do gráfico.
  const { todos: serie, usaveis, condenado } =
    serieDePessoal(fiscal, m.codigo, f?.faixa);
  const delta = variacao(usaveis);
  // Quando o último ponto publicado é o condenado, "o último quadrimestre
  // publicado" deixa de ser o ponto de chegada da variação -- e a frase diz isso.
  const finalCondenado = serie.length > 0 && condenado(serie[serie.length - 1]!);
  const vazios = interrupcoes(usaveis);
  // Quem entregou o RGF Simplificado em algum ano tem um ponto só nesse ano
  // (o 2º semestre): "quadrimestre" deixa de nomear todo ponto da série.
  const semestral = serie.some((p) => p[4] === true);
  const umPeriodo = semestral ? "relatório" : "quadrimestre";
  // A aplicação em saúde (SIOPS). `saudeDe` já descarta os anos ausentes, e
  // devolve `null` quando o município não tem ponto nenhum -- Brasília e Boa
  // Esperança do Norte/MT são os dois casos, e os dois são fato da fonte:
  // o DF não tem série municipal, e o outro é município novo demais.
  const pontosSaude = saudeDe(fiscal, m.codigo);
  const saude = pontosSaude && fiscal.saude
    ? (() => {
        const ultimo = pontosSaude.pontos[pontosSaude.pontos.length - 1]!;
        // A mediana do estado NO MESMO ANO do último ponto deste município.
        // Municípios param de entregar em anos diferentes, e comparar 2025 de
        // um com uma mediana de 26 anos misturados erraria por quase dez
        // pontos -- a mediana nacional subiu de 12,62% para 21,42% no período.
        const i = fiscal.saude!.anos.indexOf(ultimo[0]);
        const medianaUf = i >= 0
          ? (medianasSaudeCache(fiscal)[m.uf]?.[i] ?? null)
          : null;
        // A mediana do estado ano a ano, desenhada atrás da série (revisão 2,
        // lote C), só nos anos que o gráfico do município cobre.
        const primeiro = pontosSaude.pontos[0]!;
        const porAno = medianasSaudeCache(fiscal)[m.uf] ?? [];
        const medianaSerie: [number, number][] = [];
        fiscal.saude!.anos.forEach((ano, j) => {
          const v = porAno[j];
          if (typeof v === "number" && ano >= primeiro[0] && ano <= ultimo[0]) {
            medianaSerie.push([ano, v]);
          }
        });
        return {
          pontos: pontosSaude.pontos,
          primeiro,
          ultimo,
          medianaUf,
          medianaSerie,
          rotulo: fiscal.saude!.rotulo,
          fonte: fiscal.saude!.fonte,
          coletadoEm: fiscal.saude!.coletadoEm,
        };
      })()
    : null;

  // A outra pergunta: para onde vai o dinheiro. `null` quando o município não
  // entregou o RREO -- que é um relatório diferente do RGF, entregue em outra
  // data, então quem tem um pode perfeitamente não ter o outro.
  const funcoes = funcoesRecentesDe(fiscal, m.codigo);
  // A pergunta que vinha ANTES e que a página não respondia: de onde vem o
  // dinheiro. Sai do mesmo relatório das funções (RREO), anexo diferente --
  // então quem tem uma seção quase sempre tem a outra, mas não por construção.
  const receita = receitaRecenteDe(fiscal, m.codigo);
  // O ano vem de `funcoes`, NÃO de `atualDeFuncoes`. São coisas diferentes
  // quando o município não entregou o exercício mais novo, e a diferença é o
  // defeito que esta seção tinha: o rótulo dizia 2024 ou a seção sumia, e
  // nenhum dos dois descrevia um dado de 2021.
  const bimestre = fiscal.funcoes && funcoes
    ? `${fiscal.funcoes.periodo}º bimestre de ${funcoes.exercicio}`
    : "";
  const aberturaBimestre = fiscal.funcoes && funcoes
    ? fraseBimestre(funcoes.exercicio, fiscal.funcoes.periodo)
    : "";
  // O exercício mais novo da COLETA, só para saber se este município está
  // atrasado em relação a ela — e, estando, dizer isso em vez de calar.
  const exercicioColetado = fiscal.funcoes
    ? atualDeFuncoes(fiscal.funcoes)?.exercicio ?? null
    : null;
  const atrasado =
    funcoes !== null &&
    exercicioColetado !== null &&
    funcoes.exercicio !== exercicioColetado;
  const maior = funcoes?.fatias[0] ?? null;

  // As duas etapas ficam SEPARADAS de propósito. Anos iniciais e anos finais
  // têm provas e escalas diferentes, e juntá-las num número só repetiria o
  // erro do Tesouro Selic: grandezas distintas na mesma régua.
  const iniciais = trajetoriaDe(ideb, m.codigo);
  const finais = trajetoriaDe(idebFinais, m.codigo);
  // As medianas do conjunto, para situar este município. Calculadas do
  // snapshot: escritas à mão, elas viram mentira na primeira mudança de
  // universo -- e foi exatamente o que a expansão nacional revelou.
  const medianaIniciais = medianaGeral(ideb);
  const medianaFinais = medianaGeral(idebFinais);
  // A fatia da educação, para a justaposição. NÃO é uma explicação da nota:
  // são dois fatos que ninguém publica lado a lado, e é o leitor quem pensa.
  const educacao = funcoes?.fatias.find((f) => f.nome === "Educação") ?? null;

  // A mudança de composição entre o mesmo bimestre de dois anos. `null` quando
  // falta um dos anos ou quando o crescimento do total sai da faixa comparável
  // -- ali um dos dois relatórios está quebrado.
  // Dois números do ranking nacional, pelo cache: sem ele seriam 31 milhões
  // de operações no build para produzir sempre os mesmos dois.
  const nacional = rankingCache(fiscal, snapshot);

  const comparacao = compararFuncoes(fiscal, m.codigo);
  const mudancas = (comparacao?.deslocamentos ?? [])
    .filter((d) => Math.abs(d.pontos) >= DESLOCAMENTO_MINIMO)
    .slice(0, 5);

  return {
    snapshot, fiscal, ideb, caged, cagedAnos, emendas, m, atualizado, uf, fatos, abertura, regiao, pelaRegiao, vizinhos, medidas, medianas, serieFuncoes, taxasPais, medidasTrabalho, medianasTrabalho, taxasTrabalho, renda, medianaRenda, salario, medianaSalario, comUf, medianasUf, medianasTrabalhoUf, medianaRendaUf, medianaSalarioUf, legendaMedianas, anoEmpresas, temCensoTrabalho, temEmpresas, cagedM, cagedAnosM, simei, simeiM, simeiPos, simeiTaxaPais, emendasM, pop, estimada, pibReais, perCapita, emendasPh, posEmendas, posPop, posPerCapita, naoEntregaramNoEstado, consultadosNoEstado, f, instaladoEm, receitaContraRcl, saltoRcl, posicao, quadrimestre, periodoRgf, aberturaRgf, serie, usaveis, condenado, delta, finalCondenado, vazios, semestral, umPeriodo, saude, funcoes, receita, bimestre, aberturaBimestre, exercicioColetado, atrasado, maior, iniciais, finais, medianaIniciais, medianaFinais, educacao, nacional, comparacao, mudancas,
  };
}

/** O contexto completo: o calculado aqui mais os dois anos que a própria página lê do snapshot. */
export type Contexto = ReturnType<typeof montarContexto> & {
  anoEstimada: string | null;
  anoPib: string | null;
  // Só o `page.tsx` importa o CSS Module e entrega os estilos às seções por aqui:
  // se cada seção o importasse, o bundler reagruparia os chunks de CSS do site.
  estilos: typeof Estilos;
};

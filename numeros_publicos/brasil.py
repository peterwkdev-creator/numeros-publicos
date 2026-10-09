"""O Brasil ao longo do tempo: as séries do país, inteiras, e quem ocupava
a Presidência em cada período.

A espec é `especs/numeros-publicos-brasil-no-tempo.md`, no repositório de
trabalho. Aqui ficam a coleta, a conferência e o banco; a exportação para a
página lê do banco.

## As séries

Cinco do IBGE (API de agregados), sete do Banco Central (SGS), uma do
Ipea (Ipeadata) e uma do Ministério da Saúde (SIM, pelo TabNet), todas no
nível do país. Cada uma vem com o histórico inteiro que a fonte publica
(`periodos/all` no IBGE, a janela desde 1990 no SGS): o site mostra a série
inteira, nunca um recorte, e recorte escolhido aqui seria escolha editorial.
As exceções são técnicas e estão escritas na própria série: o IPCA começa em
07/1995, o primeiro mês em que os 12 meses acumulados caem inteiros no Real;
o SIM traz só os anos que o próprio TabNet chama de finais, porque o ano
preliminar ainda muda.

## Duas leituras, e nada se grava se divergirem

Cada série é lida por dois caminhos da mesma fonte, e os dois têm de dar os
mesmos pontos com os mesmos valores:

- IBGE: a API de agregados (`servicodados`) e a do SIDRA (`apisidra`), que
  são serviços diferentes do instituto;
- Banco Central: a série inteira numa consulta, e de novo em duas janelas
  que se emendam. Onde o BC publica a mesma informação por outro caminho, a
  segunda leitura é esse caminho: o câmbio mensal (3698) contra a média da
  PTAX diária (SGS 1), e a meta da Selic contra o histórico das decisões do
  Copom (a página "Histórico das taxas de juros"), que dá o início e o fim
  de vigência de cada meta. As reservas (3546), além das duas janelas, vão
  contra o último dia útil de cada mês da série diária (SGS 13621); a
  dívida líquida (4513), contra a conta do saldo em reais (4478) pelo PIB de
  12 meses (4382); o saldo da balança comercial (22707), contra as
  exportações (22708) menos as importações (22709);
- Ipea: o salário mínimo real, refeito mês a mês com o nominal e o INPC
  que o Banco Central publica no SGS;
- Ministério da Saúde: os óbitos por agressão em duas tabelas do TabNet do
  SIM, montadas de arquivos diferentes: a das causas externas (grande grupo
  X85-Y09) e a dos óbitos gerais (grupo "Agressões").

Ponto que falta num lado, sobra no outro ou difere em valor é ERRO, com a
lista, e o banco fica como estava.

## O banco

`brasil.db`, próprio, separado do banco dos municípios: outra fonte e outro
ritmo. Cada série é uma fatia, regravada inteira (apaga e escreve na mesma
transação: `stack-ingestao.md`, "Releitura substitui a fatia"). E a fatia não
encolhe sem aviso: menos pontos, começo mais tarde ou fim mais cedo que o já
gravado é recusado, salvo `permitir_encolher`.

## Quem ocupava o cargo

`brasil_mandatos.csv`, versionado ao lado: uma linha por período de
exercício, com a fonte oficial de cada data. `validar_mandatos` recusa linha
sem link oficial, período sobreposto e buraco entre dois períodos.

O fim de cada linha é o dia em que o seguinte ASSUMIU (intervalo semiaberto),
e não o último dia do mandato: a galeria da Presidência escreve "de
01/01/1995 a 31/12/1998", e a linha guarda 1995-01-01 a 1999-01-01. Assim
cada dia cai em exatamente uma faixa. Datas conferidas em 05/10/2026, página
por página. Onde a galeria tem erro de digitação (Lula "31/01/2006"; a posse
de 2015 escrita "01/01/2011"), a fonte é o Senado. A linha em aberto é a
atual: pela EC 111/2021, o sucessor toma posse em 5/1/2027.
"""

from __future__ import annotations

import calendar
import csv
import datetime as dt
import html
import json
import re
import sqlite3
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from pathlib import Path
from typing import NamedTuple
from urllib.parse import urlencode, urlparse

from .ibge import (
    ESPERA_INICIAL, FALHA_DE_REDE, REPETIVEIS, TENTATIVAS, ErroIBGE, Resposta,
    Transporte, _numero, buscar_json, ler_ate, url_serie_regiao,
)

SIDRA = "https://apisidra.ibge.gov.br/values"
SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.{codigo}/dados"
MANDATOS = Path(__file__).with_name("brasil_mandatos.csv")

#: Primeiro ano pedido ao SGS. As duas séries do BC começam em 2002 e 2006
#: (medido em 05/10/2026); pedir antes não corta nada, e a janela larga é o
#: que garante "a série inteira".
SGS_DESDE = 1990
#: Onde a segunda leitura do SGS corta a série em duas janelas.
SGS_CORTE = 2015
#: Série DIÁRIA do SGS não aceita janela de mais de 10 anos (medido em
#: 06/10/2026: "no máximo, 10 anos em séries de periodicidade diária").
SGS_JANELA_DIARIA = 10
#: A PTAX de venda, diária: a média do mês confere o câmbio mensal.
SGS_PTAX = 1
#: O histórico das decisões do Copom, com o início e o fim de vigência de
#: cada meta da Selic: o que a página "Histórico das taxas de juros" lê.
API_COPOM = "https://www.bcb.gov.br/api/servico/sitebcb/historicotaxasjuros"
#: O Ipeadata (Ipea, fundação pública federal): a série inteira, em OData.
IPEADATA = ("https://www.ipeadata.gov.br/api/odata4/"
            "ValoresSerie(SERCODIGO='{codigo}')")
#: O salário mínimo nominal (R$) e o INPC do mês (%), do SGS: com os dois se
#: refaz a variação de cada mês do salário mínimo real do Ipea.
SGS_SALARIO_MINIMO = 1619
SGS_INPC = 188
#: O PIB acumulado em 12 meses, a preços correntes, em R$ milhões: o
#: denominador das séries em % do PIB do Banco Central (`razao-pib`).
SGS_PIB_12_MESES = 4382
#: Quanto a variação do mês pode diferir na conta refeita. O INPC sai com
#: duas casas no SGS, então (1 + INPC) carrega até meio centésimo de ponto
#: percentual de arredondamento: 0,00005 relativo. Medido em 07/10/2026:
#: 385 meses, o maior desvio 0,000004.
FOLGA_INPC = 0.00005
#: Quantos meses o INPC pode estar à frente do salário mínimo real: o Ipea
#: atualiza alguns dias depois do IBGE. Mais que isso é a série parada.
INPC_ADIANTADO = 2
#: A unidade de série refeita a cada mês em reais do último (o salário mínimo
#: real do Ipea). Na página sai com o mês escrito: "R$ de agosto de 2026".
REAIS_DO_ULTIMO_MES = "R$ do último mês"


class ErroBrasil(RuntimeError):
    """A fonte mudou de forma, as duas leituras divergem, ou a fatia encolheu."""


class TabelaTabNet(NamedTuple):
    """Uma tabela do TabNet e o filtro que recorta nela os óbitos da série."""

    definicao: str  # o arquivo `.def`, como "sim/cnv/ext10uf.def"
    filtro: str  # o nome do campo no formulário
    valor: str  # a opção escolhida nele
    #: O texto da opção, conferido a cada coleta: se o TabNet renumerar as
    #: opções, a série não troca de causa calada.
    rotulo: str


class SerieBrasil(NamedTuple):
    """Uma série do país e a coordenada dela na fonte.

    `codigo` é a chave no banco e no JSON. `nome` é o que a página imprime:
    no IBGE, o nome dos metadados da tabela; no SGS, que dá nomes de catálogo
    longos, a forma curta, com o nome inteiro num comentário ao lado.
    """

    codigo: str
    nome: str
    unidade: str
    fonte: str  # "IBGE", "Banco Central", "Ipea" ou "Ministério da Saúde"
    periodicidade: str  # "trimestral", "mensal" ou "anual"
    agregado: int | None = None
    variavel: int | None = None
    classificacao: str | None = None  # "11255[90707]", como na API
    sgs: int | None = None
    #: Primeiro período que entra, quando há critério técnico (o IPCA, o
    #: câmbio e as reservas, pelo Real; a Selic, pelo começo da meta).
    desde: str | None = None
    #: A segunda leitura de uma série do SGS: `janelas` (a mesma série em
    #: duas janelas), `ptax` (a média mensal da PTAX diária) ou `copom` (a
    #: série diária do SGS contra o histórico das decisões do Copom),
    #: `inpc` (a variação de cada mês contra o salário mínimo nominal e o
    #: INPC do SGS), `ultimo-dia` (as duas janelas e, além delas, o último
    #: dia útil de cada mês de uma série diária de estoque, `sgs_diaria`) ou
    #: `razao-pib` (as duas janelas e, além delas, o saldo em reais,
    #: `sgs_saldo`, dividido pelo PIB de 12 meses) ou `diferenca` (as duas
    #: janelas e, além delas, uma série menos a outra, `sgs_partes`). No
    #: TabNet, `tabnet`: duas tabelas, iguais ano a ano.
    conferencia: str = "janelas"
    #: O código da série no Ipeadata, quando a fonte é o Ipea.
    ipeadata: str | None = None
    #: A série diária que confere uma mensal de estoque (`ultimo-dia`).
    sgs_diaria: int | None = None
    #: O saldo em R$ milhões que, dividido pelo PIB, dá a série (`razao-pib`).
    sgs_saldo: int | None = None
    #: As duas séries cuja diferença dá a série (`diferenca`): a primeira
    #: menos a segunda, na unidade do SGS.
    sgs_partes: tuple[int, int] | None = None
    #: Por quanto dividir o que o SGS publica: as reservas vêm em US$ milhões
    #: e a página fala em bilhões. A divisão é da coleta, não da página: o
    #: banco guarda o número que a página mostra, e o conferidor o compara.
    dividir_por: int = 1
    #: As duas tabelas do TabNet que dão a série, a gravada e a que a confere.
    tabnet: tuple[TabelaTabNet, TabelaTabNet] | None = None
    #: Fora da atualização semanal: série anual de fonte sem API, coletada à
    #: mão quando sai o ano final (`brasil-ingerir` sem `--semanal`).
    semanal: bool = True


# Os nomes do IBGE são os dos metadados de cada tabela, lidos em 05/10/2026.
SERIES: tuple[SerieBrasil, ...] = (
    SerieBrasil(
        "pib", "PIB a preços de mercado: taxa acumulada em quatro trimestres "
        "(em relação ao mesmo período do ano anterior)", "%", "IBGE",
        "trimestral", agregado=5932, variavel=6562,
        classificacao="11255[90707]"),
    SerieBrasil(
        "desocupacao", "Taxa de desocupação, na semana de referência, das "
        "pessoas de 14 anos ou mais de idade", "%", "IBGE", "trimestral",
        agregado=4099, variavel=4099),
    # A 6472, e não a 5436 da espec: a 5436 não publica de 2020T2 a 2022T1
    # (8 trimestres, nas duas leituras), e a 6472 tem os 58, iguais aos da
    # 5436 nos 50 que as duas têm (medido em 05/10/2026). E esta é a variável
    # da manchete da PNAD: todos os trabalhos, não só o principal.
    SerieBrasil(
        "rendimento", "Rendimento médio mensal real das pessoas de 14 anos ou "
        "mais de idade ocupadas na semana de referência com rendimento de "
        "trabalho, habitualmente recebido em todos os trabalhos", "R$",
        "IBGE", "trimestral", agregado=6472, variavel=5933),
    # A linha internacional de pobreza extrema do Banco Mundial: US$ 3,00 por
    # dia em paridade de poder de compra de 2021, convertidos pelo fator de
    # R$ 2,4498 por dólar e corrigidos pelo IPCA (ficha do indicador 1.1.1 no
    # odsbrasil.gov.br, do IBGE, lida em 07/10/2026). A Síntese de
    # Indicadores Sociais usa outra linha (US$ 2,15 em PPC de 2017) e dá 3,47%
    # em 2024, contra 4,7 aqui; o IBGE refaz a série a cada troca de linha.
    SerieBrasil(
        "extrema-pobreza", "Proporção da população abaixo da linha de pobreza "
        "internacional", "%", "IBGE", "anual", agregado=5817, variavel=9617),
    SerieBrasil(
        "ipca", "IPCA: variação acumulada em 12 meses", "%", "IBGE", "mensal",
        agregado=1737, variavel=2265, desde="1995-07"),
    # Nome no SGS: "Dívida bruta do governo geral (% PIB) - Metodologia
    # utilizada a partir de 2008" (a série começa em 12/2006 mesmo assim).
    SerieBrasil(
        "divida-bruta", "Dívida bruta do governo geral", "% do PIB",
        "Banco Central", "mensal", sgs=13762),
    # Nome no SGS (portal de dados abertos do BC): "Dívida Líquida do Setor
    # Público (% PIB) - Total - Setor público consolidado", desde 12/2001:
    # com a saída da Petrobras e da Eletrobras, o BC refez a série só até
    # ali, e a anterior não se emenda. A segunda leitura, além das duas
    # janelas, é a conta do próprio BC: o saldo em R$ milhões (SGS 4478)
    # pelo PIB de 12 meses (SGS 4382), com duas casas. Medido em 08/10/2026:
    # 297 de 297 meses iguais.
    SerieBrasil(
        "divida-liquida", "Dívida líquida do setor público, total, setor "
        "público consolidado", "% do PIB", "Banco Central", "mensal",
        sgs=4513, conferencia="razao-pib", sgs_saldo=4478),
    # Nome no SGS: "NFSP sem desvalorização cambial (% PIB) - Fluxo acumulado
    # em 12 meses - Resultado primário - Total - Setor público consolidado".
    # Sinal da NFSP: positivo é déficit, negativo é superávit (01/2011 = -2,63,
    # ano de superávit). A página tem de dizer isso ao lado do gráfico.
    SerieBrasil(
        "nfsp-primario", "Necessidades de financiamento do setor público, "
        "resultado primário, acumulado em 12 meses", "% do PIB",
        "Banco Central", "mensal", sgs=5793),
    # Nome no SGS: "Taxa de câmbio - Livre - Dólar americano (venda) - Média
    # de período - mensal". Desde 07/1994, o primeiro mês do Real: antes, a
    # série está em cruzeiro real (06/1994 = 2.296,2562). É a média da PTAX
    # de venda do mês, arredondada a quatro casas (medido em 06/10/2026: 384
    # de 387 meses iguais; os três outros são empates na quinta casa).
    SerieBrasil(
        "cambio", "Taxa de câmbio, dólar americano (venda), média do mês",
        "R$ por dólar", "Banco Central", "mensal", sgs=3698, desde="1994-07",
        conferencia="ptax"),
    # SGS 3546, "Reservas internacionais - Total - mensal": o estoque no fim
    # de cada mês, em US$ milhões, que a coleta divide por mil. Desde
    # 07/1994, como o câmbio. A segunda leitura, além das duas janelas, é o
    # último dia útil de cada mês da série diária (SGS 13621, desde
    # 09/1998): medido em 07/10/2026, 331 de 337 meses iguais. A SGS 13982
    # é outro conceito (liquidez internacional), que inclui as linhas com
    # recompra. Não há série sem os empréstimos do FMI de 2001 a 2005 (a
    # dívida com o Fundo, SGS 3648, zera em 10/2005): a nota da página avisa.
    SerieBrasil(
        "reservas", "Reservas internacionais, total, fim do mês",
        "US$ bilhões", "Banco Central", "mensal", sgs=3546, desde="1994-07",
        conferencia="ultimo-dia", sgs_diaria=13621, dividir_por=1000),
    # Nome no SGS: "Balança comercial - Balanço de Pagamentos - mensal -
    # saldo", em US$ milhões com uma casa, desde 01/1995 (o critério do
    # balanço de pagamentos, BPM6), que a coleta divide por mil. A segunda
    # leitura, além das duas janelas, é a conta: exportações (SGS 22708)
    # menos importações (SGS 22709), até `DIFERENCA_TOLERANCIA`. Medido em
    # 08/10/2026: 380 meses, diferença máxima de 0,1 (o arredondamento de
    # cada série), 280 iguais.
    SerieBrasil(
        "balanca-comercial", "Balança comercial, saldo do mês, balanço de "
        "pagamentos", "US$ bilhões", "Banco Central", "mensal", sgs=22707,
        conferencia="diferenca", sgs_partes=(22708, 22709), dividir_por=1000),
    # A meta da Selic que o Copom fixa, em vigor no último dia de cada mês.
    # Desde 03/1999, quando o regime da meta começou (05/03/1999): antes, o
    # histórico do Copom traz a TBC, taxa mensal de outro regime. O SGS 432
    # ("Taxa de juros - Meta Selic definida pelo Copom", diária) é a segunda
    # leitura: 331 de 331 meses iguais em 06/10/2026.
    SerieBrasil(
        "selic", "Meta da taxa Selic definida pelo Copom", "% ao ano",
        "Banco Central", "mensal", sgs=432, desde="1999-03",
        conferencia="copom"),
    # Nome no Ipeadata: "Salário mínimo real", em "R$ (do último mês)": o Ipea
    # deflaciona o nominal pelo INPC e refaz a série inteira a cada mês, então
    # o nível muda e a variação de um mês para o outro não. Desde 08/1994: em
    # 07/1994, o mês da troca da moeda, o Ipea multiplica a variação do
    # deflator por 1,2225 (nota da própria série), e a variação de 07 para 08
    # sai +20,8% com o nominal parado e INPC de 1,85% (medido em 07/10/2026).
    SerieBrasil(
        "salario-minimo", "Salário mínimo real", REAIS_DO_ULTIMO_MES, "Ipea",
        "mensal", desde="1994-08", conferencia="inpc",
        ipeadata="GAC12_SALMINRE12"),
    # O SIM pelo TabNet: óbitos por agressão (CID-10 X85 a Y09) por ano e
    # local de ocorrência, desde 1996 (a CID-10 no SIM). A tabela das causas
    # externas e a dos óbitos gerais vêm de arquivos diferentes e deram o
    # mesmo número nos 31 anos, 1996 a 2026, em 08/10/2026; os microdados do
    # OpenDataSUS (CAUSABAS X85 a Y09, ano de DTOBITO) deram o mesmo número
    # em 1996, 2010 e 2024, no mesmo dia. Número de óbitos, e não taxa: a
    # taxa pede a população, que é outra fonte e outra conta.
    SerieBrasil(
        "mortes-agressao", "Óbitos por agressões (CID-10 X85-Y09), por ano e "
        "local de ocorrência", "óbitos", "Ministério da Saúde", "anual",
        desde="1996", conferencia="tabnet", tabnet=(
            TabelaTabNet("sim/cnv/ext10uf.def", "SGrande_Grupo_CID10", "4",
                         "X85-Y09 Agressões"),
            TabelaTabNet("sim/cnv/obt10uf.def", "SGrupo_CID-10", "246",
                         "Agressões")), semanal=False),
)

TRIMESTRE = re.compile(r"(\d{4})0([1-4])")
MES = re.compile(r"(\d{4})(0[1-9]|1[0-2])")
ANO = re.compile(r"\d{4}")
DATA_SGS = re.compile(r"01/(0[1-9]|1[0-2])/(\d{4})")

Pontos = dict[str, float]


def agora() -> str:
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()


def periodo_ibge(codigo: str, periodicidade: str) -> str:
    """`199601` vira `1996T1` (trimestre), `199507` vira `1995-07` (mês) e
    `2012` continua `2012` (ano)."""
    if periodicidade == "anual":
        if not ANO.fullmatch(codigo):
            raise ErroBrasil(f"período {codigo!r} não é anual do IBGE")
        return codigo
    m = (TRIMESTRE if periodicidade == "trimestral" else MES).fullmatch(codigo)
    if not m:
        raise ErroBrasil(f"período {codigo!r} não é {periodicidade} do IBGE")
    a, b = m.groups()
    return f"{a}T{b}" if periodicidade == "trimestral" else f"{a}-{b}"


def periodo_sgs(data: str) -> str:
    """`01/08/2026` vira `2026-08`. Série mensal do SGS vem sempre no dia 1."""
    m = DATA_SGS.fullmatch(data)
    if not m:
        raise ErroBrasil(f"data {data!r} não é de série mensal do SGS")
    return f"{m.group(2)}-{m.group(1)}"


def _cortar(s: SerieBrasil, pontos: Pontos) -> Pontos:
    return {p: v for p, v in pontos.items() if s.desde is None or p >= s.desde}


def _classificacao(texto: str) -> tuple[str, str]:
    """`"11255[90707]"` vira `("11255", "90707")`."""
    cls, cat = texto.rstrip("]").split("[")
    return cls, cat


# ------------------------------------------------------------------ leituras

def url_agregados(s: SerieBrasil) -> str:
    return url_serie_regiao(s.agregado, "all", s.variavel, regiao=None,
                            classificacao=s.classificacao)


def ler_agregados(s: SerieBrasil, dados: object) -> Pontos:
    """A resposta da API de agregados, conferindo que é a série pedida."""
    try:
        (var,) = dados
        if str(var["id"]) != str(s.variavel):
            raise ErroBrasil(f"{s.codigo}: veio a variável {var['id']}, "
                             f"pedida {s.variavel}")
        (res,) = var["resultados"]
        if s.classificacao:
            cls, cat = _classificacao(s.classificacao)
            (c,) = res["classificacoes"]
            if str(c["id"]) != cls or list(c["categoria"]) != [cat]:
                raise ErroBrasil(f"{s.codigo}: veio a classificação "
                                 f"{c['id']} {list(c['categoria'])}, pedida "
                                 f"{s.classificacao}")
        (ser,) = res["series"]
        if ser["localidade"]["nivel"]["id"] != "N1":
            raise ErroBrasil(f"{s.codigo}: não veio o nível do país")
        serie = ser["serie"]
    except (KeyError, TypeError, ValueError) as e:
        raise ErroBrasil(f"{s.codigo}: a resposta de agregados mudou de forma "
                         f"({type(e).__name__}: {e})") from e
    pontos = {periodo_ibge(p, s.periodicidade): _numero(v)
              for p, v in serie.items()}
    return _cortar(s, {p: v for p, v in pontos.items() if v is not None})


def url_sidra(s: SerieBrasil) -> str:
    u = f"{SIDRA}/t/{s.agregado}/n1/all/v/{s.variavel}/p/all"
    if s.classificacao:
        cls, cat = _classificacao(s.classificacao)
        u += f"/c{cls}/{cat}"
    return u


def ler_sidra(s: SerieBrasil, dados: object) -> Pontos:
    """A resposta do `apisidra`: a primeira linha é o cabeçalho, e as colunas
    seguem a ordem do pedido (país, variável, período, classificação). A
    coluna do período é a `D3C`, e cada código tem de ter a forma do IBGE."""
    try:
        _, *linhas = dados
        pontos: Pontos = {}
        for linha in linhas:
            if linha["D1C"] != "1" or linha["D2C"] != str(s.variavel):
                raise ErroBrasil(f"{s.codigo}: linha do SIDRA de outro recorte "
                                 f"({linha['D1C']}, {linha['D2C']})")
            v = _numero(linha["V"])
            if v is not None:
                pontos[periodo_ibge(linha["D3C"], s.periodicidade)] = v
    except (KeyError, TypeError, ValueError) as e:
        raise ErroBrasil(f"{s.codigo}: a resposta do SIDRA mudou de forma "
                         f"({type(e).__name__}: {e})") from e
    return _cortar(s, pontos)


def _url_sgs(codigo: int, de: int, ate: int) -> str:
    return (SGS.format(codigo=codigo) + "?formato=json"
            f"&dataInicial=01/01/{de}&dataFinal=31/12/{ate}")


def url_sgs(s: SerieBrasil, de: int, ate: int) -> str:
    return _url_sgs(s.sgs, de, ate)


def janelas_diarias(de: int, ate: int) -> list[tuple[int, int]]:
    """Os anos de `de` a `ate` em janelas de até `SGS_JANELA_DIARIA` anos."""
    return [(a, min(a + SGS_JANELA_DIARIA - 1, ate))
            for a in range(de, ate + 1, SGS_JANELA_DIARIA)]


def ler_sgs(s: SerieBrasil, dados: object) -> Pontos:
    """A resposta do SGS: `[{"data": "01/08/2026", "valor": "0.62"}, ...]`.
    O SGS não tem marcador de ausência (mês sem dado não vem na lista), então
    valor que não é número é erro. O `_numero` do IBGE, que trata marcador
    desconhecido como ausente, abriria aqui um buraco calado."""
    pontos = _cortar(s, ler_sgs_mensal(s.codigo, dados))
    if s.dividir_por == 1:
        return pontos
    return {p: float(Decimal(repr(v)) / s.dividir_por)
            for p, v in pontos.items()}


def ler_sgs_mensal(rotulo: str, dados: object) -> Pontos:
    """Uma série mensal do SGS inteira, sem o corte de `desde`."""
    try:
        pontos: Pontos = {}
        for linha in dados or []:
            p = periodo_sgs(linha["data"])
            if p in pontos:
                raise ErroBrasil(f"{rotulo}: {p} repetido no SGS")
            try:
                pontos[p] = float(linha["valor"])
            except ValueError as e:
                raise ErroBrasil(f"{rotulo}: {p} veio com valor "
                                 f"{linha['valor']!r}, que não é número") from e
    except (KeyError, TypeError) as e:
        raise ErroBrasil(f"{rotulo}: a resposta do SGS mudou de forma "
                         f"({type(e).__name__}: {e})") from e
    return pontos


def url_ipeadata(s: SerieBrasil) -> str:
    return IPEADATA.format(codigo=s.ipeadata)


#: `1994-08-01T00:00:00-03:00`, ou `-02:00` no horário de verão: o dia 1 de
#: cada mês, à meia-noite de Brasília. Medido em 07/10/2026: só esses dois.
DATA_IPEADATA = re.compile(r"(\d{4})-(0[1-9]|1[0-2])-01T00:00:00-0[23]:00")


def ler_ipeadata(s: SerieBrasil, dados: object) -> Pontos:
    """A resposta do Ipeadata: `{"value": [{"VALDATA": ..., "VALVALOR":
    1621.0}, ...]}`. Valor que não é número (o Ipeadata devolve `null` em
    mês sem dado) é erro, e não buraco calado."""
    try:
        pontos: Pontos = {}
        for x in dados["value"]:
            if x["SERCODIGO"] != s.ipeadata:
                raise ErroBrasil(f"{s.codigo}: o Ipeadata devolveu a série "
                                 f"{x['SERCODIGO']!r}")
            m = DATA_IPEADATA.fullmatch(x["VALDATA"])
            if not m:
                raise ErroBrasil(f"{s.codigo}: data {x['VALDATA']!r} não é o "
                                 "dia 1 de um mês")
            p = f"{m.group(1)}-{m.group(2)}"
            if p in pontos:
                raise ErroBrasil(f"{s.codigo}: {p} repetido no Ipeadata")
            v = x["VALVALOR"]
            if not isinstance(v, (int, float)) or isinstance(v, bool):
                raise ErroBrasil(f"{s.codigo}: {p} veio com valor {v!r}, que "
                                 "não é número")
            pontos[p] = float(v)
    except (KeyError, TypeError) as e:
        raise ErroBrasil(f"{s.codigo}: a resposta do Ipeadata mudou de forma "
                         f"({type(e).__name__}: {e})") from e
    return _cortar(s, pontos)


def comparar_razao(codigo: str, real: Pontos, nominal: Pontos,
                   inpc: Pontos) -> None:
    """O salário mínimo real contra o nominal e o INPC do SGS.

    O Ipea refaz a série inteira em reais do último mês, então o nível não se
    confere contra nada fixo; a variação de cada mês, sim: real(m) / real(m-1)
    tem de ser nominal(m) / nominal(m-1) / (1 + INPC(m)), até `FOLGA_INPC`.
    E o último mês, que está em reais dele mesmo, tem de ser o nominal ao
    centavo. Com as variações e a âncora, todo nível fica conferido."""
    if not real:
        raise ErroBrasil(f"{codigo}: o Ipeadata não devolveu nenhum ponto")
    meses = sorted(real)
    primeiro, ultimo = meses[0], meses[-1]
    adiante = sorted(m for m in inpc if m > ultimo)
    if len(adiante) > INPC_ADIANTADO:
        raise ErroBrasil(f"{codigo}: o salário mínimo real para em {ultimo}, "
                         f"e o INPC já tem {', '.join(adiante)}")
    partes = []
    vazios = sorted(m for m in nominal.keys() | inpc.keys()
                      if primeiro <= m <= ultimo and m not in real)
    if vazios:
        partes.append(f"meses que faltam no Ipeadata: {', '.join(vazios[:5])}")
    faltam = sorted(m for m in meses if m not in nominal or m not in inpc)
    if faltam:
        partes.append(f"meses sem nominal ou INPC no SGS: "
                      f"{', '.join(faltam[:5])}")
    elif abs(real[ultimo] - nominal[ultimo]) > 0.005:
        partes.append(f"o último mês ({ultimo}) é {real[ultimo]} no Ipea e "
                      f"{nominal[ultimo]} de nominal")
    if not faltam:
        difs = []
        for a, b in zip(meses, meses[1:]):
            refeita = nominal[b] / nominal[a] / (1 + inpc[b] / 100)
            if abs(real[b] / real[a] / refeita - 1) > FOLGA_INPC:
                difs.append(f"{b} ({real[b] / real[a]:.6f} e {refeita:.6f})")
        if difs:
            partes.append("variações diferentes: " + ", ".join(difs[:5]))
    if partes:
        raise ErroBrasil(f"{codigo}: o nominal e o INPC não conferem; "
                         + "; ".join(partes))


DATA_DIARIA = re.compile(r"(\d{2})/(\d{2})/(\d{4})")


def ler_sgs_diaria(rotulo: str, dados: object) -> dict[dt.date, Decimal]:
    """Uma série DIÁRIA do SGS (`"data": "05/03/1999"`), em `Decimal` para a
    média não herdar o erro do ponto flutuante."""
    dias: dict[dt.date, Decimal] = {}
    try:
        for linha in dados or []:
            m = DATA_DIARIA.fullmatch(linha["data"])
            if not m:
                raise ErroBrasil(f"{rotulo}: data {linha['data']!r} não é "
                                 "dd/mm/aaaa")
            d = dt.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
            if d in dias:
                raise ErroBrasil(f"{rotulo}: {d} repetido no SGS")
            try:
                dias[d] = Decimal(linha["valor"])
            except InvalidOperation as e:
                raise ErroBrasil(f"{rotulo}: {d} veio com valor "
                                 f"{linha['valor']!r}, que não é número") from e
    except (KeyError, TypeError, ValueError) as e:
        raise ErroBrasil(f"{rotulo}: a resposta do SGS mudou de forma "
                         f"({type(e).__name__}: {e})") from e
    return dias


def _mes(d: dt.date) -> str:
    return f"{d.year}-{d.month:02d}"


def fim_de_mes(dias: dict[dt.date, Decimal], hoje: dt.date) -> Pontos:
    """O valor do último dia do calendário de cada mês, até `hoje`. Mês sem
    esse dia fica de fora, e a comparação o acusa."""
    return {_mes(d): float(v) for d, v in dias.items()
            if d <= hoje and d.day == calendar.monthrange(d.year, d.month)[1]}


def medias_mensais(dias: dict[dt.date, Decimal],
                   hoje: dt.date) -> dict[str, Decimal]:
    """A média de cada mês já encerrado (o mês de `hoje` fica de fora)."""
    grupos: dict[str, list[Decimal]] = {}
    for d, v in dias.items():
        if _mes(d) < _mes(hoje):
            grupos.setdefault(_mes(d), []).append(v)
    return {m: sum(vs) / len(vs) for m, vs in grupos.items()}


#: Quantos meses a média da PTAX pode estar à frente do câmbio mensal: o BC
#: publica a média do mês alguns dias depois de ele fechar. Mais que isso é
#: a série mensal parada, e o gráfico mostraria um câmbio velho como atual.
PTAX_ADIANTADA = 2


def comparar_media(codigo: str, publicado: Pontos,
                   medias: dict[str, Decimal], casas: int = 4) -> None:
    """O valor mensal publicado contra a média calculada da série diária.

    A tolerância é meia unidade da última casa publicada: o BC arredonda a
    média, e nos empates exatos (0,99025) às vezes para baixo. Os meses da
    média depois do último publicado saem da conta, até `PTAX_ADIANTADA`."""
    if not publicado:
        raise ErroBrasil(f"{codigo}: a série mensal veio vazia")
    ultimo = max(publicado)
    adiante = sorted(m for m in medias if m > ultimo)
    if len(adiante) > PTAX_ADIANTADA:
        raise ErroBrasil(f"{codigo}: a série mensal para em {ultimo}, e a "
                         f"diária já tem {', '.join(adiante)}")
    folga = Decimal(5) / Decimal(10) ** (casas + 1)
    b = {m: v for m, v in medias.items() if m <= ultimo}
    so_a = sorted(publicado.keys() - b.keys())
    so_b = sorted(b.keys() - publicado.keys())
    difs = sorted(m for m in publicado.keys() & b.keys()
                  if abs(Decimal(repr(publicado[m])) - b[m]) > folga)
    partes = []
    if so_a:
        partes.append(f"só na série mensal: {', '.join(so_a[:5])}")
    if so_b:
        partes.append(f"só na média da diária: {', '.join(so_b[:5])}")
    if difs:
        partes.append("valores diferentes: " + ", ".join(
            f"{m} ({publicado[m]} e {b[m]:.6f})" for m in difs[:5]))
    if partes:
        raise ErroBrasil(f"{codigo}: a média da diária não confere; "
                         + "; ".join(partes))


#: A meia-noite de Brasília em UTC: 03:00, e 02:00 no horário de verão (até
#: 2019). Medido em 06/10/2026: 425 datas às 03:00 e 152 às 02:00, nenhuma
#: outra. Um fuso fixo em UTC-3 lia 30/11/2011 como 29/11, e a meta de
#: novembro de 2011 e de 2016 saía a do mês seguinte (o SGS 432 acusou).
MEIA_NOITE_BRASILIA = ("T03:00:00Z", "T02:00:00Z")


def _data_copom(texto: str) -> dt.date:
    """`2026-09-18T03:00:00Z` e `2011-11-30T02:00:00Z` são meia-noite em
    Brasília: o dia é o da própria data. Outra hora é erro, e não um dia
    adivinhado."""
    if texto[10:] not in MEIA_NOITE_BRASILIA:
        raise ValueError(f"data do Copom fora da meia-noite de Brasília: "
                         f"{texto!r}")
    return dt.date.fromisoformat(texto[:10])


def ler_copom(s: SerieBrasil, dados: object, hoje: dt.date) -> Pontos:
    """O histórico do Copom: cada meta com o início e o fim de vigência (o
    fim é inclusivo; `null` é a meta atual). Cada mês recebe a meta em vigor
    no seu último dia, e só meses cujo último dia já passou."""
    try:
        vigencias = []
        for x in dados["conteudo"]:
            meta = x["MetaSelic"]
            if not isinstance(meta, (int, float)) or isinstance(meta, bool):
                raise ErroBrasil(f"{s.codigo}: a reunião "
                                 f"{x.get('NumeroReuniaoCopom')} veio com a "
                                 f"meta {meta!r}, que não é número")
            fim = x["DataFimVigencia"]
            vigencias.append((_data_copom(x["DataInicioVigencia"]),
                              _data_copom(fim) if fim else None, float(meta)))
    except (KeyError, TypeError, ValueError) as e:
        raise ErroBrasil(f"{s.codigo}: a resposta do Copom mudou de forma "
                         f"({type(e).__name__}: {e})") from e
    pontos: Pontos = {}
    a, m = int(s.desde[:4]), int(s.desde[5:])
    while True:
        dia = dt.date(a, m, calendar.monthrange(a, m)[1])
        if dia > hoje:
            break
        metas = [v for i, f, v in vigencias
                 if i <= dia and (f is None or dia <= f)]
        if len(metas) > 1:
            raise ErroBrasil(f"{s.codigo}: {dia} cai em {len(metas)} "
                             "vigências do Copom")
        if metas:
            pontos[_mes(dia)] = metas[0]
        a, m = (a + 1, 1) if m == 12 else (a, m + 1)
    return pontos


def ultimo_dia(dias: dict[dt.date, Decimal],
               hoje: dt.date) -> dict[str, Decimal]:
    """O valor do último dia com dado de cada mês já encerrado: o fim do mês
    de uma série de dias úteis (`fim_de_mes` quer o último do calendário)."""
    ultimos: dict[str, dt.date] = {}
    for d in dias:
        m = _mes(d)
        if m < _mes(hoje) and (m not in ultimos or d > ultimos[m]):
            ultimos[m] = d
    return {m: dias[d] for m, d in ultimos.items()}


#: Quanto o último dia útil da série diária pode diferir do estoque mensal,
#: em proporção. Medido nas reservas em 07/10/2026: 331 de 337 meses
#: (09/1998 a 09/2026) iguais; os seis outros, de 11/2007 a 02/2010,
#: diferem em até US$ 67 milhões (0,035%).
ULTIMO_DIA_TOLERANCIA = Decimal("0.0005")


def comparar_ultimo_dia(codigo: str, publicado: Pontos,
                        ultimos: dict[str, Decimal], escala: int = 1) -> None:
    """O estoque mensal publicado contra o último dia de cada mês da série
    diária, dividido por `escala` (a unidade da página), desde o primeiro mês
    da diária e até `ULTIMO_DIA_TOLERANCIA`. Os meses da diária depois do
    último publicado saem da conta, até `PTAX_ADIANTADA`."""
    if not publicado:
        raise ErroBrasil(f"{codigo}: a série mensal veio vazia")
    if not ultimos:
        raise ErroBrasil(f"{codigo}: a série diária veio vazia")
    ultimo = max(publicado)
    adiante = sorted(m for m in ultimos if m > ultimo)
    if len(adiante) > PTAX_ADIANTADA:
        raise ErroBrasil(f"{codigo}: a série mensal para em {ultimo}, e a "
                         f"diária já tem {', '.join(adiante)}")
    inicio = min(ultimos)
    a = {m: Decimal(repr(v)) for m, v in publicado.items() if m >= inicio}
    b = {m: v / escala for m, v in ultimos.items() if m <= ultimo}
    so_a = sorted(a.keys() - b.keys())
    so_b = sorted(b.keys() - a.keys())
    difs = sorted(m for m in a.keys() & b.keys()
                  if abs(a[m] - b[m]) > ULTIMO_DIA_TOLERANCIA * abs(b[m]))
    partes = []
    if so_a:
        partes.append(f"só na série mensal: {', '.join(so_a[:5])}")
    if so_b:
        partes.append(f"só na diária: {', '.join(so_b[:5])}")
    if difs:
        partes.append("valores diferentes: " + ", ".join(
            f"{m} ({a[m]} e {b[m]})" for m in difs[:5]))
    if partes:
        raise ErroBrasil(f"{codigo}: o último dia da diária não confere; "
                         + "; ".join(partes))


def comparar_razao_pib(codigo: str, publicado: Pontos, saldo: Pontos,
                       pib: Pontos) -> None:
    """A série em % do PIB contra a conta: saldo ÷ PIB de 12 meses × 100,
    arredondada a duas casas (meio para cima), igual mês a mês. Os meses do
    saldo sem par na série publicada, e vice-versa, também são erro."""
    if not publicado:
        raise ErroBrasil(f"{codigo}: a série mensal veio vazia")
    conta = {m: (Decimal(repr(v)) / Decimal(repr(pib[m])) * 100).quantize(
                 Decimal("0.01"), ROUND_HALF_UP)
             for m, v in saldo.items() if m in pib}
    so_a = sorted(publicado.keys() - conta.keys())
    so_b = sorted(conta.keys() - publicado.keys())
    difs = sorted(m for m in publicado.keys() & conta.keys()
                  if Decimal(repr(publicado[m])) != conta[m])
    partes = []
    if so_a:
        partes.append(f"só na série publicada: {', '.join(so_a[:5])}")
    if so_b:
        partes.append(f"só na conta: {', '.join(so_b[:5])}")
    if difs:
        partes.append("valores diferentes: " + ", ".join(
            f"{m} ({publicado[m]} e {conta[m]})" for m in difs[:5]))
    if partes:
        raise ErroBrasil(f"{codigo}: a conta pelo PIB não confere; "
                         + "; ".join(partes))


#: Cada série do SGS vem arredondada a uma casa: a diferença de duas pode
#: sair 0,1 longe do saldo publicado, nunca mais (na unidade do SGS).
DIFERENCA_TOLERANCIA = Decimal("0.1")


def comparar_diferenca(codigo: str, publicado: Pontos, mais: Pontos,
                       menos: Pontos, escala: int = 1) -> None:
    """A série publicada, de volta à unidade do SGS (× `escala`), contra a
    primeira parte menos a segunda, mês a mês, até `DIFERENCA_TOLERANCIA`.
    Mês de um lado só, ou de uma parte só, também é erro."""
    if not publicado:
        raise ErroBrasil(f"{codigo}: a série mensal veio vazia")
    a = {m: Decimal(repr(v)) * escala for m, v in publicado.items()}
    b = {m: Decimal(repr(v)) - Decimal(repr(menos[m]))
         for m, v in mais.items() if m in menos}
    partes = []
    so_partes = sorted(mais.keys() ^ menos.keys())
    if so_partes:
        partes.append(f"só numa das partes: {', '.join(so_partes[:5])}")
    so_a = sorted(a.keys() - b.keys())
    so_b = sorted(b.keys() - a.keys())
    difs = sorted(m for m in a.keys() & b.keys()
                  if abs(a[m] - b[m]) > DIFERENCA_TOLERANCIA)
    if so_a:
        partes.append(f"só na série publicada: {', '.join(so_a[:5])}")
    if so_b:
        partes.append(f"só na conta: {', '.join(so_b[:5])}")
    if difs:
        partes.append("valores diferentes: " + ", ".join(
            f"{m} ({a[m].quantize(DIFERENCA_TOLERANCIA)} e "
            f"{b[m].quantize(DIFERENCA_TOLERANCIA)})" for m in difs[:5]))
    if partes:
        raise ErroBrasil(f"{codigo}: a diferença das partes não confere; "
                         + "; ".join(partes))


# ------------------------------------------------------------------ TabNet

#: Por HTTP, e não HTTPS: em 08/10/2026 o HTTPS do TabNet respondeu 2 de 10
#: pedidos (os outros caíram depois de 22 s sem conexão), e o HTTP, 10 de 10.
#: O dado é público, e as duas tabelas conferem uma à outra.
TABNET = "http://tabnet.datasus.gov.br/cgi/"

#: O TabNet responde a formulário: a página dele por GET (`corpo` `None`) e
#: a tabela por POST, as duas em latin-1. O transporte das outras fontes lê
#: JSON em UTF-8 por GET, e por isso o TabNet tem o seu.
Formulario = Callable[[str, bytes | None], Resposta]

SELECT_HTML = re.compile(r'<select[^>]*name="([^"]+)"[^>]*>(.*?)</select>',
                         re.S | re.I)
OPCAO_HTML = re.compile(r'<option value="([^"]+)"[^>]*>([^<\r\n]*)', re.I)
PRE_HTML = re.compile(r"<pre[^>]*>(.*?)</pre>", re.S | re.I)
LINHA_TABNET = re.compile(r'^"(\d{4})";(\d+)\r?$', re.M)
#: A nota que o TabNet põe embaixo de cada tabela do SIM: "Dados finais
#: disponíveis até 2024 - data de extração 02/12/2025."
FINAIS_TABNET = re.compile(r"Dados finais disponíveis até (\d{4})")


def formulario_http(timeout: float = 60.0,
                    prazo: float | None = None) -> Formulario:
    """O transporte real do TabNet. Como `transporte_http`, nunca levanta
    por falha de rede (devolve o status), e o `prazo` é o mesmo."""

    def pedir(url: str, corpo: bytes | None) -> Resposta:
        fim = None if prazo is None else time.monotonic() + prazo
        req = urllib.request.Request(url, corpo, headers={
            "User-Agent": "numeros-publicos/0.1 (dados abertos; uso pessoal)"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return Resposta(r.status, ler_ate(r, fim).decode("latin-1"))
        except urllib.error.HTTPError as e:
            return Resposta(e.code, e.read().decode("latin-1"))
        except (urllib.error.URLError, OSError) as e:
            return Resposta(FALHA_DE_REDE, f"{type(e).__name__}: {e}")

    return pedir


def pedir_tabnet(formulario: Formulario, rotulo: str, url: str,
                 corpo: bytes | None,
                 dormir: Callable[[float], None]) -> str:
    """Uma página do TabNet, com a repetição de `buscar_json`."""
    espera = ESPERA_INICIAL
    for tentativa in range(1, TENTATIVAS + 1):
        r = formulario(url, corpo)
        if r.status == 200:
            return r.corpo
        if r.status not in REPETIVEIS or tentativa == TENTATIVAS:
            raise ErroBrasil(f"{rotulo}: HTTP {r.status} em {url}: "
                             f"{_texto_html(r.corpo)[:120]}")
        dormir(espera)
        espera *= 2
    raise AssertionError("inalcançável")


def url_tabnet(t: TabelaTabNet) -> str:
    """O formulário da tabela: o endereço que quem lê abre para refazer."""
    return f"{TABNET}deftohtm.exe?{t.definicao}"


def ler_formulario_tabnet(rotulo: str, pagina: str,
                          t: TabelaTabNet) -> list[str]:
    """Os arquivos de todos os anos que o formulário oferece, depois de
    conferir que a opção do filtro ainda é a mesma causa."""
    selects = {html.unescape(n): c for n, c in SELECT_HTML.findall(pagina)}
    if "Arquivos" not in selects or t.filtro not in selects:
        raise ErroBrasil(f"{rotulo}: o formulário perdeu o campo Arquivos ou "
                         f"{t.filtro}")
    opcoes = {v: html.unescape(o).strip()
              for v, o in OPCAO_HTML.findall(selects[t.filtro])}
    if opcoes.get(t.valor) != t.rotulo:
        raise ErroBrasil(f"{rotulo}: a opção {t.valor} de {t.filtro} agora é "
                         f"{opcoes.get(t.valor)!r}, e não {t.rotulo!r}")
    arquivos = [v for v, _ in OPCAO_HTML.findall(selects["Arquivos"])]
    if not arquivos:
        raise ErroBrasil(f"{rotulo}: o formulário não oferece nenhum ano")
    return arquivos


def corpo_tabnet(t: TabelaTabNet, arquivos: list[str]) -> bytes:
    """Ano do óbito na linha, óbitos por ocorrência, todos os anos, o filtro
    da causa e a saída em texto separado por ponto e vírgula."""
    campos = [("Linha", "Ano_do_Óbito"), ("Coluna", "--Não-Ativa--"),
              ("Incremento", "Óbitos_p/Ocorrênc")]
    campos += [("Arquivos", a) for a in arquivos]
    campos += [(t.filtro, t.valor), ("formato", "prn"), ("mostre", "Mostra")]
    return urlencode(campos, encoding="latin-1").encode("ascii")


def ler_tabela_tabnet(rotulo: str, pagina: str) -> tuple[Pontos, int]:
    """Os óbitos de cada ano e o último ano final, que a nota da tabela diz."""
    texto = html.unescape(pagina)
    pre = PRE_HTML.search(texto)
    if not pre:
        raise ErroBrasil(f"{rotulo}: a resposta do TabNet não traz a tabela: "
                         f"{_texto_html(pagina)[-160:]}")
    finais = FINAIS_TABNET.search(texto)
    if not finais:
        raise ErroBrasil(f"{rotulo}: a nota \"Dados finais disponíveis até\" "
                         "sumiu da tabela")
    pontos = {a: float(n) for a, n in LINHA_TABNET.findall(pre.group(1))}
    return pontos, int(finais.group(1))


def comparar(codigo: str, a: Pontos, b: Pontos) -> None:
    """Exige os mesmos períodos com os mesmos valores. Diz o que diverge
    (até cinco de cada tipo)."""
    so_a, so_b = sorted(a.keys() - b.keys()), sorted(b.keys() - a.keys())
    difs = sorted(p for p in a.keys() & b.keys() if a[p] != b[p])
    partes = []
    if so_a:
        partes.append(f"só na 1ª leitura: {', '.join(so_a[:5])}")
    if so_b:
        partes.append(f"só na 2ª leitura: {', '.join(so_b[:5])}")
    if difs:
        partes.append("valores diferentes: " + ", ".join(
            f"{p} ({a[p]} e {b[p]})" for p in difs[:5]))
    if partes:
        raise ErroBrasil(f"{codigo}: as duas leituras divergem; "
                         + "; ".join(partes))


def _seguinte(periodicidade: str, p: str) -> str:
    """`1996T4` → `1997T1`; `2019-12` → `2020-01`; `2019` → `2020`."""
    if periodicidade == "anual":
        return str(int(p) + 1)
    if periodicidade == "trimestral":
        a, t = int(p[:4]), int(p[5])
        return f"{a + t // 4}T{t % 4 + 1}"
    a, m = int(p[:4]), int(p[5:])
    return f"{a + m // 12}-{m % 12 + 1:02d}"


def buracos(periodicidade: str, pontos: Pontos) -> list[str]:
    """Os períodos que faltam entre o primeiro e o último. Não é erro: a
    fonte pode não ter publicado, e o gráfico mostra o vão em vez de ligar
    os pontos. Mas sai impresso, para ninguém o descobrir na página."""
    if not pontos:
        return []
    ultimo = max(pontos)
    faltam, p = [], min(pontos)
    while p < ultimo:
        p = _seguinte(periodicidade, p)
        if p not in pontos:
            faltam.append(p)
    return faltam


class Leitura(NamedTuple):
    serie: SerieBrasil
    pontos: Pontos
    origem: str  # a URL da primeira leitura, a que vai para o banco
    conferida: str  # a URL (ou as URLs) da segunda


def coletar(s: SerieBrasil, transporte: Transporte,
            dormir: Callable[[float], None] = time.sleep,
            hoje: dt.date | None = None,
            formulario: Formulario | None = None) -> Leitura:
    """Lê a série pelos dois caminhos e só devolve se baterem."""
    hoje = hoje or dt.date.today()
    ano = hoje.year

    def obter(url: str) -> object:
        try:
            return buscar_json(transporte, url, dormir)
        except ErroIBGE as e:  # o nome é do IBGE; a repetição serve aos dois
            raise ErroBrasil(f"{s.codigo}: {e}") from e

    def diaria(codigo: int) -> tuple[str, dict[dt.date, Decimal]]:
        """A série diária inteira desde o ano de `s.desde`, em janelas."""
        urls = [_url_sgs(codigo, de, ate)
                for de, ate in janelas_diarias(int(s.desde[:4]), ano)]
        dias: dict[dt.date, Decimal] = {}
        for u in urls:
            parte = ler_sgs_diaria(f"{s.codigo} (SGS {codigo})", obter(u))
            if parte.keys() & dias.keys():
                raise ErroBrasil(f"{s.codigo}: as janelas diárias do SGS "
                                 "se sobrepõem")
            dias |= parte
        return " + ".join(urls), dias

    if s.fonte == "Ministério da Saúde":
        formulario = formulario or formulario_http(prazo=PRAZO_PEDIDO)
        lidas = []
        for t in s.tabnet:
            rotulo = f"{s.codigo} ({t.definicao})"
            arquivos = ler_formulario_tabnet(rotulo, pedir_tabnet(
                formulario, rotulo, url_tabnet(t), None, dormir), t)
            lidas.append(ler_tabela_tabnet(rotulo, pedir_tabnet(
                formulario, rotulo, f"{TABNET}tabcgi.exe?{t.definicao}",
                corpo_tabnet(t, arquivos), dormir)))
        (a, fa), (b, fb) = lidas
        if fa != fb:
            raise ErroBrasil(f"{s.codigo}: as duas tabelas dão anos finais "
                             f"diferentes ({fa} e {fb})")
        a, b = ({p: v for p, v in _cortar(s, x).items() if int(p) <= fa}
                for x in (a, b))
        u1, u2 = (url_tabnet(t) for t in s.tabnet)
    elif s.fonte == "IBGE":
        u1, u2 = url_agregados(s), url_sidra(s)
        a = ler_agregados(s, obter(u1))
        b = ler_sidra(s, obter(u2))
    elif s.conferencia == "ptax":
        u1 = url_sgs(s, SGS_DESDE, ano)
        a = ler_sgs(s, obter(u1))
        u2, dias = diaria(SGS_PTAX)
        if not a:
            raise ErroBrasil(f"{s.codigo}: a fonte não devolveu nenhum ponto")
        medias = {m: v for m, v in medias_mensais(dias, hoje).items()
                  if m >= s.desde}
        comparar_media(s.codigo, a, medias)
        return Leitura(s, a, u1, u2)
    elif s.conferencia == "inpc":
        u1 = url_ipeadata(s)
        a = ler_ipeadata(s, obter(u1))
        de = int(s.desde[:4])
        un, ui = (_url_sgs(SGS_SALARIO_MINIMO, de, ano),
                  _url_sgs(SGS_INPC, de, ano))
        nominal = ler_sgs_mensal(f"{s.codigo} (SGS {SGS_SALARIO_MINIMO})",
                                 obter(un))
        inpc = ler_sgs_mensal(f"{s.codigo} (SGS {SGS_INPC})", obter(ui))
        comparar_razao(s.codigo, a, nominal, inpc)
        return Leitura(s, a, u1, f"{un} + {ui}")
    elif s.conferencia == "copom":
        u1 = API_COPOM
        a = ler_copom(s, obter(u1), hoje)
        u2, dias = diaria(s.sgs)
        b = _cortar(s, fim_de_mes(dias, hoje))
    else:
        u1 = url_sgs(s, SGS_DESDE, ano)
        janelas = (url_sgs(s, SGS_DESDE, SGS_CORTE - 1),
                   url_sgs(s, SGS_CORTE, ano))
        u2 = " + ".join(janelas)
        a = ler_sgs(s, obter(u1))
        b = {}
        for u in janelas:
            parte = ler_sgs(s, obter(u))
            if parte.keys() & b.keys():
                raise ErroBrasil(f"{s.codigo}: as duas janelas do SGS se "
                                 "sobrepõem")
            b |= parte
        if s.conferencia == "ultimo-dia":
            ud, dias = diaria(s.sgs_diaria)
            comparar_ultimo_dia(s.codigo, a, ultimo_dia(dias, hoje),
                                s.dividir_por)
            u2 = f"{u2} + {ud}"
        elif s.conferencia == "razao-pib":
            us, up = (_url_sgs(s.sgs_saldo, SGS_DESDE, ano),
                      _url_sgs(SGS_PIB_12_MESES, SGS_DESDE, ano))
            saldo = ler_sgs_mensal(f"{s.codigo} (SGS {s.sgs_saldo})",
                                   obter(us))
            pib = ler_sgs_mensal(f"{s.codigo} (SGS {SGS_PIB_12_MESES})",
                                 obter(up))
            comparar_razao_pib(s.codigo, a, saldo, pib)
            u2 = f"{u2} + {us} + {up}"
        elif s.conferencia == "diferenca":
            um, un = (_url_sgs(c, SGS_DESDE, ano) for c in s.sgs_partes)
            mais = ler_sgs_mensal(f"{s.codigo} (SGS {s.sgs_partes[0]})",
                                  obter(um))
            menos = ler_sgs_mensal(f"{s.codigo} (SGS {s.sgs_partes[1]})",
                                   obter(un))
            comparar_diferenca(s.codigo, a, mais, menos, s.dividir_por)
            u2 = f"{u2} + {um} + {un}"
    if not a:
        raise ErroBrasil(f"{s.codigo}: a fonte não devolveu nenhum ponto")
    comparar(s.codigo, a, b)
    return Leitura(s, a, u1, u2)


# ------------------------------------------------------------------ banco

ESQUEMA = """
-- Uma linha por ponto. Cada série é uma fatia, regravada inteira.
CREATE TABLE IF NOT EXISTS observacao (
    serie TEXT NOT NULL, periodo TEXT NOT NULL, valor REAL NOT NULL,
    coletado_em TEXT NOT NULL, origem TEXT NOT NULL,
    PRIMARY KEY (serie, periodo));

-- O que se sabe da série e de onde ela veio, uma linha por série.
CREATE TABLE IF NOT EXISTS serie (
    codigo TEXT PRIMARY KEY, nome TEXT NOT NULL, unidade TEXT NOT NULL,
    fonte TEXT NOT NULL, periodicidade TEXT NOT NULL,
    origem TEXT NOT NULL, conferida TEXT NOT NULL, pontos INTEGER NOT NULL,
    primeiro TEXT NOT NULL, ultimo TEXT NOT NULL, coletado_em TEXT NOT NULL);

-- A meta de inflação de cada ano, conferida na ingestão contra o SGS e contra
-- a tabela da página do Banco Central. Regravada inteira, como uma série.
CREATE TABLE IF NOT EXISTS meta_inflacao (
    ano INTEGER PRIMARY KEY, meta REAL NOT NULL, tolerancia REAL NOT NULL,
    norma TEXT NOT NULL, origem TEXT NOT NULL, conferida TEXT NOT NULL,
    coletado_em TEXT NOT NULL);
"""


class ArmazemBrasil:
    def __init__(self, caminho: str | Path) -> None:
        # Sem transação implícita: `gravar` abre e fecha a dela à mão.
        self.con = sqlite3.connect(str(caminho), isolation_level=None)
        self.con.executescript(ESQUEMA)

    def __enter__(self) -> ArmazemBrasil:
        return self

    def __exit__(self, *_: object) -> None:
        self.con.close()

    def cobertura(self, codigo: str) -> tuple[int, str, str] | None:
        """Quantos pontos a série tem no banco, o primeiro e o último."""
        n, primeiro, ultimo = self.con.execute(
            "SELECT COUNT(*), MIN(periodo), MAX(periodo) FROM observacao"
            " WHERE serie = ?", (codigo,)).fetchone()
        return None if n == 0 else (n, primeiro, ultimo)

    def _encolheria(self, codigo: str, ps: list[str]) -> list[str]:
        """O que a série perderia, em cada uma das três dimensões."""
        velho = self.cobertura(codigo)
        if velho is None:
            return []
        n, primeiro, ultimo = velho
        return [motivo for motivo, perde in (
            (f"{n} pontos para {len(ps)}", len(ps) < n),
            (f"começo de {primeiro} para {ps[0]}", ps[0] > primeiro),
            (f"fim de {ultimo} para {ps[-1]}", ps[-1] < ultimo),
        ) if perde]

    def _metas_encolheriam(self, anos: list[int]) -> list[str]:
        n, primeiro, ultimo = self.con.execute(
            "SELECT COUNT(*), MIN(ano), MAX(ano) FROM meta_inflacao").fetchone()
        if n == 0:
            return []
        return [motivo for motivo, perde in (
            (f"{n} anos para {len(anos)}", len(anos) < n),
            (f"começo de {primeiro} para {anos[0]}", anos[0] > primeiro),
            (f"fim de {ultimo} para {anos[-1]}", anos[-1] < ultimo),
        ) if perde]

    def gravar(self, leituras: list[Leitura], *,
               metas: LeituraMetas | None = None,
               permitir_encolher: bool = False) -> None:
        """Regrava as séries (e a meta de inflação, quando vem) numa transação
        só: ou entram todas, ou nenhuma. Recusa série vazia e a que
        encolheria, nas três dimensões; a meta, do mesmo jeito, em anos."""
        quando = agora()
        self.con.execute("BEGIN")
        try:
            if metas is not None:
                anos = [m.ano for m in metas.metas]
                if not anos:
                    raise ErroBrasil("meta de inflação sem nenhum ano; nada "
                                     "foi gravado")
                motivos = ([] if permitir_encolher
                           else self._metas_encolheriam(anos))
                if motivos:
                    raise ErroBrasil(
                        f"a meta de inflação encolheria ({'; '.join(motivos)});"
                        " nada foi gravado (--permitir-encolher se for a "
                        "intenção)")
                self.con.execute("DELETE FROM meta_inflacao")
                self.con.executemany(
                    "INSERT INTO meta_inflacao VALUES (?, ?, ?, ?, ?, ?, ?)",
                    [(m.ano, m.meta, m.tolerancia, m.norma, metas.origem,
                      metas.conferida, quando) for m in metas.metas])
            for leitura in leituras:
                s, ps = leitura.serie, sorted(leitura.pontos)
                if not ps:
                    raise ErroBrasil(f"{s.codigo}: série sem nenhum ponto; "
                                     "nada foi gravado")
                motivos = ([] if permitir_encolher
                           else self._encolheria(s.codigo, ps))
                if motivos:
                    raise ErroBrasil(
                        f"{s.codigo}: a série encolheria ({'; '.join(motivos)}). "
                        "Ou a fonte mudou, e é notícia, ou o pedido está "
                        "errado; nada foi gravado (--permitir-encolher "
                        "se for a intenção)")
                self.con.execute("DELETE FROM observacao WHERE serie = ?",
                                 (s.codigo,))
                self.con.executemany(
                    "INSERT INTO observacao VALUES (?, ?, ?, ?, ?)",
                    [(s.codigo, p, leitura.pontos[p], quando, leitura.origem)
                     for p in ps])
                self.con.execute(
                    "INSERT OR REPLACE INTO serie VALUES "
                    "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (s.codigo, s.nome, s.unidade, s.fonte, s.periodicidade,
                     leitura.origem, leitura.conferida, len(ps), ps[0], ps[-1],
                     quando))
        except BaseException:
            self.con.execute("ROLLBACK")
            raise
        self.con.execute("COMMIT")

    def pontos(self, codigo: str) -> Pontos:
        return dict(self.con.execute(
            "SELECT periodo, valor FROM observacao WHERE serie = ?"
            " ORDER BY periodo", (codigo,)).fetchall())

    def metas(self) -> dict | None:
        """A meta de inflação gravada, com a procedência; `None` se não há."""
        linhas = self.con.execute(
            "SELECT ano, meta, tolerancia, origem, conferida, coletado_em"
            " FROM meta_inflacao ORDER BY ano").fetchall()
        if not linhas:
            return None
        _, _, _, origem, conferida, coletado = linhas[0]
        return {"fonte": PAGINA_METAS, "origem": origem,
                "conferida": conferida, "coletadoEm": coletado,
                "anos": [[a, m, t] for a, m, t, *_ in linhas]}


#: Quanto esperar, em segundos, antes de tentar de novo o que falhou. Em
#: 07/10/2026 o SGS devolveu um corpo que não era JSON no meio de duas coletas
#: seguidas, e a mesma URL respondeu certo minutos depois.
PAUSA_NOVA_TENTATIVA = 120

#: Prazos, em segundos: o de cada pedido, da conexão ao fim do corpo, e o da
#: coleta inteira, depois do qual a série que ainda não começou fica de fora
#: com o dado anterior. Em 09/10/2026 a semanal passou dos 20 min do job e
#: foi cancelada sem uma linha de log nem aviso (o SIM recém-incluído, o
#: Ipeadata fora do ar): o job tem de terminar a tempo de avisar.
PRAZO_PEDIDO = 90.0
PRAZO_COLETA = 600.0

#: O nome da meta de inflação nas falhas, ao lado dos códigos das séries.
META = "meta de inflação"


class Ingestao(NamedTuple):
    leituras: list[Leitura]  # as que bateram, na ordem de `series`
    metas: LeituraMetas | None  # `None` se a meta falhou
    falhas: list[str]  # "código: motivo", uma por série (ou meta) de fora


def ingerir(banco: str | Path, transporte: Transporte,
            dormir: Callable[[float], None] = time.sleep,
            series: tuple[SerieBrasil, ...] = SERIES,
            permitir_encolher: bool = False,
            prazo: float | None = None,
            ao_ler: Callable[[str, float, str | None], None] | None = None,
            relogio: Callable[[], float] = time.monotonic) -> Ingestao:
    """Coleta e confere cada série e a meta de inflação por si, e grava numa
    transação as que bateram.

    A que falhar (fonte fora do ar, leituras que divergem) é tentada de novo
    uma vez no fim, depois de `PAUSA_NOVA_TENTATIVA`; se falhar outra vez,
    fica de fora, o banco guarda o que já tinha dela e o motivo vai em
    `falhas`. Uma fonte com problema não segura as outras. Nada lido é erro,
    e nada é gravado; série que encolheria também (`gravar`).

    Com `prazo` (segundos desde o início), a coleta que ainda não começou
    quando ele passa vira falha, e a nova tentativa só acontece se couber.
    `ao_ler(código, segundos, motivo ou None)` vem ao fim de cada coleta,
    para quem chama mostrar o andamento."""
    coletas: dict[str, Callable[[], Leitura | LeituraMetas]] = {
        s.codigo: (lambda s=s: coletar(s, transporte, dormir)) for s in series}
    coletas[META] = lambda: coletar_metas(transporte, dormir)

    inicio = relogio()

    def tentar(codigos: list[str]) -> tuple[dict, dict[str, str]]:
        lidas, falhas = {}, {}
        for codigo in codigos:
            if prazo is not None and relogio() - inicio > prazo:
                falhas[codigo] = (f"{codigo}: não coletada, a coleta passou "
                                  f"do prazo de {prazo / 60:g} min")
                continue
            comeco = relogio()
            try:
                lidas[codigo] = coletas[codigo]()
            except ErroBrasil as e:
                motivo = str(e)
                falhas[codigo] = (motivo if motivo.startswith(f"{codigo}:")
                                  else f"{codigo}: {motivo}")
            if ao_ler is not None:
                ao_ler(codigo, relogio() - comeco, falhas.get(codigo))
        return lidas, falhas

    lidas, falhas = tentar(list(coletas))
    if falhas and (prazo is None
                   or relogio() - inicio + PAUSA_NOVA_TENTATIVA < prazo):
        dormir(PAUSA_NOVA_TENTATIVA)
        de_novo, falhas = tentar(list(falhas))
        lidas.update(de_novo)
    if not lidas:
        raise ErroBrasil("nada foi lido, e nada foi gravado: "
                         + "; ".join(falhas.values()))
    leituras = [lidas[s.codigo] for s in series if s.codigo in lidas]
    metas = lidas.get(META)
    with ArmazemBrasil(banco) as db:
        db.gravar(leituras, metas=metas, permitir_encolher=permitir_encolher)
    return Ingestao(leituras, metas, list(falhas.values()))


# ------------------------------------------------------------------ mandatos

#: De onde a data de um mandato pode ter sido lida. `gov.br` cobre a
#: Presidência, o Planalto e o Diário Oficial (`in.gov.br`); fora dele, só o
#: TSE e as duas Casas do Congresso.
DOMINIOS_OFICIAIS = ("gov.br", "tse.jus.br", "senado.leg.br", "camara.leg.br",
                     "congressonacional.leg.br")
COLUNAS_MANDATOS = ("nome", "inicio", "fim", "como", "fonte", "rotulo")
#: O rótulo vai dentro da faixa do gráfico, onde o nome inteiro não cabe.
ROTULO_MAX = 20


class Mandato(NamedTuple):
    nome: str
    inicio: str  # AAAA-MM-DD, o dia em que passou a ocupar o cargo
    fim: str | None  # o dia em que o seguinte assumiu; None se ainda ocupa
    como: str  # como assumiu, pelo nome do ato, sem adjetivo
    fonte: str  # link https da página oficial que dá as datas
    #: O nome curto, como a Agência Senado o escreve nas manchetes ("Lula",
    #: "Temer"): é o que cabe na faixa do gráfico. O nome inteiro fica na
    #: tabela da página.
    rotulo: str


def _oficial(url: str) -> bool:
    u = urlparse(url)
    host = u.hostname or ""
    return u.scheme == "https" and any(
        host == d or host.endswith("." + d) for d in DOMINIOS_OFICIAIS)


def _data_valida(d: str) -> bool:
    """`AAAA-MM-DD` de um dia que existe (`fromisoformat` aceita outras
    formas a partir do Python 3.11, por isso a forma se confere à parte)."""
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", d):
        return False
    try:
        dt.date.fromisoformat(d)
    except ValueError:
        return False
    return True


def validar_mandatos(mandatos: list[Mandato]) -> None:
    """Fonte oficial em toda linha, datas válidas, e cada período começa no
    dia em que o anterior termina: nem sobreposição, nem buraco. O último, e
    só ele, está em aberto: alguém ocupa o cargo hoje. Junta todos os erros
    antes de recusar."""
    if not mandatos:
        raise ErroBrasil("tabela de mandatos inválida: a tabela está vazia")
    erros = []
    for i, m in enumerate(mandatos, start=1):
        if not m.nome.strip() or not m.como.strip():
            erros.append(f"linha {i}: nome ou forma de assumir vazios")
        if not m.rotulo.strip() or len(m.rotulo) > ROTULO_MAX:
            erros.append(f"linha {i} ({m.nome}): rótulo {m.rotulo!r} vazio ou "
                         f"com mais de {ROTULO_MAX} caracteres")
        if not _oficial(m.fonte):
            erros.append(f"linha {i} ({m.nome}): fonte {m.fonte!r} não é "
                         "link https de domínio oficial")
        for d in (m.inicio, m.fim):
            if d is not None and not _data_valida(d):
                erros.append(f"linha {i} ({m.nome}): data {d!r} inválida")
        if m.fim is not None and m.fim <= m.inicio:
            erros.append(f"linha {i} ({m.nome}): termina antes de começar")
        if m.fim is None and i != len(mandatos):
            erros.append(f"linha {i} ({m.nome}): só o último pode estar em "
                         "aberto")
    if mandatos[-1].fim is not None:
        erros.append(f"o último período ({mandatos[-1].nome}) termina em "
                     f"{mandatos[-1].fim}: falta quem assumiu depois")
    # A mesma pessoa com dois rótulos viraria duas pessoas no gráfico.
    rotulos: dict[str, str] = {}
    for m in mandatos:
        if rotulos.setdefault(m.nome, m.rotulo) != m.rotulo:
            erros.append(f"{m.nome}: rótulos diferentes ({rotulos[m.nome]!r} "
                         f"e {m.rotulo!r})")
    for a, b in zip(mandatos, mandatos[1:]):
        if a.fim is not None and a.fim != b.inicio:
            tipo = "sobreposição" if b.inicio < a.fim else "buraco"
            erros.append(f"{tipo} entre {a.nome} (até {a.fim}) e {b.nome} "
                         f"(desde {b.inicio})")
    if erros:
        raise ErroBrasil("tabela de mandatos inválida: " + "; ".join(erros))


def carregar_mandatos(caminho: str | Path = MANDATOS) -> list[Mandato]:
    with open(caminho, encoding="utf-8", newline="") as f:
        leitor = csv.DictReader(f)
        if tuple(leitor.fieldnames or ()) != COLUNAS_MANDATOS:
            raise ErroBrasil(f"{caminho}: colunas {leitor.fieldnames}, "
                             f"esperadas {list(COLUNAS_MANDATOS)}")
        mandatos = [Mandato(r["nome"], r["inicio"], r["fim"] or None,
                            r["como"], r["fonte"], r["rotulo"]) for r in leitor]
    validar_mandatos(mandatos)
    return mandatos


# ---------------------------------------------------------- meta de inflação

#: A meta de cada ano como o Conselho Monetário Nacional a fixou, transcrita
#: da tabela do Banco Central (`PAGINA_METAS`). Em 2003 e 2004 a meta foi
#: revista um ano depois de fixada; vale a revista, que é a que a tabela põe
#: primeiro e a que o SGS publica. Desde 2025 a meta é contínua (Resolução
#: CMN nº 5.141): vale para os 12 meses acumulados em cada mês, e não mais só
#: para dezembro; a tabela da página para em 2024, e esses anos se conferem
#: pelo texto da mesma página.
METAS = Path(__file__).with_name("brasil_metas.csv")
COLUNAS_METAS = ("ano", "meta", "tolerancia", "norma")
PAGINA_METAS = "https://www.bcb.gov.br/controleinflacao/historicometas"
#: A mesma página como o site do Banco Central a carrega: JSON com o conteúdo
#: em HTML, tabela inclusive.
API_METAS = ("https://www.bcb.gov.br/api/paginasite/sitebcb/"
             "controleinflacao/historicometas")
#: O centro da meta, um valor por ano.
SGS_METAS = 13521


class Meta(NamedTuple):
    ano: int
    meta: float  # o centro, em % ao ano
    tolerancia: float  # o intervalo, em pontos percentuais para cada lado
    norma: str  # a resolução do CMN que a fixou


class LeituraMetas(NamedTuple):
    metas: list[Meta]
    origem: str  # o SGS 13521
    conferida: str  # a página do Banco Central, pela API dela


def carregar_metas(caminho: str | Path = METAS) -> list[Meta]:
    """A tabela versionada, com os anos seguidos e sem buraco."""
    with open(caminho, encoding="utf-8", newline="") as f:
        leitor = csv.DictReader(f)
        if tuple(leitor.fieldnames or ()) != COLUNAS_METAS:
            raise ErroBrasil(f"{caminho}: colunas {leitor.fieldnames}, "
                             f"esperadas {list(COLUNAS_METAS)}")
        try:
            metas = [Meta(int(r["ano"]), float(r["meta"]),
                          float(r["tolerancia"]), r["norma"]) for r in leitor]
        except ValueError as e:
            raise ErroBrasil(f"{caminho}: {e}") from e
    erros = [] if metas else ["a tabela está vazia"]
    for a, b in zip(metas, metas[1:]):
        if b.ano != a.ano + 1:
            erros.append(f"de {a.ano} para {b.ano}: fora de ordem ou com "
                         "ano faltando")
    for m in metas:
        if not 0 < m.tolerancia < m.meta:
            erros.append(f"{m.ano}: meta {m.meta} e intervalo {m.tolerancia}")
        if not m.norma.startswith("Resolução CMN nº "):
            erros.append(f"{m.ano}: norma {m.norma!r}")
    if erros:
        raise ErroBrasil("tabela de metas inválida: " + "; ".join(erros))
    return metas


def ler_sgs_metas(dados: object) -> dict[int, float]:
    """O SGS 13521: um valor por ano, datado de 1º de janeiro."""
    try:
        anos: dict[int, float] = {}
        for linha in dados or []:
            m = re.fullmatch(r"01/01/(\d{4})", linha["data"])
            if not m or int(m[1]) in anos:
                raise ErroBrasil(f"meta de inflação: data {linha['data']!r} "
                                 "fora da forma ou repetida no SGS")
            anos[int(m[1])] = float(linha["valor"])
    except (KeyError, TypeError, ValueError) as e:
        raise ErroBrasil("meta de inflação: a resposta do SGS mudou de forma "
                         f"({type(e).__name__}: {e})") from e
    return anos


LINHA_HTML = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S)
CELULA_HTML = re.compile(r"<t[dh][^>]*>(.*?)</t[dh]>", re.S)


def _texto_html(h: str) -> str:
    """O texto de um trecho de HTML, com os espaços juntados. A página traz
    espaços de largura zero no meio de palavras ("CM​N")."""
    t = html.unescape(re.sub(r"<[^>]+>", " ", h)).replace("​", "")
    return " ".join(t.split())


def ler_tabela_metas(dados: object) -> tuple[
        dict[int, tuple[float, float, float, float]], str]:
    """A tabela da página do Banco Central: `{ano: (meta, intervalo,
    inferior, superior)}`, e o texto que vem antes dela.

    Colunas: ano, norma, data, meta, tamanho do intervalo, intervalo, inflação
    efetiva e carta aberta. As linhas de 1999 e 2000 não têm norma nem data (a
    célula da de 2001 as cobre), então as colunas se contam do fim. Onde a
    meta foi revista (2003 e 2004, com asterisco), cada célula traz as duas, a
    vigente primeiro."""
    try:
        conteudo = dados["conteudo"]
        tabela = {}
        for linha in LINHA_HTML.findall(conteudo):
            cel = [_texto_html(c) for c in CELULA_HTML.findall(linha)]
            ano = re.fullmatch(r"(\d{4})\*?", cel[0]) if cel else None
            if ano is None:
                continue  # o cabeçalho
            meta, tol, intervalo = (c.split()[0] for c in cel[-5:-2])
            inferior, superior = intervalo.split("-")
            tabela[int(ano[1])] = tuple(float(v.replace(",", ".")) for v in
                                        (meta, tol, inferior, superior))
        texto = _texto_html(conteudo.split("<table")[0])
    except (KeyError, TypeError, IndexError, ValueError) as e:
        raise ErroBrasil("meta de inflação: a página do Banco Central mudou "
                         f"de forma ({type(e).__name__}: {e})") from e
    if not tabela:
        raise ErroBrasil("meta de inflação: a página do Banco Central veio "
                         "sem nenhuma linha na tabela")
    return tabela, texto


def conferir_metas(metas: list[Meta], sgs: dict[int, float],
                   tabela: dict[int, tuple[float, float, float, float]],
                   texto: str) -> None:
    """A tabela versionada contra as duas leituras: os mesmos anos e o mesmo
    centro do SGS; a meta, o intervalo e as duas pontas da tabela da página;
    e, nos anos depois da tabela, a norma, a meta e o intervalo escritos no
    texto da página. Junta todos os erros antes de recusar."""
    erros = []
    anos = {m.ano for m in metas}
    if anos != sgs.keys():
        erros.append(f"anos só na tabela versionada: {sorted(anos - sgs.keys())}"
                     f"; só no SGS: {sorted(sgs.keys() - anos)}")
    if tabela.keys() - anos:
        erros.append("anos da página do Banco Central fora da tabela "
                     f"versionada: {sorted(tabela.keys() - anos)}")
    for m in metas:
        if m.ano in sgs and sgs[m.ano] != m.meta:
            erros.append(f"{m.ano}: meta {m.meta} aqui e {sgs[m.ano]} no SGS")
        esperado = (m.meta, m.tolerancia, round(m.meta - m.tolerancia, 2),
                    round(m.meta + m.tolerancia, 2))
        if m.ano in tabela:
            if tabela[m.ano] != esperado:
                erros.append(f"{m.ano}: {esperado} aqui e {tabela[m.ano]} na "
                             "página do Banco Central")
        elif m.ano < max(tabela):
            erros.append(f"{m.ano}: ausente da tabela do Banco Central")
        else:
            for trecho in (m.norma, f"{m.meta:.2f}%".replace(".", ","),
                           f"±{m.tolerancia:g}".replace(".", ",")):
                if trecho not in texto:
                    erros.append(f"{m.ano}: o texto da página do Banco "
                                 f"Central não traz {trecho!r}")
    if erros:
        raise ErroBrasil("meta de inflação: as leituras divergem; "
                         + "; ".join(erros))


def coletar_metas(transporte: Transporte,
                  dormir: Callable[[float], None] = time.sleep,
                  metas: list[Meta] | None = None) -> LeituraMetas:
    """Confere a tabela versionada contra o SGS e contra a página."""
    metas = carregar_metas() if metas is None else metas
    origem = SGS.format(codigo=SGS_METAS) + "?formato=json"
    try:
        sgs = ler_sgs_metas(buscar_json(transporte, origem, dormir))
        tabela, texto = ler_tabela_metas(
            buscar_json(transporte, API_METAS, dormir))
    except ErroIBGE as e:
        raise ErroBrasil(f"meta de inflação: {e}") from e
    conferir_metas(metas, sgs, tabela, texto)
    return LeituraMetas(metas, origem, API_METAS)


# ---------------------------------------------------------------- exportação

MESES = ("janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho",
         "agosto", "setembro", "outubro", "novembro", "dezembro")


def unidade_exportada(s: SerieBrasil, ultimo: str) -> str:
    """A unidade como a página a imprime. "R$ do último mês" diria a quem lê
    só que existe um último mês; o retrato escreve qual."""
    if s.unidade != REAIS_DO_ULTIMO_MES:
        return s.unidade
    return f"R$ de {MESES[int(ultimo[5:]) - 1]} de {ultimo[:4]}"


def retrato(db: ArmazemBrasil, mandatos: list[Mandato],
            series: tuple[SerieBrasil, ...] = SERIES,
            anterior: dict | None = None) -> dict:
    """O que a página `/brasil/` lê: as séries na ordem de `SERIES`, inteiras,
    cada uma com as duas leituras e a data de coleta, e a tabela de mandatos.

    Série ausente do banco é ERRO, e não série a menos: a página promete
    todas, e um retrato com uma a menos seria bem formado e incompleto. O mesmo
    vale para a meta de inflação, que o gráfico do IPCA desenha.

    Com `anterior` (o `brasil.json` já publicado), a série ou a meta que
    faltar no banco sai dele como está, com a data de coleta antiga: é a
    atualização semanal depois de uma fonte falhar, porque o banco do runner
    começa vazio. Ausente dos dois, continua erro."""
    velhas = {s["codigo"]: s for s in (anterior or {}).get("series", [])}
    saida = []
    for s in series:
        linha = db.con.execute(
            "SELECT origem, conferida, coletado_em FROM serie WHERE codigo = ?",
            (s.codigo,)).fetchone()
        pontos = db.pontos(s.codigo)
        if (linha is None or not pontos) and s.codigo in velhas:
            saida.append(velhas[s.codigo])
            continue
        if linha is None or not pontos:
            raise ErroBrasil(f"{s.codigo}: série ausente do banco; rode "
                             "brasil-ingerir antes de exportar")
        origem, conferida, coletado = linha
        saida.append({
            "codigo": s.codigo, "nome": s.nome,
            "unidade": unidade_exportada(s, max(pontos)),
            "fonte": s.fonte, "periodicidade": s.periodicidade,
            "origem": origem, "conferida": conferida, "coletadoEm": coletado,
            "pontos": [[p, v] for p, v in sorted(pontos.items())],
        })
    meta = db.metas() or (anterior or {}).get("metaInflacao")
    if meta is None:
        raise ErroBrasil("meta de inflação ausente do banco; rode "
                         "brasil-ingerir antes de exportar")
    return {"series": saida, "mandatos": [m._asdict() for m in mandatos],
            "metaInflacao": meta}


def _cobertura_retrato(r: dict) -> dict[str, tuple[int, str, str]]:
    return {s["codigo"]: (len(s["pontos"]), s["pontos"][0][0],
                          s["pontos"][-1][0]) for s in r["series"]}


def gravar_retrato(r: dict, saida: str | Path,
                   permitir_encolher: bool = False) -> str:
    """Escreve `brasil.json`, comparando com o que vai sobrescrever.

    Recusa encolher em qualquer das dimensões: série que some, série com
    menos pontos, começo mais tarde ou fim mais cedo, e mandato a menos
    (`stack-ingestao.md`, lição 3b). Não reescreve quando só os carimbos de
    coleta mudaram: o commit sairia vazio de dado e republicaria o site.
    Devolve `"gravado"` ou `"inalterado"`."""
    saida = Path(saida)
    if saida.exists():
        velho = json.loads(saida.read_text(encoding="utf-8"))
        if not permitir_encolher:
            erros = []
            novo_cob = _cobertura_retrato(r)
            for codigo, (n, primeiro, ultimo) in _cobertura_retrato(velho).items():
                if codigo not in novo_cob:
                    erros.append(f"{codigo}: a série sumiu")
                    continue
                m, p, u = novo_cob[codigo]
                if m < n:
                    erros.append(f"{codigo}: {n} pontos para {m}")
                if p > primeiro:
                    erros.append(f"{codigo}: começo de {primeiro} para {p}")
                if u < ultimo:
                    erros.append(f"{codigo}: fim de {ultimo} para {u}")
            if len(r["mandatos"]) < len(velho.get("mandatos", [])):
                erros.append(f"mandatos {len(velho['mandatos'])} → "
                             f"{len(r['mandatos'])}")
            va = [a[0] for a in velho.get("metaInflacao", {}).get("anos", [])]
            na = [a[0] for a in r["metaInflacao"]["anos"]]
            if va and (len(na) < len(va) or na[0] > va[0] or na[-1] < va[-1]):
                erros.append(f"meta de inflação de {va[0]}–{va[-1]} "
                             f"({len(va)} anos) para {na[0]}–{na[-1]} "
                             f"({len(na)})")
            if erros:
                raise ErroBrasil("RECUSADO: o retrato do Brasil encolheu — "
                                 + "; ".join(erros) + ". Se é a intenção, "
                                 "repita com --permitir-encolher. Nada gravado.")

        def sem_carimbo(x: dict) -> dict:
            meta = {k: v for k, v in x.get("metaInflacao", {}).items()
                    if k != "coletadoEm"}
            return {**x, "metaInflacao": meta,
                    "series": [{k: v for k, v in s.items()
                                if k != "coletadoEm"} for s in x["series"]]}
        if sem_carimbo(velho) == sem_carimbo(r):
            return "inalterado"
    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(json.dumps(r, ensure_ascii=False, separators=(",", ":"))
                     + "\n", encoding="utf-8")
    return "gravado"

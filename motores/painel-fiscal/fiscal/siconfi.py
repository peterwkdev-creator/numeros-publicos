"""Cliente da API de dados abertos do SICONFI (Tesouro Nacional).

Todo fato aqui foi **verificado contra a API real em 03/09/2026**, antes de uma
linha de código existir. O registro completo está em
`.claude/rules/painel-fiscal.md`.

O acesso à rede fica atrás de `Transporte`, e a espera atrás de `dormir`, para
que o sistema inteiro seja testável sem tocar a rede e sem esperar de verdade --
mesmo desenho do `sys-radar-licitacoes`, e pelo mesmo motivo.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, replace
from typing import Callable

BASE = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt"

# Pseudo-status para falha de rede. Não existe no HTTP: serve para que o
# transporte **nunca levante** e quem decide repetir possa receber, em vez de
# ser interrompido. Ver a seção correspondente na regra do radar.
FALHA_DE_REDE = 599
REPETIVEIS = frozenset({429, 500, 502, 503, 504, FALHA_DE_REDE})

# Medido em 03/09/2026: 8 requisições a 0,8 s, 8 em HTTP 200, ~1,1 s cada.
# A API é lenta, não hostil -- ao contrário do PNCP, não há orçamento diário.
PAUSA_PADRAO = 0.8
TENTATIVAS_PADRAO = 4

NORDESTE = frozenset({"MA", "PI", "CE", "RN", "PB", "PE", "AL", "SE", "BA"})

# As três linhas que interessam no RGF Anexo 01, dentro de 189-229 devolvidas.
# `DespesaComPessoalTotal` aparece DUAS vezes, distinguida só pela coluna: ler
# apenas pelo `cod_conta` pega a linha errada metade das vezes.
COLUNA_VALOR = "Valor"
COLUNA_PERCENTUAL = "% sobre a RCL Ajustada"
# A RCL **bruta** e a RCL **AJUSTADA** sao numeros diferentes, e o percentual
# publicado usa a ajustada -- o proprio rotulo da coluna diz "% sobre a RCL
# Ajustada". Salvador/BA em 2024/3: bruta 10.384.311.525,53, ajustada
# 10.250.806.767,53, e 3.318.008.507,92 / ajustada = 32,37%, o valor declarado.
# Usar a bruta faz a conferencia divergir SEMPRE no mesmo sentido -- foi assim
# que `fiscal conferir` denunciou o erro do proprio leitor, em 03/09/2026.
CONTA_RCL = "ReceitaCorrenteLiquidaLimite"
CONTA_RCL_AJUSTADA = "ReceitaCorrenteLiquidaAjustada"
CONTA_PESSOAL = "DespesaComPessoalTotal"
CONTA_PRUDENCIAL = "LimitePrudencialDespesaComPe"


class ErroSiconfi(Exception):
    """Falha que não adianta repetir: resposta ilegível ou status definitivo."""


@dataclass(frozen=True)
class Resposta:
    status: int
    corpo: str


Transporte = Callable[[str], Resposta]
Dormir = Callable[[float], None]


@dataclass(frozen=True)
class Ente:
    """Uma linha de `/entes`. `esfera` M = município, E = estado, U = União."""

    codigo_ibge: int
    nome: str
    uf: str
    regiao: str
    esfera: str
    populacao: int | None
    cnpj: str | None

    @classmethod
    def de_json(cls, d: dict) -> "Ente":
        return cls(
            codigo_ibge=int(d["cod_ibge"]),
            nome=(d.get("ente") or "").strip(),
            uf=(d.get("uf") or "").strip(),
            regiao=(d.get("regiao") or "").strip(),
            esfera=(d.get("esfera") or "").strip(),
            populacao=_inteiro(d.get("populacao")),
            cnpj=(d.get("cnpj") or None),
        )


@dataclass(frozen=True)
class Pessoal:
    """Despesa com pessoal de um ente num quadrimestre, como ELE a declarou.

    O percentual vem **calculado e homologado pelo próprio ente**. Recalcular a
    partir de `despesa / rcl` criaria uma segunda verdade que ninguém assinou --
    ver `especs/painel-fiscal.md`.
    """

    codigo_ibge: int
    exercicio: int
    periodo: int
    rcl: float | None
    rcl_ajustada: float | None
    despesa: float | None
    percentual: float | None
    limite_prudencial: float | None
    #: Veio do RGF Simplificado do 2º semestre, não do 3º quadrimestre -- ver
    #: `url_rgf`. A janela é a mesma (os 12 meses até dezembro).
    simplificado: bool = False

    @property
    def acima_do_prudencial(self) -> bool | None:
        """`None` quando falta um dos dois lados -- ausência não é 'está abaixo'."""
        if self.percentual is None or self.limite_prudencial is None:
            return None
        return self.percentual > self.limite_prudencial


def _inteiro(v) -> int | None:
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def _numero(v) -> float | None:
    """Número da API, ou `None`. **Zero é um número e é preservado** -- a
    ausência é representada por `None`, nunca por 0."""
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def transporte_http(timeout: float = 60.0) -> Transporte:
    """Transporte real. **Nunca levanta por falha de rede**: devolve status.

    `TimeoutError` de socket é `OSError`, **não** `urllib.error.URLError` --
    foi por essa fresta que um erro de rede atravessou todo o backoff do radar e
    derrubou uma execução com 2.500 registros já lidos. Aqui ele é capturado.
    """

    def buscar(url: str) -> Resposta:
        req = urllib.request.Request(
            url,
            headers={"Accept": "application/json",
                     "User-Agent": "painel-fiscal/1.0 (uso pessoal)"},
        )
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return Resposta(r.status, r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            return Resposta(e.code, e.read().decode("utf-8", "replace"))
        except urllib.error.URLError as e:
            return Resposta(FALHA_DE_REDE, f"{type(e).__name__}: {e.reason}")
        except OSError as e:
            return Resposta(FALHA_DE_REDE, f"{type(e).__name__}: {e}")

    return buscar


def _envelope(resposta: Resposta, o_que: str) -> dict:
    """Decodifica o envelope `{items, hasMore, limit, offset, count, links}`."""
    try:
        d = json.loads(resposta.corpo)
    except json.JSONDecodeError as e:
        amostra = resposta.corpo[:200]
        raise ErroSiconfi(
            f"resposta ilegível ao buscar {o_que} "
            f"(HTTP {resposta.status}): {amostra!r}"
        ) from e
    if not isinstance(d, dict) or "items" not in d:
        raise ErroSiconfi(
            f"envelope inesperado ao buscar {o_que} (HTTP {resposta.status}): "
            f"chaves {sorted(d) if isinstance(d, dict) else type(d).__name__}"
        )
    return d


def buscar(
    url: str,
    o_que: str,
    transporte: Transporte,
    *,
    dormir: Dormir = time.sleep,
    tentativas: int = TENTATIVAS_PADRAO,
    pausa: float = PAUSA_PADRAO,
) -> dict:
    """Busca uma URL com espera dobrando, e devolve o envelope decodificado.

    Repete só o que vale a pena repetir (`REPETIVEIS`). Status definitivo -- um
    400 por parâmetro errado, por exemplo -- levanta na hora: repetir um erro de
    programação só gasta tempo e esconde a causa.
    """
    espera = pausa
    ultimo: Resposta | None = None
    for tentativa in range(1, tentativas + 1):
        ultimo = transporte(url)
        if ultimo.status == 200:
            return _envelope(ultimo, o_que)
        if ultimo.status not in REPETIVEIS:
            raise ErroSiconfi(
                f"HTTP {ultimo.status} ao buscar {o_que}: {ultimo.corpo[:200]!r}"
            )
        if tentativa < tentativas:
            dormir(espera)
            espera *= 2
    assert ultimo is not None
    raise ErroSiconfi(
        f"desisti de {o_que} depois de {tentativas} tentativas; "
        f"último status {ultimo.status}"
    )


def url_entes() -> str:
    return f"{BASE}/entes"


def entes(
    transporte: Transporte,
    *,
    dormir: Dormir = time.sleep,
    uf: frozenset[str] | None = None,
    esfera: str | None = "M",
) -> list[Ente]:
    """Todos os entes, ou só os das UFs pedidas.

    **Uma requisição basta**: verificado em 03/09/2026, `/entes` devolve os
    5.598 entes de uma vez (`limit` 6000, `hasMore` false). Não paginar sem
    necessidade.

    Filtrando pelas nove UFs do Nordeste com `esfera="M"` saem **1.793** --
    e não 1.794. A diferença é Fernando de Noronha, distrito estadual de PE e
    não município, que por isso não entrega RGF municipal. Ver a regra.
    """
    d = buscar(url_entes(), "a lista de entes", transporte, dormir=dormir)
    saida = [Ente.de_json(x) for x in d["items"]]
    if uf is not None:
        saida = [e for e in saida if e.uf in uf]
    if esfera is not None:
        saida = [e for e in saida if e.esfera == esfera]
    return saida


#: Os 26 estados e o DF pelo código do IBGE de dois dígitos. No `/entes` os
#: estados vêm com `uf='BR'` (25/10/2026): a sigla tem de sair do código.
UF_DO_CODIGO: dict[int, str] = {
    11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO",
    21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB", 26: "PE", 27: "AL",
    28: "SE", 29: "BA", 31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR",
    42: "SC", 43: "RS", 50: "MS", 51: "MT", 52: "GO", 53: "DF",
}


def esfera_de(codigo_ibge: int) -> str:
    """O `co_esfera` do pedido: 'E' para os códigos de 2 dígitos, 'M' para os de 7.

    O DF (53) vem com `esfera='D'` no `/entes`, mas o RREO e o RGF pedidos com
    `co_esfera='D'` voltam **vazios com HTTP 200**; com 'E', 2.127 e 215
    linhas, e cada linha diz `esfera='E'` (medido em 25/10/2026). Por isso a
    esfera do pedido sai do código, nunca do cadastro.
    """
    return "E" if codigo_ibge < 100 else "M"


def estados(transporte: "Transporte", *, dormir: "Dormir" = time.sleep) -> list[Ente]:
    """Os 26 estados e o DF, com a UF tirada do código e o DF gravado como 'E'.

    Gravar como veio daria 27 entes com `uf='BR'` e um DF com esfera que
    nenhum pedido acha. Código estadual fora do `UF_DO_CODIGO` estoura alto:
    o universo mudou e isso se confere antes de seguir.
    """
    d = buscar(url_entes(), "a lista de entes", transporte, dormir=dormir)
    saida = []
    for x in d["items"]:
        e = Ente.de_json(x)
        if e.esfera in ("E", "D"):
            saida.append(replace(e, uf=UF_DO_CODIGO[e.codigo_ibge], esfera="E"))
    return sorted(saida, key=lambda e: e.codigo_ibge)


def url_rgf(exercicio: int, periodo: int, codigo_ibge: int,
            *, simplificado: bool = False, anexo: str = "RGF-Anexo 01",
            esfera: str | None = None) -> str:
    """RGF de um ente: por padrão o Anexo 01 (despesa com pessoal).

    `anexo` e `esfera` entraram com a dívida dos estados (Anexo 02, 27/10/2026).
    Os padrões reproduzem o pedido de antes byte a byte -- a coleta municipal
    não muda --, e `esfera=None` segue tirando o `co_esfera` do código
    (`esfera_de`), que é o que faz o DF (53) responder.

    `id_ente` é obrigatório na prática: sem ele a API devolve `items: []` com
    HTTP **200** -- resposta vazia, não erro. E **repetir o parâmetro não busca
    dois entes**: volta um só, em silêncio. Daí uma requisição por município.

    `simplificado=True` pede o **RGF Simplificado semestral** (art. 63 da LRF:
    município com menos de 50 mil habitantes pode optar por ele) do 2º
    semestre, que cobre os mesmos 12 meses até dezembro do 3º quadrimestre.
    Por isso só existe para `periodo=3`: o 1º semestre (até junho) não
    coincide com o 1º (abril) nem com o 2º (agosto) quadrimestre. Medido em
    11/10/2026: dos 2.326 municípios sem RGF quadrimestral em 2024/3, 39 de
    40 sorteados tinham o simplificado, com os mesmos `cod_conta` e colunas.
    """
    if not 1 <= periodo <= 3:
        raise ValueError(f"quadrimestre fora de 1..3: {periodo!r}")
    if simplificado and periodo != 3:
        raise ValueError("o RGF Simplificado só equivale ao 3º quadrimestre")
    q = urllib.parse.urlencode({
        "an_exercicio": exercicio,
        "in_periodicidade": "S" if simplificado else "Q",
        "nr_periodo": 2 if simplificado else periodo,
        "co_tipo_demonstrativo": "RGF Simplificado" if simplificado else "RGF",
        "no_anexo": anexo,
        "co_esfera": esfera or esfera_de(codigo_ibge),
        "co_poder": "E",
        "id_ente": codigo_ibge,
    })
    return f"{BASE}/rgf?{q}"


# --- Dívida dos estados: RGF Anexo 02 (espec numeros-publicos-divida-estados) --

ANEXO_DIVIDA = "RGF-Anexo 02"
#: A posição em 31/12: a coluna do 3º quadrimestre do relatório do 3º.
COLUNA_3Q = "Até o 3º Quadrimestre"
#: A posição em 31/12 do ano anterior, que o relatório repete: é o elo do
#: encadeamento (§9.3 da espec) e o ponto de 2014 no relatório de 2015.
COLUNA_SALDO_ANTERIOR = "SALDO DO EXERCÍCIO ANTERIOR"

#: Campo da tabela `divida` <- `cod_conta` da fonte. **Pelo código, nunca pelo
#: nome** (`stack-ingestao.md`, "Identificador legível..."): o nome muda entre
#: anos e duas linhas podem ter o mesmo nome com códigos diferentes. As 8
#: existem com o mesmo código de 2015 a 2025 (medido em 26/10/2026), menos a
#: RCL ajustada, que só aparece de 2020/2021 em diante.
CONTAS_DIVIDA = {
    "dc": "DividaConsolidada",
    "deducoes": "DeducoesDaDividaConsolidada",
    "dcl": "DividaConsolidadaLiquida",
    "rcl": "RGF2ReceitaCorrenteLiquida",
    "rcl_ajustada": "ReceitaCorrenteLiquidaAjustadaParaCalculoDosLimitesDeEndividamento",
    "percentual": "PercentualDaDCLSobreARCL",
    "limite_senado": "LimiteDefinidoPorResolucaoDoSenadoFederal",
    "limite_alerta": "LimiteDeAlerta",
}
CAMPOS_DIVIDA = tuple(CONTAS_DIVIDA)

#: Contas que a fonte entrega como **tabela**: o mesmo `cod_conta` + `coluna`
#: em várias linhas, separadas só pela ordem da resposta. É a trajetória de
#: ajuste da dívida (Resolução do Senado 40/2001): MA 2015 traz 54 linhas de
#: `PercentualDaDCLSobreARCLTrajetoriaDeAjuste` na coluna "% da DCL sobre a
#: RCL", 15 anos x 3 quadrimestres mais o "% Limite de Endividamento", e
#: nenhum outro campo (nem `rotulo`) as distingue; há linhas iguais por inteiro
#: (MA 2015: "1º" 32,68 duas vezes) [medido 27/10/2026]. Só nelas a chave
#: ganha a `ordem` (0, 1, 2... na ordem da resposta) e a repetição se aceita;
#: o `conta` ("1º", "2º"...) nunca é chave. Em qualquer outra conta, par
#: repetido continua falhando alto. Nenhuma das 8 da página está aqui.
CONTAS_EM_TABELA = ("PercentualDaDCLSobreARCLTrajetoria",)

#: Limite ou alerta abaixo disto está em **pontos percentuais**, não em reais:
#: CE 2015-2022 e DF 2016 declaram 200 e 180 (a armadilha dos municípios); o
#: menor limite em reais de 2015-2025 passa de R$ 1 bi [medido 27/10/2026].
TETO_PONTOS_PERCENTUAIS = 1000.0
LIMITES_DIVIDA = ("limite_senado", "limite_alerta")


@dataclass(frozen=True)
class Divida:
    """O RGF 02 de uma UF num exercício: os 8 números da página e as linhas cruas.

    `linhas` tem **todas** as linhas da resposta, chave `(cod_conta, coluna,
    ordem)` -> `(conta, valor)` (`ordem` 0, salvo em `CONTAS_EM_TABELA`), para o detalhe que muda de nome entre anos ir cru ao
    banco. Os campos da página saem da coluna `COLUNA_3Q`.
    """

    codigo_ibge: int
    exercicio: int
    periodo: int
    rotulo: str | None
    linhas: dict

    def campo(self, nome: str, coluna: str = COLUNA_3Q) -> float | None:
        par = self.linhas.get((CONTAS_DIVIDA[nome], coluna, 0))
        return None if par is None else par[1]

    def campos(self, coluna: str = COLUNA_3Q) -> dict:
        """Os 8 números da página. Limite e alerta vão **como a fonte declara**
        (Peter, 27/10/2026), só que sempre em reais: o declarado em pontos
        percentuais (`TETO_PONTOS_PERCENTUAIS`) vira R$ sobre a base do %. O
        valor cru continua na `divida_conta`."""
        c = {n: self.campo(n, coluna) for n in CAMPOS_DIVIDA}
        base = c["rcl_ajustada"] if c["rcl_ajustada"] is not None else c["rcl"]
        for n in LIMITES_DIVIDA:
            if c[n] is not None and base and abs(c[n]) < TETO_PONTOS_PERCENTUAIS:
                c[n] = round(c[n] / 100 * base, 2)
        return c

    def regua(self) -> list[str]:
        """Os problemas da régua do §9.1; lista vazia = a fatia fecha.

        1. DC - Deduções = DCL ao centavo; dedução ausente só se DC = DCL.
        2. DCL / base x 100 = % declarado (diferença <= 0,01); base = RCL
           ajustada quando existe, senão a RCL.

        Limite e alerta não reprovam (Peter, 27/10/2026): a fonte declara
        0,9 x RCL (RR), 2 x RCL ajustada - R$ 80 bi (SP 2025) ou pontos
        percentuais (CE, DF 2016), e o site mostra o que ela declara. O que
        foge do padrão sai em `avisos()`.
        """
        c = self.campos()
        p: list[str] = []
        for obrig in ("dc", "dcl", "rcl", "percentual"):
            if c[obrig] is None:
                p.append(f"campo ausente: {obrig} ({CONTAS_DIVIDA[obrig]})")
        if p:
            return p
        ded = c["deducoes"]
        if ded is None:
            if abs(c["dc"] - c["dcl"]) > 0.005:
                p.append(f"sem dedução e DC {c['dc']:.2f} != DCL {c['dcl']:.2f}")
        elif abs(round(c["dc"] - ded, 2) - c["dcl"]) > 0.005:
            p.append(f"DC - Deduções = {c['dc'] - ded:.2f} != DCL {c['dcl']:.2f}")
        base = c["rcl_ajustada"] if c["rcl_ajustada"] is not None else c["rcl"]
        if not base:
            p.append("base do % é zero")
            return p
        calc = c["dcl"] / base * 100
        if abs(calc - c["percentual"]) > 0.01 + 1e-9:
            p.append(f"DCL / base = {calc:.4f}% != declarado {c['percentual']:.2f}%")
        return p

    def avisos(self) -> list[str]:
        """Limite e alerta fora do padrão; relatam, não reprovam.

        1. declarado em pontos percentuais (convertido em `campos`);
        2. limite / base fora de 1,999-2,001, na ajustada **e** na bruta
           (SP 2021: o limite sobre a bruta e o % sobre a ajustada);
        3. alerta fora de 0,9 x limite (+-0,1%) **e** de 1,8 x as duas RCL:
           SP 2024 tem o limite sobre a ajustada e o alerta sobre a bruta
           (alerta / limite = 0,9013; alerta / (1,8 x bruta) = 1,0000)
           [medido 27/10/2026].
        """
        crus = {n: self.campo(n) for n in LIMITES_DIVIDA}
        c = self.campos()
        a: list[str] = []
        for n in LIMITES_DIVIDA:
            if crus[n] is None:
                a.append(f"{n} ausente")
            elif crus[n] != c[n]:
                a.append(f"{n} em pontos percentuais ({crus[n]:g}), gravado em reais")
        bases = [b for b in (c["rcl_ajustada"], c["rcl"]) if b]
        lim, ale = c["limite_senado"], c["limite_alerta"]
        if lim is not None and bases and not any(1.999 <= lim / b <= 2.001 for b in bases):
            a.append("limite do Senado não é 2 x a RCL (ajustada nem bruta): "
                     + ", ".join(f"{lim / b:.4f}" for b in bases))
        if ale is not None and lim:
            refs = [0.9 * lim] + [1.8 * b for b in bases]
            if not any(r and 0.999 <= ale / r <= 1.001 for r in refs):
                a.append(f"alerta / limite = {ale / lim:.4f}, e nem 1,8 x RCL")
        return a


def divida(
    codigo_ibge: int,
    exercicio: int,
    transporte: Transporte,
    *,
    periodo: int = 3,
    dormir: Dormir = time.sleep,
) -> Divida | None:
    """O RGF 02 (dívida consolidada) do Executivo de uma UF. `None` = não publicou.

    Falha alto (`ErroSiconfi`) no que viria calado: dois `rotulo` na mesma
    resposta (§2.3 item 6), o par `cod_conta` + `coluna` repetido (a chave da
    `divida_conta`), ou linha de outro ente, exercício ou anexo.
    """
    d = buscar(url_rgf(exercicio, periodo, codigo_ibge, anexo=ANEXO_DIVIDA, esfera="E"),
               f"o RGF 02 de {codigo_ibge} em {exercicio}/{periodo}", transporte,
               dormir=dormir)
    itens = d["items"]
    if d.get("hasMore"):
        raise ErroSiconfi(f"RGF 02 de {codigo_ibge} {exercicio}: hasMore=true, paginação não prevista")
    if not itens:
        return None
    rotulos = {i.get("rotulo") for i in itens}
    if len(rotulos) != 1:
        raise ErroSiconfi(f"RGF 02 de {codigo_ibge} {exercicio}: mais de um rótulo {sorted(map(str, rotulos))}")
    linhas: dict = {}
    ordens: dict = {}
    for i in itens:
        if (_inteiro(i.get("cod_ibge")) != codigo_ibge or _inteiro(i.get("exercicio")) != exercicio
                or _inteiro(i.get("periodo")) != periodo or i.get("anexo") != ANEXO_DIVIDA):
            raise ErroSiconfi(
                f"RGF 02 de {codigo_ibge} {exercicio}/{periodo}: linha de outro recorte "
                f"({i.get('cod_ibge')}, {i.get('exercicio')}/{i.get('periodo')}, {i.get('anexo')})")
        chave = ((i.get("cod_conta") or "").strip(), (i.get("coluna") or "").strip())
        if not chave[0] or not chave[1]:
            raise ErroSiconfi(f"RGF 02 de {codigo_ibge} {exercicio}: linha sem cod_conta ou coluna: {i!r}"[:300])
        ordem = ordens.get(chave, 0)
        if ordem and not chave[0].startswith(CONTAS_EM_TABELA):
            raise ErroSiconfi(f"RGF 02 de {codigo_ibge} {exercicio}: par repetido {chave}")
        ordens[chave] = ordem + 1
        linhas[(*chave, ordem)] = ((i.get("conta") or "").strip(), _numero(i.get("valor")))
    return Divida(codigo_ibge, exercicio, periodo, rotulos.pop(), linhas)


def _linha(itens: list[dict], prefixo_conta: str, coluna: str) -> float | None:
    for x in itens:
        conta = (x.get("cod_conta") or "").strip()
        if conta.startswith(prefixo_conta) and (x.get("coluna") or "").strip() == coluna:
            return _numero(x.get("valor"))
    return None


def pessoal(
    codigo_ibge: int,
    exercicio: int,
    periodo: int,
    transporte: Transporte,
    *,
    dormir: Dormir = time.sleep,
) -> Pessoal | None:
    """A despesa com pessoal de um ente, ou `None` se ele **não publicou**.

    `items: []` com HTTP 200 é a armadilha central desta API. Não é erro e não é
    zero: é ausência. Quem tratar como erro repete para sempre; quem tratar como
    dado grava zero onde não há informação -- e zero é um número.
    """
    d = buscar(
        url_rgf(exercicio, periodo, codigo_ibge),
        f"o RGF de {codigo_ibge} em {exercicio}/{periodo}",
        transporte,
        dormir=dormir,
    )
    itens = d["items"]
    simplificado = False
    if not itens and periodo == 3:
        # Sem o quadrimestral, o ente pode ter optado pelo semestral (art. 63
        # da LRF). Gravar "não publicou" sem perguntar foi o erro até
        # 11/10/2026: 2.326 municípios "sem relatório", quase todos com ele.
        dormir(PAUSA_PADRAO)
        d = buscar(
            url_rgf(exercicio, periodo, codigo_ibge, simplificado=True),
            f"o RGF Simplificado de {codigo_ibge} em {exercicio}/2º semestre",
            transporte,
            dormir=dormir,
        )
        itens = d["items"]
        simplificado = True
    if not itens:
        return None
    return Pessoal(
        codigo_ibge=codigo_ibge,
        exercicio=exercicio,
        periodo=periodo,
        rcl=_linha(itens, CONTA_RCL, COLUNA_VALOR),
        rcl_ajustada=_linha(itens, CONTA_RCL_AJUSTADA, COLUNA_VALOR),
        despesa=_linha(itens, CONTA_PESSOAL, COLUNA_VALOR),
        percentual=_linha(itens, CONTA_PESSOAL, COLUNA_PERCENTUAL),
        limite_prudencial=_linha(itens, CONTA_PRUDENCIAL, COLUNA_PERCENTUAL),
        simplificado=simplificado,
    )

# ---------------------------------------------------------------- despesa por função

# As 28 funções orçamentárias da Portaria MOG 42/1999. É lista **fechada e
# legal**, não inferência: o anexo não traz hierarquia utilizável (`cod_conta`
# tem dois valores para 1.464 linhas), então o que separa função de subfunção é
# o nome estar aqui. Subfunção fica de fora -- somá-la duplicaria tudo.
FUNCOES: tuple[str, ...] = (
    "Legislativa", "Judiciária", "Essencial à Justiça", "Administração",
    "Defesa Nacional", "Segurança Pública", "Relações Exteriores",
    "Assistência Social", "Previdência Social", "Saúde", "Trabalho",
    "Educação", "Cultura", "Direitos da Cidadania", "Urbanismo", "Habitação",
    "Saneamento", "Gestão Ambiental", "Ciência e Tecnologia", "Agricultura",
    "Organização Agrária", "Indústria", "Comércio e Serviços", "Comunicações",
    "Energia", "Transporte", "Desporto e Lazer", "Encargos Especiais",
)

# **Liquidada, não empenhada nem orçada.** Empenhada é dinheiro reservado;
# dotação é intenção. Liquidada é a despesa que o município reconhece como
# efetivamente realizada -- a única que responde "quanto gastou".
COLUNA_LIQUIDADA = "DESPESAS LIQUIDADAS ATÉ O BIMESTRE (d)"

# **Cada função aparece DUAS vezes**, sob dois rótulos: uma no total geral e
# outra em "Intra-Orçamentárias", que são transferências entre órgãos do mesmo
# governo. Ler sem filtrar o rótulo pega a segunda e publica número **vinte
# vezes menor**: Salvador/BA 2024 marcaria R$ 137 milhões em Saúde no lugar de
# R$ 2,86 bilhões. Descoberto em 03/09/2026, antes de ingerir.
ROTULO_EXCETO_INTRA = "Total das Despesas Exceto Intra-Orçamentárias"
CONTA_TOTAL_DESPESAS = "DESPESAS (EXCETO INTRA-ORÇAMENTÁRIAS)"


@dataclass(frozen=True)
class Funcoes:
    """A despesa liquidada por função, e o total que o próprio anexo declara.

    O total existe para **conferir**: a soma das funções tem de fechar com ele.
    É uma integridade que a fonte oferece de graça, e mais forte que a do RGF --
    ali só dá para comparar razão contra razão; aqui, parte contra todo.
    """

    codigo_ibge: int
    exercicio: int
    periodo: int
    total: float | None
    valores: dict[str, float]
    #: Veio do **RREO Simplificado** (art. 63 da LRF), não do RREO -- ver
    #: `url_rreo`. Mesmo bimestre, mesmos anexos e mesmas contas.
    simplificado: bool = False

    @property
    def soma(self) -> float:
        return sum(self.valores.values())

    @property
    def fecha(self) -> bool | None:
        """`None` sem total -- ausência de régua não é aprovação."""
        if self.total is None or not self.valores:
            return None
        return abs(self.soma - self.total) <= max(1.0, abs(self.total) * 1e-9)


# ── RECEITA: RREO Anexo 01 (Balanço Orçamentário) ──────────────────────────
#
# Sondado em 21/09/2026, 48 requisições antes de uma linha de código. O registro
# está em `progress/painel-fiscal.md`; aqui fica o que o leitor precisa saber.
#
# A coluna é **"Até o Bimestre (c)"** — o realizado acumulado no ano, análoga à
# liquidada da despesa. A "PREVISÃO ATUALIZADA (a)" é orçamento, não
# arrecadação: confundi-las publicaria intenção como fato.
#
# O `rotulo` é sempre `Padrão` neste anexo — ao contrário do Anexo 02, onde é
# `Total das Despesas Exceto Intra-Orçamentárias` e distingue linhas homônimas.
COLUNA_REALIZADA = "Até o Bimestre (c)"

# ⚠ O `conta` NÃO identifica a linha. O `cod_conta` identifica.
#
# Medido em 21/09/2026, depois de a varredura das 5.570 acusar 15 entes cuja
# soma passava do total. Há **dois pares de homônimos** dentro da MESMA
# resposta, e eles não se parecem em gravidade:
#
#     ReceitasCorrentes                               RECEITAS CORRENTES
#     ReceitasCorrentesIntra                          RECEITAS CORRENTES
#
#     TransferenciasCorrentesDaUniaoEDeSuasEntidades  Transferências da União…
#     TransferenciasDeCapitalDaUniaoEDeSuasEntidades  Transferências da União…
#
# O primeiro é o bloco **INTRA-ORÇAMENTÁRIAS (II)**, que repete os nomes do
# bloco (I) e aparece em 0,5% dos entes. A régua de fechamento o denuncia — a
# soma passa do total —, e foi ela quem o achou.
#
# **O segundo aparece em TODOS os entes**, Imperatriz incluída — a fixture que
# passou nos dezesseis primeiros testes desta fonte. E a régua **não o vê**,
# porque o detalhe não entra na soma: uma transferência de CAPITAL entraria no
# lugar de uma corrente, o número ficaria bem formado e a conta fecharia.
# Ler pelo nome acertava por ordem de resposta, não por identificação.
#
# Conferido no corpo inteiro depois do conserto: em nenhum dos 3.243 entes o
# detalhe passa do pai. A ordem havia segurado — mas segurança por ordem não é
# a mesma coisa que ler a linha certa.
COD_TOTAL = "ReceitasCorrentes"

#: `cod_conta` → nome guardado, das oito componentes que SOMAM as correntes.
#: A ordem é a do anexo. Os doze códigos foram lidos das respostas reais, nunca
#: derivados do nome: `RECEITA AGROPECUÁRIA` e `RECEITA INDUSTRIAL` existem em
#: 116 e 17 entes, e nenhuma das duas fixtures as tinha.
#:
#: **A soma fecha exatamente**, medido em 7 municípios de São Paulo (R$ 97,5 bi)
#: a Itarumã/GO (R$ 56 mi): a maior diferença foi 2,1e-16, que é epsilon de
#: ponto flutuante e não divergência de dado. Isso dá a esta fonte a mesma
#: integridade **parte contra todo** que o Anexo 02 oferece — mais forte que a
#: do RGF, onde só dá para comparar razão contra razão.
COD_RECEITAS_CORRENTES: dict[str, str] = {
    "ReceitaTributaria": "IMPOSTOS, TAXAS E CONTRIBUIÇÕES DE MELHORIA",
    "ReceitaDeContribuicoes": "CONTRIBUIÇÕES",
    "ReceitaPatrimonial": "RECEITA PATRIMONIAL",
    "ReceitaAgropecuaria": "RECEITA AGROPECUÁRIA",
    "ReceitaIndustrial": "RECEITA INDUSTRIAL",
    "ReceitaDeServicos": "RECEITA DE SERVIÇOS",
    "TransferenciasCorrentes": "TRANSFERÊNCIAS CORRENTES",
    "OutrasReceitasCorrentes": "OUTRAS RECEITAS CORRENTES",
}

#: Detalhe guardado e **NÃO somado**: estas linhas estão DENTRO das de cima.
#:
#: Somá-las com as outras contaria o mesmo dinheiro duas vezes e quebraria a
#: régua. Ficam porque "de onde vem a transferência" é a pergunta seguinte
#: imediata de quem lê que 90% da receita é transferida — Imperatriz recebe
#: R$ 565 mi da União e R$ 229 mi do Estado, e isso é notícia diferente.
#:
#: É aqui que mora o homônimo invisível: os dois `Transferencias*DaUniao*` têm
#: nome idêntico e só o código os separa.
COD_RECEITAS_DETALHE: dict[str, str] = {
    "Impostos": "Impostos",
    "Taxas": "Taxas",
    "TransferenciasCorrentesDaUniaoEDeSuasEntidades":
        "Transferências da União e de suas Entidades",
    "TransferenciasCorrentesDosEstadosEDoDistritoFederalEDeSuasEntidades":
        "Transferências dos Estados e do Distrito Federal e de suas Entidades",
}

#: Os nomes, na ordem — é por eles que o banco e a página falam.
RECEITAS_CORRENTES: tuple[str, ...] = tuple(COD_RECEITAS_CORRENTES.values())
RECEITAS_DETALHE: tuple[str, ...] = tuple(COD_RECEITAS_DETALHE.values())


@dataclass(frozen=True)
class Receita:
    """A composição da receita corrente, e o total que o próprio anexo declara.

    Responde o que a despesa por função não responde: a página já dizia *para
    onde vai* o dinheiro e não dizia *de onde vem*. Na sondagem, a mediana da
    arrecadação própria ficou em **7,3% das receitas correntes** — o município
    brasileiro típico vive de transferência, e o número que mostra isso não
    existia em lugar nenhum nesta forma.
    """

    codigo_ibge: int
    exercicio: int
    periodo: int
    total: float | None
    valores: dict[str, float]
    #: Veio do **RREO Simplificado** (art. 63 da LRF), não do RREO -- ver
    #: `url_rreo`. Mesmo bimestre, mesmos anexos e mesmas contas.
    simplificado: bool = False

    @property
    def soma(self) -> float:
        """Só as componentes que somam — o detalhe está dentro delas."""
        return sum(v for c, v in self.valores.items() if c in RECEITAS_CORRENTES)

    @property
    def fecha(self) -> bool | None:
        """`None` sem total — ausência de régua não é aprovação."""
        if self.total is None or not self.valores:
            return None
        return abs(self.soma - self.total) <= max(1.0, abs(self.total) * 1e-9)


def _rreo(url_de, anexo: str, codigo_ibge: int, exercicio: int, periodo: int,
          transporte: Transporte, dormir: Dormir) -> tuple[list[dict], bool]:
    """Os itens do anexo no RREO e, se vier vazio, no RREO Simplificado.

    Gravar "não publicou" sem a segunda pergunta foi o erro até 11/10/2026:
    2.327 municípios sem "para onde vai o dinheiro" nem receita, com os dois
    anexos publicados no Simplificado. Devolve `(itens, simplificado)`.
    """
    d = buscar(
        url_de(exercicio, periodo, codigo_ibge),
        f"o RREO {anexo} de {codigo_ibge} em {exercicio}/{periodo}",
        transporte,
        dormir=dormir,
    )
    if d["items"]:
        return d["items"], False
    dormir(PAUSA_PADRAO)
    d = buscar(
        url_de(exercicio, periodo, codigo_ibge, simplificado=True),
        f"o RREO Simplificado {anexo} de {codigo_ibge} em {exercicio}/{periodo}",
        transporte,
        dormir=dormir,
    )
    return d["items"], True


def url_rreo_receita(exercicio: int, periodo: int, codigo_ibge: int,
                     *, simplificado: bool = False) -> str:
    """RREO Anexo 01 (Balanço Orçamentário) de um ente.

    Bimestral como o Anexo 02, `nr_periodo` de 1 a 6. `simplificado`: ver
    `url_rreo`.
    """
    if not 1 <= periodo <= 6:
        raise ValueError(f"bimestre fora de 1..6: {periodo!r}")
    q = urllib.parse.urlencode({
        "an_exercicio": exercicio,
        "nr_periodo": periodo,
        "co_tipo_demonstrativo": "RREO Simplificado" if simplificado else "RREO",
        "no_anexo": "RREO-Anexo 01",
        "co_esfera": esfera_de(codigo_ibge),
        "id_ente": codigo_ibge,
    })
    return f"{BASE}/rreo?{q}"


def _receita_de(itens: list[dict], cod: str) -> float | None:
    """A linha realizada de um `cod_conta` — ver o aviso sobre homônimos.

    Casar por `conta` devolvia a primeira ocorrência do NOME, que em duas
    situações é outra linha: o bloco intra-orçamentário e a transferência de
    capital. Aqui não há primeira ocorrência a escolher: o código é único.
    """
    for x in itens:
        if x.get("coluna") == COLUNA_REALIZADA and x.get("cod_conta") == cod:
            return _numero(x.get("valor"))
    return None


def receita(
    codigo_ibge: int,
    exercicio: int,
    periodo: int,
    transporte: Transporte,
    *,
    dormir: Dormir = time.sleep,
) -> Receita | None:
    """A composição da receita de um ente, ou `None` se ele não publicou."""
    itens, simplificado = _rreo(url_rreo_receita, "Anexo 01", codigo_ibge,
                                exercicio, periodo, transporte, dormir)
    if not itens:
        return None
    valores = {}
    for cod, nome in (*COD_RECEITAS_CORRENTES.items(),
                      *COD_RECEITAS_DETALHE.items()):
        v = _receita_de(itens, cod)
        if v is not None:
            valores[nome] = v
    total = _receita_de(itens, COD_TOTAL)
    if total is None and not valores:
        return None
    return Receita(codigo_ibge, exercicio, periodo, total, valores, simplificado)


def url_rreo(exercicio: int, periodo: int, codigo_ibge: int,
             *, simplificado: bool = False) -> str:
    """RREO Anexo 02 (despesa por função) de um ente.

    O RREO é **bimestral** -- `nr_periodo` de 1 a 6 --, enquanto o RGF é
    quadrimestral de 1 a 3. Confundir os dois devolve vazio sem dizer por quê.

    `simplificado=True` pede o **RREO Simplificado** (art. 63 da LRF), o tipo
    que o SICONFI dá a quem optou pelo RGF semestral. Ao contrário do RGF, ele
    continua **bimestral**: mesmo `nr_periodo`, mesmos anexos, mesmas contas.
    Medido em 11/10/2026: dos 30 sorteados em 2025/6, os 12 sem RREO tinham o
    Simplificado (Anexos 01 e 02), e o leitor fechou soma com total em todos.
    """
    if not 1 <= periodo <= 6:
        raise ValueError(f"bimestre fora de 1..6: {periodo!r}")
    q = urllib.parse.urlencode({
        "an_exercicio": exercicio,
        "nr_periodo": periodo,
        "co_tipo_demonstrativo": "RREO Simplificado" if simplificado else "RREO",
        "no_anexo": "RREO-Anexo 02",
        "co_esfera": esfera_de(codigo_ibge),
        "id_ente": codigo_ibge,
    })
    return f"{BASE}/rreo?{q}"


def _valor_de(itens: list[dict], conta: str) -> float | None:
    for x in itens:
        if (x.get("coluna") == COLUNA_LIQUIDADA
                and x.get("rotulo") == ROTULO_EXCETO_INTRA
                and (x.get("conta") or "").strip() == conta):
            return _numero(x.get("valor"))
    return None


def funcoes(
    codigo_ibge: int,
    exercicio: int,
    periodo: int,
    transporte: Transporte,
    *,
    dormir: Dormir = time.sleep,
) -> Funcoes | None:
    """A despesa por função de um ente, ou `None` se ele não publicou."""
    itens, simplificado = _rreo(url_rreo, "Anexo 02", codigo_ibge,
                                exercicio, periodo, transporte, dormir)
    if not itens:
        return None
    valores = {}
    for f in FUNCOES:
        v = _valor_de(itens, f)
        if v is not None:
            valores[f] = v
    total = next(
        (_numero(x.get("valor")) for x in itens
         if x.get("coluna") == COLUNA_LIQUIDADA
         and x.get("rotulo") == ROTULO_EXCETO_INTRA
         and CONTA_TOTAL_DESPESAS in (x.get("conta") or "")),
        None,
    )
    return Funcoes(codigo_ibge, exercicio, periodo, total, valores, simplificado)

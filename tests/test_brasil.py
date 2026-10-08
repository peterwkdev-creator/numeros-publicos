"""O Brasil ao longo do tempo: as duas leituras de cada série, o banco que
não encolhe calado e a tabela de quem ocupava a Presidência.

Sem rede: o transporte é um dicionário de URL para resposta, montado com a
forma das respostas reais lidas em 05/10/2026.
"""

from __future__ import annotations

import argparse
import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

from numeros_publicos import brasil, cli
from numeros_publicos.brasil import (
    ArmazemBrasil, ErroBrasil, Leitura, LeituraMetas, Mandato, Meta,
    SerieBrasil, buracos, carregar_mandatos, carregar_metas, coletar,
    coletar_metas, conferir_metas, ler_tabela_metas, periodo_ibge,
    periodo_sgs, validar_mandatos,
)
from numeros_publicos.ibge import Resposta

PIB = SerieBrasil("pib", "PIB", "%", "IBGE", "trimestral", agregado=5932,
                  variavel=6562, classificacao="11255[90707]")
IPCA = SerieBrasil("ipca", "IPCA", "%", "IBGE", "mensal", agregado=1737,
                   variavel=2265, desde="1995-07")
DIVIDA = SerieBrasil("divida-bruta", "Dívida", "% do PIB", "Banco Central",
                     "mensal", sgs=13762)


def agregados(s: SerieBrasil, serie: dict[str, str], cat: str | None = None):
    cls = []
    if s.classificacao:
        c, k = s.classificacao.rstrip("]").split("[")
        cls = [{"id": c, "nome": "x", "categoria": {cat or k: "y"}}]
    return [{"id": str(s.variavel), "variavel": s.nome, "unidade": s.unidade,
             "resultados": [{"classificacoes": cls, "series": [{
                 "localidade": {"id": "1", "nivel": {"id": "N1", "nome": "Brasil"},
                                "nome": "Brasil"},
                 "serie": serie}]}]}]


def sidra(s: SerieBrasil, serie: dict[str, str]):
    cab = {"V": "Valor", "D1C": "Brasil (Código)", "D2C": "Variável (Código)",
           "D3C": "Período (Código)"}
    return [cab] + [{"V": v, "D1C": "1", "D2C": str(s.variavel), "D3C": p}
                    for p, v in serie.items()]


def sgs(pontos: dict[str, str]):
    return [{"data": f"01/{p[5:]}/{p[:4]}", "valor": v}
            for p, v in pontos.items()]


class Transporte:
    def __init__(self, respostas: dict[str, object]) -> None:
        self.respostas = respostas
        self.pedidas: list[str] = []

    def __call__(self, url: str) -> Resposta:
        self.pedidas.append(url)
        if url not in self.respostas:
            return Resposta(404, f"não previsto: {url}")
        return Resposta(200, json.dumps(self.respostas[url]))


def sem_pausa(_):
    pass


def transporte_ibge(s, a, b=None):
    return Transporte({brasil.url_agregados(s): agregados(s, a),
                       brasil.url_sidra(s): sidra(s, b if b is not None else a)})


class TestPeriodos(unittest.TestCase):
    def test_trimestre_e_mes(self):
        self.assertEqual(periodo_ibge("199601", "trimestral"), "1996T1")
        self.assertEqual(periodo_ibge("199507", "mensal"), "1995-07")
        self.assertEqual(periodo_sgs("01/08/2026"), "2026-08")

    def test_ano(self):
        self.assertEqual(periodo_ibge("2012", "anual"), "2012")
        for codigo in ("201201", "12", "2012T1"):
            with self.assertRaises(ErroBrasil):
                periodo_ibge(codigo, "anual")

    def test_forma_inesperada_e_erro(self):
        for codigo, per in (("199605", "trimestral"), ("199513", "mensal"),
                            ("1996", "mensal")):
            with self.assertRaises(ErroBrasil):
                periodo_ibge(codigo, per)
        with self.assertRaises(ErroBrasil):
            periodo_sgs("15/08/2026")  # série diária não é o que se pediu

    def test_buracos(self):
        self.assertEqual(buracos("trimestral", {"2019T4": 1, "2020T3": 1}),
                         ["2020T1", "2020T2"])
        self.assertEqual(buracos("mensal", {"2019-11": 1, "2020-02": 1}),
                         ["2019-12", "2020-01"])
        self.assertEqual(buracos("mensal", {"2019-11": 1, "2019-12": 1}), [])
        self.assertEqual(buracos("anual", {"2019": 1, "2022": 1}),
                         ["2020", "2021"])
        self.assertEqual(buracos("anual", {"2023": 1, "2024": 1}), [])


class TestDuasLeituras(unittest.TestCase):
    SERIE = {"199601": "2.5", "199602": "2.1", "199603": "..."}

    def test_iguais_passam_e_ausente_fica_de_fora(self):
        lida = coletar(PIB, transporte_ibge(PIB, self.SERIE), sem_pausa)
        self.assertEqual(lida.pontos, {"1996T1": 2.5, "1996T2": 2.1})
        self.assertIn("/agregados/5932/periodos/all/", lida.origem)
        self.assertIn("apisidra", lida.conferida)

    def test_valor_diferente_reprova_dizendo_qual(self):
        outra = dict(self.SERIE, **{"199602": "2.2"})
        with self.assertRaisesRegex(ErroBrasil, r"1996T2 \(2.1 e 2.2\)"):
            coletar(PIB, transporte_ibge(PIB, self.SERIE, outra), sem_pausa)

    def test_ponto_faltando_num_lado_reprova(self):
        menos = {"199601": "2.5"}
        with self.assertRaisesRegex(ErroBrasil, "só na 1ª leitura: 1996T2"):
            coletar(PIB, transporte_ibge(PIB, self.SERIE, menos), sem_pausa)

    def test_categoria_errada_reprova(self):
        t = transporte_ibge(PIB, self.SERIE)
        t.respostas[brasil.url_agregados(PIB)] = agregados(PIB, self.SERIE,
                                                           cat="90687")
        with self.assertRaisesRegex(ErroBrasil, "classificação"):
            coletar(PIB, t, sem_pausa)

    def test_ipca_comeca_em_julho_de_1995(self):
        serie = {"199506": "33.0", "199507": "35.0", "199508": "30.0"}
        lida = coletar(IPCA, transporte_ibge(IPCA, serie), sem_pausa)
        self.assertEqual(sorted(lida.pontos), ["1995-07", "1995-08"])

    def test_sgs_inteira_contra_duas_janelas(self):
        tudo = {"2014-11": "60.1", "2014-12": "61.0", "2015-01": "62.3"}
        antes = {k: v for k, v in tudo.items() if k < "2015"}
        depois = {k: v for k, v in tudo.items() if k >= "2015"}
        hoje = brasil.dt.date(2026, 10, 5)
        t = Transporte({
            brasil.url_sgs(DIVIDA, 1990, 2026): sgs(tudo),
            brasil.url_sgs(DIVIDA, 1990, 2014): sgs(antes),
            brasil.url_sgs(DIVIDA, 2015, 2026): sgs(depois)})
        lida = coletar(DIVIDA, t, sem_pausa, hoje=hoje)
        self.assertEqual(len(lida.pontos), 3)
        self.assertEqual(len(t.pedidas), 3)
        # Uma janela que perde um mês é pega pela comparação.
        t.respostas[brasil.url_sgs(DIVIDA, 2015, 2026)] = sgs({})
        with self.assertRaisesRegex(ErroBrasil, "só na 1ª leitura: 2015-01"):
            coletar(DIVIDA, t, sem_pausa, hoje=hoje)

    def test_valor_do_sgs_que_nao_e_numero_reprova(self):
        # O `_numero` do IBGE tomaria isto por ausente, e o mês sumiria calado
        # das duas leituras ao mesmo tempo, sem divergência para acusar.
        with self.assertRaisesRegex(ErroBrasil, "2015-01 veio com valor 'n/d'"):
            brasil.ler_sgs(DIVIDA, sgs({"2014-12": "61.0", "2015-01": "n/d"}))

    def test_fonte_vazia_reprova(self):
        with self.assertRaisesRegex(ErroBrasil, "nenhum ponto"):
            coletar(PIB, transporte_ibge(PIB, {}), sem_pausa)


CAMBIO = next(s for s in brasil.SERIES if s.codigo == "cambio")
SELIC = next(s for s in brasil.SERIES if s.codigo == "selic")


def diaria(dias: dict[str, str]):
    """`{"1994-07-01": "0.9320"}` na forma do SGS diário."""
    return [{"data": f"{d[8:]}/{d[5:7]}/{d[:4]}", "valor": v}
            for d, v in dias.items()]


def transporte_diario(codigo: int, de: int, ate: int, dias: dict[str, str]):
    """Uma resposta por janela diária, cada uma com os dias que lhe cabem."""
    return {brasil._url_sgs(codigo, a, b): diaria(
                {d: v for d, v in dias.items() if a <= int(d[:4]) <= b})
            for a, b in brasil.janelas_diarias(de, ate)}


class TestCambio(unittest.TestCase):
    HOJE = brasil.dt.date(2026, 10, 6)
    MENSAL = {"1994-06": "2296.2562", "1994-07": "0.9333", "1994-08": "0.9002"}
    # Julho dá 0,9333 certo; agosto dá 0,90025, o empate na quinta casa que o
    # BC arredondou para baixo em 1996-04, 1999-08 e 2001-03.
    PTAX = {"1994-07-01": "0.9320", "1994-07-29": "0.9346",
            "1994-08-01": "0.9002", "1994-08-31": "0.9003",
            "1994-09-01": "0.8700"}

    def transporte(self, mensal=None, ptax=None):
        return Transporte({
            brasil.url_sgs(CAMBIO, 1990, 2026): sgs(mensal or self.MENSAL),
            **transporte_diario(1, 1994, 2026, ptax or self.PTAX)})

    def test_janelas_diarias_de_dez_anos(self):
        self.assertEqual(brasil.janelas_diarias(1994, 2026),
                         [(1994, 2003), (2004, 2013), (2014, 2023), (2024, 2026)])
        self.assertEqual(brasil.janelas_diarias(2024, 2026), [(2024, 2026)])

    def test_media_confere_ate_o_arredondamento_e_corta_no_real(self):
        lida = coletar(CAMBIO, self.transporte(), sem_pausa, hoje=self.HOJE)
        self.assertEqual(lida.pontos, {"1994-07": 0.9333, "1994-08": 0.9002})
        self.assertEqual(lida.origem, brasil.url_sgs(CAMBIO, 1990, 2026))
        self.assertIn("bcdata.sgs.1/", lida.conferida)

    def test_meia_casa_a_mais_reprova(self):
        mensal = dict(self.MENSAL, **{"1994-08": "0.9001"})
        with self.assertRaisesRegex(ErroBrasil, r"1994-08 \(0.9001 e 0.900250\)"):
            coletar(CAMBIO, self.transporte(mensal=mensal), sem_pausa,
                    hoje=self.HOJE)

    def test_mes_faltando_na_mensal_reprova(self):
        mensal = {"1994-08": "0.9002"}
        with self.assertRaisesRegex(ErroBrasil, "só na média da diária: 1994-07"):
            coletar(CAMBIO, self.transporte(mensal=mensal), sem_pausa,
                    hoje=self.HOJE)

    def test_mensal_parada_reprova(self):
        ptax = dict(self.PTAX, **{"1994-10-03": "0.85", "1994-11-01": "0.84"})
        with self.assertRaisesRegex(ErroBrasil, "para em 1994-08"):
            coletar(CAMBIO, self.transporte(ptax=ptax), sem_pausa,
                    hoje=self.HOJE)

    def test_mes_corrente_nao_tem_media(self):
        dias = brasil.ler_sgs_diaria("t", diaria(
            {"2026-09-30": "5.30", "2026-10-01": "5.40"}))
        self.assertEqual(brasil.medias_mensais(dias, self.HOJE),
                         {"2026-09": brasil.Decimal("5.30")})


RESERVAS = next(s for s in brasil.SERIES if s.codigo == "reservas")


class TestReservas(unittest.TestCase):
    HOJE = brasil.dt.date(2026, 10, 7)
    # US$ milhões, como o SGS publica. 06/1994 fica de fora pelo `desde`.
    MENSAL = {"1994-06": "40131", "1994-07": "43090", "1998-08": "67333",
              "1998-09": "45811", "1998-10": "42385"}
    # A diária começa em 09/1998; o último dia útil de outubro é 30/10.
    DIAS = {"1998-09-01": "66000", "1998-09-30": "45811",
            "1998-10-29": "42000", "1998-10-30": "42385"}

    def transporte(self, mensal=None, dias=None):
        mensal = mensal or self.MENSAL

        def janela(de, ate):
            return sgs({p: v for p, v in mensal.items()
                        if de <= int(p[:4]) <= ate})
        return Transporte({
            brasil.url_sgs(RESERVAS, 1990, 2026): janela(1990, 2026),
            brasil.url_sgs(RESERVAS, 1990, 2014): janela(1990, 2014),
            brasil.url_sgs(RESERVAS, 2015, 2026): janela(2015, 2026),
            **transporte_diario(13621, 1994, 2026, dias or self.DIAS)})

    def test_le_em_bilhoes_e_confere_o_ultimo_dia(self):
        lida = coletar(RESERVAS, self.transporte(), sem_pausa, hoje=self.HOJE)
        self.assertEqual(lida.pontos, {"1994-07": 43.09, "1998-08": 67.333,
                                       "1998-09": 45.811, "1998-10": 42.385})
        self.assertIn("bcdata.sgs.13621/", lida.conferida)

    def test_ultimo_dia_e_o_ultimo_com_dado_e_o_mes_corrente_fica_fora(self):
        dias = brasil.ler_sgs_diaria("t", diaria(
            dict(self.DIAS, **{"1998-11-03": "41900"})))
        self.assertEqual(brasil.ultimo_dia(dias, brasil.dt.date(1998, 11, 10)),
                         {"1998-09": brasil.Decimal("45811"),
                          "1998-10": brasil.Decimal("42385")})

    def test_diferenca_dentro_da_tolerancia_passa(self):
        # 15 em 42.385: 0,035%, a maior diferença medida.
        dias = dict(self.DIAS, **{"1998-10-30": "42400"})
        coletar(RESERVAS, self.transporte(dias=dias), sem_pausa,
                hoje=self.HOJE)

    def test_diferenca_fora_da_tolerancia_reprova(self):
        dias = dict(self.DIAS, **{"1998-10-30": "42500"})
        with self.assertRaisesRegex(ErroBrasil,
                                    r"não confere.*1998-10 \(42.385 e 42.5\)"):
            coletar(RESERVAS, self.transporte(dias=dias), sem_pausa,
                    hoje=self.HOJE)

    def test_mes_sem_dado_na_mensal_reprova(self):
        mensal = {p: v for p, v in self.MENSAL.items() if p != "1998-09"}
        with self.assertRaisesRegex(ErroBrasil, "só na diária: 1998-09"):
            coletar(RESERVAS, self.transporte(mensal=mensal), sem_pausa,
                    hoje=self.HOJE)

    def test_mensal_parada_reprova(self):
        ultimos = {m: brasil.Decimal(1000) for m in
                   ("2026-06", "2026-07", "2026-08", "2026-09")}
        brasil.comparar_ultimo_dia("t", {"2026-06": 1.0}, dict(
            list(ultimos.items())[:3]), 1000)
        with self.assertRaisesRegex(ErroBrasil, "para em 2026-06"):
            brasil.comparar_ultimo_dia("t", {"2026-06": 1.0}, ultimos, 1000)

    def test_diaria_vazia_reprova(self):
        with self.assertRaisesRegex(ErroBrasil, "diária veio vazia"):
            brasil.comparar_ultimo_dia("t", {"2026-06": 1.0}, {}, 1000)


DIVIDA_LIQUIDA = next(s for s in brasil.SERIES
                      if s.codigo == "divida-liquida")


class TestDividaLiquida(unittest.TestCase):
    HOJE = brasil.dt.date(2026, 10, 8)
    # 12.345 ÷ 100.000 = 12,345%: meio para cima dá 12,35 (o arredondamento
    # bancário daria 12,34). 2.000 ÷ 3.000 = 66,666…%.
    PUBLICADA = {"2001-12": "12.35", "2002-01": "66.67"}
    SALDO = {"2001-12": "12345.00", "2002-01": "2000.00"}
    PIB = {"2001-11": "90000.0", "2001-12": "100000.0", "2002-01": "3000.0"}

    def transporte(self, publicada=None, saldo=None):
        publicada = publicada or self.PUBLICADA

        def janela(de, ate):
            return sgs({p: v for p, v in publicada.items()
                        if de <= int(p[:4]) <= ate})
        return Transporte({
            brasil.url_sgs(DIVIDA_LIQUIDA, 1990, 2026): janela(1990, 2026),
            brasil.url_sgs(DIVIDA_LIQUIDA, 1990, 2014): janela(1990, 2014),
            brasil.url_sgs(DIVIDA_LIQUIDA, 2015, 2026): janela(2015, 2026),
            brasil._url_sgs(4478, 1990, 2026): sgs(saldo or self.SALDO),
            brasil._url_sgs(4382, 1990, 2026): sgs(self.PIB)})

    def test_conta_confere_com_meio_para_cima(self):
        lida = coletar(DIVIDA_LIQUIDA, self.transporte(), sem_pausa,
                       hoje=self.HOJE)
        self.assertEqual(lida.pontos, {"2001-12": 12.35, "2002-01": 66.67})
        self.assertIn("bcdata.sgs.4478/", lida.conferida)
        self.assertIn("bcdata.sgs.4382/", lida.conferida)

    def test_um_centesimo_a_mais_reprova(self):
        publicada = dict(self.PUBLICADA, **{"2002-01": "66.68"})
        with self.assertRaisesRegex(ErroBrasil,
                                    r"não confere.*2002-01 \(66.68 e 66.67\)"):
            coletar(DIVIDA_LIQUIDA, self.transporte(publicada=publicada),
                    sem_pausa, hoje=self.HOJE)

    def test_mes_sem_saldo_reprova(self):
        saldo = {"2002-01": "2000.00"}
        with self.assertRaisesRegex(ErroBrasil,
                                    "só na série publicada: 2001-12"):
            coletar(DIVIDA_LIQUIDA, self.transporte(saldo=saldo), sem_pausa,
                    hoje=self.HOJE)

    def test_saldo_sem_par_na_publicada_reprova(self):
        saldo = dict(self.SALDO, **{"2001-11": "9000.00"})
        with self.assertRaisesRegex(ErroBrasil, "só na conta: 2001-11"):
            coletar(DIVIDA_LIQUIDA, self.transporte(saldo=saldo), sem_pausa,
                    hoje=self.HOJE)


def vigencia(inicio: str, fim: str | None, meta: float, n: int):
    return {"NumeroReuniaoCopom": n, "MetaSelic": meta,
            "DataInicioVigencia": f"{inicio}T03:00:00Z",
            "DataFimVigencia": f"{fim}T03:00:00Z" if fim else None}


class TestSelic(unittest.TestCase):
    HOJE = brasil.dt.date(1999, 6, 10)
    # A primeira é da TBC, de antes da meta: cai antes de março e não entra.
    COPOM = {"conteudo": [
        vigencia("1999-05-20", None, 27.0, 4),
        vigencia("1999-04-15", "1999-05-19", 34.0, 3),
        vigencia("1999-03-25", "1999-04-14", 42.0, 2),
        vigencia("1999-03-05", "1999-03-24", 45.0, 1),
        vigencia("1999-01-20", "1999-03-04", 2.9, 0)]}
    # O SGS 432 traz datas futuras: 30/06 ainda não chegou.
    DIAS = {"1999-03-05": "45.00", "1999-03-31": "42.00",
            "1999-04-30": "34.00", "1999-05-31": "27.00",
            "1999-06-30": "27.00"}

    def transporte(self, copom=None, dias=None):
        return Transporte({brasil.API_COPOM: copom or self.COPOM,
                           **transporte_diario(432, 1999, 1999, dias or self.DIAS)})

    def test_meta_do_ultimo_dia_de_cada_mes_ate_hoje(self):
        lida = coletar(SELIC, self.transporte(), sem_pausa, hoje=self.HOJE)
        self.assertEqual(lida.pontos,
                         {"1999-03": 42.0, "1999-04": 34.0, "1999-05": 27.0})
        self.assertEqual(lida.origem, brasil.API_COPOM)
        self.assertIn("bcdata.sgs.432/", lida.conferida)

    def test_serie_diaria_diferente_reprova(self):
        dias = dict(self.DIAS, **{"1999-04-30": "33.50"})
        with self.assertRaisesRegex(ErroBrasil, r"1999-04 \(34.0 e 33.5\)"):
            coletar(SELIC, self.transporte(dias=dias), sem_pausa,
                    hoje=self.HOJE)

    def test_vigencias_sobrepostas_reprovam(self):
        copom = {"conteudo": self.COPOM["conteudo"]
                 + [vigencia("1999-04-01", "1999-04-30", 40.0, 9)]}
        with self.assertRaisesRegex(ErroBrasil, "1999-04-30 cai em 2"):
            coletar(SELIC, self.transporte(copom=copom), sem_pausa,
                    hoje=self.HOJE)

    def test_meta_que_nao_e_numero_reprova(self):
        copom = {"conteudo": [vigencia("1999-05-20", None, None, 4)]}
        with self.assertRaisesRegex(ErroBrasil, "reunião 4 veio com a meta None"):
            brasil.ler_copom(SELIC, copom, self.HOJE)

    def test_meia_noite_de_brasilia_com_e_sem_horario_de_verao(self):
        # 02:00 UTC é a meia-noite do horário de verão: o dia é 30, e não 29
        # (o fuso fixo em UTC-3 errava a meta de novembro de 2011 e de 2016).
        self.assertEqual(brasil._data_copom("2011-11-30T02:00:00Z"),
                         brasil.dt.date(2011, 11, 30))
        self.assertEqual(brasil._data_copom("1999-03-05T03:00:00Z"),
                         brasil.dt.date(1999, 3, 5))
        for outra in ("1999-03-05T00:00:00Z", "1999-03-05T03:00:00"):
            with self.assertRaises(ValueError):
                brasil._data_copom(outra)

    def test_fim_de_vigencia_no_horario_de_verao(self):
        # As vigências de 2011 como o BC as publica (reuniões 162 e 163).
        copom = {"conteudo": [
            {"NumeroReuniaoCopom": 163, "MetaSelic": 11.0,
             "DataInicioVigencia": "2011-12-01T02:00:00Z",
             "DataFimVigencia": "2012-01-18T02:00:00Z"},
            {"NumeroReuniaoCopom": 162, "MetaSelic": 11.5,
             "DataInicioVigencia": "2011-10-20T02:00:00Z",
             "DataFimVigencia": "2011-11-30T02:00:00Z"}]}
        s = SELIC._replace(desde="2011-11")
        self.assertEqual(brasil.ler_copom(s, copom, brasil.dt.date(2011, 12, 31)),
                         {"2011-11": 11.5, "2011-12": 11.0})


SALARIO = next(s for s in brasil.SERIES if s.codigo == "salario-minimo")


def ipeadata(pontos: dict[str, object], codigo="GAC12_SALMINRE12"):
    return {"value": [{"SERCODIGO": codigo, "VALDATA": f"{p}-01T00:00:00-03:00",
                       "VALVALOR": v, "NIVNOME": "", "TERCODIGO": ""}
                      for p, v in pontos.items()]}


class TestSalarioMinimo(unittest.TestCase):
    HOJE = brasil.dt.date(1994, 11, 15)
    # 07/1994 é o mês da troca da moeda e fica de fora (desde 08/1994). Em
    # setembro o nominal sobe de 64,79 para 70,00 com INPC de 1,40%; em
    # outubro fica parado com INPC de 2,00%. Outubro, o último, em reais dele.
    NOMINAL = {"1994-07": "64.79", "1994-08": "64.79", "1994-09": "70.00",
               "1994-10": "70.00", "1994-11": "70.00", "1994-12": "70.00"}
    INPC = {"1994-07": "7.75", "1994-08": "1.85", "1994-09": "1.40",
            "1994-10": "2.00"}
    REAL = {"1994-07": 444.45,
            "1994-08": 70.0 * 1.02 * 1.014 * 64.79 / 70.0,
            "1994-09": 70.0 * 1.02, "1994-10": 70.0}

    def transporte(self, real=None, inpc=None):
        return Transporte({
            brasil.url_ipeadata(SALARIO): ipeadata(real or self.REAL),
            brasil._url_sgs(1619, 1994, 1994): sgs(self.NOMINAL),
            brasil._url_sgs(188, 1994, 1994): sgs(inpc or self.INPC)})

    def coletar(self, **k):
        return coletar(SALARIO, self.transporte(**k), sem_pausa, hoje=self.HOJE)

    def test_confere_pela_variacao_e_corta_a_troca_da_moeda(self):
        lida = self.coletar()
        self.assertEqual(sorted(lida.pontos), ["1994-08", "1994-09", "1994-10"])
        self.assertEqual(lida.origem, brasil.url_ipeadata(SALARIO))
        self.assertIn("bcdata.sgs.1619/", lida.conferida)
        self.assertIn("bcdata.sgs.188/", lida.conferida)

    def test_nivel_refeito_inteiro_tambem_confere(self):
        # No mês seguinte o Ipea refaz tudo em reais de novembro: o nível
        # muda, a variação não, e a âncora passa a ser novembro.
        real = {p: v * 1.01 for p, v in self.REAL.items()}
        real["1994-11"] = 70.0
        lida = self.coletar(real=real, inpc=dict(self.INPC, **{"1994-11": "1.00"}))
        self.assertEqual(lida.pontos["1994-11"], 70.0)

    def test_variacao_fora_da_folga_reprova(self):
        # Setembro 0,1% acima da conta refeita: vinte vezes o que o
        # arredondamento do INPC explica (0,005%).
        real = dict(self.REAL, **{"1994-08": self.REAL["1994-08"] / 1.001})
        with self.assertRaisesRegex(ErroBrasil, r"variações diferentes: 1994-09"):
            self.coletar(real=real)

    def test_dentro_do_arredondamento_do_inpc_passa(self):
        real = dict(self.REAL, **{"1994-08": self.REAL["1994-08"] / 1.00004})
        self.assertEqual(len(self.coletar(real=real).pontos), 3)

    def test_ultimo_mes_fora_do_nominal_reprova(self):
        real = {p: v * 1.01 for p, v in self.REAL.items()}
        with self.assertRaisesRegex(ErroBrasil, r"último mês \(1994-10\)"):
            self.coletar(real=real)

    def test_mes_faltando_no_ipea_reprova(self):
        real = {p: v for p, v in self.REAL.items() if p != "1994-09"}
        with self.assertRaisesRegex(ErroBrasil, "faltam no Ipeadata: 1994-09"):
            self.coletar(real=real)

    def test_inpc_que_falta_reprova(self):
        inpc = {p: v for p, v in self.INPC.items() if p != "1994-09"}
        with self.assertRaisesRegex(ErroBrasil, "sem nominal ou INPC no SGS: "
                                                "1994-09"):
            self.coletar(inpc=inpc)

    def test_serie_parada_reprova(self):
        inpc = dict(self.INPC, **{"1994-11": "1", "1994-12": "1",
                                  "1995-01": "1"})
        with self.assertRaisesRegex(ErroBrasil, "para em 1994-10"):
            self.coletar(inpc=inpc)

    def test_valor_nulo_e_outra_serie_reprovam(self):
        with self.assertRaisesRegex(ErroBrasil, "1994-09 veio com valor None"):
            brasil.ler_ipeadata(SALARIO, ipeadata({"1994-09": None}))
        with self.assertRaisesRegex(ErroBrasil, "devolveu a série 'OUTRA'"):
            brasil.ler_ipeadata(SALARIO, ipeadata({"1994-09": 1.0}, "OUTRA"))

    def test_unidade_exportada_escreve_o_mes(self):
        self.assertEqual(brasil.unidade_exportada(SALARIO, "2026-08"),
                         "R$ de agosto de 2026")
        self.assertEqual(brasil.unidade_exportada(CAMBIO, "2026-08"),
                         "R$ por dólar")

    def test_data_fora_do_dia_1_reprova_e_horario_de_verao_passa(self):
        dados = ipeadata({"1994-09": 1.0})
        dados["value"][0]["VALDATA"] = "1994-10-01T00:00:00-02:00"
        self.assertEqual(brasil.ler_ipeadata(SALARIO, dados), {"1994-10": 1.0})
        dados["value"][0]["VALDATA"] = "1994-10-02T00:00:00-03:00"
        with self.assertRaisesRegex(ErroBrasil, "não é o dia 1"):
            brasil.ler_ipeadata(SALARIO, dados)


def leitura(s: SerieBrasil, pontos: dict[str, float]) -> Leitura:
    return Leitura(s, pontos, "https://origem", "https://conferida")


def metas(*anos: int) -> LeituraMetas:
    return LeituraMetas([Meta(a, 4.5, 2.0, "Resolução CMN nº 1") for a in anos],
                        "https://sgs", "https://pagina")


# A forma da página do Banco Central lida em 06/10/2026: o texto da meta
# contínua antes da tabela; uma linha inteira; uma revista (2003, com as duas
# metas na mesma célula e um espaço de largura zero no nome da norma); e uma
# das curtas do começo, sem norma nem data.
PAGINA_METAS = {"conteudo": (
    "<p>Desde janeiro de 2025, a meta se refere à inflação acumulada em doze "
    "meses. A meta, fixada pela Resolução CMN nº 5.141, de 26 de junho de "
    "2024, é de 3,00%, com intervalo de tolerância de &plusmn;1,5 ponto "
    "percentual.</p><table><tr><th>Ano</th><th>Norma</th><th>Data</th>"
    "<th>Meta (%)</th><th>Tamanho</th><th>Intervalo</th><th>Efetiva</th>"
    "<th>Carta</th></tr>"
    "<tr><td>2024</td><td>Resolução CMN nº 4.918</td><td>24/6/2021</td>"
    "<td>3,00</td><td>1,50</td><td>1,50-4,50</td><td>4,83</td><td>Sim</td></tr>"
    "<tr><td>2003*</td><td>Resolução CM​N nº 2.972<br>Resolução CMN nº "
    "2.842</td><td>27/6/2002<br>28/6/2001</td><td>4<br>3,25</td>"
    "<td>2,5<br>2</td><td>1,5-6,5 <br>1,25-5,25</td><td>9,30</td><td>Sim</td>"
    "</tr><tr><td>1999</td><td>8</td><td>2</td><td>6-10</td><td>8,94</td>"
    "<td>Não</td></tr></table>")}
METAS_PAGINA = [Meta(1999, 8.0, 2.0, "Resolução CMN nº 2.615"),
                Meta(2003, 4.0, 2.5, "Resolução CMN nº 2.972"),
                Meta(2024, 3.0, 1.5, "Resolução CMN nº 4.918"),
                Meta(2025, 3.0, 1.5, "Resolução CMN nº 5.141")]
SGS_METAS = {1999: 8.0, 2003: 4.0, 2024: 3.0, 2025: 3.0}


class TestMetas(unittest.TestCase):
    """A meta de inflação: a tabela versionada contra o SGS e a página."""

    def tabela(self):
        return ler_tabela_metas(PAGINA_METAS)

    def test_a_tabela_versionada_e_valida_e_comeca_em_1999(self):
        ms = carregar_metas()
        self.assertEqual(ms[0].ano, 1999)
        self.assertEqual([m.ano for m in ms], list(range(1999, ms[-1].ano + 1)))

    def test_le_a_pagina_pela_meta_vigente_e_conta_colunas_do_fim(self):
        tabela, texto = self.tabela()
        self.assertEqual(tabela, {2024: (3.0, 1.5, 1.5, 4.5),
                                  2003: (4.0, 2.5, 1.5, 6.5),
                                  1999: (8.0, 2.0, 6.0, 10.0)})
        self.assertIn("±1,5 ponto", texto)

    def test_as_tres_leituras_iguais_passam(self):
        conferir_metas(METAS_PAGINA, SGS_METAS, *self.tabela())

    def test_cada_divergencia_reprova_dizendo_qual(self):
        casos = [
            ("centro", {**SGS_METAS, 2003: 3.25}, METAS_PAGINA,
             "2003: meta 4.0 aqui e 3.25 no SGS"),
            ("ano a mais no SGS", {**SGS_METAS, 2026: 3.0}, METAS_PAGINA,
             r"só no SGS: \[2026\]"),
            ("intervalo", SGS_METAS,
             [m._replace(tolerancia=2.0) if m.ano == 2024 else m
              for m in METAS_PAGINA], "2024: .* na página"),
            ("norma fora do texto", SGS_METAS,
             [m._replace(norma="Resolução CMN nº 9.999") if m.ano == 2025
              else m for m in METAS_PAGINA], "não traz 'Resolução CMN nº 9.999'"),
        ]
        for nome, sgs, ms, erro in casos:
            with self.subTest(nome), self.assertRaisesRegex(ErroBrasil, erro):
                conferir_metas(ms, sgs, *self.tabela())

    def test_ano_no_meio_ausente_da_pagina_reprova(self):
        ms = METAS_PAGINA + [Meta(2010, 4.5, 2.0, "Resolução CMN nº 3.584")]
        with self.assertRaisesRegex(ErroBrasil, "2010: ausente da tabela"):
            conferir_metas(ms, {**SGS_METAS, 2010: 4.5}, *self.tabela())

    def test_coleta_pelas_duas_urls(self):
        t = Transporte({
            brasil.SGS.format(codigo=13521) + "?formato=json": [
                {"data": f"01/01/{a}", "valor": f"{v:.2f}"}
                for a, v in SGS_METAS.items()],
            brasil.API_METAS: PAGINA_METAS})
        r = coletar_metas(t, sem_pausa, METAS_PAGINA)
        self.assertEqual(r.metas, METAS_PAGINA)
        self.assertEqual(len(t.pedidas), 2)

    def test_pagina_sem_tabela_e_erro(self):
        with self.assertRaisesRegex(ErroBrasil, "sem nenhuma linha"):
            ler_tabela_metas({"conteudo": "<p>nada</p>"})


class TestBanco(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.banco = Path(self.tmp.name) / "brasil.db"

    def tearDown(self):
        self.tmp.cleanup()

    def gravar(self, *leituras, **kw):
        with ArmazemBrasil(self.banco) as db:
            db.gravar(list(leituras), **kw)

    def pontos(self, codigo):
        with ArmazemBrasil(self.banco) as db:
            return db.pontos(codigo)

    def test_regravar_substitui_so_a_fatia_da_serie(self):
        self.gravar(leitura(PIB, {"1996T1": 1.0, "1996T2": 2.0}),
                    leitura(IPCA, {"1995-07": 3.0}))
        self.gravar(leitura(PIB, {"1996T1": 1.5, "1996T2": 2.0}))
        self.assertEqual(self.pontos("pib"), {"1996T1": 1.5, "1996T2": 2.0})
        self.assertEqual(self.pontos("ipca"), {"1995-07": 3.0})

    def test_encolher_e_recusado_nas_tres_dimensoes(self):
        self.gravar(leitura(PIB, {"1996T1": 1.0, "1996T2": 2.0, "1996T3": 3.0}))
        for menor, motivo in (
                ({"1996T1": 1.0, "1996T2": 2.0}, "3 pontos para 2"),
                ({"1996T2": 2.0, "1996T3": 3.0, "1996T4": 4.0}, "começo"),
                ({"1995T4": 0.0, "1996T1": 1.0, "1996T2": 2.0}, "fim de")):
            with self.subTest(motivo), self.assertRaisesRegex(ErroBrasil, motivo):
                self.gravar(leitura(PIB, menor))
        self.assertEqual(len(self.pontos("pib")), 3)
        self.gravar(leitura(PIB, {"1996T1": 1.0}), permitir_encolher=True)
        self.assertEqual(self.pontos("pib"), {"1996T1": 1.0})

    def test_uma_serie_recusada_nao_deixa_gravar_nenhuma(self):
        self.gravar(leitura(PIB, {"1996T1": 1.0, "1996T2": 2.0}))
        with self.assertRaises(ErroBrasil):
            self.gravar(leitura(IPCA, {"1995-07": 3.0}),
                        leitura(PIB, {"1996T1": 1.0}))
        self.assertEqual(self.pontos("ipca"), {})

    def test_serie_vazia_e_recusada_mesmo_com_permissao_de_encolher(self):
        self.gravar(leitura(PIB, {"1996T1": 1.0}))
        with self.assertRaisesRegex(ErroBrasil, "sem nenhum ponto"):
            self.gravar(leitura(PIB, {}), permitir_encolher=True)
        self.assertEqual(self.pontos("pib"), {"1996T1": 1.0})

    def test_meta_regravada_inteira_e_que_nao_encolhe(self):
        self.gravar(metas=metas(1999, 2000, 2001))
        self.gravar(metas=metas(1999, 2000, 2001, 2002))
        with ArmazemBrasil(self.banco) as db:
            self.assertEqual([a[0] for a in db.metas()["anos"]],
                             [1999, 2000, 2001, 2002])
        for menor in (metas(1999, 2000, 2001), metas(2000, 2001, 2002, 2003)):
            with self.subTest(menor.metas[0].ano), \
                    self.assertRaisesRegex(ErroBrasil, "meta de inflação encolheria"):
                self.gravar(metas=menor)


class TestMandatos(unittest.TestCase):
    FONTE = "https://www.gov.br/planalto/pt-br/x"

    def m(self, nome, inicio, fim, fonte=None, rotulo=None):
        return Mandato(nome, inicio, fim, "eleito",
                       self.FONTE if fonte is None else fonte,
                       nome if rotulo is None else rotulo)

    def test_a_tabela_versionada_e_valida(self):
        mandatos = carregar_mandatos()
        self.assertGreater(len(mandatos), 1)
        self.assertEqual(mandatos[0].inicio, "1995-01-01")
        # Só o último está em aberto, e quem ocupa hoje está nele.
        self.assertTrue(all(m.fim for m in mandatos[:-1]))
        self.assertIsNone(mandatos[-1].fim)

    def test_sequencia_certa_passa(self):
        validar_mandatos([self.m("A", "1995-01-01", "1999-01-01"),
                          self.m("B", "1999-01-01", None)])

    def test_recusas(self):
        casos = {
            "sem link": [self.m("A", "1995-01-01", None, fonte="")],
            "domínio não oficial": [self.m("A", "1995-01-01", None,
                                           fonte="https://pt.wikipedia.org/x")],
            "domínio parecido": [self.m("A", "1995-01-01", None,
                                        fonte="https://falso-gov.br/x")],
            "http": [self.m("A", "1995-01-01", None,
                            fonte="http://www.gov.br/planalto/x")],
            "sobreposição": [self.m("A", "1995-01-01", "1999-01-02"),
                             self.m("B", "1999-01-01", None)],
            "buraco": [self.m("A", "1995-01-01", "1998-12-31"),
                       self.m("B", "1999-01-01", None)],
            "aberto no meio": [self.m("A", "1995-01-01", None),
                               self.m("B", "1999-01-01", None)],
            "último fechado": [self.m("A", "1995-01-01", "1999-01-01")],
            "data sem hífen": [self.m("A", "19950101", None)],
            "data inválida": [self.m("A", "1995-02-30", None)],
            "termina antes": [self.m("A", "1999-01-01", "1995-01-01")],
            "vazia": [],
            "rótulo vazio": [self.m("A", "1995-01-01", None, rotulo=" ")],
            "rótulo longo": [self.m("A", "1995-01-01", None, rotulo="x" * 21)],
            "dois rótulos": [self.m("A", "1995-01-01", "1999-01-01"),
                             self.m("A", "1999-01-01", None, rotulo="B")],
        }
        for caso, mandatos in casos.items():
            with self.subTest(caso), self.assertRaises(ErroBrasil):
                validar_mandatos(mandatos)


class TestRetrato(unittest.TestCase):
    """O `brasil.json`: o que vai, e a trava contra encolher."""

    MANDATOS = [Mandato("A", "1995-01-01", None, "eleito",
                        "https://www.gov.br/x", "A")]

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.banco = Path(self.tmp.name) / "brasil.db"
        self.saida = Path(self.tmp.name) / "brasil.json"

    def tearDown(self):
        self.tmp.cleanup()

    def retrato(self, *leituras, series=(PIB, IPCA)):
        with ArmazemBrasil(self.banco) as db:
            db.gravar(list(leituras), metas=metas(1999, 2000),
                      permitir_encolher=True)
            return brasil.retrato(db, self.MANDATOS, series)

    def test_series_na_ordem_do_registro_com_procedencia(self):
        r = self.retrato(leitura(IPCA, {"1995-08": 2.0, "1995-07": 1.0}),
                         leitura(PIB, {"1996T1": 3.0}))
        self.assertEqual([s["codigo"] for s in r["series"]], ["pib", "ipca"])
        ipca = r["series"][1]
        self.assertEqual(ipca["pontos"], [["1995-07", 1.0], ["1995-08", 2.0]])
        self.assertEqual((ipca["origem"], ipca["conferida"]),
                         ("https://origem", "https://conferida"))
        self.assertTrue(ipca["coletadoEm"])
        self.assertEqual(r["mandatos"][0]["fim"], None)
        self.assertEqual(r["mandatos"][0]["rotulo"], "A")
        self.assertEqual(r["metaInflacao"]["anos"],
                         [[1999, 4.5, 2.0], [2000, 4.5, 2.0]])
        self.assertEqual(r["metaInflacao"]["fonte"], brasil.PAGINA_METAS)

    def test_meta_ausente_e_erro(self):
        with ArmazemBrasil(self.banco) as db:
            db.gravar([leitura(PIB, {"1996T1": 3.0}),
                       leitura(IPCA, {"1995-07": 1.0})])
            with self.assertRaisesRegex(ErroBrasil, "meta de inflação ausente"):
                brasil.retrato(db, self.MANDATOS, (PIB, IPCA))

    def test_serie_ausente_e_erro_e_nao_serie_a_menos(self):
        with self.assertRaisesRegex(ErroBrasil, "ipca: série ausente"):
            self.retrato(leitura(PIB, {"1996T1": 3.0}))

    def test_encolher_e_recusado_em_cada_dimensao(self):
        base = self.retrato(leitura(PIB, {"1996T1": 1.0, "1996T2": 2.0,
                                          "1996T3": 3.0}),
                            leitura(IPCA, {"1995-07": 1.0}))
        self.assertEqual(brasil.gravar_retrato(base, self.saida), "gravado")
        conteudo = self.saida.read_bytes()

        def com(**muda):
            r = json.loads(json.dumps(base))
            for chave, valor in muda.items():
                if chave == "mandatos":
                    r["mandatos"] = valor
                elif valor is None:
                    r["series"] = [s for s in r["series"] if s["codigo"] != chave]
                else:
                    next(s for s in r["series"] if s["codigo"] == chave)["pontos"] = valor
            return r

        for motivo, r in (
                ("sumiu", com(ipca=None)),
                ("3 pontos para 2", com(pib=[["1996T1", 1.0], ["1996T2", 2.0]])),
                ("começo de", com(pib=[["1996T2", 2.0], ["1996T3", 3.0],
                                       ["1996T4", 4.0]])),
                ("fim de", com(pib=[["1995T4", 0.0], ["1996T1", 1.0],
                                    ["1996T2", 2.0]])),
                ("mandatos 1", com(mandatos=[]))):
            with self.subTest(motivo), self.assertRaisesRegex(ErroBrasil, motivo):
                brasil.gravar_retrato(r, self.saida)
        self.assertEqual(self.saida.read_bytes(), conteudo)
        self.assertEqual(brasil.gravar_retrato(com(ipca=None), self.saida,
                                               permitir_encolher=True), "gravado")

    def test_so_o_carimbo_mudou_nao_reescreve(self):
        r = self.retrato(leitura(PIB, {"1996T1": 1.0}),
                         leitura(IPCA, {"1995-07": 1.0}))
        brasil.gravar_retrato(r, self.saida)
        for s in r["series"]:
            s["coletadoEm"] = "2099-01-01T00:00:00+00:00"
        self.assertEqual(brasil.gravar_retrato(r, self.saida), "inalterado")
        r["series"][0]["pontos"][0][1] = 9.0
        self.assertEqual(brasil.gravar_retrato(r, self.saida), "gravado")


class TestIngerirPorSerie(unittest.TestCase):
    """Uma fonte que falha não segura as outras: a série é tentada de novo uma
    vez, e se falhar outra vez fica de fora com o dado que o banco já tinha."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.banco = Path(self.tmp.name) / "brasil.db"
        self.pausas = []
        with ArmazemBrasil(self.banco) as db:
            db.gravar([leitura(PIB, {"2020T1": 1.0}),
                       leitura(IPCA, {"2020-01": 1.0})], metas=metas(1999))

    def tearDown(self):
        self.tmp.cleanup()

    def ingerir(self, falhas):
        """`falhas`: quantas vezes cada código falha antes de ler."""
        restam = dict(falhas)

        def tentar(codigo):
            if restam.get(codigo, 0):
                restam[codigo] -= 1
                raise ErroBrasil("200 com corpo que não é JSON")

        def coletar(s, transporte, dormir):
            tentar(s.codigo)
            return leitura(s, {"2020T1": 2.0} if s is PIB else {"2020-01": 2.0})

        def coletar_metas(transporte, dormir):
            tentar(brasil.META)
            return metas(1999, 2000)

        with mock.patch.object(brasil, "coletar", coletar), \
                mock.patch.object(brasil, "coletar_metas", coletar_metas):
            return brasil.ingerir(self.banco, object(), self.pausas.append,
                                  series=(PIB, IPCA))

    def gravado(self):
        with ArmazemBrasil(self.banco) as db:
            return (db.pontos("pib"), db.pontos("ipca"),
                    len(db.metas()["anos"]))

    def test_sem_falha_grava_tudo_e_nao_espera(self):
        r = self.ingerir({})
        self.assertEqual(r.falhas, [])
        self.assertEqual(self.pausas, [])
        self.assertEqual(self.gravado(),
                         ({"2020T1": 2.0}, {"2020-01": 2.0}, 2))

    def test_a_que_falha_duas_vezes_fica_com_o_dado_anterior(self):
        r = self.ingerir({"ipca": 2})
        self.assertEqual(r.falhas, ["ipca: 200 com corpo que não é JSON"])
        self.assertEqual([x.serie.codigo for x in r.leituras], ["pib"])
        self.assertEqual(self.pausas, [brasil.PAUSA_NOVA_TENTATIVA])
        self.assertEqual(self.gravado(),
                         ({"2020T1": 2.0}, {"2020-01": 1.0}, 2))

    def test_a_que_falha_uma_vez_entra_na_nova_tentativa(self):
        r = self.ingerir({"pib": 1})
        self.assertEqual(r.falhas, [])
        self.assertEqual([x.serie.codigo for x in r.leituras], ["pib", "ipca"])
        self.assertEqual(self.pausas, [brasil.PAUSA_NOVA_TENTATIVA])

    def test_meta_que_falha_fica_a_anterior(self):
        r = self.ingerir({brasil.META: 2})
        self.assertIsNone(r.metas)
        self.assertEqual(r.falhas,
                         ["meta de inflação: 200 com corpo que não é JSON"])
        self.assertEqual(self.gravado(),
                         ({"2020T1": 2.0}, {"2020-01": 2.0}, 1))

    def test_nada_lido_e_erro_e_nada_gravado(self):
        with self.assertRaises(ErroBrasil) as ctx:
            self.ingerir({"pib": 2, "ipca": 2, brasil.META: 2})
        self.assertIn("nada foi gravado", str(ctx.exception))
        self.assertIn("ipca: 200 com corpo", str(ctx.exception))
        self.assertEqual(self.gravado(),
                         ({"2020T1": 1.0}, {"2020-01": 1.0}, 1))


class TestManterAusentes(unittest.TestCase):
    """`brasil-exportar --manter-ausentes`: o banco do runner começa vazio, e
    a série que falhou sai do `brasil.json` já publicado, igual."""

    MANDATOS = TestRetrato.MANDATOS

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.pasta = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_serie_e_meta_ausentes_saem_do_anterior_iguais(self):
        with ArmazemBrasil(self.pasta / "velho.db") as db:
            db.gravar([leitura(PIB, {"1996T1": 1.0}),
                       leitura(IPCA, {"1995-07": 1.0})], metas=metas(1999))
            anterior = brasil.retrato(db, self.MANDATOS, (PIB, IPCA))
        with ArmazemBrasil(self.pasta / "novo.db") as db:
            db.gravar([leitura(PIB, {"1996T1": 2.0})])
            r = brasil.retrato(db, self.MANDATOS, (PIB, IPCA),
                               anterior=anterior)
            with self.assertRaises(ErroBrasil):
                brasil.retrato(db, self.MANDATOS, (PIB, IPCA))
        self.assertEqual(r["series"][0]["pontos"], [["1996T1", 2.0]])
        self.assertEqual(r["series"][1], anterior["series"][1])
        self.assertEqual(r["metaInflacao"], anterior["metaInflacao"])

    def test_ausente_dos_dois_continua_erro(self):
        with ArmazemBrasil(self.pasta / "novo.db") as db:
            db.gravar([leitura(PIB, {"1996T1": 2.0})], metas=metas(1999))
            anterior = brasil.retrato(db, self.MANDATOS, (PIB,))
            with self.assertRaisesRegex(ErroBrasil, "ipca: série ausente"):
                brasil.retrato(db, self.MANDATOS, (PIB, IPCA),
                               anterior=anterior)


class TestComando(unittest.TestCase):
    """O que `brasil-ingerir` imprime, sem rede: a coleta é trocada por uma
    que devolve uma leitura pronta."""

    ARGS = argparse.Namespace(banco_brasil="nao-usado.db",
                              permitir_encolher=False)

    def rodar(self, ingerir):
        saida, erro = io.StringIO(), io.StringIO()
        with mock.patch.object(brasil, "ingerir", ingerir), \
                redirect_stdout(saida), redirect_stderr(erro):
            codigo = cli.brasil_ingerir(self.ARGS, transporte=object(),
                                        dormir=sem_pausa)
        return codigo, saida.getvalue(), erro.getvalue()

    def test_imprime_cada_serie_o_vao_e_quem_ocupa_hoje(self):
        pontos = {"2019T4": 1.0, "2020T3": 2.0}
        codigo, saida, _ = self.rodar(
            lambda *a, **k: brasil.Ingestao(
                [leitura(PIB, pontos)], metas(1999, 2000), []))
        self.assertEqual(codigo, 0)
        self.assertIn("pib: 2 pontos, 2019T4 a 2020T3, iguais na segunda "
                      "leitura; sem dado na fonte: 2020T1, 2020T2", saida)
        atual = carregar_mandatos()[-1]
        self.assertIn(f"até hoje ({atual.nome}, desde {atual.inicio})", saida)
        self.assertIn("meta de inflação: 2 anos, 1999 a 2000", saida)

    def test_salario_minimo_diz_que_conferiu_a_variacao(self):
        pontos = {"2026-07": 1630.0, "2026-08": 1621.0}
        _, saida, _ = self.rodar(
            lambda *a, **k: brasil.Ingestao(
                [leitura(SALARIO, pontos)], metas(1999), []))
        self.assertIn("salario-minimo: 2 pontos, 2026-07 a 2026-08, cada "
                      "variação mensal igual à do nominal e do INPC", saida)

    def test_erro_sai_com_1_e_diz_por_que(self):
        def falha(*a, **k):
            raise ErroBrasil("pib: as duas leituras divergem")
        codigo, saida, erro = self.rodar(falha)
        self.assertEqual(codigo, 1)
        self.assertEqual(saida, "")
        self.assertIn("as duas leituras divergem", erro)

    def test_parcial_sai_com_3_e_diz_qual_ficou_de_fora(self):
        codigo, saida, erro = self.rodar(lambda *a, **k: brasil.Ingestao(
            [leitura(PIB, {"2020T1": 1.0})], None,
            ["cambio: 200 com corpo que não é JSON"]))
        self.assertEqual(codigo, cli.SAIDA_PARCIAL)
        self.assertIn("pib: 1 pontos, 2020T1 a 2020T1", saida)
        self.assertNotIn("meta de inflação", saida)
        self.assertIn("[falha] cambio: 200 com corpo que não é JSON; fica o "
                      "dado anterior", erro)


class TestRegistro(unittest.TestCase):
    def test_codigos_unicos_e_coordenada_completa(self):
        codigos = [s.codigo for s in brasil.SERIES]
        self.assertEqual(len(codigos), len(set(codigos)))
        for s in brasil.SERIES:
            with self.subTest(s.codigo):
                if s.fonte == "IBGE":
                    self.assertTrue(s.agregado and s.variavel and not s.sgs)
                elif s.fonte == "Ipea":
                    self.assertTrue(s.ipeadata and not s.sgs and not s.agregado)
                    self.assertEqual(s.conferencia, "inpc")
                else:
                    self.assertTrue(s.sgs and not s.agregado)
                self.assertIn(s.conferencia, ("janelas", "ptax", "copom",
                                              "inpc", "ultimo-dia",
                                              "razao-pib"))
                self.assertEqual(s.conferencia == "razao-pib",
                                 s.sgs_saldo is not None)
                if s.conferencia not in ("janelas", "razao-pib"):
                    # As janelas diárias começam no ano de `desde`.
                    self.assertTrue(s.desde)
                self.assertEqual(s.conferencia == "ultimo-dia",
                                 s.sgs_diaria is not None)
                self.assertGreaterEqual(s.dividir_por, 1)


if __name__ == "__main__":
    unittest.main()

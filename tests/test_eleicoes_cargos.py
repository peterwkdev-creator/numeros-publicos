"""Eleições 2026: senador e deputados no nível da UF (`eleicoes-2026-cargos.json`).

Sem rede: os arquivos são de brinquedo, com as chaves reais dos `-u.json` da
eleição 6259 lidos em 26/10/2026 (`carg[].nv/fed/agr[].vag/par[].tvtn/tvtl/
tval/dvt/cand[].st/dvt`). Os números são pequenos para a conta caber na mão.
"""

from __future__ import annotations

import argparse
import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from numeros_publicos import cli, eleicoes
from numeros_publicos.eleicoes import (
    DEP_DISTRITAL, DEP_ESTADUAL, DEP_FEDERAL, SENADOR, UFS, ErroEleicoes,
    coletar_cargos, ler_cargo_uf, url_cargo_uf,
)

V, L = "Válido", "Válido (legenda)"


def cand(n, votos, st="Não eleito", dvt=V):
    return {"n": n, "nmu": f"CAND {n}", "vap": str(votos), "dvt": dvt,
            "st": st, "e": "s" if st.startswith("Eleito") else "n"}


def senador(abr="sp") -> dict:
    """Duas vagas; um candidato anulado sub judice, fora dos válidos."""
    return {
        "cdabr": abr, "dg": "05/10/2026", "hg": "11:44:31", "tf": "s",
        "carg": [{"cd": "5", "nv": "2", "fed": [], "agr": [
            {"tp": "c", "par": [
                {"sg": "PL", "cand": [cand("222", 300, "Eleito")]},
                {"sg": "PP", "cand": [cand("111", 500, "Eleito")]}]},
            {"tp": "i", "par": [
                {"sg": "PSB", "cand": [cand("400", 200)]},
                {"sg": "PSOL", "cand": [cand("500", 70, dvt="Anulado sub judice")]}]},
        ]}],
        "v": {"vv": "1000", "vnom": "1000", "van": "0", "vansj": "70"},
    }


def deputados(abr="sp", cd="6") -> dict:
    """Três vagas. Federação A/B (2 cadeiras), partido C isolado (1), D sem
    cadeira, E com a legenda anulada; um candidato de C cassado cujo voto
    vai para a legenda (já no `tvtl`)."""
    return {
        "cdabr": abr, "dg": "05/10/2026", "hg": "11:47:48", "tf": "s",
        "carg": [{"cd": cd, "nv": "3", "qe": "300",
                  "fed": [{"n": "100", "sg": "A/B", "npar": ["10", "20"]}], "agr": [
            {"tp": "f", "vag": "2", "par": [
                {"sg": "A", "nfed": "100", "dvt": L, "tvtn": "400", "tvtl": "50",
                 "cand": [cand("1001", 250, "Eleito por QP"), cand("1002", 150, "Suplente")]},
                {"sg": "B", "nfed": "100", "dvt": L, "tvtn": "100", "tvtl": "10",
                 "cand": [cand("2001", 100, "Eleito por média"),
                          cand("2002", 9, dvt="Anulado")]}]},
            {"tp": "i", "vag": "1", "par": [
                {"sg": "C", "nfed": "", "dvt": L, "tvtn": "200", "tvtl": "40",
                 "cand": [cand("3001", 200, "Eleito por QP"), cand("3002", 30, dvt=L)]}]},
            {"tp": "i", "vag": "0", "par": [
                {"sg": "D", "nfed": "", "dvt": L, "tvtn": "0", "tvtl": "5", "cand": []}]},
            {"tp": "i", "vag": "0", "par": [
                {"sg": "E", "nfed": "", "dvt": "Anulado sub judice", "tvtn": "0",
                 "tvtl": "0", "tval": "7", "cand": [cand("4001", 0, dvt="Anulado sub judice")]}]},
            {"tp": "i", "vag": "0", "par": [
                {"sg": "F", "nfed": "", "dvt": L, "tvtn": "0", "tvtl": "0", "cand": []}]},
        ]}],
        # nominais 400+100+200 = 700; legenda 50+10+40+5 = 105
        "v": {"vv": "805", "vnom": "700", "vl": "105", "van": "9", "vansj": "7"},
    }


class LerSenador(unittest.TestCase):
    def test_ordem_pct_eleitos_e_anulado_a_parte(self):
        r = ler_cargo_uf(senador())
        self.assertEqual(r["gerado"], "05/10/2026 11:44:31")
        self.assertTrue(r["final"])
        self.assertEqual((r["vagas"], r["validos"], r["votosAnulados"]), (2, 1000, 70))
        self.assertEqual([c["n"] for c in r["candidatos"]], ["111", "222", "400"])
        self.assertEqual(r["candidatos"][0], {"n": "111", "nome": "CAND 111", "partido": "PP",
                                              "votos": 500, "pct": 50.0, "eleito": True})
        self.assertEqual([c["eleito"] for c in r["candidatos"]], [True, True, False])
        self.assertEqual(sum(c["votos"] for c in r["candidatos"]), r["validos"])
        self.assertEqual(r["candidatosAnulados"][0]["situacao"], "Anulado sub judice")
        self.assertNotIn("partidos", r)

    def test_soma_que_nao_bate_e_erro(self):
        d = senador()
        d["v"]["vnom"] = "999"
        with self.assertRaisesRegex(ErroEleicoes, "nominais 1000 ≠ 999"):
            ler_cargo_uf(d)

    def test_eleitos_diferente_das_vagas_e_erro(self):
        d = senador()
        d["carg"][0]["nv"] = "1"
        with self.assertRaisesRegex(ErroEleicoes, "eleitos 2 ≠ 1"):
            ler_cargo_uf(d)


class LerDeputados(unittest.TestCase):
    def test_partidos_somam_nominal_e_legenda(self):
        r = ler_cargo_uf(deputados())
        self.assertEqual((r["vagas"], r["validos"], r["votosAnulados"]), (3, 805, 16))
        p = {x["partido"]: x for x in r["partidos"]}
        self.assertEqual(p["A"]["votos"], 450)
        self.assertEqual(p["B"]["votos"], 110)  # o anulado fica de fora
        self.assertEqual(p["C"]["votos"], 240)  # o cassado já está na legenda
        self.assertEqual(p["A"]["federacao"], "A/B")
        self.assertNotIn("federacao", p["C"])
        self.assertEqual(sum(x["votos"] for x in r["partidos"]), r["validos"])
        self.assertEqual(sum(x["eleitos"] for x in r["partidos"]), r["vagas"])
        self.assertEqual(p["A"]["pct"], round(100 * 450 / 805, 2))

    def test_ordem_e_quem_entra(self):
        r = ler_cargo_uf(deputados())
        # eleitos desc, depois votos desc; D entra com 0 eleitos (tem voto);
        # E (legenda anulada) e F (sem voto) não entram
        self.assertEqual([x["partido"] for x in r["partidos"]], ["A", "C", "B", "D"])
        self.assertEqual(r["eleitos"], [
            {"nome": "CAND 1001", "partido": "A", "votos": 250},
            {"nome": "CAND 3001", "partido": "C", "votos": 200},
            {"nome": "CAND 2001", "partido": "B", "votos": 100}])
        self.assertNotIn("candidatos", r)

    def test_cadeiras_da_agremiacao_conferem(self):
        d = deputados()
        d["carg"][0]["agr"][1]["vag"] = "2"
        with self.assertRaisesRegex(ErroEleicoes, "1 eleitos ≠ vag 2"):
            ler_cargo_uf(d)

    def test_legenda_que_nao_bate_e_erro(self):
        d = deputados()
        d["v"]["vl"] = "100"
        with self.assertRaisesRegex(ErroEleicoes, "legenda 105 ≠ 100"):
            ler_cargo_uf(d)


def mundo() -> dict:
    r = {}
    for abr in UFS:
        r[url_cargo_uf(SENADOR, abr)] = senador(abr)
        r[url_cargo_uf(DEP_FEDERAL, abr)] = deputados(abr)
        est = DEP_DISTRITAL if abr == "df" else DEP_ESTADUAL
        r[url_cargo_uf(est, abr)] = deputados(abr, str(int(est)))
    return r


def pedir_de(respostas: dict) -> eleicoes.Pedir:
    return lambda url: respostas.get(url)


class Coleta(unittest.TestCase):
    def test_tres_cargos_nas_27_ufs(self):
        d = coletar_cargos(pedir_de(mundo()), paralelos=2, agora=lambda: "2026-10-26T17:00:00+00:00")
        self.assertEqual(d["fonte"]["eleicao"], 6259)
        self.assertEqual(d["fonte"]["coletadoEm"], "2026-10-26T17:00:00+00:00")
        self.assertTrue(d["fonte"]["exemplo"].endswith("/6259/dados/sp/sp-c0005-e006259-u.json"))
        for chave in ("senador", "depFederal", "depEstadual"):
            self.assertEqual(sorted(d[chave]), sorted(UFS))
        self.assertEqual(d["depEstadual"]["df"]["cargo"], "Deputado distrital")
        self.assertNotIn("cargo", d["depEstadual"]["sp"])

    def test_df_pede_o_distrital(self):
        self.assertIn("/df/df-c0008-e006259-u.json",
                      url_cargo_uf(eleicoes.cargo_uf("depEstadual", "df"), "df"))
        self.assertIn("/sp/sp-c0007-", url_cargo_uf(eleicoes.cargo_uf("depEstadual", "sp"), "sp"))

    def test_arquivo_que_falta_e_erro(self):
        r = mundo()
        r[url_cargo_uf(SENADOR, "ac")] = None
        with self.assertRaisesRegex(ErroEleicoes, "ac-c0005-e006259-u.json: 404"):
            coletar_cargos(pedir_de(r), paralelos=2)

    def test_cli_grava_ou_nao_grava(self):
        with tempfile.TemporaryDirectory() as tmp:
            saida = Path(tmp) / "cargos.json"
            args = argparse.Namespace(saida=str(saida), cache=None,
                                      reusar_cache=False, paralelos=2)
            with redirect_stdout(io.StringIO()) as out:
                self.assertEqual(cli.eleicoes_2026_cargos(args, pedir=pedir_de(mundo())), 0)
            self.assertIn("senador 27 UFs e 54 eleitos", out.getvalue())
            d = json.loads(saida.read_bytes().decode("utf-8"))
            self.assertEqual(len(d["depFederal"]), 27)
            saida.unlink()
            r = mundo()
            r[url_cargo_uf(DEP_FEDERAL, "sp")] = None
            with redirect_stderr(io.StringIO()):
                self.assertEqual(cli.eleicoes_2026_cargos(args, pedir=pedir_de(r)), 1)
            self.assertFalse(saida.exists())


if __name__ == "__main__":
    unittest.main()

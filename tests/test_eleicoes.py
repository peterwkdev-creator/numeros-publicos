"""Eleições 2026: a leitura do `-u.json` do TSE, as somas que a coleta confere
e o município sem par no TSE.

Sem rede: o "TSE" é um dicionário de URL para JSON, montado com as chaves
reais dos arquivos lidos em 26/10/2026 (`carg[].agr[].par[].cand[]`, `s`,
`e`, `v`), num país de brinquedo com duas UFs (AC com dois municípios, DF com
um) e o exterior.
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

from numeros_publicos import cli, eleicoes
from numeros_publicos.eleicoes import (
    GOVERNADOR, PRESIDENTE, ErroEleicoes, compacto, conferir_soma, coletar,
    ler_resultado, url_config, url_resultado,
)


def arquivo(abr: str, cands: list[tuple[str, int, str]], brancos: int = 1,
            nulos: int = 2, abstencao: int = 3, secoes: int = 1) -> dict:
    """Um `-u.json` mínimo: `cands` é `[(número, votos, destino)]`."""
    validos = sum(v for _, v, d in cands if d == "Válido")
    anulados = sum(v for _, v, d in cands if d != "Válido")
    comparecimento = validos + anulados + brancos + nulos
    return {
        "cdabr": abr, "dg": "25/10/2026", "hg": "23:27:02", "tf": "s",
        "carg": [{"agr": [{"par": [{"sg": f"P{n}", "cand": [{
            "n": n, "nmu": f"CAND {n}", "vap": str(v), "pvap": "0,00",
            "e": "n", "st": "Não eleito", "dvt": d}]} for n, v, d in cands]}]}],
        "s": {"ts": str(secoes), "st": str(secoes)},
        "e": {"te": str(comparecimento + abstencao), "c": str(comparecimento),
              "pc": "0,00", "a": str(abstencao), "pa": "0,00"},
        "v": {"vv": str(validos), "vnom": str(validos), "van": "0",
              "vansj": str(anulados), "vb": str(brancos), "pvb": "0,00",
              "tvn": str(nulos), "ptvn": "0,00"},
    }


def somar(abr: str, partes: list[dict]) -> dict:
    """O arquivo da UF (ou do país) como a soma exata das partes."""
    votos: dict[str, list] = {}
    for p in partes:
        for agr in p["carg"][0]["agr"]:
            for par in agr["par"]:
                c = par["cand"][0]
                votos.setdefault(c["n"], [0, c["dvt"]])[0] += int(c["vap"])
    tot = lambda k, s: sum(int(p[k][s]) for p in partes)
    return arquivo(abr, [(n, v, d) for n, (v, d) in votos.items()],
                   brancos=tot("v", "vb"), nulos=tot("v", "tvn"),
                   abstencao=tot("e", "a"), secoes=tot("s", "ts"))


V = "Válido"
CONFIG = {"abr": [
    {"cd": "ac", "mu": [{"cd": "01120", "cdi": "1200013", "nm": "ACRELÂNDIA"},
                        {"cd": "01570", "cdi": "1200054", "nm": "ASSIS BRASIL"}]},
    {"cd": "df", "mu": [{"cd": "97012", "cdi": "5300108", "nm": "BRASÍLIA"}]},
    {"cd": "zz", "mu": [{"cd": "29998", "cdi": "", "nm": "LISBOA"}]},
]}


def mundo() -> dict[str, dict | None]:
    """Todas as URLs que a coleta pede, com respostas que fecham."""
    r: dict[str, dict | None] = {}
    for e in (6257, 6258, 6259, 6260):
        r[url_config(e)] = CONFIG
    for turno, cands in ((1, [("13", 0, V), ("22", 0, V), ("30", 0, V)]),
                         (2, [("13", 0, V), ("22", 0, V)])):
        def mun(seed: int) -> dict:
            return arquivo("x", [(n, seed * (i + 2), d) for i, (n, _, d) in enumerate(cands)])
        ac = [mun(10), mun(3)]
        df = [mun(7)]
        r[url_resultado(PRESIDENTE, turno, "ac", "01120")] = ac[0]
        r[url_resultado(PRESIDENTE, turno, "ac", "01570")] = ac[1]
        r[url_resultado(PRESIDENTE, turno, "df", "97012")] = df[0]
        uf_ac, uf_df = somar("ac", ac), somar("df", df)
        zz = arquivo("zz", [(n, 5, d) for n, _, d in cands])
        r[url_resultado(PRESIDENTE, turno, "ac")] = uf_ac
        r[url_resultado(PRESIDENTE, turno, "df")] = uf_df
        r[url_resultado(PRESIDENTE, turno, "zz")] = zz
        r[url_resultado(PRESIDENTE, turno, "br")] = somar("br", [uf_ac, uf_df, zz])
    # Governador: 1º turno nas duas, com um anulado sub judice no DF; 2º só no DF.
    g_ac = [arquivo("x", [("15", 40, V), ("45", 20, V)]), arquivo("x", [("15", 4, V), ("45", 9, V)])]
    g_df = [arquivo("x", [("11", 50, V), ("13", 30, V), ("28", 6, "Anulado sub judice")])]
    r[url_resultado(GOVERNADOR, 1, "ac", "01120")] = g_ac[0]
    r[url_resultado(GOVERNADOR, 1, "ac", "01570")] = g_ac[1]
    r[url_resultado(GOVERNADOR, 1, "df", "97012")] = g_df[0]
    r[url_resultado(GOVERNADOR, 1, "ac")] = somar("ac", g_ac)
    r[url_resultado(GOVERNADOR, 1, "df")] = somar("df", g_df)
    g2 = [arquivo("x", [("11", 60, V), ("13", 35, V)])]
    r[url_resultado(GOVERNADOR, 2, "df", "97012")] = g2[0]
    r[url_resultado(GOVERNADOR, 2, "df")] = somar("df", g2)
    r[url_resultado(GOVERNADOR, 2, "ac")] = None  # 404: não houve 2º turno
    return r


def pedir_de(respostas: dict) -> eleicoes.Pedir:
    def pedir(url: str):
        if url not in respostas:
            raise ErroEleicoes(f"{url}: falha de rede (simulada)")
        return respostas[url]
    return pedir


SITE = {"1200013": "Acrelândia", "1200054": "Assis Brasil", "5300108": "Brasília",
        "5101837": "Boa Esperança do Norte"}


class LerResultado(unittest.TestCase):
    def test_le_pelas_chaves(self):
        r = ler_resultado(arquivo("br", [("13", 70, V), ("22", 30, V)], brancos=4, nulos=6, abstencao=10))
        self.assertEqual([c["n"] for c in r["candidatos"]], ["13", "22"])
        self.assertEqual((r["comparecimento"], r["abstencao"], r["brancos"], r["nulos"]), (110, 10, 4, 6))
        self.assertEqual(r["eleitorado"], 120)
        self.assertEqual(r["gerado"], "25/10/2026 23:27:02")

    def test_anulado_sub_judice_fecha_a_soma(self):
        # Governador do DF, 1º turno, 26/10/2026: 1.843 votos em candidatos
        # "Anulado sub judice", fora dos nominais e dentro de `vansj`.
        r = ler_resultado(arquivo("df", [("11", 50, V), ("28", 6, "Anulado sub judice")]))
        self.assertEqual((r["validos"], r["anulados"]), (50, 6))

    def test_eleito_e_so_st_eleito(self):
        # No TSE, `e: "s"` marca também quem vai ao 2º turno (st "2º turno").
        d = arquivo("br", [("13", 70, V), ("22", 30, V), ("30", 5, V)])
        cands = [p["cand"][0] for p in d["carg"][0]["agr"][0]["par"]]
        cands[0].update(e="s", st="2º turno")
        cands[1].update(e="s", st="2º turno")
        r = ler_resultado(d)
        self.assertEqual([c["eleito"] for c in r["candidatos"]], [False, False, False])
        cands[0].update(e="s", st="Eleito")
        self.assertTrue(ler_resultado(d)["candidatos"][0]["eleito"])

    def test_soma_que_nao_fecha_e_erro(self):
        d = arquivo("ac", [("13", 70, V)])
        d["v"]["vnom"] = "71"
        with self.assertRaises(ErroEleicoes):
            ler_resultado(d)

    def test_compacto_recusa_candidato_que_falta(self):
        r = ler_resultado(arquivo("x", [("13", 7, V)]))
        with self.assertRaises(ErroEleicoes):
            compacto(r, ["13", "22"])


class Somas(unittest.TestCase):
    def test_ufs_mais_exterior_igual_ao_brasil(self):
        m = mundo()
        br = ler_resultado(m[url_resultado(PRESIDENTE, 2, "br")])
        partes = [ler_resultado(m[url_resultado(PRESIDENTE, 2, a)]) for a in ("ac", "df", "zz")]
        self.assertEqual(conferir_soma("x", br, partes), [])
        # Sem o exterior, não fecha: a conferência pega a parte que falta.
        self.assertTrue(conferir_soma("x", br, partes[:2]))


class Coleta(unittest.TestCase):
    def setUp(self):
        p = mock.patch.object(eleicoes, "UFS", ("ac", "df"))
        p.start()
        self.addCleanup(p.stop)

    def test_coleta_fecha_e_compacta(self):
        resumo, mun = coletar(pedir_de(mundo()), SITE, paralelos=2, agora=lambda: "2026-10-26T12:00:00+00:00")
        self.assertEqual(sorted(resumo["presidente"]["2"]["ufs"]), ["ac", "df", "zz"])
        self.assertEqual(sorted(resumo["governador"]["2"]), ["df"])  # da resposta, não de lista
        self.assertEqual(sorted(mun["municipios"]), ["1200013", "1200054", "5300108"])
        ac1 = mun["municipios"]["1200013"]
        self.assertEqual(ac1["tse"], "01120")
        # p2: CAMPOS e os votos na ordem da lista do país (13 com 20, 22 com 30).
        ordem = mun["ordem"]["p2"]
        votos = dict(zip(ordem, ac1["p2"][len(eleicoes.CAMPOS):]))
        self.assertEqual(votos, {"13": 20, "22": 30})
        self.assertNotIn("g2", ac1)
        self.assertIn("g2", mun["municipios"]["5300108"])

    def test_soma_dos_municipios_igual_a_uf(self):
        m = mundo()
        m[url_resultado(PRESIDENTE, 1, "ac", "01570")] = arquivo("x", [("13", 1, V), ("22", 1, V), ("30", 1, V)])
        with self.assertRaises(ErroEleicoes) as e:
            coletar(pedir_de(m), SITE, paralelos=2)
        self.assertIn("municípios = AC", str(e.exception))

    def test_municipio_sem_par_vira_nota_e_nao_zero(self):
        resumo, mun = coletar(pedir_de(mundo()), SITE, paralelos=2)
        self.assertEqual(resumo["municipios"]["semPar"],
                         [{"ibge": "5101837", "nome": "Boa Esperança do Norte"}])
        self.assertNotIn("5101837", mun["municipios"])

    def test_falha_parcial_e_erro(self):
        m = mundo()
        del m[url_resultado(GOVERNADOR, 1, "ac", "01570")]
        with self.assertRaises(ErroEleicoes):
            coletar(pedir_de(m), SITE, paralelos=2)

    def test_404_inesperado_e_erro(self):
        m = mundo()
        m[url_resultado(PRESIDENTE, 2, "df", "97012")] = None
        with self.assertRaises(ErroEleicoes):
            coletar(pedir_de(m), SITE, paralelos=2)

    def test_cli_sai_1_e_nao_grava(self):
        m = mundo()
        del m[url_resultado(PRESIDENTE, 2, "zz")]
        with tempfile.TemporaryDirectory() as d:
            snap = Path(d) / "snapshot.json"
            snap.write_text(json.dumps({"municipios": [[1200013, "Acrelândia"]]}), encoding="utf-8")
            args = argparse.Namespace(
                saida=str(Path(d) / "e.json"), saida_municipios=str(Path(d) / "m.json"),
                snapshot=str(snap), cache=d, reusar_cache=False, paralelos=2)
            with redirect_stderr(io.StringIO()), redirect_stdout(io.StringIO()):
                self.assertEqual(cli.eleicoes_2026(args, pedir=pedir_de(m)), 1)
            self.assertFalse((Path(d) / "e.json").exists())
            with redirect_stderr(io.StringIO()), redirect_stdout(io.StringIO()):
                self.assertEqual(cli.eleicoes_2026(args, pedir=pedir_de(mundo())), 0)
            gravado = json.loads((Path(d) / "e.json").read_text(encoding="utf-8"))
            self.assertIn("licenca", gravado["fonte"])


class Transporte(unittest.TestCase):
    def test_404_e_none_e_rede_tenta_de_novo(self):
        import urllib.error
        chamadas = []

        def abrir(req, timeout):
            chamadas.append(req.full_url)
            if "nao-existe" in req.full_url:
                raise urllib.error.HTTPError(req.full_url, 404, "", {}, None)
            raise urllib.error.URLError("caiu")

        with mock.patch("urllib.request.urlopen", abrir):
            pedir = eleicoes.pedir_http(None, dormir=lambda s: None)
            self.assertIsNone(pedir(eleicoes.BASE + "/nao-existe.json"))
            with self.assertRaises(ErroEleicoes):
                pedir(eleicoes.BASE + "/caiu.json")
        self.assertEqual(chamadas.count(eleicoes.BASE + "/caiu.json"), eleicoes.TENTATIVAS)


if __name__ == "__main__":
    unittest.main()

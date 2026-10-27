"""A dívida dos estados (RGF Anexo 02): leitor, régua, fatia, cobertura e CLI.

As fixtures são respostas reais do SICONFI capturadas em 27/10/2026 (SP 2024 e
DF 2025), e os valores esperados são os da espec
`especs/numeros-publicos-divida-estados.md`, §2.1, ao centavo.
"""

import copy
import io
import json
import sqlite3
import tempfile
import unittest
import urllib.parse
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from fiscal import armazem
from fiscal.cli import principal
from fiscal.siconfi import (
    COLUNA_3Q, COLUNA_SALDO_ANTERIOR, ErroSiconfi, Ente, Resposta, divida, url_rgf,
)

FIX = Path(__file__).parent / "fixtures"
SP = Ente(35, "São Paulo", "SP", "SE", "E", 46024937, None)
DF = Ente(53, "Distrito Federal", "DF", "CO", "E", 2982818, None)


def _resposta(nome: str) -> dict:
    return json.loads((FIX / nome).read_text(encoding="utf-8"))["resposta"]


def _transporte(respostas: dict):
    """Responde pelo (id_ente, an_exercicio) da URL; o resto volta vazio (200)."""
    pedidos = []

    def t(url: str) -> Resposta:
        q = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        pedidos.append(q)
        chave = (int(q["id_ente"][0]), int(q["an_exercicio"][0]))
        corpo = respostas.get(chave, {"items": [], "hasMore": False})
        return Resposta(200, json.dumps(corpo))
    t.pedidos = pedidos
    return t


def _ler(resp: dict, codigo: int, ano: int):
    return divida(codigo, ano, _transporte({(codigo, ano): resp}), dormir=lambda s: None)


SP_2024 = dict(dc=372192972626.30, dcl=317655576689.71, rcl=251366970706.76,
               rcl_ajustada=251011974754.38, percentual=126.55)
DF_2025 = dict(dc=9386032883.67, dcl=6221218399.07, rcl=39201192140.12,
               rcl_ajustada=39090948038.61, percentual=15.91)


class TestUrl(unittest.TestCase):
    def test_padrao_continua_o_anexo_01_municipal(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(url_rgf(2024, 3, 2927408)).query)
        self.assertEqual(q["no_anexo"], ["RGF-Anexo 01"])
        self.assertEqual(q["co_esfera"], ["M"])

    def test_anexo_02_estadual(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(
            url_rgf(2025, 3, 53, anexo="RGF-Anexo 02", esfera="E")).query)
        self.assertEqual((q["no_anexo"], q["co_esfera"], q["id_ente"], q["in_periodicidade"]),
                         (["RGF-Anexo 02"], ["E"], ["53"], ["Q"]))


class TestLeitor(unittest.TestCase):
    def test_sp_2024_ao_centavo_e_fecha(self):
        d = _ler(_resposta("rgf02_sp_2024.json"), 35, 2024)
        for campo, valor in SP_2024.items():
            self.assertEqual(round(d.campo(campo), 2), valor, campo)
        self.assertEqual(d.regua(), [])
        self.assertEqual(len(d.linhas), 124)

    def test_df_2025_ao_centavo_e_fecha(self):
        d = _ler(_resposta("rgf02_df_2025.json"), 53, 2025)
        for campo, valor in DF_2025.items():
            self.assertEqual(round(d.campo(campo), 2), valor, campo)
        self.assertEqual(d.regua(), [])

    def test_vazio_e_nao_publicou(self):
        self.assertIsNone(_ler({"items": [], "hasMore": False}, 35, 2014))

    def test_linha_disfarcada_mesmo_nome_outro_codigo(self):
        """Mesmo `conta` da DCL, outro `cod_conta`: não pode virar a DCL."""
        r = _resposta("rgf02_sp_2024.json")
        dcl = next(i for i in r["items"] if i["cod_conta"] == "DividaConsolidadaLiquida"
                   and i["coluna"] == COLUNA_3Q)
        falsa = dict(dcl, cod_conta="DividaConsolidadaLiquidaIntra", valor=1.0)
        r["items"].insert(0, falsa)
        d = _ler(r, 35, 2024)
        self.assertEqual(round(d.campo("dcl"), 2), SP_2024["dcl"])
        self.assertEqual(d.regua(), [])

    def test_nome_mudado_mesmo_codigo_continua_lido(self):
        r = _resposta("rgf02_sp_2024.json")
        for i in r["items"]:
            if i["cod_conta"] == "DividaConsolidadaLiquida":
                i["conta"] = "OUTRO NOME QUALQUER"
        self.assertEqual(round(_ler(r, 35, 2024).campo("dcl"), 2), SP_2024["dcl"])

    def test_par_repetido_falha_alto(self):
        r = _resposta("rgf02_sp_2024.json")
        r["items"].append(copy.deepcopy(r["items"][0]))
        with self.assertRaises(ErroSiconfi):
            _ler(r, 35, 2024)

    def test_trajetoria_em_tabela_entra_pela_ordem(self):
        """MA 2015: a trajetória repete `cod_conta` + `coluna`; só a ordem separa."""
        r = _resposta("rgf02_ma_2015_trajetoria.json")
        d = _ler(r, 21, 2015)
        traj = [(k[2], v) for k, v in sorted(d.linhas.items())
                if k[0] == "PercentualDaDCLSobreARCLTrajetoriaDeAjuste"]
        self.assertEqual([o for o, _ in traj], list(range(14)))
        # Na ordem da resposta, inclusive as linhas iguais por inteiro.
        esperado = [(i["conta"], i["valor"]) for i in r["items"]
                    if i["cod_conta"] == "PercentualDaDCLSobreARCLTrajetoriaDeAjuste"]
        self.assertEqual([v for _, v in traj], esperado)
        self.assertEqual(sum(1 for k in d.linhas if k[2] == 0), 17 + 1)

    def test_trajetoria_gravada_sem_colisao(self):
        with tempfile.TemporaryDirectory() as tmp:
            with armazem.abrir(Path(tmp) / "e.db") as con:
                armazem.gravar_entes(con, [Ente(21, "Maranhão", "MA", "NE", "E", None, None)])
                d = _ler(_resposta("rgf02_ma_2015_trajetoria.json"), 21, 2015)
                if not d.regua():
                    armazem.gravar_divida(con, 21, 2015, 3, d)
                    self.assertEqual(con.execute(
                        "SELECT COUNT(*), MAX(ordem) FROM divida_conta").fetchone()[:], (31, 13))

    def test_repeticao_fora_da_tabela_continua_falhando(self):
        """Repetir a mesma linha da trajetória numa conta da página falha alto."""
        r = _resposta("rgf02_ma_2015_trajetoria.json")
        r["items"].append(dict(next(i for i in r["items"]
                                    if i["cod_conta"] == "PercentualDaDCLSobreARCL")))
        with self.assertRaises(ErroSiconfi):
            _ler(r, 21, 2015)

    def test_dois_rotulos_falha_alto(self):
        r = _resposta("rgf02_sp_2024.json")
        r["items"][0]["rotulo"] = None
        with self.assertRaises(ErroSiconfi):
            _ler(r, 35, 2024)

    def test_linha_de_outro_ente_falha_alto(self):
        r = _resposta("rgf02_sp_2024.json")
        r["items"][3]["cod_ibge"] = 33
        with self.assertRaises(ErroSiconfi):
            _ler(r, 35, 2024)


def _mexer(r: dict, cod: str, valor, coluna: str = COLUNA_3Q) -> dict:
    for i in r["items"]:
        if i["cod_conta"] == cod and i["coluna"] == coluna:
            i["valor"] = valor
    return r


class TestRegua(unittest.TestCase):
    def test_dcl_plantada_um_real_reprova(self):
        r = _mexer(_resposta("rgf02_sp_2024.json"), "DividaConsolidadaLiquida", 317655576690.71)
        self.assertTrue(any("DCL" in p for p in _ler(r, 35, 2024).regua()))

    def test_percentual_plantado_reprova(self):
        r = _mexer(_resposta("rgf02_df_2025.json"), "PercentualDaDCLSobreARCL", 15.93)
        self.assertTrue(_ler(r, 53, 2025).regua())

    def test_limite_em_pontos_percentuais_vira_reais(self):
        """A armadilha dos municípios (CE: 200 e 180): grava em reais sobre a base."""
        r = _mexer(_resposta("rgf02_df_2025.json"), "LimiteDefinidoPorResolucaoDoSenadoFederal", 200)
        r = _mexer(r, "LimiteDeAlerta", 180)
        d = _ler(r, 53, 2025)
        c = d.campos()
        base = c["rcl_ajustada"] if c["rcl_ajustada"] is not None else c["rcl"]
        self.assertEqual(c["limite_senado"], round(2 * base, 2))
        self.assertEqual(c["limite_alerta"], round(1.8 * base, 2))
        self.assertEqual(d.campo("limite_senado"), 200)  # o cru, na divida_conta
        self.assertEqual(d.regua(), [])
        self.assertEqual(sum("pontos percentuais" in a for a in d.avisos()), 2)

    def test_limite_fora_de_2x_grava_e_avisa(self):
        """RR declara 0,9 x RCL: vai como a fonte declara, com aviso."""
        r = _resposta("rgf02_df_2025.json")
        rcl = _ler(r, 53, 2025).campo("rcl")
        r = _mexer(r, "LimiteDefinidoPorResolucaoDoSenadoFederal", round(0.9 * rcl, 2))
        d = _ler(r, 53, 2025)
        self.assertEqual(d.regua(), [])
        self.assertEqual(d.campos()["limite_senado"], round(0.9 * rcl, 2))
        self.assertTrue(any("não é 2 x" in a for a in d.avisos()))

    def test_padrao_sem_aviso(self):
        self.assertEqual(_ler(_resposta("rgf02_sp_2024.json"), 35, 2024).avisos(), [])
        self.assertEqual(_ler(_resposta("rgf02_df_2025.json"), 53, 2025).avisos(), [])

    def test_sem_deducao_so_se_dc_igual_dcl(self):
        r = _resposta("rgf02_df_2025.json")
        r["items"] = [i for i in r["items"] if i["cod_conta"] != "DeducoesDaDividaConsolidada"]
        self.assertTrue(any("sem dedução" in p for p in _ler(r, 53, 2025).regua()))

    def test_campo_ausente_reprova(self):
        """AP 2017: sem DCL nem %, a fatia não entra."""
        r = _resposta("rgf02_df_2025.json")
        r["items"] = [i for i in r["items"] if i["cod_conta"] != "DividaConsolidadaLiquida"]
        self.assertTrue(any("ausente" in p for p in _ler(r, 53, 2025).regua()))

    def test_limite_ausente_grava_e_avisa(self):
        r = _resposta("rgf02_df_2025.json")
        r["items"] = [i for i in r["items"] if i["cod_conta"] != "LimiteDeAlerta"]
        d = _ler(r, 53, 2025)
        self.assertEqual(d.regua(), [])
        self.assertIn("limite_alerta ausente", d.avisos())


class Banco(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.caminho = Path(self.dir.name) / "estados.db"
        with armazem.abrir(self.caminho) as con:
            armazem.gravar_entes(con, [SP, DF])

    def tearDown(self):
        self.dir.cleanup()

    def _contar(self, tabela: str) -> int:
        with armazem.abrir(self.caminho) as con:
            return con.execute(f"SELECT COUNT(*) FROM {tabela}").fetchone()[0]


class TestFatia(Banco):
    def test_releitura_substitui_e_vazio_apaga(self):
        r = _resposta("rgf02_sp_2024.json")
        with armazem.abrir(self.caminho) as con:
            armazem.gravar_divida(con, 35, 2024, 3, _ler(r, 35, 2024))
        self.assertEqual(self._contar("divida_conta"), 124)
        # A releitura sem uma linha de detalhe: a linha some do banco.
        r2 = _resposta("rgf02_sp_2024.json")
        r2["items"] = [i for i in r2["items"] if i["cod_conta"] != "OutrasDividas"]
        with armazem.abrir(self.caminho) as con:
            armazem.gravar_divida(con, 35, 2024, 3, _ler(r2, 35, 2024))
            self.assertEqual(con.execute(
                "SELECT COUNT(*) FROM divida_conta WHERE cod_conta='OutrasDividas'").fetchone()[0], 0)
        self.assertEqual(self._contar("divida_conta"), 124 - 4)
        # Deixou de publicar: só a linha publicou=0, sem valor nem detalhe.
        with armazem.abrir(self.caminho) as con:
            armazem.gravar_divida(con, 35, 2024, 3, None)
            linha = con.execute("SELECT * FROM divida").fetchone()
        self.assertEqual(self._contar("divida_conta"), 0)
        self.assertEqual(linha["publicou"], 0)
        self.assertIsNone(linha["dcl"])

    def test_regua_reprovada_nao_apaga_a_anterior(self):
        with armazem.abrir(self.caminho) as con:
            armazem.gravar_divida(con, 53, 2025, 3, _ler(_resposta("rgf02_df_2025.json"), 53, 2025))
        ruim = _ler(_mexer(_resposta("rgf02_df_2025.json"), "DividaConsolidadaLiquida", 1.0), 53, 2025)
        with self.assertRaises(armazem.ReguaDivida):
            with armazem.abrir(self.caminho) as con:
                armazem.gravar_divida(con, 53, 2025, 3, ruim)
        with armazem.abrir(self.caminho) as con:
            self.assertEqual(round(con.execute("SELECT dcl FROM divida").fetchone()[0], 2),
                             DF_2025["dcl"])
        self.assertEqual(self._contar("divida_conta"), 116)

    def test_retrato_acusa_o_que_encolheu(self):
        with armazem.abrir(self.caminho) as con:
            armazem.gravar_divida(con, 35, 2024, 3, _ler(_resposta("rgf02_sp_2024.json"), 35, 2024))
            antes = armazem.retrato_divida(con)
            armazem.gravar_divida(con, 35, 2024, 3, None)
            difs = armazem.comparar_retratos(antes, armazem.retrato_divida(con))
        self.assertIn("ufs_por_ano 2024: 1 -> 0", difs)
        self.assertIn("anos_por_uf SP: 1 -> 0", difs)
        self.assertTrue(any(d.startswith("nao_nulos dcl") for d in difs))

    def test_encadeamento_relata_a_retificacao(self):
        """O saldo anterior de 2025 contra o 3º quadrimestre de 2024 (DF)."""
        r24 = _resposta("rgf02_df_2025.json")
        for i in r24["items"]:
            i["exercicio"] = 2024
            if i["coluna"] == COLUNA_3Q:
                saldo = next((j["valor"] for j in r24["items"] if j["cod_conta"] == i["cod_conta"]
                             and j["coluna"] == COLUNA_SALDO_ANTERIOR), i["valor"])
                i["valor"] = saldo
        with armazem.abrir(self.caminho) as con:
            armazem.gravar_divida(con, 53, 2025, 3, _ler(_resposta("rgf02_df_2025.json"), 53, 2025))
            armazem.gravar_divida(con, 53, 2024, 3, _ler(r24, 53, 2024))
            pares, difs = armazem.encadeamento_divida(con)
        self.assertEqual((pares, difs), (8, []))
        # Plantada: a DCL de 2024 retificada em 1 real no relatório de 2025.
        with armazem.abrir(self.caminho) as con:
            con.execute("UPDATE divida_conta SET valor=valor+1 WHERE exercicio=2025"
                        " AND cod_conta='DividaConsolidadaLiquida' AND coluna=?",
                        (COLUNA_SALDO_ANTERIOR,))
            pares, difs = armazem.encadeamento_divida(con)
        self.assertEqual([(d[0], d[1], d[2]) for d in difs], [(53, 2024, "dcl")])


class TestCli(Banco):
    def _rodar(self, *argv, respostas):
        t = _transporte(respostas)
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            rc = principal(["--banco", str(self.caminho), "--esfera", "E", "ingerir-divida",
                            "--pausa", "0", *argv], transporte=t, dormir=lambda s: None)
        return rc, out.getvalue(), err.getvalue(), t

    def test_ingere_retoma_e_relata(self):
        resp = {(35, 2024): _resposta("rgf02_sp_2024.json"),
                (53, 2025): _resposta("rgf02_df_2025.json")}
        rc, out, err, t = self._rodar("--de", "2024", "--ate", "2025", respostas=resp)
        self.assertEqual(rc, 0, err)
        self.assertEqual(len(t.pedidos), 4)
        self.assertTrue(all(q["no_anexo"] == ["RGF-Anexo 02"] and q["co_esfera"] == ["E"]
                            for q in t.pedidos))
        self.assertIn("nada encolheu", out)
        with armazem.abrir(self.caminho) as con:
            self.assertEqual(con.execute(
                "SELECT COUNT(*), SUM(publicou) FROM divida").fetchone()[:], (4, 2))
        # Retomada: só os dois que não publicaram voltam a ser pedidos.
        rc, out, err, t = self._rodar("--de", "2024", "--ate", "2025", respostas=resp)
        self.assertEqual(len(t.pedidos), 2)
        # Retificação com a fonte vazia: a cobertura acusa (relata, sai 0).
        rc, out, err, t = self._rodar("--de", "2024", "--ate", "2024", "--uf", "SP",
                                      "--recomecar", respostas={})
        self.assertEqual(rc, 0)
        self.assertIn("ENCOLHEU ufs_por_ano 2024: 1 -> 0", out)

    def test_regua_reprovada_sai_1(self):
        ruim = _mexer(_resposta("rgf02_sp_2024.json"), "PercentualDaDCLSobreARCL", 99.0)
        rc, out, err, _ = self._rodar("--de", "2024", "--ate", "2024", "--uf", "SP",
                                      respostas={(35, 2024): ruim})
        self.assertEqual(rc, 1)
        self.assertIn("RÉGUA", err)
        self.assertEqual(self._contar("divida"), 0)

    def test_so_estados(self):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            rc = principal(["--banco", str(self.caminho), "ingerir-divida", "--ate", "2024"],
                           transporte=_transporte({}), dormir=lambda s: None)
        self.assertEqual(rc, 2)


#: As 27 UFs pelo código do IBGE; SP e DF com os dados reais das fixtures.
UFS = {11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO",
       21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB", 26: "PE", 27: "AL",
       28: "SE", 29: "BA", 31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR",
       42: "SC", 43: "RS", 50: "MS", 51: "MT", 52: "GO", 53: "DF"}


class TestExportar(Banco):
    def setUp(self):
        super().setUp()
        self.saida = Path(self.dir.name) / "estados-divida.json"
        outros = [Ente(c, f"Estado {uf}", uf, "X", "E", 1, None)
                  for c, uf in UFS.items() if c not in (35, 53)]
        with armazem.abrir(self.caminho) as con:
            armazem.gravar_entes(con, outros)
            armazem.gravar_divida(con, 35, 2024, 3, _ler(_resposta("rgf02_sp_2024.json"), 35, 2024))
            armazem.gravar_divida(con, 53, 2024, 3, None)
            armazem.gravar_divida(con, 53, 2025, 3, _ler(_resposta("rgf02_df_2025.json"), 53, 2025))

    def _exportar(self, *argv):
        out, err = io.StringIO(), io.StringIO()
        with redirect_stdout(out), redirect_stderr(err):
            rc = principal(["--banco", str(self.caminho), "--esfera", "E", "exportar-divida",
                            "--saida", str(self.saida), *argv])
        return rc, out.getvalue(), err.getvalue()

    def _json(self) -> dict:
        return json.loads(self.saida.read_text(encoding="utf-8"))

    def test_colunas_valores_base_e_faltam(self):
        rc, out, err = self._exportar()
        self.assertEqual(rc, 0, err)
        j = self._json()
        self.assertEqual(j["colunas"], ["dc", "deducoes", "dcl", "rcl", "rclAjustada",
                                        "percentual", "limiteSenado", "limiteAlerta"])
        self.assertEqual(j["exercicios"], [2025, 2024])
        self.assertEqual(len(j["estados"]), 27)
        for cod, ano, esperado in (("35", "2024", SP_2024), ("53", "2025", DF_2025)):
            linha = dict(zip(j["colunas"], j["estados"][cod]["anos"][ano]))
            self.assertEqual(round(linha["dc"] - linha["deducoes"], 2), round(linha["dcl"], 2))
            for campo, chave in (("dc", "dc"), ("dcl", "dcl"), ("rcl", "rcl"),
                                 ("rcl_ajustada", "rclAjustada"), ("percentual", "percentual")):
                self.assertEqual(round(linha[chave], 2), esperado[campo], (cod, ano, campo))
            self.assertEqual(j["estados"][cod]["base"][ano], "rclAjustada")
            self.assertEqual(j["estados"][cod]["avisos"], {})
        # DF consultado em 2024 sem publicar: não vira ano, entra em `faltam`.
        self.assertNotIn("2024", j["estados"]["53"]["anos"])
        self.assertIn("DF", j["faltam"]["2024"])
        self.assertNotIn("SP", j["faltam"]["2024"])
        self.assertEqual(len(j["faltam"]["2025"]), 26)
        self.assertIn("2 anos", out)

    def test_aviso_do_limite_fora_do_padrao(self):
        r = _resposta("rgf02_df_2025.json")
        rcl = _ler(r, 53, 2025).campo("rcl")
        r = _mexer(r, "LimiteDefinidoPorResolucaoDoSenadoFederal", round(0.9 * rcl, 2))
        with armazem.abrir(self.caminho) as con:
            armazem.gravar_divida(con, 53, 2025, 3, _ler(r, 53, 2025))
        rc, out, err = self._exportar()
        self.assertEqual(rc, 0, err)
        df = self._json()["estados"]["53"]
        self.assertTrue(any("não é 2 x" in a for a in df["avisos"]["2025"]))
        self.assertEqual(df["anos"]["2025"][6], round(0.9 * rcl, 2))
        self.assertIn("1 com aviso", out)

    def test_faltando_ente_sai_1(self):
        with armazem.abrir(self.caminho) as con:
            con.execute("DELETE FROM ente WHERE codigo_ibge=11")
        rc, _, err = self._exportar()
        self.assertEqual(rc, 1)
        self.assertIn("26 entes", err)
        self.assertFalse(self.saida.exists())

    def test_banco_mexido_a_mao_nao_sai(self):
        with armazem.abrir(self.caminho) as con:
            con.execute("UPDATE divida_conta SET valor=valor+1 WHERE codigo_ibge=35"
                        " AND cod_conta='DividaConsolidadaLiquida'")
        rc, _, err = self._exportar()
        self.assertEqual(rc, 1)
        self.assertIn("SP 2024 não fecha a régua", err)
        self.assertFalse(self.saida.exists())

    def test_nada_mudou_e_encolher(self):
        self.assertEqual(self._exportar()[0], 0)
        antes = self.saida.read_bytes()
        rc, out, _ = self._exportar()
        self.assertEqual(rc, 0)
        self.assertIn("NADA MUDOU", out)
        self.assertEqual(self.saida.read_bytes(), antes)
        with armazem.abrir(self.caminho) as con:
            armazem.gravar_divida(con, 35, 2024, 3, None)
        rc, _, err = self._exportar()
        self.assertEqual(rc, 1)
        self.assertIn("sumiriam", err)
        self.assertEqual(self.saida.read_bytes(), antes)
        rc, _, err = self._exportar("--permitir-encolher")
        self.assertEqual(rc, 0, err)
        self.assertNotIn("2024", self._json()["estados"]["35"]["anos"])


if __name__ == "__main__":
    unittest.main()

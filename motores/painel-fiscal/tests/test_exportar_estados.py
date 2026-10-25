"""`exportar-estados`: o arquivo dos 26 governos estaduais e do DF.

`especs/painel-fiscal-estados.md`, Fase 2. As travas são o que importa: o
arquivo só sai com os 27 entes, com o limite legal que a LRF prevê para o
Executivo estadual e sem função cuja soma não fecha; e não encolhe sem pedir.
"""

import io
import json
import re
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from fiscal.armazem import abrir
from fiscal.cli import principal
from fiscal.siconfi import FUNCOES, UF_DO_CODIGO

#: O contrato do lado do site (`motores/painel-fiscal/` → `painel/lib/`).
ESTADOS_TS = (Path(__file__).resolve().parents[3] / "painel" / "lib"
              / "estados-fiscal.ts")

#: BA, GO e PA têm Tribunal de Contas dos Municípios: 48,6% (art. 20, §4º).
COM_TCM = {29, 52, 15}


def _povoar(banco: Path, *, sem: int | None = None, prudencial: dict | None = None,
            nao_fecha: tuple | None = None, anos=(2024, 2025)) -> None:
    """O banco dos estados com 27 entes, ou 26 se `sem` for um código."""
    prudencial = prudencial or {}
    with abrir(banco) as con:
        for cod, uf in UF_DO_CODIGO.items():
            if cod == sem:
                continue
            con.execute(
                "INSERT INTO ente (codigo_ibge, nome, uf, regiao, esfera, visto_em)"
                " VALUES (?, ?, ?, 'X', 'E', 't')", (cod, f"Estado {uf}", uf))
            for ano in anos:
                fecha = 0 if nao_fecha == (cod, ano) else 1
                con.execute(
                    "INSERT INTO funcao_consulta VALUES (?, ?, 6, 1, ?, '2026-10-25')",
                    (cod, ano, fecha))
                for funcao, valor in ((FUNCOES[0], 300.0), (FUNCOES[1], 700.0)):
                    con.execute(
                        "INSERT INTO despesa_funcao VALUES (?, ?, 6, ?, ?, 1000.0, 'f', 't')",
                        (cod, ano, funcao, valor))
                pr = prudencial.get(cod, 46.17 if cod in COM_TCM else 46.55)
                con.execute(
                    "INSERT INTO pessoal VALUES (?, ?, 3, 1, 1e9, 9e8, 4e8, 44.44, ?, 'f', 't')",
                    (cod, ano, pr))


def _rodar(banco: Path, saida: Path, *extra: str) -> tuple[int, str, str]:
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        codigo = principal(["--banco", str(banco), "exportar-estados",
                            "--saida", str(saida), *extra])
    return codigo, out.getvalue(), err.getvalue()


class TestExportarEstados(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self._tmp.name)
        self.banco = self.dir / "estados.db"
        self.saida = self.dir / "estados-fiscal.json"

    def tearDown(self):
        self._tmp.cleanup()

    def test_27_entes_e_o_formato(self):
        _povoar(self.banco)
        codigo, _, err = _rodar(self.banco, self.saida)
        self.assertEqual(codigo, 0, err)
        d = json.loads(self.saida.read_text(encoding="utf-8"))
        self.assertEqual(len(d["estados"]), 27)
        self.assertEqual(d["exercicios"], [2025, 2024])
        self.assertEqual(d["rotulos"], list(FUNCOES))
        self.assertEqual(d["fora"], [])
        ba = d["estados"]["29"]
        self.assertEqual(ba["uf"], "BA")
        total, valores = ba["funcoes"]["2025"]
        self.assertEqual(total, 1000.0)
        self.assertEqual(valores, [[1, 700.0], [0, 300.0]])
        self.assertEqual(ba["pessoal"]["2025"][-1], 48.6)
        self.assertEqual(d["estados"]["35"]["pessoal"]["2025"][-1], 49.0)
        self.assertEqual(len(d["colunasPessoal"]), len(ba["pessoal"]["2025"]))

    def test_colunas_batem_com_as_tuplas_do_typescript(self):
        """A página lê `PessoalDoAno` pela posição: uma coluna nova no meio
        trocaria o limite pelo percentual sem erro nenhum."""
        _povoar(self.banco)
        codigo, _, err = _rodar(self.banco, self.saida)
        self.assertEqual(codigo, 0, err)
        d = json.loads(self.saida.read_text(encoding="utf-8"))
        ts = ESTADOS_TS.read_text(encoding="utf-8")
        corpo = re.search(r"export type PessoalDoAno = \[(.*?)\];", ts, re.S)
        self.assertIsNotNone(corpo, "PessoalDoAno não encontrada")
        self.assertEqual(d["colunasPessoal"], re.findall(r"(\w+):", corpo.group(1)))
        corpo = re.search(r"export type FuncoesDoAno = \[(\w+): [^,]+, (\w+):", ts)
        self.assertIsNotNone(corpo, "FuncoesDoAno não encontrada")
        self.assertEqual(d["colunasFuncoes"], list(corpo.groups()))
        # As funções da série da página existem entre os rótulos do motor.
        serie = re.search(r"FUNCOES_DA_SERIE = \[(.*?)\]", ts).group(1)
        for nome in re.findall(r'"([^"]+)"', serie):
            self.assertIn(nome, d["rotulos"])

    def test_26_entes_da_erro_e_nao_grava(self):
        _povoar(self.banco, sem=53)
        codigo, _, err = _rodar(self.banco, self.saida)
        self.assertEqual(codigo, 1)
        self.assertIn("26 entes", err)
        self.assertFalse(self.saida.exists())

    def test_limite_fora_da_lei_da_erro_e_nao_grava(self):
        # 51,3 é o prudencial do município (54 × 0,95): no estado é leitura errada.
        _povoar(self.banco, prudencial={35: 51.3})
        codigo, _, err = _rodar(self.banco, self.saida)
        self.assertEqual(codigo, 1)
        self.assertIn("SP", err)
        self.assertFalse(self.saida.exists())

    def test_funcao_que_nao_fecha_fica_fora_com_motivo(self):
        _povoar(self.banco, nao_fecha=(33, 2024))
        codigo, _, err = _rodar(self.banco, self.saida)
        self.assertEqual(codigo, 0, err)
        d = json.loads(self.saida.read_text(encoding="utf-8"))
        self.assertNotIn("2024", d["estados"]["33"]["funcoes"])
        self.assertIn("2025", d["estados"]["33"]["funcoes"])
        self.assertIn("2024", d["estados"]["33"]["pessoal"])
        self.assertEqual([(f["codigo"], f["exercicio"]) for f in d["fora"]], [(33, 2024)])

    def test_encolher_recusado_sem_a_bandeira(self):
        _povoar(self.banco)
        self.assertEqual(_rodar(self.banco, self.saida)[0], 0)
        antes = self.saida.read_bytes()
        menor = self.dir / "menor.db"
        _povoar(menor, anos=(2025,))
        codigo, _, err = _rodar(menor, self.saida)
        self.assertEqual(codigo, 1)
        self.assertIn("sumiriam", err)
        self.assertEqual(self.saida.read_bytes(), antes)
        self.assertEqual(_rodar(menor, self.saida, "--permitir-encolher")[0], 0)
        self.assertEqual(json.loads(self.saida.read_text(encoding="utf-8"))["exercicios"], [2025])

    def test_mesmo_dado_nao_reescreve(self):
        _povoar(self.banco)
        self.assertEqual(_rodar(self.banco, self.saida)[0], 0)
        antes = self.saida.read_bytes()
        codigo, out, _ = _rodar(self.banco, self.saida)
        self.assertEqual(codigo, 0)
        self.assertIn("NADA MUDOU", out)
        self.assertEqual(self.saida.read_bytes(), antes)


if __name__ == "__main__":
    unittest.main()

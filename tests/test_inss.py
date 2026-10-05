"""A ingestão do INSS: cada armadilha medida na Fase 0 vira um teste.

Ver `especs/numeros-publicos-inss.md` (§8 e §9), no repositório da raiz. Sem
rede: os arquivos são escritos aqui, pequenos, na forma dos reais.
"""

from __future__ import annotations

import datetime as dt
import io
import sqlite3
import tempfile
import unittest
import zipfile
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from numeros_publicos import inss
from numeros_publicos import inss_grupos as grupos
from numeros_publicos.cli import construir_parser, inss_ingerir

CAB_PEND = ('"Código da unidade da criação da tarefa","Nome da unidade da criação '
            'da tarefa","Código do serviço","Nome do serviço","UF da unidade da '
            'criação da tarefa","Data da criação","Quantidade de tarefas"')


def csv_pendentes(linhas: list[tuple]) -> str:
    """`(unidade, serviço, uf, 'DDMMAAAA', quantidade)` → o CSV do INSS."""
    corpo = [CAB_PEND]
    for unidade, servico, uf, data, q in linhas:
        corpo.append(f'"{unidade}","AGÊNCIA DA PREVIDÊNCIA SOCIAL {unidade}",'
                     f'{servico},"Serviço {servico}","{uf}",{data},{q}')
    return "\n".join(corpo) + "\n"


def todas_as_ufs(data: str, servico: int = 1655, q: int = 1) -> list[tuple]:
    return [(f"{i:05d}", servico, uf, data, q) for i, uf in enumerate(sorted(inss.UFS))]


def serial(d: dt.date) -> float:
    return float((d - dt.date(1899, 12, 30)).days)


def escrever_xlsx(caminho: Path, linhas: list[list]) -> None:
    """Um XLSX mínimo, com strings compartilhadas e números, na forma do INSS.
    Serve para testar a lógica; a prova do leitor é contra o `openpyxl` no
    arquivo real (ver a especificação, §9)."""
    strings: list[str] = []

    def celula(ref: str, v) -> str:
        if v is None:
            return ""
        if isinstance(v, str):
            if v not in strings:
                strings.append(v)
            return f'<c r="{ref}" t="s"><v>{strings.index(v)}</v></c>'
        return f'<c r="{ref}"><v>{v}</v></c>'

    def letra(i: int) -> str:
        s = ""
        i += 1
        while i:
            i, r = divmod(i - 1, 26)
            s = chr(65 + r) + s
        return s

    ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    rel = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    corpo = "".join(
        f'<row r="{n}">' + "".join(celula(f"{letra(i)}{n}", v) for i, v in enumerate(l))
        + "</row>" for n, l in enumerate(linhas, 1))
    with zipfile.ZipFile(caminho, "w") as z:
        z.writestr("xl/workbook.xml",
                   f'<workbook {ns} {rel}><sheets><sheet name="D" sheetId="1" r:id="rId1"/>'
                   "</sheets></workbook>")
        z.writestr("xl/_rels/workbook.xml.rels",
                   '<Relationships xmlns="http://schemas.openxmlformats.org/package/'
                   '2006/relationships"><Relationship Id="rId1" '
                   'Target="worksheets/sheet1.xml"/></Relationships>')
        z.writestr("xl/worksheets/sheet1.xml",
                   f"<worksheet {ns}><sheetData>{corpo}</sheetData></worksheet>")
        z.writestr("xl/sharedStrings.xml",
                   f"<sst {ns}>" + "".join(f"<si><t>{s}</t></si>" for s in strings)
                   + "</sst>")


CAB_NEG = ["Competência indeferimento", "Espécie", "Espécie", "Motivo Indeferimento",
           "Dt Nascimento", "Sexo.", "Clientela", "Forma Filiação", "UF",
           "Dt Indeferimento", "Ramo Atividade", "APS", "APS", "Dt DER"]

NOMES_UF = {v: k.title() for k, v in inss.UF_POR_NOME.items()}


def linha_negada(comp: int, especie: int, motivo: str, uf: str, aps: int,
                 pedido: dt.date, negado: dt.date, clientela: str = "Urbano") -> list:
    return [comp, especie, f"Espécie {especie}", motivo, serial(dt.date(1980, 1, 1)),
            "Feminino", clientela, "Empregado", NOMES_UF[uf], serial(negado),
            "Comerciario", aps, f"{aps:08d}-Aps {uf}", serial(pedido)]


def negados_do_mes(comp: int, especie: int = 87, clientelas=("Urbano",)) -> list:
    """Uma negativa por UF para cada clientela: o mínimo que passa na trava."""
    ano, mes = divmod(comp, 100)
    return [linha_negada(comp, especie, "Motivo", uf, 1000 + i,
                         dt.date(ano, mes, 1), dt.date(ano, mes, 11), c)
            for c in clientelas for i, uf in enumerate(sorted(inss.UFS))]


class TestMesDoArquivo(unittest.TestCase):
    """Armadilha 1: em 25/09/2026 o recurso "Agsoto 2026" era PEND_202507."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = inss.ArmazemINSS(Path(self.tmp.name) / "inss.db")

    def tearDown(self) -> None:
        self.db.con.close()
        self.tmp.cleanup()

    def _gravar(self, mes, nome, csv_texto):
        return inss.gravar_pendentes(self.db, mes, nome,
                                     inss.ler_pendentes(io.StringIO(csv_texto)))

    def test_nome_do_arquivo_de_outro_mes_e_recusado(self) -> None:
        with self.assertRaises(inss.ErroINSS) as ctx:
            self._gravar("2026-08", "PDA_ITEM_10_PEND_202507.csv",
                         csv_pendentes(todas_as_ufs("31072025")))
        self.assertIn("2025-07", str(ctx.exception))
        self.assertEqual(self.db.con.execute("SELECT COUNT(*) FROM pendente").fetchone()[0], 0)

    def test_conteudo_de_outro_mes_e_recusado_mesmo_com_o_nome_certo(self) -> None:
        with self.assertRaises(inss.ErroINSS) as ctx:
            self._gravar("2026-07", "PEND_202607.csv",
                         csv_pendentes(todas_as_ufs("30062026")))
        self.assertIn("fora do mês", str(ctx.exception))

    def test_mes_certo_grava_e_a_idade_e_contada_na_data_de_referencia(self) -> None:
        linhas = todas_as_ufs("31072026") + [("99999", 1655, "SP", "01072026", 5)]
        r = self._gravar("2026-07", "PEND_202607.csv", csv_pendentes(linhas))
        self.assertEqual(r["total"], 27 + 5)
        idade = self.db.con.execute(
            "SELECT idade_dias FROM pendente WHERE unidade='99999'").fetchone()[0]
        self.assertEqual(idade, 30)   # 01/07 → 31/07

    def test_competencia_dos_negados_e_conferida_linha_a_linha(self) -> None:
        linhas = [linha_negada(202607, 87, "Motivo", uf, 1000 + i,
                               dt.date(2026, 6, 1), dt.date(2026, 7, 1))
                  for i, uf in enumerate(sorted(inss.UFS))]
        linhas.append(linha_negada(202507, 87, "Motivo", "SP", 1,
                                   dt.date(2025, 6, 1), dt.date(2025, 7, 1)))
        with self.assertRaises(inss.ErroINSS) as ctx:
            inss.gravar_indeferidos(self.db, "2026-07", "x.xlsx",
                                    inss.ler_indeferidos([["título"], CAB_NEG, *linhas]))
        self.assertIn("202507", str(ctx.exception))
        self.assertEqual(self.db.con.execute("SELECT COUNT(*) FROM negado").fetchone()[0], 0)


class TestReleituraSubstituiAFatia(unittest.TestCase):
    """Armadilha 5: reingerir um mês apaga o mês antes de gravar, e só ele."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = inss.ArmazemINSS(Path(self.tmp.name) / "inss.db")

    def tearDown(self) -> None:
        self.db.con.close()
        self.tmp.cleanup()

    def _gravar(self, mes, data, extra=()):
        ano, m = inss.mes_de(mes)
        texto = csv_pendentes(todas_as_ufs(data) + list(extra))
        return inss.gravar_pendentes(self.db, mes, f"PEND_{ano}{m:02d}.csv",
                                     inss.ler_pendentes(io.StringIO(texto)))

    def test_linha_que_sumiu_da_fonte_sai_do_banco_e_o_mes_vizinho_fica(self) -> None:
        self._gravar("2026-06", "30062026")
        self._gravar("2026-07", "31072026", [("99999", 4852, "CE", "15072026", 7)])
        self._gravar("2026-07", "31072026")   # releitura sem a linha extra
        n_jul = self.db.con.execute(
            "SELECT SUM(quantidade) FROM pendente WHERE mes='2026-07'").fetchone()[0]
        n_jun = self.db.con.execute(
            "SELECT SUM(quantidade) FROM pendente WHERE mes='2026-06'").fetchone()[0]
        self.assertEqual(n_jul, 27)   # a linha de 7 não sobreviveu
        self.assertEqual(n_jun, 27)   # o mês vizinho ficou intacto


class TestTrava(unittest.TestCase):
    """Armadilha 6: arquivo lido pela metade passa em qualquer conferência de
    forma. A fila pode encolher; a cobertura, não."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = inss.ArmazemINSS(Path(self.tmp.name) / "inss.db")

    def tearDown(self) -> None:
        self.db.con.close()
        self.tmp.cleanup()

    def _gravar(self, mes, linhas, permitir=False):
        ano, m = inss.mes_de(mes)
        return inss.gravar_pendentes(
            self.db, mes, f"PEND_{ano}{m:02d}.csv",
            inss.ler_pendentes(io.StringIO(csv_pendentes(linhas))), permitir)

    def test_menos_de_27_ufs_e_recusado(self) -> None:
        with self.assertRaises(inss.ErroINSS) as ctx:
            self._gravar("2026-07", todas_as_ufs("31072026")[:20])
        self.assertIn("20 UFs", str(ctx.exception))

    def test_servicos_caindo_abaixo_de_80_por_cento_e_recusado(self) -> None:
        dez = [17437, 1655, 4852, 2772, 1671, 1659, 1675, 3372, 1657, 1674]
        cheio = [l for s in dez for l in todas_as_ufs("30062026", s)]
        self._gravar("2026-06", cheio)
        metade = [l for s in dez[:5] for l in todas_as_ufs("31072026", s)]
        with self.assertRaises(inss.ErroINSS) as ctx:
            self._gravar("2026-07", metade)
        self.assertIn("serviços: 10", str(ctx.exception))
        self.assertEqual(self._gravar("2026-07", metade, permitir=True)["serviços"], 5)

    def test_a_fila_encolher_nao_e_encolher_a_cobertura(self) -> None:
        # Mesmos serviços e unidades, muito menos tarefas: passa.
        self._gravar("2026-06", todas_as_ufs("30062026", q=100))
        r = self._gravar("2026-07", todas_as_ufs("31072026", q=1))
        self.assertEqual(r["total"], 27)


class TestNegados(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = inss.ArmazemINSS(Path(self.tmp.name) / "inss.db")

    def tearDown(self) -> None:
        self.db.con.close()
        self.tmp.cleanup()

    def _linhas(self):
        base = [linha_negada(202607, 87, "{ñ class}", uf, 1000 + i,
                             dt.date(2026, 6, 1), dt.date(2026, 7, 1))
                for i, uf in enumerate(sorted(inss.UFS))]
        base.append(linha_negada(202607, 36, "Inexiste Sequela", "AL", 2001360,
                                 dt.date(2026, 5, 19), dt.date(2026, 7, 2)))
        # negado ANTES do pedido: contado, informado, nunca gravado
        base.append(linha_negada(202607, 36, "Inexiste Sequela", "AL", 2001360,
                                 dt.date(2026, 7, 10), dt.date(2026, 7, 2)))
        return base

    def test_le_a_planilha_pelo_leitor_sem_dependencia(self) -> None:
        caminho = Path(self.tmp.name) / "neg.xlsx"
        escrever_xlsx(caminho, [["DADOS ABERTOS - TÍTULO"], CAB_NEG, *self._linhas()])
        r = inss.gravar_indeferidos(self.db, "2026-07", "neg.xlsx",
                                    inss.ler_indeferidos(inss.linhas_xlsx(caminho)))
        self.assertEqual(r["linhas"], 29)
        self.assertEqual(r["negativas"], 1)
        self.assertEqual(r["total"], 28)
        dias = self.db.con.execute(
            "SELECT dias FROM negado WHERE especie=36").fetchone()[0]
        self.assertEqual(dias, 44)   # 19/05 → 02/07
        # "{ñ class}" é gravado como vem (armadilha 3)
        self.assertEqual(self.db.con.execute(
            "SELECT SUM(quantidade) FROM negado WHERE motivo='{ñ class}'").fetchone()[0], 27)
        # a UF por extenso vira sigla
        self.assertEqual(self.db.con.execute(
            "SELECT uf FROM negado WHERE especie=36").fetchone()[0], "AL")

    def test_servico_e_especie_ficam_em_tabelas_separadas(self) -> None:
        # Armadilha 2: 1655 (serviço) e 87 (espécie) são o mesmo BPC-PcD, e
        # nada aqui os junta por conta própria.
        inss.gravar_indeferidos(self.db, "2026-07", "x.xlsx",
                                inss.ler_indeferidos([["t"], CAB_NEG, *self._linhas()]))
        self.assertEqual(self.db.con.execute("SELECT COUNT(*) FROM servico").fetchone()[0], 0)
        self.assertEqual({r[0] for r in self.db.con.execute("SELECT codigo FROM especie")},
                         {87, 36})


class TestClientela(unittest.TestCase):
    """Os indeferidos trazem Urbano/Rural, e é a única coluna que separa, nos
    negados, a aposentadoria por idade urbana (serviço 2772) da rural (1671):
    as duas são a espécie 41. A primeira ingestão a descartava (26/09/2026)."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.caminho = Path(self.tmp.name) / "inss.db"
        self.db = inss.ArmazemINSS(self.caminho)

    def tearDown(self) -> None:
        self.db.con.close()
        self.tmp.cleanup()

    def _gravar(self, mes, linhas, permitir=False):
        return inss.gravar_indeferidos(
            self.db, mes, "x.xlsx", inss.ler_indeferidos([["t"], CAB_NEG, *linhas]),
            permitir)

    def test_urbano_e_rural_da_mesma_especie_ficam_separados(self) -> None:
        linhas = negados_do_mes(202607, 41, ("Urbano", "Rural"))
        linhas.append(linha_negada(202607, 41, "Motivo", "PI", 7, dt.date(2026, 7, 1),
                                   dt.date(2026, 7, 31), "Rural"))
        r = self._gravar("2026-07", linhas)
        self.assertEqual(r["clientelas"], 2)
        por = dict(self.db.con.execute(
            "SELECT clientela, SUM(quantidade) FROM negado GROUP BY clientela"))
        self.assertEqual(por, {"urbano": 27, "rural": 28})
        rural = inss.negados_por_especie(self.db, "2026-07", clientela="rural")
        self.assertEqual(rural[0][2]["n"], 28)
        self.assertEqual(inss.negados_por_especie(self.db, "2026-07")[0][2]["n"], 55)

    def test_clientela_desconhecida_e_recusada_sem_gravar(self) -> None:
        # Um valor novo é a fonte mudando: vira notícia, não uma terceira
        # categoria que nenhuma página sabe nomear.
        linhas = negados_do_mes(202607) + [linha_negada(
            202607, 87, "Motivo", "SP", 9, dt.date(2026, 7, 1), dt.date(2026, 7, 2),
            "Indígena")]
        with self.assertRaises(inss.ErroINSS) as ctx:
            self._gravar("2026-07", linhas)
        self.assertIn("Indígena", str(ctx.exception))
        self.assertEqual(self.db.con.execute("SELECT COUNT(*) FROM negado").fetchone()[0], 0)

    def test_sumir_uma_clientela_e_encolher_a_cobertura(self) -> None:
        self._gravar("2026-07", negados_do_mes(202607, 41, ("Urbano", "Rural")))
        with self.assertRaises(inss.ErroINSS) as ctx:
            self._gravar("2026-08", negados_do_mes(202608, 41, ("Urbano",)))
        self.assertIn("clientelas: 2", str(ctx.exception))

    def test_banco_anterior_a_clientela_nao_abre_sem_migrar(self) -> None:
        # O banco de 25/09 tem negados sem clientela. Não há como completá-los
        # sem reler o arquivo, e linha sem clientela misturaria urbano e rural
        # em silêncio: recusa, e só a ingestão (que vai reler) migra.
        self.db.con.close()
        antigo = Path(self.tmp.name) / "antigo.db"
        con = sqlite3.connect(antigo)
        con.executescript(
            "CREATE TABLE negado (mes TEXT NOT NULL, especie INTEGER NOT NULL,"
            " motivo TEXT NOT NULL, uf TEXT NOT NULL, aps INTEGER,"
            " dias INTEGER NOT NULL, quantidade INTEGER NOT NULL);"
            "INSERT INTO negado VALUES ('2026-07', 41, 'M', 'SP', 1, 10, 5);"
            "CREATE TABLE coleta (mes TEXT NOT NULL, conjunto TEXT NOT NULL,"
            " arquivo TEXT NOT NULL, linhas INTEGER NOT NULL, total INTEGER NOT NULL,"
            " descartadas INTEGER NOT NULL, gravado_em TEXT NOT NULL,"
            " PRIMARY KEY (mes, conjunto));"
            "INSERT INTO coleta VALUES ('2026-07', 'indeferidos', 'x', 1, 5, 0, 'h');"
            "INSERT INTO coleta VALUES ('2026-07', 'pendentes', 'p', 1, 9, 0, 'h');")
        con.commit()
        con.close()
        with self.assertRaises(inss.ErroINSS) as ctx:
            inss.ArmazemINSS(antigo)
        self.assertIn("inss-ingerir", str(ctx.exception))
        with inss.ArmazemINSS(antigo, migrar=True) as db:
            self.assertTrue(db.migrado)
            self.assertEqual(db.con.execute("SELECT COUNT(*) FROM negado").fetchone()[0], 0)
            conjuntos = {r[0] for r in db.con.execute("SELECT conjunto FROM coleta")}
            self.assertEqual(conjuntos, {"pendentes"})   # a fila não é tocada
        with inss.ArmazemINSS(antigo) as db:           # já migrado: abre normal
            self.assertFalse(db.migrado)
        self.db = inss.ArmazemINSS(self.caminho)       # para o tearDown


class TestGrupos(unittest.TestCase):
    """A ponte serviço × espécie (§10 da especificação) como código."""

    # Todos os códigos presentes nos arquivos reais de jun–ago/2026.
    SERVICOS_2026 = {17437, 1655, 4852, 2772, 1671, 1659, 1675, 3372, 1657, 1674,
                     2773, 1658, 2812, 4613, 3653, 14835, 3746, 3743, 3770, 4632,
                     5852, 5832, 5474, 13995, 5412, 5473, 4633, 14836, 6452, 6492,
                     4612, 15255, 4614, 3769, 5332, 6266, 15235, 3742, 15256}
    ESPECIES_2026 = {31, 87, 80, 41, 36, 42, 21, 88, 25, 91, 94, 32, 18, 57, 60,
                     67, 46, 92, 56, 98, 93, 86, 54, 16, 85}

    def test_todo_codigo_real_esta_classificado(self) -> None:
        self.assertEqual(len(self.SERVICOS_2026), 39)
        self.assertEqual(len(self.ESPECIES_2026), 25)
        self.assertEqual(grupos.codigos_desconhecidos(self.SERVICOS_2026,
                                                      self.ESPECIES_2026), (set(), set()))

    def test_cada_codigo_em_exatamente_um_lugar(self) -> None:
        for lado in ("servicos", "especies"):
            vistos: list[int] = [c for g in grupos.GRUPOS for c in getattr(g, lado)]
            sem = (grupos.SEM_PAGINA_SERVICOS if lado == "servicos"
                   else grupos.SEM_PAGINA_ESPECIES)
            todos = vistos + list(sem)
            repetidos = {c for c in todos if todos.count(c) > 1}
            self.assertEqual(repetidos, set(), f"{lado} em dois lugares")
        chaves = [g.chave for g in grupos.GRUPOS]
        self.assertEqual(len(chaves), len(set(chaves)))

    def test_prazo_e_marco_andam_juntos(self) -> None:
        for g in grupos.GRUPOS:
            self.assertEqual(g.prazo_acordo is None, g.prazo_conta_do_pedido is None, g.chave)

    def test_a_armadilha_do_recluso_nao_move_o_auxilio_doenca(self) -> None:
        # "Requerente recluso mantido pelo Estado" é motivo da espécie 31: o
        # grupo sai da espécie, nunca de palavra do motivo.
        self.assertEqual(grupos.grupo_da_especie(31).chave, "auxilio-doenca")
        self.assertEqual(grupos.grupo_da_especie(25).chave, "auxilio-reclusao")

    def test_minimo_de_pedidos(self) -> None:
        self.assertFalse(grupos.publicavel(999))
        self.assertTrue(grupos.publicavel(1000))


class TestCodigoNovoReprova(unittest.TestCase):
    """Um código que não está na tabela reprova a ingestão: serviço que surge
    num mês e some calado de todas as páginas é o defeito a impedir."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = inss.ArmazemINSS(Path(self.tmp.name) / "inss.db")

    def tearDown(self) -> None:
        self.db.con.close()
        self.tmp.cleanup()

    def test_servico_novo_na_fila(self) -> None:
        linhas = todas_as_ufs("31072026") + [("99999", 77777, "SP", "15072026", 3)]
        with self.assertRaises(inss.ErroINSS) as ctx:
            inss.gravar_pendentes(self.db, "2026-07", "PEND_202607.csv",
                                  inss.ler_pendentes(io.StringIO(csv_pendentes(linhas))))
        self.assertIn("77777", str(ctx.exception))
        self.assertIn("inss_grupos", str(ctx.exception))
        self.assertEqual(self.db.con.execute("SELECT COUNT(*) FROM pendente").fetchone()[0], 0)

    def test_especie_nova_nos_negados(self) -> None:
        linhas = negados_do_mes(202607) + [linha_negada(
            202607, 77, "Motivo", "SP", 9, dt.date(2026, 7, 1), dt.date(2026, 7, 2))]
        with self.assertRaises(inss.ErroINSS) as ctx:
            inss.gravar_indeferidos(self.db, "2026-07", "x.xlsx",
                                    inss.ler_indeferidos([["t"], CAB_NEG, *linhas]))
        self.assertIn("77", str(ctx.exception))
        self.assertEqual(self.db.con.execute("SELECT COUNT(*) FROM negado").fetchone()[0], 0)


class TestPorGrupo(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = inss.ArmazemINSS(Path(self.tmp.name) / "inss.db")

    def tearDown(self) -> None:
        self.db.con.close()
        self.tmp.cleanup()

    def test_servicos_do_mesmo_grupo_somam_e_o_minimo_decide(self) -> None:
        # Urbana (2772) e rural (1671) são o mesmo grupo: 27 + 27 + 1.000.
        linhas = (todas_as_ufs("31072026", 2772) + todas_as_ufs("31072026", 1671)
                  + [("99999", 1671, "PI", "01072026", 1000)])
        inss.gravar_pendentes(self.db, "2026-07", "PEND_202607.csv",
                              inss.ler_pendentes(io.StringIO(csv_pendentes(linhas))))
        por = {g.chave: (r, pub) for g, r, pub in inss.fila_por_grupo(self.db, "2026-07")}
        r, pub = por["aposentadoria-por-idade"]
        self.assertEqual(r["n"], 1054)
        self.assertTrue(pub)

    def test_negados_por_grupo_e_clientela(self) -> None:
        inss.gravar_indeferidos(
            self.db, "2026-07", "x.xlsx", inss.ler_indeferidos(
                [["t"], CAB_NEG, *negados_do_mes(202607, 31, ("Urbano", "Rural")),
                 *negados_do_mes(202607, 91)]))
        por = {g.chave: (r, pub) for g, r, pub in inss.negados_por_grupo(self.db, "2026-07")}
        self.assertEqual(por["auxilio-doenca"][0]["n"], 81)   # 31 urbano+rural, 91 urbano
        self.assertFalse(por["auxilio-doenca"][1])             # 81 < 1.000
        rural = {g.chave: r for g, r, _ in inss.negados_por_grupo(self.db, "2026-07", "rural")}
        self.assertEqual(rural["auxilio-doenca"]["n"], 27)


class TestRetratoParaOPainel(unittest.TestCase):
    """O contrato com `painel/lib/inss.ts`: mudou aqui, muda lá."""

    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db = inss.ArmazemINSS(Path(self.tmp.name) / "inss.db")
        for mes, data, q in (("2026-06", "30062026", 2), ("2026-07", "31072026", 1)):
            ano, m = inss.mes_de(mes)
            linhas = todas_as_ufs(data, 1675, q) + [("99999", 1675, "SP", f"01{m:02d}{ano}", 1000)]
            inss.gravar_pendentes(self.db, mes, f"PEND_{ano}{m:02d}.csv",
                                  inss.ler_pendentes(io.StringIO(csv_pendentes(linhas))))
        inss.gravar_indeferidos(self.db, "2026-08", "neg.xlsx", inss.ler_indeferidos(
            [["t"], CAB_NEG, *negados_do_mes(202608, 80, ("Urbano", "Rural"))]))
        self.r = inss.retrato(self.db)

    def tearDown(self) -> None:
        self.db.con.close()
        self.tmp.cleanup()

    def test_chaves_de_topo(self) -> None:
        self.assertEqual(set(self.r), {"geradoEm", "fonte", "fila", "negados",
                                       "minimoPedidos", "grupos"})
        self.assertEqual(self.r["fila"]["mes"], "2026-07")          # o mais recente
        self.assertEqual(self.r["fila"]["mesAnterior"], "2026-06")
        self.assertEqual(self.r["negados"]["mes"], "2026-08")
        self.assertEqual(set(self.r["fila"]), {"mes", "referencia", "mesAnterior",
                                              "arquivo", "gravadoEm"})

    def test_grupo_carrega_prazo_nome_e_os_dois_lados(self) -> None:
        g = {x["chave"]: x for x in self.r["grupos"]}["salario-maternidade"]
        self.assertEqual(set(g), {"chave", "nome", "nomePopular", "prazoAcordo",
                                  "prazoContaDoPedido", "fila", "negados"})
        self.assertEqual((g["prazoAcordo"], g["prazoContaDoPedido"]), (30, True))
        f = g["fila"]
        self.assertEqual(set(f), {"n", "mediana", "p75", "p90", "acima45", "acima90",
                                  "acimaDoPrazo", "publicavel", "medianaAnterior",
                                  "porServico"})
        self.assertEqual(f["n"], 1027)
        self.assertTrue(f["publicavel"])
        # 1.000 pedidos criados em 01/07 têm 30 dias em 31/07: não passam de 30
        self.assertAlmostEqual(f["acimaDoPrazo"], 0.0)
        self.assertEqual(f["porServico"][0]["codigo"], 1675)
        n = g["negados"]
        self.assertEqual(set(n["porClientela"]), {"urbano", "rural"})
        self.assertFalse(n["publicavel"])       # 54 negativas < 1.000

    def test_grupo_sem_dado_sai_com_os_dois_lados_nulos(self) -> None:
        g = {x["chave"]: x for x in self.r["grupos"]}["auxilio-inclusao"]
        self.assertIsNone(g["fila"])
        self.assertIsNone(g["negados"])

    def test_trava_do_exportar_recusa_encolher(self) -> None:
        saida = Path(self.tmp.name) / "inss.json"
        inss.gravar_retrato(self.r, saida)
        menor = dict(self.r, grupos=[
            dict(g, fila=None) for g in self.r["grupos"]])
        with self.assertRaises(inss.ErroINSS) as ctx:
            inss.gravar_retrato(menor, saida)
        self.assertIn("grupos com fila", str(ctx.exception))
        inss.gravar_retrato(menor, saida, permitir_encolher=True)

    def test_trava_recusa_mes_mais_velho_que_o_publicado(self) -> None:
        saida = Path(self.tmp.name) / "inss.json"
        inss.gravar_retrato(self.r, saida)
        velho = dict(self.r, fila=dict(self.r["fila"], mes="2026-05"))
        with self.assertRaises(inss.ErroINSS) as ctx:
            inss.gravar_retrato(velho, saida)
        self.assertIn("2026-05", str(ctx.exception))


class TestLeitorXlsx(unittest.TestCase):
    def test_coluna_depois_do_Z(self) -> None:
        self.assertEqual(inss._coluna("A1"), 0)
        self.assertEqual(inss._coluna("Z9"), 25)
        self.assertEqual(inss._coluna("AA1"), 26)   # errar a base 26 desloca tudo
        self.assertEqual(inss._coluna("AB12"), 27)

    def test_celula_vazia_no_meio_nao_desloca_as_seguintes(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            caminho = Path(d) / "x.xlsx"
            escrever_xlsx(caminho, [["a", None, "c", 3.5]])
            self.assertEqual(list(inss.linhas_xlsx(caminho)), [["a", None, "c", 3.5]])

    def test_serial_do_excel_vira_data(self) -> None:
        self.assertEqual(inss.serial_para_data(46234.0), dt.date(2026, 7, 31))


class TestQuantil(unittest.TestCase):
    def test_quantil_ponderado(self) -> None:
        c = {10: 1, 20: 1, 30: 1, 40: 1}
        self.assertEqual(inss.quantil(c, .5), 20)
        self.assertEqual(inss.quantil({5: 99, 500: 1}, .5), 5)
        r = inss.resumo({10: 3, 50: 1, 100: 1})
        self.assertEqual((r["n"], r["mediana"]), (5, 10))
        self.assertAlmostEqual(r["acima_45"], 0.4)
        self.assertAlmostEqual(r["acima_90"], 0.2)

    def test_vazio_e_nenhum(self) -> None:
        self.assertIsNone(inss.quantil({}, .5))
        self.assertIsNone(inss.resumo({}))


class TestRecursoDoPortal(unittest.TestCase):
    RECURSOS = [
        {"name": "Pendentes Julho 2026", "url": "https://x/PDA_ITEM_10_PEND_202607.csv"},
        {"name": "Pendentes Agsoto 2026", "url": "https://x/PDA_ITEM_10_PEND_202507.csv"},
        {"name": "Benefícios Indeferidos Março 2026", "url": "https://x/IND_MAR.xlsx"},
    ]

    def test_pendentes_se_acham_pela_url_e_nao_pelo_rotulo(self) -> None:
        # O rótulo de agosto aponta para 2025: pela URL, agosto de 2026 não existe.
        self.assertIn("202607", inss.recurso_do_mes(self.RECURSOS, "pendentes", "2026-07")["url"])
        with self.assertRaises(inss.ErroINSS):
            inss.recurso_do_mes(self.RECURSOS, "pendentes", "2026-08")

    def test_indeferidos_pelo_nome_sem_acento(self) -> None:
        r = inss.recurso_do_mes(self.RECURSOS, "indeferidos", "2026-03")
        self.assertIn("IND_MAR", r["url"])


class TestComandoPontaAPonta(unittest.TestCase):
    def test_arquivo_local_grava_e_o_resumo_le(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            csv_arq = Path(d) / "PDA_ITEM_10_PEND_202607.csv"
            csv_arq.write_text(csv_pendentes(todas_as_ufs("31072026")), encoding="latin-1")
            args = construir_parser().parse_args(
                ["inss-ingerir", "--mes", "2026-07", "--conjunto", "pendentes",
                 "--arquivo", str(csv_arq), "--banco-inss", str(Path(d) / "i.db")])
            saida = io.StringIO()
            with redirect_stdout(saida), redirect_stderr(saida):
                codigo = inss_ingerir(args)
            self.assertEqual(codigo, 0, saida.getvalue())
            self.assertIn("gravado", saida.getvalue())


if __name__ == "__main__":
    unittest.main()

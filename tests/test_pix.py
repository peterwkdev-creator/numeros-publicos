"""Emenda Pix: as oito armadilhas da espec (§4 de
`especs/numeros-publicos-emendas-pix.md` da raiz), a ligação ao município
pelo CNPJ e a conferência contra o pago da CGU.

Sem rede: a API do Transferegov entra por um `abrir` falso que pagina como a
real (1.000 linhas no máximo, `Content-Range` só com `Prefer: count=exact`).
"""

from __future__ import annotations

import io
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from numeros_publicos import pix
from numeros_publicos.emendas import ArmazemEmendas
from numeros_publicos.pix import (
    ArmazemPix, ErroPix, baixar_tabela, centavos, conferir_com_cgu, ingerir,
    ligar_municipios, linhas_para_gravar, texto,
)

SNAPSHOT = {"municipios": [
    [2927408, "Salvador", "BA"],
    [2209559, "Pau D'Arco do Piauí", "PI"],
    [1721000, "Palmas", "TO"],
]}

CNPJ_SALVADOR = "13927801000149"
TRANSF_ESPECIAIS = "Emenda Individual - Transferências Especiais"


class Resposta:
    def __init__(self, corpo, cabecalhos):
        self._corpo = json.dumps(corpo).encode("utf-8")
        self.headers = cabecalhos

    def read(self):
        return self._corpo

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


def api_falsa(tabelas: dict[str, list[dict]], declarar: dict[str, int] | None = None,
              teto: int = pix.PAGINA):
    """`abrir` que serve `tabelas` como a API: corta em `teto` sem aviso e só
    declara o total quando pedem `Prefer: count=exact`. `declarar` mente o
    total de uma tabela."""
    pedidos: list[str] = []

    def abrir(req):
        pedidos.append(req.full_url)
        u = urlparse(req.full_url)
        nome = u.path.rsplit("/", 1)[-1]
        q = parse_qs(u.query)
        ini = int(q["offset"][0])
        fim = ini + min(int(q["limit"][0]), teto)
        linhas = tabelas[nome][ini:fim]
        cab = {}
        if req.get_header("Prefer") == "count=exact":
            total = (declarar or {}).get(nome, len(tabelas[nome]))
            cab["Content-Range"] = f"{ini}-{ini + len(linhas) - 1}/{total}"
        return Resposta(linhas, cab)

    abrir.pedidos = pedidos
    return abrir


def plano(id_, cnpj=CNPJ_SALVADOR, nome="MUNICIPIO DE SALVADOR", uf="BA",
          situacao="CIENTE", ano_emenda="2024", custeio=0.0, investimento=100.0):
    return {"id_plano_acao": id_, "codigo_plano_acao": f"0903-{id_:06d}",
            "ano_plano_acao": int(ano_emenda), "situacao_plano_acao": situacao,
            "cnpj_beneficiario_plano_acao": cnpj,
            "nome_beneficiario_plano_acao": nome, "uf_beneficiario_plano_acao": uf,
            "numero_emenda_parlamentar_plano_acao": f"{ano_emenda}27070006",
            "ano_emenda_parlamentar_plano_acao": ano_emenda,
            "valor_custeio_plano_acao": custeio,
            "valor_investimento_plano_acao": investimento}


def executor(id_, id_plano, cnpj=CNPJ_SALVADOR, nome="MUNICIPIO DE SALVADOR",
             objeto="PAVIMENTAÇÃO DE RUAS ", custeio=0.0, investimento=100.0):
    return {"id_executor": id_, "id_plano_acao": id_plano, "cnpj_executor": cnpj,
            "nome_executor": nome, "objeto_executor": objeto,
            "vl_custeio_executor": custeio, "vl_investimento_executor": investimento}


def area(id_executor, cd=451, nome="Infraestrutura Urbana ", cd_funcao=15,
         funcao="Urbanismo"):
    return {"id_executor": id_executor, "cd_area_politica_publica_tipo_pt": cd_funcao,
            "area_politica_publica_tipo_pt": funcao, "cd_area_politica_publica_pt": cd,
            "area_politica_publica_pt": nome}


def relatorio(id_, id_plano, tipo="Final", executado=100.0):
    return {"id_relatorio_gestao_novo": id_, "id_plano_acao": id_plano,
            "tipo_relatorio_gestao_novo": tipo,
            "data_e_hora_relatorio_gestao_novo": "2024-12-23T10:47:09.829654",
            "valor_executado_relatorio_gestao_novo": executado,
            "valor_pendente_relatorio_gestao_novo": 0.0,
            "situacao_relatorio_gestao_novo": "DISPONIBILIZADO"}


def fonte(planos=None, executores=None, areas=None, relatorios=None):
    return {"plano_acao_especial": planos if planos is not None else [plano(1)],
            "executor_especial": executores if executores is not None else [executor(10, 1)],
            "finalidade_especial": areas if areas is not None else [area(10)],
            "relatorio_gestao_novo_especial": relatorios if relatorios is not None else []}


class Banco(unittest.TestCase):
    """Um `emendas.db` temporário com o pagamento da CGU a Salvador."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.banco = Path(self._tmp.name) / "emendas.db"
        with ArmazemEmendas(self.banco):
            pass
        con = sqlite3.connect(self.banco)
        con.execute("INSERT INTO pagamento VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                    ("202427070006", TRANSF_ESPECIAIS, "2707", "FULANA", "0006",
                     "202406", 2927408, "Município", CNPJ_SALVADOR,
                     "MUNICIPIO DE SALVADOR", 10000))
        con.commit()
        con.close()
        # A tabela real de apelidos se confere contra os 5.571; aqui, vazia.
        self.apelidos = Path(self._tmp.name) / "apelidos.csv"
        self.apelidos.write_text("uf;nome_na_fonte;ibge;nome_ibge;prova\n",
                                 encoding="utf-8")

    def tearDown(self):
        self._tmp.cleanup()

    def ingerir(self, tabelas, **kw):
        return ingerir(SNAPSHOT, self.banco, abrir=api_falsa(tabelas),
                       base="https://api.test/", tabela_apelidos=self.apelidos, **kw)

    def linhas(self, sql):
        con = sqlite3.connect(self.banco)
        try:
            return con.execute(sql).fetchall()
        finally:
            con.close()


class TestValores(unittest.TestCase):
    def test_centavos_sem_erro_de_ponto_flutuante(self):
        self.assertEqual(centavos(4350000.0), 435000000)
        self.assertEqual(centavos(325098.88), 32509888)
        self.assertEqual(centavos(0.1 + 0.2), 30)
        self.assertEqual(centavos(None), 0)


class TestArmadilha1AreaSemValor(Banco):
    def test_area_grava_sem_quantia_e_o_valor_fica_no_executor(self):
        self.ingerir(fonte(areas=[area(10, 451), area(10, 122, "Administração Geral", 4,
                                                      "Administração")]))
        self.assertEqual(self.linhas("SELECT COUNT(*) FROM pix_area"), [(2,)])
        colunas = [c[1] for c in self.linhas("PRAGMA table_info(pix_area)")]
        self.assertFalse({"custeio", "investimento", "valor", "centavos"} & set(colunas))
        # O valor do plano conta uma vez, não uma por área.
        self.assertEqual(self.linhas("SELECT SUM(custeio + investimento) FROM pix_plano"),
                         [(10000,)])


class TestArmadilha2ExecutorNaoEBeneficiario(Banco):
    def test_plano_com_dois_executores_guarda_os_dois_e_o_beneficiario(self):
        self.ingerir(fonte(executores=[
            executor(10, 1, investimento=60.0),
            executor(11, 1, cnpj="11111111000111", nome="FUNDO MUNICIPAL DE SAUDE",
                     investimento=40.0)]))
        self.assertEqual(self.linhas("SELECT cnpj, municipio FROM pix_plano"),
                         [(CNPJ_SALVADOR, 2927408)])
        self.assertEqual(self.linhas(
            "SELECT id_executor, cnpj FROM pix_executor ORDER BY 1"),
            [(10, CNPJ_SALVADOR), (11, "11111111000111")])


class TestArmadilha3AreaOrfa(Banco):
    def test_area_de_executor_inexistente_fica_de_fora_e_contada(self):
        r = self.ingerir(fonte(areas=[area(10), area(99), area(98)]))
        self.assertEqual(self.linhas("SELECT id_executor FROM pix_area"), [(10,)])
        self.assertEqual(r["orfas"], 2)

    def test_area_repetida_nao_conta_como_orfa(self):
        r = self.ingerir(fonte(areas=[area(10), area(10)]))
        self.assertEqual(self.linhas("SELECT COUNT(*) FROM pix_area"), [(1,)])
        self.assertEqual(r["orfas"], 0)


class TestArmadilha4Relatorio(Banco):
    def test_plano_sem_relatorio_continua_gravado(self):
        self.ingerir(fonte(planos=[plano(1), plano(2)],
                           executores=[executor(10, 1), executor(20, 2)],
                           relatorios=[relatorio(500, 1, executado=12.34)]))
        self.assertEqual(self.linhas("SELECT COUNT(*) FROM pix_plano"), [(2,)])
        self.assertEqual(self.linhas(
            "SELECT id_plano, tipo, executado FROM pix_relatorio"), [(1, "Final", 1234)])


class TestArmadilha5Texto(unittest.TestCase):
    def test_normaliza_espaco_e_preserva_palavra_e_caixa(self):
        self.assertEqual(texto("Infraestrutura Urbana "), "Infraestrutura Urbana")
        self.assertEqual(texto("  PAVIMENTAÇÃO   DE RUAS "), "PAVIMENTAÇÃO DE RUAS")
        self.assertEqual(texto(None), "")

    def test_gravacao_usa_o_texto_normalizado(self):
        linhas = linhas_para_gravar(fonte(), {1: 2927408})
        self.assertEqual(linhas["pix_area"][0][4], "Infraestrutura Urbana")
        self.assertEqual(linhas["pix_executor"][0][4], "PAVIMENTAÇÃO DE RUAS")


class TestArmadilha6Paginacao(unittest.TestCase):
    def test_pagina_ate_a_ultima_curta_e_confere_o_total(self):
        linhas = [plano(i) for i in range(2500)]
        abrir = api_falsa({"plano_acao_especial": linhas})
        lidas = baixar_tabela("plano_acao_especial", abrir, "https://api.test/")
        self.assertEqual([p["id_plano_acao"] for p in lidas], list(range(2500)))
        self.assertEqual(len(abrir.pedidos), 3)
        self.assertTrue(all("order=id_plano_acao" in u for u in abrir.pedidos))

    def test_multiplo_exato_de_1000_pede_a_pagina_vazia(self):
        abrir = api_falsa({"plano_acao_especial": [plano(i) for i in range(2000)]})
        self.assertEqual(len(baixar_tabela("plano_acao_especial", abrir, "https://api.test/")),
                         2000)
        self.assertEqual(len(abrir.pedidos), 3)

    def test_total_diferente_do_declarado_e_erro(self):
        abrir = api_falsa({"plano_acao_especial": [plano(i) for i in range(1500)]},
                          declarar={"plano_acao_especial": 1600})
        with self.assertRaisesRegex(ErroPix, "lidas 1500 linhas, a API declara 1600"):
            baixar_tabela("plano_acao_especial", abrir, "https://api.test/")

    def test_teto_menor_que_o_esperado_e_erro(self):
        # A API passa a cortar em 500: a 1ª página curta para o laço e a
        # contagem pega a falta.
        abrir = api_falsa({"plano_acao_especial": [plano(i) for i in range(1500)]}, teto=500)
        with self.assertRaisesRegex(ErroPix, "lidas 500 linhas"):
            baixar_tabela("plano_acao_especial", abrir, "https://api.test/")

    def test_sem_content_range_e_erro(self):
        def abrir(req):
            return Resposta([plano(1)], {})
        with self.assertRaisesRegex(ErroPix, "não declarou o total"):
            baixar_tabela("plano_acao_especial", abrir, "https://api.test/")


class TestArmadilha7Releitura(Banco):
    def test_releitura_substitui_a_tabela_inteira(self):
        self.ingerir(fonte(planos=[plano(1), plano(2)],
                           executores=[executor(10, 1), executor(20, 2)]))
        self.ingerir(fonte(planos=[plano(1, investimento=7.0), plano(3)],
                           executores=[executor(10, 1), executor(30, 3)]),
                     permitir_encolher=False)
        self.assertEqual(self.linhas("SELECT id_plano, investimento FROM pix_plano ORDER BY 1"),
                         [(1, 700), (3, 10000)])
        self.assertEqual(self.linhas("SELECT tabela, linhas FROM pix_coleta ORDER BY 1"),
                         [("pix_area", 1), ("pix_executor", 2), ("pix_plano", 2),
                          ("pix_relatorio", 0)])

    def test_recusa_encolher_e_nao_toca_no_que_havia(self):
        self.ingerir(fonte(planos=[plano(1), plano(2)],
                           executores=[executor(10, 1), executor(20, 2)]))
        with self.assertRaisesRegex(ErroPix, "encolheu"):
            self.ingerir(fonte())
        self.assertEqual(self.linhas("SELECT COUNT(*) FROM pix_plano"), [(2,)])
        self.ingerir(fonte(), permitir_encolher=True)
        self.assertEqual(self.linhas("SELECT COUNT(*) FROM pix_plano"), [(1,)])

    def test_falha_no_meio_desfaz_tudo(self):
        self.ingerir(fonte())
        with ArmazemPix(self.banco) as db:
            # Executor repetido viola a chave depois do plano já apagado.
            linhas = linhas_para_gravar(fonte(planos=[plano(1), plano(2)]),
                                        {1: 2927408, 2: 2927408})
            linhas["pix_executor"] = linhas["pix_executor"] * 2
            with self.assertRaises(sqlite3.IntegrityError):
                db.gravar(linhas, origem="teste")
        self.assertEqual(self.linhas("SELECT COUNT(*) FROM pix_plano"), [(1,)])

    def test_a_tabela_da_cgu_sobrevive(self):
        self.ingerir(fonte())
        self.ingerir(fonte(), permitir_encolher=True)
        self.assertEqual(self.linhas("SELECT COUNT(*) FROM pagamento"), [(1,)])


class TestArmadilha8ExecutorRepetido(Banco):
    """A API repete o executor com outro nome de agência (8 em 29/10/2026)."""

    def test_repeticao_igual_fica_uma_linha(self):
        a = dict(executor(10, 1), nome_agencia_executor="AGENCIA A")
        b = dict(executor(10, 1), nome_agencia_executor="AGENCIA B")
        self.ingerir(fonte(executores=[a, b]))
        self.assertEqual(self.linhas("SELECT id_executor FROM pix_executor"), [(10,)])
        self.assertEqual(self.linhas("SELECT tabela, linhas FROM pix_coleta "
                                     "WHERE tabela = 'pix_executor'"), [("pix_executor", 1)])

    def test_repeticao_com_dado_diferente_e_erro_e_nada_grava(self):
        a = dict(executor(10, 1), nome_agencia_executor="AGENCIA A")
        b = dict(executor(10, 1, investimento=5.0), nome_agencia_executor="AGENCIA B")
        with self.assertRaisesRegex(ErroPix, "executor 10 repetido com dados diferentes"):
            self.ingerir(fonte(executores=[a, b]))
        self.assertEqual(self.linhas("SELECT COUNT(*) FROM pix_plano"), [(0,)])

    def test_paginacao_do_executor_desempata_pela_agencia(self):
        abrir = api_falsa({"executor_especial": [executor(10, 1)]})
        baixar_tabela("executor_especial", abrir, "https://api.test/")
        self.assertTrue(all("order=id_executor,nome_agencia_executor" in u
                            for u in abrir.pedidos))


class TestLigacao(Banco):
    def test_cnpj_da_cgu_liga_sem_olhar_o_nome(self):
        self.ingerir(fonte(planos=[plano(1, nome="NOME QUALQUER")]))
        self.assertEqual(self.linhas("SELECT municipio FROM pix_plano"), [(2927408,)])

    def test_cnpj_de_fundo_na_cgu_nao_liga(self):
        con = sqlite3.connect(self.banco)
        con.execute("INSERT INTO pagamento SELECT emenda, tipo, autor_codigo, autor, numero,"
                    " ano_mes, 1721000, 'Fundo Público da Administração Direta Municipal',"
                    " '22222222000122', favorecido, centavos FROM pagamento")
        con.commit()
        con.close()
        with self.assertRaisesRegex(ErroPix, "1 planos de município sem casar"):
            self.ingerir(fonte(planos=[plano(1, cnpj="22222222000122",
                                             nome="FUNDO X", uf="TO")]))

    def test_cnpj_desconhecido_cai_para_o_nome_com_dois_pontos(self):
        # A fonte escreve o apóstrofo como ":" ("PAU D:ARCO DO PIAUI").
        p = plano(1, cnpj="04218211000156", nome="MUNICIPIO DE PAU D:ARCO DO PIAUI", uf="PI")
        self.ingerir(fonte(planos=[p]))
        self.assertEqual(self.linhas("SELECT municipio FROM pix_plano"), [(2209559,)])

    def test_estado_fica_sem_municipio(self):
        ligacao, sem = ligar_municipios(
            [plano(1, cnpj="00000000000100", nome="ESTADO DA BAHIA"),
             plano(2, cnpj="00000000000200", nome="DISTRITO FEDERAL", uf="DF")],
            {}, {}, {})
        self.assertEqual((ligacao, sem), ({1: None, 2: None}, []))

    def test_estado_com_nome_da_capital_nao_cai_na_prefeitura(self):
        # O Tocantins vem como "PALMAS" com o CNPJ do estado (medido em 29/10/2026).
        ligacao, sem = ligar_municipios(
            [plano(1, cnpj="01786029000103", nome="PALMAS", uf="TO")],
            {}, {("TO", "PALMAS"): 1721000}, {})
        self.assertEqual((ligacao, sem), ({1: None}, []))

    def test_municipio_que_nao_casa_e_erro_e_nada_se_grava(self):
        with self.assertRaisesRegex(ErroPix, "MUNICIPIO DE ATLANTIDA"):
            self.ingerir(fonte(planos=[plano(1, cnpj="99999999000199",
                                             nome="MUNICIPIO DE ATLANTIDA")]))
        self.assertEqual(self.linhas("SELECT COUNT(*) FROM pix_plano"), [(0,)])

    def test_cnpj_em_dois_municipios_e_erro(self):
        con = sqlite3.connect(self.banco)
        con.execute("INSERT INTO pagamento SELECT emenda, tipo, autor_codigo, autor, numero,"
                    " ano_mes, 1721000, natureza, cnpj, favorecido, centavos FROM pagamento")
        con.commit()
        con.close()
        with self.assertRaisesRegex(ErroPix, "em dois municípios"):
            self.ingerir(fonte())


class TestConferenciaComCgu(Banco):
    def test_so_o_plano_ciente_conta_e_compara_por_municipio_e_ano(self):
        self.ingerir(fonte(planos=[plano(1), plano(2, situacao="IMPEDIDO", investimento=999.0),
                                   plano(3, ano_emenda="2023", investimento=5.0)],
                           executores=[executor(10, 1)]))
        self.assertEqual(conferir_com_cgu(self.banco),
                         [("2023", 500, 0, 0, 1), ("2024", 10000, 10000, 1, 1)])


class TestComando(Banco):
    def test_pix_ingerir_grava_e_imprime_a_conferencia(self):
        import argparse
        import contextlib
        from numeros_publicos.cli import pix_ingerir
        snapshot = Path(__file__).resolve().parents[1] / "painel" / "dados" / "snapshot.json"
        args = argparse.Namespace(snapshot=str(snapshot), banco_emendas=str(self.banco),
                                  permitir_encolher=False)
        saida = io.StringIO()
        with contextlib.redirect_stdout(saida):
            codigo = pix_ingerir(args, abrir=api_falsa(fonte()))
        self.assertEqual(codigo, 0)
        self.assertIn("1 planos, 1 executores, 1 áreas", saida.getvalue())
        self.assertIn("2024            100,00          100,00   1 de 1", saida.getvalue())

    def test_pix_ingerir_sai_1_quando_a_coleta_nao_fecha(self):
        import argparse
        import contextlib
        from numeros_publicos.cli import pix_ingerir
        snapshot = Path(__file__).resolve().parents[1] / "painel" / "dados" / "snapshot.json"
        args = argparse.Namespace(snapshot=str(snapshot), banco_emendas=str(self.banco),
                                  permitir_encolher=False)
        erro = io.StringIO()
        with contextlib.redirect_stderr(erro):
            codigo = pix_ingerir(args, abrir=api_falsa(
                fonte(), declarar={"plano_acao_especial": 2}))
        self.assertEqual(codigo, 1)
        self.assertIn("a API declara 2", erro.getvalue())
        # A coleta falha antes de abrir o banco: nem a tabela nasce.
        self.assertEqual(self.linhas(
            "SELECT name FROM sqlite_master WHERE name LIKE 'pix%'"), [])


CNPJ_PAU_DARCO = "06554869000164"
CNPJ_BAHIA = "13937032000160"


class TestExportar(unittest.TestCase):
    """O `pix.json` a partir de um `emendas.db` com poucos planos: um de cada
    caso que o painel trata (Fase 2 da espec, §5)."""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.banco = Path(self._tmp.name) / "emendas.db"
        self.saida = Path(self._tmp.name) / "painel" / "dados" / "pix.json"
        with ArmazemPix(self.banco) as db:
            con = db.con
            for t, quando in (("pix_plano", "2026-10-30T13:12:05+00:00"),
                              ("pix_executor", "2026-10-30T13:12:03+00:00"),
                              ("pix_area", "2026-10-30T13:12:02+00:00"),
                              ("pix_relatorio", "2026-10-30T13:12:04+00:00")):
                con.execute("INSERT INTO pix_coleta VALUES (?,?,?,?,?)",
                            (t, 1, pix.BASE, pix.LICENCA, quando))
            ssa = (CNPJ_SALVADOR, "MUNICIPIO DE SALVADOR", "BA", 2927408)
            con.executemany("INSERT INTO pix_plano VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [
                (1, "0903-000001", 2024, "CIENTE", *ssa, "202427070006", "2024", 5000, 10000),
                (2, "0903-000002", 2023, "CIENTE", *ssa, "202327070006", "2023", 0, 20000),
                (3, "0903-000003", 2024, "IMPEDIDO", *ssa, "202427070007", "2024", 0, 99900),
                (4, "0903-000004", 2024, "CIENTE", CNPJ_PAU_DARCO,
                 "MUNICIPIO DE PAU D'ARCO DO PIAUI", "PI", 2209559, "202427070008",
                 "2024", 0, 30000),
                (5, "0903-000005", 2024, "CIENTE", CNPJ_BAHIA, "ESTADO DA BAHIA", "BA",
                 None, "202427070009", "2024", 0, 50000),
                (6, "0903-000000", 2024, "CIENTE", *ssa, "202427070010", "2024", 1000, 0),
            ])
            con.executemany("INSERT INTO pix_executor VALUES (?,?,?,?,?,?,?)", [
                (11, 1, "11111111000111", "FUNDO MUNICIPAL DE  SAÚDE ",
                 "Compra de ambulância", 0, 5000),
                (10, 1, CNPJ_SALVADOR, "MUNICIPIO DE SALVADOR",
                 " PAVIMENTAÇÃO  DE Ruas ", 5000, 5000),
                (20, 4, CNPJ_PAU_DARCO, "MUNICIPIO DE PAU D'ARCO", "REFORMA DA ESCOLA",
                 0, 30000),
                (30, 3, CNPJ_SALVADOR, "MUNICIPIO DE SALVADOR", "QUADRA", 0, 99900),
            ])
            con.executemany("INSERT INTO pix_area VALUES (?,?,?,?,?)", [
                (10, 15, "Urbanismo", 451, "Infraestrutura Urbana "),
                (10, 15, "Urbanismo", 452, "Serviços Urbanos"),
                (10, 10, "Saúde", 302, "Assistência Hospitalar"),
                (11, 10, "Saúde", 301, "Atenção Básica"),
                (20, 12, "Educação", 361, "Ensino Fundamental"),
                (30, 27, "Desporto e Lazer", 812, "Desporto Comunitário"),
            ])
            con.executemany("INSERT INTO pix_relatorio VALUES (?,?,?,?,?,?,?)", [
                (103, 1, "Final", "2024-12-01T00:00:00.999999", 9000, 6000, "DISPONIBILIZADO"),
                (100, 1, "Final", "2025-01-10T09:00:00.12", 15000, 0, "DISPONIBILIZADO"),
                (101, 1, "Parcial", "2025-06-01T08:00:00.5", 7000, 8000, "DISPONIBILIZADO"),
                (102, 1, "Final", "2026-01-01T00:00:00.000001", 1, 1, "EM_ELABORACAO"),
                (200, 2, "Final", "2025-03-01T10:00:00.1", 20000, 0, "EM_ELABORACAO"),
                (401, 4, "Parcial", "2025-02-01T10:00:00.3", 2000, 28000, "DISPONIBILIZADO"),
                (400, 4, "Parcial", "2025-02-01T10:00:00.25", 1000, 29000, "DISPONIBILIZADO"),
            ])

    def tearDown(self):
        self._tmp.cleanup()

    def exportar(self):
        return pix.exportar_json(self.banco, self.saida)

    def municipio(self, r, codigo):
        return dict((m, p) for m, p in r["municipios"])[codigo]

    def test_formato_inteiro(self):
        r = self.exportar()
        self.assertEqual(list(r), ["fonte", "origem", "licenca", "coletadoEm", "anos",
                                   "funcoes", "municipios"])
        self.assertEqual(r["fonte"], "Transferegov (Ministério da Gestão), planos de "
                                     "ação das transferências especiais")
        self.assertEqual(r["origem"], pix.BASE)
        self.assertEqual(r["licenca"], pix.LICENCA)
        self.assertEqual(r["coletadoEm"], "2026-10-30T13:12:02+00:00")
        self.assertEqual(r["anos"], [2023, 2024])
        self.assertEqual(r["municipios"], [
            [2209559, [
                [2024, "0903-000004", 30000, [[None, "REFORMA DA ESCOLA", [12]]],
                 ["Parcial", "2025-02-01T10:00:00.3", 2000, 28000]]]],
            [2927408, [
                [2023, "0903-000002", 20000, [], None],
                [2024, "0903-000000", 1000, [], None],
                [2024, "0903-000001", 15000, [
                    [None, "PAVIMENTAÇÃO DE Ruas", [10, 15]],
                    ["FUNDO MUNICIPAL DE SAÚDE", "Compra de ambulância", [10]]],
                 ["Final", "2025-01-10T09:00:00.12", 15000, 0]]]],
        ])

    def test_plano_impedido_e_estado_ficam_fora(self):
        r = self.exportar()
        codigos = [p[1] for _, planos in r["municipios"] for p in planos]
        self.assertNotIn("0903-000003", codigos)
        self.assertNotIn("0903-000005", codigos)
        # A função só do executor do plano IMPEDIDO não entra no dicionário.
        self.assertNotIn("27", r["funcoes"])

    def test_executor_igual_ao_beneficiario_e_null_diferente_e_o_nome(self):
        itens = self.municipio(self.exportar(), 2927408)[2][3]
        self.assertIsNone(itens[0][0])
        self.assertEqual(itens[1][0], "FUNDO MUNICIPAL DE SAÚDE")

    def test_objeto_normaliza_o_espaco_sem_mudar_a_caixa(self):
        itens = self.municipio(self.exportar(), 2927408)[2][3]
        self.assertEqual(itens[0][1], "PAVIMENTAÇÃO DE Ruas")

    def test_funcoes_distintas_e_ordenadas_com_o_nome(self):
        r = self.exportar()
        itens = self.municipio(r, 2927408)[2][3]
        self.assertEqual(itens[0][2], [10, 15])  # 15 em duas subfunções conta uma vez
        self.assertEqual(r["funcoes"], {"10": "Saúde", "12": "Educação", "15": "Urbanismo"})
        self.assertEqual(list(r["funcoes"]), ["10", "12", "15"])

    def test_relatorio_final_vence_parcial_mais_novo_e_em_elaboracao_nao_conta(self):
        rel = self.municipio(self.exportar(), 2927408)[2][4]
        self.assertEqual(rel, ["Final", "2025-01-10T09:00:00.12", 15000, 0])

    def test_sem_final_vale_o_parcial_mais_recente(self):
        rel = self.municipio(self.exportar(), 2209559)[0][4]
        self.assertEqual(rel, ["Parcial", "2025-02-01T10:00:00.3", 2000, 28000])

    def test_sem_relatorio_disponibilizado_e_null(self):
        planos = self.municipio(self.exportar(), 2927408)
        self.assertIsNone(planos[0][4])  # só EM_ELABORACAO
        self.assertIsNone(planos[1][4])  # nenhum

    def test_arquivo_compacto_em_utf8(self):
        r = self.exportar()
        # write_text, como o emendas.json: no Windows a linha final sai CRLF.
        texto_ = self.saida.read_text(encoding="utf-8")
        self.assertTrue(texto_.endswith("}\n"))
        self.assertIn("SAÚDE", texto_)
        self.assertEqual(texto_, json.dumps(r, ensure_ascii=False,
                                            separators=(",", ":")) + "\n")
        self.assertEqual(json.loads(texto_), r)

    def test_soma_que_nao_fecha_e_erro_e_nada_se_escreve(self):
        from unittest import mock
        original = pix.retrato

        def com_um_centavo_a_mais(con):
            r = original(con)
            r["municipios"][0][1][0][2] += 1
            return r

        with mock.patch.object(pix, "retrato", side_effect=com_um_centavo_a_mais):
            with self.assertRaisesRegex(ErroPix, "não fecham com o banco"):
                self.exportar()
        self.assertFalse(self.saida.exists())

    def test_municipio_fora_do_ibge_e_erro_e_nada_se_escreve(self):
        con = sqlite3.connect(self.banco)
        con.execute("INSERT INTO pix_plano VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                    (7, "0903-000007", 2024, "CIENTE", "22222222000122", "X", "BA", 123,
                     "202427070011", "2024", 0, 100))
        con.commit()
        con.close()
        with self.assertRaisesRegex(ErroPix, "IBGE"):
            self.exportar()
        self.assertFalse(self.saida.exists())

    def test_banco_sem_coleta_e_erro(self):
        vazio = Path(self._tmp.name) / "vazio.db"
        with ArmazemPix(vazio):
            pass
        with self.assertRaisesRegex(ErroPix, "rode pix-ingerir"):
            pix.exportar_json(vazio, self.saida)
        self.assertFalse(self.saida.exists())

    def test_pix_exportar_grava_e_imprime(self):
        import argparse
        import contextlib
        from numeros_publicos.cli import pix_exportar
        args = argparse.Namespace(banco_emendas=str(self.banco), saida=str(self.saida))
        saida = io.StringIO()
        with contextlib.redirect_stdout(saida):
            codigo = pix_exportar(args)
        self.assertEqual(codigo, 0)
        self.assertIn("2 municípios, 4 planos CIENTE", saida.getvalue())
        self.assertIn("2024      3 planos            460,00", saida.getvalue())
        self.assertTrue(self.saida.exists())

    def test_pix_exportar_sai_1_sem_banco(self):
        import argparse
        import contextlib
        from numeros_publicos.cli import pix_exportar
        args = argparse.Namespace(banco_emendas=str(Path(self._tmp.name) / "nao.db"),
                                  saida=str(self.saida))
        erro = io.StringIO()
        with contextlib.redirect_stderr(erro):
            codigo = pix_exportar(args)
        self.assertEqual(codigo, 1)
        self.assertIn("não existe", erro.getvalue())
        self.assertFalse(self.saida.exists())


if __name__ == "__main__":
    unittest.main()

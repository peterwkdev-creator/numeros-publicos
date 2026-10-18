"""Constrói, em memória, uma planilha com a **forma** do arquivo real do INEP.

Não é um recorte do arquivo original: aquele tem 11,2 MB e 122 colunas, e
versionar isso para testar quatro comportamentos seria caro e ilegível. Esta
fixture reproduz exatamente o que morde:

- seis linhas de timbre do Ministério antes de qualquer dado;
- duas linhas de rótulo para humano (7 e 9), e os nomes de máquina na **10**;
- o mesmo município em várias `REDE`, incluindo a agregada `Pública`;
- ausência escrita como a string `"-"`;
- colunas de edição em pares `VL_<coisa>_<ano>`;
- e **a última edição sem meta nenhuma**, como 2023 no arquivo real — o
  primeiro ciclo do IDEB encerrou em 2021 e as novas metas ainda não
  saíram. Sem isso, o teste do "sem meta" testaria um caso que a fixture
  nunca produz.

Se a planilha real mudar de forma, é `_cabecalho()` que grita — e é por isso
que o teste do cabeçalho existe.
"""

from __future__ import annotations

import hashlib
import io
import zipfile

import openpyxl

EDICOES = (2021, 2023)

# Uma linha por (municipio, rede). `-` onde a fonte nao calculou.
# Sao Luis/MA aparece nas quatro redes; Imperatriz so em duas.
LINHAS = [
    # SG_UF, CO_MUNICIPIO, NO_MUNICIPIO, REDE,
    #   REND_2021, PORT_2021, MAT_2021, OBS_2021, PROJ_2021,
    #   REND_2023, PORT_2023, MAT_2023, OBS_2023, PROJ_2023
    ("MA", 2111300, "São Luís", "Municipal",
     0.97, 205.1, 210.4, 5.1, 5.4, 0.98, 212.0, 218.7, 5.6, "-"),
    ("MA", 2111300, "São Luís", "Estadual",
     0.95, 200.0, 204.0, 4.7, 5.0, 0.96, 203.5, 207.1, 4.9, "-"),
    ("MA", 2111300, "São Luís", "Federal",
     "-", "-", "-", "-", "-", 0.99, 240.0, 250.0, 7.2, "-"),
    # A AGREGADA. Note que ela nao e a soma aritmetica das outras -- e um
    # indice proprio, calculado sobre o conjunto. Somar as quatro linhas nao
    # produz nada que exista.
    ("MA", 2111300, "São Luís", "Pública",
     0.96, 202.0, 206.5, 4.9, 5.1, 0.97, 207.0, 212.0, 5.2, "-"),
    ("MA", 2105302, "Imperatriz", "Municipal",
     "-", "-", "-", "-", 5.2, 0.96, 209.0, 214.0, 5.4, "-"),
    ("MA", 2105302, "Imperatriz", "Pública",
     0.94, 198.0, 201.0, 4.6, 4.9, 0.95, 205.0, 209.0, 5.0, "-"),
]


def _cabecalho_de_maquina() -> list[str]:
    nomes = ["SG_UF", "CO_MUNICIPIO", "NO_MUNICIPIO", "REDE"]
    for ano in EDICOES:
        nomes += [f"VL_INDICADOR_REND_{ano}", f"VL_NOTA_PORTUGUES_{ano}",
                  f"VL_NOTA_MATEMATICA_{ano}", f"VL_OBSERVADO_{ano}",
                  f"VL_PROJECAO_{ano}"]
    return nomes


def planilha_bytes(cabecalho_na_linha: int = 10) -> bytes:
    """Os bytes de um `.xlsx` com a forma do arquivo do INEP.

    `cabecalho_na_linha` existe para o teste que prova que o leitor **rejeita**
    uma planilha reformatada em vez de ler o timbre como cabeçalho.
    """
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "IDEB_AI_MUNICÍPIOS"

    timbre = [
        ["Ministério da Educação"],
        ["Instituto Nacional de Estudos e Pesquisas Educacionais Anísio Teixeira"],
        [],
        ["Ensino Fundamental Regular"],
        ["Indicadores educacionais consolidados"],
        [],
        ["Sigla da UF", "Código do Município", "Nome do Município", "Rede"],
        [],
        [None, None, None, None, "1º ao 5º ano"],
    ]
    for linha in timbre[: cabecalho_na_linha - 1]:
        ws.append(linha)
    ws.append(_cabecalho_de_maquina())
    for linha in LINHAS:
        ws.append(list(linha))

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def zip_bytes(md5_correto: bool = True, com_md5: bool = True) -> bytes:
    """Um zip no formato do INEP: pasta, `.xlsx`, `.ods` e o `md5.txt`."""
    base = "divulgacao_anos_iniciais_municipios_2023"
    xlsx = planilha_bytes()
    ods = b"fingindo ser um .ods"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(f"{base}/{base}.xlsx", xlsx)
        z.writestr(f"{base}/{base}.ods", ods)
        if com_md5:
            h = hashlib.md5(xlsx).hexdigest()
            if not md5_correto:
                h = "0" * 32
            z.writestr(
                f"{base}/md5_{base}.txt",
                f"{h} *{base}.xlsx\n{hashlib.md5(ods).hexdigest()} *{base}.ods\n",
            )
    return buf.getvalue()

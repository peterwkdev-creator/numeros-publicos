"""Linha de comando: `ingerir`, `resumo`, `exportar`.

O recorte geográfico é **parâmetro, não pressuposto**. Hoje o site cobre o
Nordeste e o padrão é `--regiao NE`; o arquivo do INEP é nacional (5.433
municípios com rede municipal). Cravar o filtro no código transformaria a
expansão numa refatoração; sendo bandeira, ela é uma decisão e um comando.
"""

from __future__ import annotations

import argparse
import os
import sys
import urllib.request

from . import armazem
from .inep import (
    CABECALHOS, REDE_PADRAO, baixar, extrair_xlsx, ler, url_de,
)

BANCO_PADRAO = os.environ.get("EDUCACAO_BANCO", "educacao.db")

UFS_NORDESTE = ("MA", "PI", "CE", "RN", "PB", "PE", "AL", "SE", "BA")

REGIOES: dict[str, tuple[str, ...] | None] = {
    "NE": UFS_NORDESTE,
    # `None` = sem filtro. Existe desde o primeiro dia justamente para que a
    # expansão não precise de código novo.
    "BR": None,
}


def transporte_real(url: str, cabecalhos: dict) -> bytes:
    pedido = urllib.request.Request(url, headers=cabecalhos)
    with urllib.request.urlopen(pedido, timeout=300) as r:
        return r.read()


def cmd_ingerir(args, transporte, dormir=None) -> int:
    """Baixa, confere o MD5, lê e grava. Sem varredura: um arquivo por etapa."""
    ufs = REGIOES[args.regiao]
    filtro = set(ufs) if ufs else None
    etapas = ["anos_iniciais", "anos_finais"] if args.etapa == "todas" else [args.etapa]

    total = 0
    for etapa in etapas:
        url = url_de(etapa, args.ano)
        print(f"{etapa}: baixando {url}")
        with armazem.abrir(args.banco) as con:
            coleta = armazem.abrir_coleta(con, etapa, args.regiao)
        falha = None
        linhas = municipios = 0
        try:
            zipb = baixar(url, transporte, dormir)
            print(f"  {len(zipb):,} bytes; conferindo o MD5 declarado pelo INEP")
            xlsx = extrair_xlsx(zipb)
            itens = [
                l for l in ler(xlsx, etapa, redes=(args.rede,))
                if filtro is None or l.uf in filtro
            ]
            municipios = len({l.codigo_ibge for l in itens})
            with armazem.abrir(args.banco) as con:
                linhas = armazem.gravar(con, itens)
            total += linhas
            print(f"  {linhas:,} observações de {municipios:,} municípios "
                  f"({args.rede}, {args.regiao}).")
        except (Exception, KeyboardInterrupt) as e:
            falha = f"{type(e).__name__}: {e}"
            print(f"\n>>> {etapa} falhou: {falha}", file=sys.stderr)
        finally:
            with armazem.abrir(args.banco) as con:
                armazem.fechar_coleta(con, coleta, linhas, municipios, falha)
        if falha:
            return 1
    print(f"\n{total:,} observações gravadas.")
    return 0


def cmd_resumo(args, *_) -> int:
    """Cobertura e mediana do IDEB por UF, na edição mais recente."""
    with armazem.abrir(args.banco) as con:
        ult = con.execute(
            "SELECT MAX(edicao) FROM ideb WHERE etapa=?", (args.etapa,)).fetchone()[0]
        if ult is None:
            print(f"Nada coletado para {args.etapa}. Rode `ingerir` primeiro.")
            return 0
        print(f"{args.etapa}, edição {ult}:\n")
        print(f"  {'UF':4} {'municípios':>11} {'com IDEB':>9} {'mediana':>8} "
              f"{'mín':>6} {'máx':>6}")
        for l in con.execute(
            "SELECT uf, COUNT(*) n, COUNT(observado) com,"
            "       MIN(observado) mn, MAX(observado) mx"
            "  FROM ideb WHERE etapa=? AND edicao=?"
            " GROUP BY uf ORDER BY uf", (args.etapa, ult)):
            medianas = [r[0] for r in con.execute(
                "SELECT observado FROM ideb WHERE etapa=? AND edicao=? AND uf=?"
                "   AND observado IS NOT NULL ORDER BY observado",
                (args.etapa, ult, l["uf"]))]
            med = medianas[len(medianas) // 2] if medianas else None
            print(f"  {l['uf']:4} {l['n']:>11,} {l['com']:>9,} "
                  f"{('%.1f' % med) if med else '—':>8} "
                  f"{('%.1f' % l['mn']) if l['mn'] else '—':>6} "
                  f"{('%.1f' % l['mx']) if l['mx'] else '—':>6}")

        r = con.execute(
            "SELECT COUNT(*) n, COUNT(marca_portugues) mp,"
            "       COUNT(marca_matematica) mm FROM ideb WHERE etapa=?",
            (args.etapa,)).fetchone()
        print(f"\n  {r['n']:,} observações no total; "
              f"{r['mp'] + r['mm']} com ressalva da fonte.")
        sem_meta = [r[0] for r in con.execute(
            "SELECT edicao FROM ideb WHERE etapa=? GROUP BY edicao"
            " HAVING COUNT(projecao)=0 ORDER BY edicao", (args.etapa,))]
        if sem_meta:
            print(f"  edições sem meta publicada pelo INEP: {sem_meta}")
    return 0


def _mediana(valores: list[float]) -> float | None:
    """Mediana, e não média.

    O IDEB é limitado entre 0 e 10, e um punhado de municípios pequenos com
    nota extrema desloca a média sem descrever o conjunto. `None` para lista
    vazia — média de nada não é zero.
    """
    if not valores:
        return None
    v = sorted(valores)
    meio = len(v) // 2
    return v[meio] if len(v) % 2 else (v[meio - 1] + v[meio]) / 2


def cmd_regiao(args, *_) -> int:
    """A trajetória do conjunto inteiro, edição a edição.

    O `resumo` responde "como está cada UF hoje". Esta responde a outra
    pergunta, que nenhuma tabela por UF responde: **como o conjunto se moveu ao
    longo de dezoito anos**, e em quantas edições ele bateu a própria meta.

    Cobertura entra em toda linha de propósito. Um IDEB mediano subindo enquanto
    o número de municípios avaliados cai não é melhora do conjunto — é mudança
    de quem está sendo medido, e sem a coluna de cobertura isso é invisível.
    """
    with armazem.abrir(args.banco) as con:
        edicoes = [r[0] for r in con.execute(
            "SELECT DISTINCT edicao FROM ideb WHERE etapa=? AND rede=?"
            " ORDER BY edicao", (args.etapa, args.rede))]
        if not edicoes:
            print(f"Nada coletado para {args.etapa}. Rode `ingerir` primeiro.")
            return 0

        print(f"{args.etapa}, rede {args.rede}:\n")
        print(f"  {'edição':7} {'municípios':>11} {'mediana':>8} {'meta':>7} "
              f"{'bateram a meta':>15}")
        for e in edicoes:
            linhas = con.execute(
                "SELECT observado, projecao FROM ideb"
                "  WHERE etapa=? AND rede=? AND edicao=? AND observado IS NOT NULL",
                (args.etapa, args.rede, e)).fetchall()
            obs = [l["observado"] for l in linhas]
            metas = [l["projecao"] for l in linhas if l["projecao"] is not None]
            com_meta = [l for l in linhas if l["projecao"] is not None]
            bateram = sum(1 for l in com_meta if l["observado"] >= l["projecao"])
            med = _mediana(obs)
            med_meta = _mediana(metas)
            if com_meta:
                pct = f"{bateram:,} ({bateram * 100 // len(com_meta)}%)"
            else:
                # Sem meta publicada, "0%" seria uma afirmação sobre um alvo
                # que não existe.
                pct = "sem meta"
            print(f"  {e:<7} {len(obs):>11,} "
                  f"{('%.2f' % med) if med is not None else '—':>8} "
                  f"{('%.2f' % med_meta) if med_meta is not None else '—':>7} "
                  f"{pct:>15}")

        primeira, ultima = edicoes[0], edicoes[-1]
        def med_de(e):
            return _mediana([r[0] for r in con.execute(
                "SELECT observado FROM ideb WHERE etapa=? AND rede=? AND edicao=?"
                "   AND observado IS NOT NULL", (args.etapa, args.rede, e))])
        a, b = med_de(primeira), med_de(ultima)
        if a is not None and b is not None:
            print(f"\n  mediana de {a:.2f} em {primeira} para {b:.2f} em "
                  f"{ultima}: {b - a:+.2f} ponto(s) em {ultima - primeira} anos.")

        r = con.execute(
            "SELECT COUNT(DISTINCT codigo_ibge) n FROM ideb WHERE etapa=? AND rede=?",
            (args.etapa, args.rede)).fetchone()
        print(f"  {r['n']:,} municípios com rede {args.rede.lower()} nesta etapa.")
    return 0


def cmd_exportar(args, *_) -> int:
    """Gera o snapshot que o painel lê.

    Formato esparso, como o do painel fiscal: uma série por município, e os
    metadados de edição uma vez só.
    """
    import json
    from pathlib import Path

    with armazem.abrir(args.banco) as con:
        edicoes = [r[0] for r in con.execute(
            "SELECT DISTINCT edicao FROM ideb WHERE etapa=? ORDER BY edicao",
            (args.etapa,))]
        if not edicoes:
            print(f"Nada coletado para {args.etapa}.", file=sys.stderr)
            return 2
        indice = {e: i for i, e in enumerate(edicoes)}

        serie: dict[str, list] = {}
        nomes: dict[str, list] = {}
        ressalvas: dict[str, list] = {}
        for r in con.execute(
            "SELECT codigo_ibge, uf, nome, edicao, observado, projecao,"
            "       marca_portugues, marca_matematica"
            "  FROM ideb WHERE etapa=? AND rede=?"
            " ORDER BY codigo_ibge, edicao", (args.etapa, args.rede)):
            chave = str(r["codigo_ibge"])
            nomes.setdefault(chave, [r["nome"], r["uf"]])
            # Edição sem IDEB não entra na série: ausência já é dita pela
            # falta do ponto, e emitir `null` por edição inflaria o arquivo.
            if r["observado"] is not None:
                serie.setdefault(chave, []).append(
                    [indice[r["edicao"]], r["observado"], r["projecao"]])
            marca = r["marca_portugues"] or r["marca_matematica"]
            if marca:
                ressalvas.setdefault(chave, []).append(
                    [indice[r["edicao"]], marca])

        coleta = con.execute(
            "SELECT MAX(coletado_em) FROM ideb WHERE etapa=?",
            (args.etapa,)).fetchone()[0]

    from .inep import MARCAS
    snapshot = {
        "geradoEm": armazem.agora(),
        "coletadoEm": coleta,
        "fonte": armazem.FONTE,
        "etapa": args.etapa,
        "rede": args.rede,
        "edicoes": edicoes,
        # As edições em que o INEP NÃO publicou meta. 2005 é linha de base e o
        # primeiro ciclo do IDEB encerrou em 2021 (Portaria 26/2024): exibir
        # meta para 2023 ou 2025 inventaria um alvo que não existe.
        "edicoesSemMeta": [
            e for i, e in enumerate(edicoes)
            if not any(p[0] == i and p[2] is not None
                       for pontos in serie.values() for p in pontos)
        ],
        "colunasSerie": ["edicao", "observado", "projecao"],
        "municipios": nomes,
        "serie": serie,
        "ressalvas": ressalvas,
        "legenda": MARCAS,
        "cobertura": {
            "municipios": len(nomes),
            "observacoes": sum(len(v) for v in serie.values()),
            "comRessalva": sum(len(v) for v in ressalvas.values()),
        },
    }
    destino = Path(args.saida)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps(snapshot, ensure_ascii=False,
                                  separators=(",", ":")) + "\n", encoding="utf-8")
    kb = destino.stat().st_size // 1024
    print(f"{len(nomes):,} municípios em {destino} ({kb} KB); "
          f"{snapshot['cobertura']['observacoes']:,} observações, "
          f"{len(edicoes)} edições.")
    if snapshot["edicoesSemMeta"]:
        print(f"  sem meta publicada pelo INEP: {snapshot['edicoesSemMeta']}")
    return 0


def montar() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="educacao",
                                description="IDEB por município (INEP)")
    p.add_argument("--banco", default=BANCO_PADRAO)
    sub = p.add_subparsers(dest="comando", required=True)

    for nome, ajuda in (("ingerir", "baixa, confere o MD5 e grava"),
                        ("resumo", "cobertura e mediana por UF"),
                        ("regiao", "a trajetória do conjunto, edição a edição"),
                        ("exportar", "gera o snapshot que o painel lê")):
        s = sub.add_parser(nome, help=ajuda)
        s.add_argument("--rede", default=REDE_PADRAO,
                       help="a rede lida; o padrão é a municipal, que é a que "
                            "pareia com o orçamento do município")
        if nome == "ingerir":
            s.add_argument("--regiao", default="BR", choices=sorted(REGIOES),
                           help="BR (padrão) não filtra; NE filtra o Nordeste")
            s.add_argument("--ano", type=int, default=2025,
                           help="a divulgação; a de 2025 traz as 11 edições")
            s.add_argument("--etapa", default="anos_iniciais",
                           choices=("anos_iniciais", "anos_finais", "todas"))
        else:
            s.add_argument("--etapa", default="anos_iniciais",
                           choices=("anos_iniciais", "anos_finais"))
        if nome == "exportar":
            s.add_argument("--saida", default="painel/dados/ideb.json")
    return p


def principal(argv=None, transporte=None, dormir=None) -> int:
    """`dormir` é injetável para que o teste da retentativa não durma de
    verdade: com a espera dobrando, a suíte pagava 14 s por um caso."""
    args = montar().parse_args(argv)
    if args.comando == "ingerir":
        return cmd_ingerir(args, transporte or transporte_real, dormir)
    comandos = {"resumo": cmd_resumo, "regiao": cmd_regiao,
                "exportar": cmd_exportar}
    return comandos[args.comando](args, transporte or transporte_real)

# educacao-inep

Reads Brazil's **IDEB** — the federal basic-education index — for every
municipality, straight from the INEP spreadsheet, and turns it into a small
SQLite database and a JSON snapshot.

It exists to answer a question neither source answers alone. The
[Números Públicos](https://www.numerospublicos.com.br) panel already shows how
much of a municipality's budget went to education, taken from the National
Treasury. INEP publishes the result that spending produced. Both are keyed by
the same IBGE municipality code, and nobody joins them.

**The value is in the join, not in either end.**

## Why this is not as simple as reading a spreadsheet

Four traps, all silent — none raises an error, each publishes a wrong number:

| Trap | What happens if you miss it |
|---|---|
| `CO_MUNICIPIO` is not a key; **`REDE` is the other half** | Each municipality appears 1–4 times, and `Pública` is the **aggregate** of the others. Summing counts the same pupil twice. |
| Missing values are the **string `"-"`** | 21,545 of them in the IDEB columns alone. A coercing parser turns them into `NaN`, which becomes zero on the first aggregation. |
| The header is on **row 10** | Rows 1–6 are ministry letterhead. Reading with the first row as header yields columns named `None` and garbage data. |
| **No `User-Agent` → HTTP 200 with an empty body** | Not a 403, not a 404. A naive ingester writes an empty file and reports success. |

The archive ships an **MD5 checksum** of each spreadsheet. Verifying it turns
the fourth trap from a silent failure into a loud one, so the reader always does.

The municipal network (`REDE = Municipal`) is the one this project reads,
because the education spending shown beside it comes from the municipality's own
budget. Pairing that spending with an index that includes state-run schools would
credit the city hall with results it neither runs nor funds.

## Requirements

- Python 3.12+
- `openpyxl`

## Run it

```bash
pip install -r requirements.txt
python -m educacao ingerir          # downloads, verifies the MD5, loads SQLite
python -m educacao resumo           # coverage and medians per state
python -m educacao exportar         # writes the snapshot the panel reads
```

## Test it

```bash
python -m unittest discover -s tests
```

The tests run against a fixture that reproduces the real file's shape —
letterhead rows, header on row 10, `"-"` for absence and one municipality in all
four networks — so every trap above has a test that fails when it returns.

## Source and licence

Data: [INEP — IDEB results](https://www.gov.br/inep/pt-br/areas-de-atuacao/pesquisas-estatisticas-e-indicadores/ideb/resultados),
Ministry of Education, Brazil. Public data.

Code: AGPL-3.0-or-later.

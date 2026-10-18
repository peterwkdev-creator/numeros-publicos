# Painel Fiscal

How much every one of Brazil's **5,570 municipalities** spends on personnel,
against the limit the law sets for it — with the source and the collection date
next to every figure.

It started as a Northeast panel (1,793 municipalities); the geographic cut was
always a flag (`--regiao NE` / `--regiao BR`), so going national was a command.

Brazil's Fiscal Responsibility Law caps municipal executive personnel spending
at **54%** of net current revenue, with a **51.3%** prudential threshold that
already forbids new hiring once crossed. The data is public and free, published
by the National Treasury through SICONFI — but it arrives **one municipality per
request**, in 200+ lines of chart-of-accounts per query, with no comparison and
no reading. In practice nobody looks.

> **Status: the national sweep is complete.** For the third quarter of 2024,
> all **5,570** municipalities were consulted and **5,544 filed**: 3,245 the
> four-monthly report and 2,299 the **simplified half-yearly** one (see below).
> Everything below runs against the live API today.
>
> **The first and second four-month periods cover only the four-monthly
> filers.** Municipalities under 50,000 people may file half-yearly instead
> (art. 63 of the Fiscal Responsibility Law), and the first half-year matches
> no four-month period, so 2020–2024 Q1 and Q2 hold about 3,300 filers each.
> The third period does match: the second half-year covers the same twelve
> months to December.

## Run it

Requires **Python 3.10+** and nothing else — standard library only, no
dependencies to install.

```bash
python -m fiscal ingerir-entes && python -m fiscal ingerir
```

The first command fetches every municipality in a single request — 1,793 for
the Northeast, 5,570 for the country with `--regiao BR`. The second sweeps
their Fiscal Management Reports, one request each: roughly **57 minutes** for
the Northeast and **three hours** for the country. It is **resumable**:
interrupt it and run it again, and it continues instead of re-reading.

```bash
python -m fiscal ingerir --limite 25      # stop after 25, to try it out
python -m fiscal resumo                   # count and average per state
python -m fiscal listar --acima-do-limite # only those over the threshold
python -m fiscal conferir                 # internal consistency, reported not fixed
python -m fiscal exportar                 # the snapshot the panel reads (latest year asked of all)
python -m fiscal ingerir --refazer-ausentes  # ask again only those recorded as not filed
```

### Health spending, 26 years in 26 requests

A second source, from a different agency: **SIOPS**, published through DATASUS.
One request returns every municipality of a state across **all 26 exercises**
(2000–2025), so the whole country costs **26 requests and about 13 seconds** —
against 5,570 requests *per exercise* for the Fiscal Management Report.

```bash
python -m fiscal ingerir-saude            # 5,568 municipalities, 143,754 values
python -m fiscal saude                    # median and floor, year by year
```

Two things it refuses to do. It **will not silently record a state that came
back smaller** than the previous sweep — coverage does not shrink on its own,
so either the source changed (which is news) or the command was called wrong;
`--permitir-encolher` is there for when shrinking is the intent. And it **does
not compare the whole series against the 15% floor**: that floor only binds
from 2004 on. Constitutional Amendment 29 set 7% for the year 2000 and had each
municipality close its own gap by at least a fifth per year, so between 2001 and
2003 there is no comparable national floor at all — and saying otherwise would
accuse 3,428 municipalities of breaking a rule that did not yet apply to them.

The Federal District is absent by design, not by failure: it holds both state
and municipal powers, so it files no municipal report and has no municipal
series.

## The panel

The figures are published at
[numerospublicos.com.br](https://www.numerospublicos.com.br), built by
[numeros-publicos](https://github.com/peterwkdev-creator/numeros-publicos) from
`painel/dados/snapshot.json`. The standalone Next.js panel that used to live in
`painel/` was removed on 2026-10-10: nothing ran it any more, and its
dependencies carried security advisories. `painel/lib/dados.ts` stays as the
declared shape of the snapshot, which `tests/test_snapshot.py` checks the
export against.

## Test it

```bash
python -m unittest discover -s tests -t .
```

**No network and no real waiting** — the HTTP transport and the clock
are both injected, and the suite prints nothing: a real
`ATENÇÃO: incomplete database` has to be distinguishable from the same warning
coming out of a 20-municipality fixture. The fixtures are responses **captured
from the live API**, including the empty one, because the empty response is this
API's central trap — and, for SIOPS, a real latin-1 page with its tags left
unclosed, which is that source's.

Among them is a **cross-language contract test**: it reads the TypeScript types
as text and compares them against what the Python exporter actually writes. The
snapshot is positional, so swapping two columns in Python breaks nothing
anywhere — it just starts showing population where the percentage should be.
That test is the only thing standing between such a swap and a silently wrong
page. It was verified by deliberately swapping two columns and watching it
fail.

## Three things it gets right on purpose

**An empty answer is not an error, and it is not zero.** `/rgf` without
`id_ente` returns `items: []` with HTTP **200**. A client that treats that as a
failure retries forever; one that treats it as data records zero where there is
no information. Here it is recorded as an explicit absence, distinct both from
"filed a zero" and from "not asked yet".

**The sweep assumes it will be interrupted.** An hour of network is plenty of
time for something to go wrong, so each municipality is written and marked as it
arrives. A network failure becomes a status code, never an exception — a socket
`TimeoutError` is an `OSError`, not a `URLError`, a distinction that once took
down a sibling project mid-run.

**The percentage is never recalculated.** It arrives computed and filed by the
municipality itself. Recomputing it from `spending / revenue` would invent a
second truth that nobody signed.

## The check that found its own author's mistake

`fiscal conferir` recomputes `spending / adjusted net revenue` and compares it
against the percentage the municipality filed — reporting divergence, never
correcting it. On its first run it diverged in **every single municipality**,
always in the same direction.

That was not noise. The filed percentage is computed over the **adjusted** net
current revenue, and the check was using the gross figure. Salvador's 2024 Q3
report carries both: 10,384,311,525.53 gross against 10,250,806,767.53 adjusted,
and 3,318,008,507.92 over the adjusted figure is exactly the 32.37% filed.
**Divergence in one direction only is never chance.** After the fix: zero
divergences.

## What it does not do

It does not interpret, accuse, or declare anyone in breach — it shows the filed
figure and the legal limit. It has no backend, no production database, and no
login.

## The numbers, nationally

The complete sweep of 2024's third quarter, all **5,570** municipalities
(measured 11/10/2026):

| | |
|---|---|
| Filed the four-monthly report | **3,245** |
| Filed the simplified half-yearly report | **2,299** |
| **Did not file at all** | **26** (0.5%) |
| Over the 54% legal cap | **349** |
| Between 51.3% and 54% (prudential band) | 368 |
| Filings outside 0–100%, kept and labelled | 26 |
| Average of the plausible filings | 44.15% |
| Median | 43.86% |

The bands above are **disjoint**: 349 are over the legal cap and a further 368
sit between the two thresholds. Adding them gives the 717 over the prudential
limit.

**Sergipe averages 51.97% across the whole state** — the state mean sits above
the prudential threshold. Among municipalities over 200,000 people: Lauro de
Freitas/BA 70.25%, Imperatriz/MA 60.64%, Paulista/PE 55.30%.

**Until 11/10/2026 this README said two in five municipalities did not file
at all** — 2,326 of 5,570, with Santa Catarina at 86% and Rio Grande do Sul at
15%. It was wrong. Those municipalities had filed the **simplified report**
(`co_tipo_demonstrativo=RGF Simplificado`, `in_periodicidade=S`), which the
four-monthly query never reaches. Every state now files 88% or more
(Amapá is the lowest).

The check that "proved" the absence had a control, and the control was not
enough: probing known filers in the same run, and getting rows back, proves the
**query** works, not that it asks for the right **kind** of report. An empty
list from an API is a fact about the question. The same trap sat in the budget
execution report, where 2,327 municipalities filed the **RREO Simplificado**;
both readers now ask the simplified report when the regular one comes back
empty, and record which one the number came from.

## License

AGPL-3.0-or-later.

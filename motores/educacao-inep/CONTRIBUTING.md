# Contributing

A figure that differs from the INEP spreadsheet, or a missing municipality:
open an issue with the "Figure differs from the source" template. To send
code:

- Tests run from the checkout, with no network:

  ```bash
  pip install -r requirements.txt
  python -m unittest discover -s tests
  ```

- One dependency, `openpyxl`, pinned in `requirements.txt`; adding another
  needs a reason in the pull request.
- Every figure is read from the INEP spreadsheet as published, with the
  source's own marks (`*`, `**`) kept. Absence (`-`, `ND`) stays absence,
  never zero.
- Every new case has a test, with the expected result written by hand in
  the test itself. Tests never touch the network: the transport is injected
  and the test spreadsheet is built in memory.
- No personal data (taxpayer IDs, addresses, contacts) in code, tests or
  issues. Municipality names and figures, as INEP publishes them, are fine.
- Documentation and commit messages in English; identifiers follow the
  existing code.
- Behavior changes are described in the pull request.
- Your own code only: do not bring code copied from another project, even
  under a free license. What you contribute is released under the project's
  [AGPL-3.0-or-later license](LICENSE).

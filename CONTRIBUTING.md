# Como contribuir

Número diferente do da fonte oficial, ou município ou dado que falta: abra
uma issue pelo modelo "Número diferente da fonte". Para mandar código:

- Os testes do Python rodam do checkout:

  ```bash
  python -m unittest discover -s tests -t .
  ```

  e os do painel, dentro de `painel/`:

  ```bash
  npm ci
  npm test
  ```

- Todo número vem de fonte oficial (IBGE, Tesouro Nacional, INEP, INSS,
  Ministério do Trabalho, CGU), com o endereço da fonte, a data da coleta e
  uma conferência que o compara com a própria fonte, não consigo mesmo.
- O site não toma lado: o texto descreve o dado, sem juízo sobre governo,
  partido ou pessoa.
- Todo caso novo tem teste, com o resultado esperado escrito à mão no
  próprio teste.
- Nenhum dado pessoal (CPF, endereço, contato) em código, teste ou issue.
  Nome de município e de quem ocupa cargo público pode, como a fonte
  oficial o publica.
- Código, mensagens e documentação em português do Brasil.
- Mudança de comportamento vai descrita no pull request.
- Código próprio: não traga código copiado de outro projeto, mesmo de
  licença livre. O que você contribui sai sob a licença
  [AGPL-3.0-or-later](LICENSE) do projeto.

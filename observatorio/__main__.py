"""Ponto de entrada: `python -m observatorio`.

## As duas linhas de `reconfigure`, e por que elas moram aqui

No Windows o `stdout` abre em **cp1252** sempre que a saída vai para um cano —
toda tarefa em segundo plano, todo `| tee`, todo CI que captura log. Um
caractere fora daquela tabela levanta `UnicodeEncodeError` e **mata o processo
no meio do trabalho, na hora de contar o que fez**.

Isso já custou três diagnósticos apontados para o lugar errado nesta máquina, e
a regra em `.claude/rules/medir.md` manda pôr estas linhas no topo de todo
script que imprima. Faltavam aqui, e o motivo de nunca terem faltado *na
prática* é constrangedor: os caracteres que este CLI usava — `·` e `—` —
**existem** em cp1252. Ele estava protegido por acaso.

Em 15/09/2026 um `─` (U+2500, desenho de caixa) entrou num separador novo e o
acaso acabou: `ingerir-indicador todos` morria antes de ingerir nada, num
comando escrito para ser chamado justamente por processo automático com a saída
redirecionada. Só apareceu porque o comando foi **executado**; a suíte de
testes não exercita o `print` com cano.

Aqui e não em `cli.py` porque este é o único ponto de entrada: quem importa o
módulo como biblioteca não deve ter o `stdout` do processo reconfigurado por
baixo.
"""

import sys

from .cli import main

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.exit(main())

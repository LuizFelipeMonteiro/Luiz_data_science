# Monitor de Licitações (PNCP)

Agente que vigia o **Portal Nacional de Contratações Públicas (PNCP)** — onde União, estados e
municípios são obrigados a publicar suas licitações pela Lei 14.133/2021 — e avisa quando aparece
uma oportunidade que combina com o seu negócio.

```
PNCP (API pública) ─► filtros (palavras, valor, UF) ─► Claude dá nota 0-10 (opcional)
        ─► SQLite (lembra o que já viu) ─► avisos: Telegram / e-mail / Slack / console
        ─► relatório HTML + CSV
```

## O que ele faz

- Consulta a API aberta do PNCP (sem cadastro), por modalidade (pregão, concorrência, dispensa…) e UF.
- **Modo `proposta`**: só traz licitações com prazo de propostas ainda aberto.
  **Modo `publicacao`**: tudo publicado nos últimos N dias.
- Filtra por palavras-chave (sem ligar para acentos ou maiúsculas, com prefixo `dashboard*`),
  palavras de exclusão, faixa de valor, UF e município.
- **Triagem com IA (opcional)**: o Claude lê cada licitação, compara com o perfil da sua empresa e
  devolve nota, recomendação (participar / analisar / descartar), resumo e pontos de atenção.
  Só são notificadas as que atingem a `nota_minima`.
- Avisa **só novidades**. Se o envio falhar, tenta de novo no próximo ciclo.
- Gera `dados/relatorio.html` (tabela filtrável) e `dados/licitacoes.csv` (abre no Excel).

## Começando (no seu computador)

```bash
cd monitor_licitacoes
pip install -r requirements.txt
cp config.example.yaml config.yaml      # edite palavras-chave, UFs, modalidades
python -m licitacoes --sem-notificar    # 1ª carga: registra o que já existe, sem avisar
python -m licitacoes                    # próximas execuções: avisa só o que for novo
python -m licitacoes --loop 120         # ou deixe rodando, a cada 2 horas
```

## Rodando sozinho no GitHub (grátis)

O workflow `.github/workflows/monitor-licitacoes.yml` roda em dias úteis, a cada 3 horas,
e guarda o histórico no cache do Actions.

1. Faça commit do seu `config.yaml` dentro de `monitor_licitacoes/` (sem credenciais).
2. Em **Settings → Secrets and variables → Actions**, cadastre os segredos dos canais que usar
   (tabela abaixo).
3. Em **Actions → Monitor de licitações → Run workflow**, rode uma vez marcando
   *Só registrar, sem enviar avisos*. Depois disso ele segue no horário.
4. O relatório HTML/CSV de cada execução fica em *Artifacts* na página da execução.

## Credenciais (variáveis de ambiente)

| Canal | Variáveis | Como obter |
|---|---|---|
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Crie um bot com o @BotFather; mande uma mensagem a ele e veja o `chat.id` em `https://api.telegram.org/bot<TOKEN>/getUpdates` |
| E-mail | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `EMAIL_DESTINATARIOS` | No Gmail/Outlook, use uma *senha de app* |
| Slack/Discord/Chat | `WEBHOOK_URL` | URL de *Incoming Webhook* do canal |
| IA (Claude) | `ANTHROPIC_API_KEY` | https://console.anthropic.com |

Ative cada canal em `notificacoes:` no `config.yaml`.

## Sobre a triagem com IA

Com `ia.habilitado: true`, cada licitação **que já passou nos filtros** é enviada ao Claude
(modelo `claude-opus-5-5`, esforço `low`) junto com o `perfil_empresa`. O perfil fica em cache
de prompt, então o custo por licitação é pequeno; quanto mais preciso o perfil (o que vocês
fazem **e** o que não fazem), melhores as notas. Se o modelo recusar alguma análise por política
de segurança, a API tenta automaticamente outro modelo (`fallbacks: "default"`). Se a IA falhar,
a licitação é avisada mesmo assim, sem nota — nada se perde.

## Estrutura

```
licitacoes/
  pncp.py           cliente da API do PNCP (paginação, novas tentativas)
  filtros.py        palavras-chave, exclusões, valor, UF, município
  ia.py             avaliação com Claude (saída estruturada)
  storage.py        SQLite com o histórico
  notificadores.py  console, Telegram, e-mail, webhook
  relatorio.py      HTML e CSV
  monitor.py        orquestra um ciclo
tests/              testes com PNCP e Claude simulados (pytest)
```

Testes: `python -m pytest`.

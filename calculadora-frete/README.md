# Calculadora de Frete – LFM Transportes

Página (HTML + JavaScript, sem servidor) onde o cliente digita os endereços de
retirada e entrega, vê o valor na hora e agenda pelo WhatsApp.

```
 Cliente abre o link no celular
        │
        ▼
 Hospedagem grátis (Netlify / GitHub Pages) ──► entrega os arquivos
        │
        ▼
 O navegador do celular faz as contas
        ├──► Google Maps: "onde fica esse endereço?" / "quantos km de carro?"
        │       (se o Google falhar → OpenStreetMap + OpenRouteService, grátis)
        └──► WhatsApp: abre a conversa com a LFM com a mensagem pronta
```

## Onde mexer

| Quero mudar…                                        | Arquivo              |
|-----------------------------------------------------|----------------------|
| Preços, faixas, WhatsApp, carga especial, mapas      | `config.js`          |
| Condições de um cliente (mínimo, só avulsa, nome)    | `parceiros.js`       |
| Chaves do Google e do OpenRouteService               | `chave.js` (só no seu computador) |
| Logo                                                 | `assets/logo.png`    |
| Exemplos que a tabela deve acertar                   | `testes/casos.js`    |

Regras para editar sem quebrar: centavos com **ponto** (`2.50`), vírgula no fim
de cada linha, textos entre aspas. Depois de salvar, abra o **`testes.html`**:
ele confere a tabela **e** aponta erros de digitação no `config.js`/`parceiros.js`.

## Uma ou várias entregas

O cliente informa a retirada e quantas entregas quiser (até `maxEntregas`, no
`config.js`), com o botão **"+ Adicionar outra entrega"**.

- Cada entrega paga pela distância **da retirada até ela** (não depende da ordem).
- **1 entrega** → tabela avulsa. **2 ou mais** → tabela agrupada para cada uma.
  Não existe escolha manual: ninguém pega o desconto com uma entrega só.
- Cliente com `modalidadesPermitidas: ["avulsa"]` (ex.: `cliente-a`) paga
  avulsa em cada entrega, mesmo com várias.
- Entrega fora da cidade segue a regra de fora da cidade, mesmo dentro de um grupo.
- A mensagem do WhatsApp lista cada entrega (endereço, mapa e valor) e o total.
- **A quilometragem não aparece para o cliente** (nem na tela, nem na mensagem, que ele lê
  antes de enviar), para ele não fazer a conta do preço. Aparece só o tempo de carro.
  Para conferir a km de um pedido, abra o link do mapa da mensagem.

## Link de cada cliente

`index.html?parceiro=CODIGO` usa as condições do cliente cadastrado em
`parceiros.js` (ex.: `?parceiro=cliente-a`: mínimo de R$ 20, só avulsa, nome na
mensagem). Sem `?parceiro=` vale a tabela padrão.

## Chaves (`chave.js`)

- O `chave.js` **não vai para o GitHub** (está no `.gitignore`) e os ZIPs de
  atualização vêm **sem** ele. Ao atualizar: extraia o ZIP numa pasta nova e
  **copie o seu `chave.js`** da pasta antiga.
- Para criar do zero: copie `chave.exemplo.js` com o nome `chave.js` e cole as chaves.
- Google: console.cloud.google.com → APIs e serviços → Credenciais
  (serviços ativados: Maps JavaScript API, Places API (New), Routes API;
  limite de 300 pedidos/dia em cada um).
- OpenRouteService (plano B): openrouteservice.org → Dashboard → API Keys.
  O endereço da API mudou em 11/2026 para `api.heigit.org`.

## Mapas e custos

- `config.js → mapas.provedor`: `"google"` (endereço com número da casa) ou
  `"gratis"` (OpenStreetMap, sem número da casa).
- **Plano B automático:** se o Google falhar (conta pausada, limite diário,
  fora do ar), a página passa sozinha para o mapa gratuito.
- **Custo:** hospedagem grátis; Google dentro da cota grátis no volume atual
  (busca com "sessão", detalhe só com campos básicos, rota sem trânsito).
  O período de teste do Google termina por volta de **26/02/2027**: ativar a
  conta paga ou trocar `provedor` para `"gratis"`.
- O limite de 300/dia conta cada busca enquanto a pessoa digita. Com muitos
  parceiros, aumente o limite no console do Google.

## Privacidade

A LFM não guarda dados. O celular de quem usa lembra só o último endereço de
retirada (separado por cliente, por até 30 dias, regra do Google para
coordenadas). Os endereços vão ao Google/OpenStreetMap só para calcular a rota.

## Testes

- **Preços e config (para o Luiz):** abrir `testes.html` no navegador.
- **Técnicos (para quem mexe no código):** `node testes/tecnicos.js` e
  `node testes/rodar-testes.js`.

## Organização do código (pensando no agendamento futuro)

- `js/precos.js`: só as contas do frete. Não depende de tela nem de mapa.
- `js/parceiro.js`: junta a tabela padrão com as condições do cliente.
- `js/mapas.js`: busca de endereço e rota (Google + plano B gratuito).
- `js/autocompletar.js`: campo de endereço com sugestões.
- `js/whatsapp.js`: monta a mensagem pronta e o link do mapa para o entregador.
- `js/app.js`: liga a tela às regras.

## Etapas

- [x] 1. Tabela no config + cálculo + página de testes
- [x] 2. Tela para celular
- [x] 3. Busca de endereços com sugestões (Google, com plano B gratuito)
- [x] 4. Distância de carro + dentro/fora de PG
- [x] 5. Número/complemento + "Agendar pelo WhatsApp" (mensagem pronta com link do mapa)
- [x] Revisão geral (11/2026)
- [x] Várias entregas no mesmo pedido (agrupada automática a partir de 2)
- [ ] 6. Publicar, travar a chave do Google no endereço do site e gerar o link da cliente
- [ ] 7. Logo, ícone para "Adicionar à tela inicial" e ajustes finos

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| "Calculadora indisponível no momento" | Erro de digitação no `config.js`/`parceiros.js`: abra o `testes.html` |
| Sugestões sem "Google Maps" no rodapé | Chave do Google ausente no `chave.js`, ou Google falhou e o plano B assumiu (F12 → Console mostra o motivo) |
| "Não conseguimos calcular a distância" | Sem internet, ou `chave.js` ausente (ZIP do GitHub não traz as chaves) |
| Funciona no computador e não no site publicado | Chave do Google travada para outro endereço (ver Etapa 6) |

## Ideias para o futuro (não construir agora)

- **Agendamento para pequenos negócios parceiros** (próxima fase após a calculadora).
- **Nicho floriculturas (ideia da cliente piloto):** entrega de carro com cuidado e
  apresentação (produto "de alto sentimento"). Possíveis opções por cliente em
  `parceiros.js`: tipo de veículo (só carro), foto de comprovação, horário exato.
  Validar antes com outras floriculturas de PG, principalmente os picos
  (Dia das Mães, Namorados, Finados, Dia da Mulher).
- **Tabela por cliente:** já funciona via `parceiros.js`; ampliar conforme as negociações
  (ex.: cliente de alto volume sem cobrança de retorno).

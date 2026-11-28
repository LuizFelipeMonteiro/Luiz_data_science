# Calculadora de Frete – LFM Transportes

Página simples (HTML + JavaScript, sem servidor) para calcular o valor de uma entrega
e agendar pelo WhatsApp.

## Onde mexer

| Quero mudar…                         | Arquivo                |
|--------------------------------------|------------------------|
| Preços, faixas, WhatsApp, carga especial | `config.js`        |
| Logo                                 | `assets/logo.png`      |
| Exemplos que a tabela deve acertar   | `testes/casos.js`      |

Depois de editar o `config.js`, abra `testes.html` no navegador: tudo verde = tabela ok.

## Organização (pensando no agendamento futuro)

- `js/precos.js`: só as contas do frete. Não depende de tela nem de mapa.
- `js/mapas.js` *(etapa 3)*: busca de endereço e rota. Trocar de provedor mexe só aqui.
- `js/whatsapp.js` *(etapa 5)*: monta a mensagem pronta.
- `js/app.js` *(etapa 2)*: liga a tela às regras.

## Etapas

- [x] 1. Tabela no config + cálculo + página de testes
- [x] 2. Tela para celular (km digitado à mão)
- [x] 3. Autocomplete de endereços (Photon)
- [x] 4. Distância de rota (OpenRouteService) + dentro/fora de PG
- [x] 5. Número/complemento + botão "Agendar pelo WhatsApp" (mensagem pronta com link do mapa)
- [ ] 6. Publicar e gerar link para parceiros
- [ ] 7. Carga especial e ajustes finos

## Ideias para o futuro (não construir agora)

- **Tabela por cliente parceiro:** cada cliente com condições negociadas
  (ex.: alto volume → sem cobrança de retorno, desconto por km, faixas próprias).
  Caminho previsto: um arquivo de configuração por cliente que só sobrescreve o
  que muda em relação ao `config.js` padrão, escolhido pelo link
  (ex.: `.../?parceiro=confeitaria`). O `js/precos.js` já recebe o config como
  parâmetro, então não precisa ser reescrito.
- **Agendamento para pequenos negócios parceiros** (próxima fase após a calculadora).
- **Nicho floriculturas (ideia da cliente piloto):** entrega de carro com cuidado e
  apresentação (produto "de alto sentimento"). Possíveis opções por cliente em
  `parceiros.js`: tipo de veículo (só carro), foto de comprovação, horário exato.
  Validar antes com outras floriculturas de PG, principalmente os picos
  (Dia das Mães, Namorados, Finados, Dia da Mulher).

## Chave do serviço de rotas

A rota usa o OpenRouteService (endereço novo desde 11/2026: `api.heigit.org`).
A chave fica no arquivo `chave.js`, que **não vai para o GitHub**.
Para criar: copie `chave.exemplo.js` com o nome `chave.js` e cole sua chave.

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
- [ ] 3. Autocomplete de endereços
- [ ] 4. Distância de rota + dentro/fora de PG
- [ ] 5. Botão "Agendar pelo WhatsApp"
- [ ] 6. Publicar e gerar link para parceiros
- [ ] 7. Carga especial e ajustes finos

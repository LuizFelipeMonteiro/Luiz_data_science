/*
 * ============================================================
 *  CONDIÇÕES ESPECIAIS POR CLIENTE PARCEIRO
 * ============================================================
 *  Cada cliente tem um "código" que vai no link:
 *     index.html?parceiro=cliente-a
 *
 *  Em "ajustes" você escreve SÓ o que muda em relação ao
 *  config.js. Todo o resto continua igual à tabela padrão.
 *
 *  Não coloque aqui dados pessoais (endereço de casa,
 *  telefone): este arquivo fica público junto com a página.
 * ============================================================
 */
window.LFM_PARCEIROS = {

  // Cliente avulsa (retirada na casa dela). Troque "cliente-a" por
  // um código que você reconheça; o link muda junto.
  "cliente-a": {
    ajustes: {
      valorMinimoEntrega: 20.00,          // nunca cobra menos que R$ 20
      modalidadesPermitidas: ["avulsa"],  // não mostra a opção "agrupada"
    },
  },

  // Exemplo para o futuro (desligado: comece a linha sem // para usar)
  // "mercado-x": { ajustes: { acimaDaUltimaFaixa: { avulsa: { porKm: 3.50 } } } },
};

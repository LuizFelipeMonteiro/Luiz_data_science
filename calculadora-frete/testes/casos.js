/*
 * Exemplos que a calculadora TEM que acertar.
 * Se você mudar a tabela no config.js, alguns destes vão ficar
 * vermelhos. É o esperado: atualize o "esperado" aqui também.
 *
 * Campos: km, dentro (true = dentro de PG), modalidade, especial, esperado (R$)
 */
(function (global) {
  var casos = [
    // ---- Avulsa dentro de PG ----
    { km: 0.5,  dentro: true,  modalidade: "avulsa",   esperado: 15.00 },
    { km: 3,    dentro: true,  modalidade: "avulsa",   esperado: 15.00, obs: "exatamente 3 km fica na 1ª faixa" },
    { km: 3.1,  dentro: true,  modalidade: "avulsa",   esperado: 18.00 },
    { km: 5,    dentro: true,  modalidade: "avulsa",   esperado: 18.00 },
    { km: 6.9,  dentro: true,  modalidade: "avulsa",   esperado: 22.00 },
    { km: 7,    dentro: true,  modalidade: "avulsa",   esperado: 22.00 },
    { km: 7.4,  dentro: true,  modalidade: "avulsa",   esperado: 23.00, obs: "22 + 0,4 km × 2,50" },
    { km: 10,   dentro: true,  modalidade: "avulsa",   esperado: 29.50, obs: "exemplo da tabela do Luiz" },

    // ---- Agrupada dentro de PG ----
    { km: 2,    dentro: true,  modalidade: "agrupada", esperado: 12.00 },
    { km: 4,    dentro: true,  modalidade: "agrupada", esperado: 14.00 },
    { km: 7,    dentro: true,  modalidade: "agrupada", esperado: 17.00 },
    { km: 10,   dentro: true,  modalidade: "agrupada", esperado: 29.50, obs: "acima de 7 km usa a mesma regra da avulsa" },

    // ---- Fora de PG (ida e volta) ----
    { km: 20,   dentro: false, modalidade: "avulsa",   esperado: 100.00, obs: "20 km × 2 × 2,50" },
    { km: 12.3, dentro: false, modalidade: "avulsa",   esperado: 61.50 },

    // ---- Carga especial (testada com a opção LIGADA, mesmo que esteja desligada no config) ----
    { km: 4,    dentro: true,  modalidade: "avulsa",   especial: { tipo: "fixo", valor: 5 },        esperado: 23.00 },
    { km: 4,    dentro: true,  modalidade: "avulsa",   especial: { tipo: "percentual", valor: 20 }, esperado: 21.60 },
  ];

  global.LFM = global.LFM || {};
  global.LFM.casosDeTeste = casos;
  if (typeof module !== "undefined" && module.exports) module.exports = casos;
})(typeof window !== "undefined" ? window : globalThis);

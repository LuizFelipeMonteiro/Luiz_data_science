/*
 * Regras de preço da LFM Transportes.
 *
 * Este arquivo só faz contas: recebe a distância e as opções e
 * devolve o valor. Ele não sabe nada de mapa, tela ou WhatsApp.
 * Por isso dá para reaproveitá-lo depois no agendamento.
 *
 * Os valores vêm do config.js. Não coloque preços aqui.
 */
(function (global) {
  "use strict";

  function arredondar(numero, casas) {
    var fator = Math.pow(10, casas);
    return Math.round((numero + Number.EPSILON) * fator) / fator;
  }

  /**
   * Calcula o frete.
   *
   * @param {Object}  pedido
   * @param {number}  pedido.distanciaKm      distância de rota (só ida), em km
   * @param {boolean} pedido.dentroDaCidade   true se retirada E entrega são na cidade
   * @param {string}  pedido.modalidade       "avulsa" ou "agrupada"
   * @param {boolean} [pedido.cargaEspecial]  true para aplicar o acréscimo
   * @param {Object}  config                  o LFM_CONFIG
   * @returns {{valor:number, kmConsiderado:number, regra:string}}
   *          "regra" é uma descrição curta para uso interno/testes.
   *          A página mostra só o "valor" ao cliente.
   */
  function calcularFrete(pedido, config) {
    var km = Number(pedido.distanciaKm);
    if (!isFinite(km) || km < 0) {
      throw new Error("Distância inválida: " + pedido.distanciaKm);
    }
    km = arredondar(km, config.arredondamento.casasDecimaisKm);

    var valor, regra;

    if (pedido.dentroDaCidade) {
      var cidade = config.dentroDaCidade;
      var modalidade = pedido.modalidade || "avulsa";
      var tabela = cidade.modalidades[modalidade];
      if (!tabela) throw new Error("Modalidade desconhecida: " + modalidade);

      var faixa = null;
      for (var i = 0; i < tabela.faixas.length; i++) {
        if (km <= tabela.faixas[i].ate) { faixa = tabela.faixas[i]; break; }
      }

      if (faixa) {
        valor = faixa.valor;
        regra = tabela.rotulo + ": faixa até " + faixa.ate + " km";
      } else {
        var limite = tabela.faixas[tabela.faixas.length - 1].ate;
        var acima = cidade.acimaDaUltimaFaixa[modalidade];
        var valorUltimaFaixa = tabela.faixas[tabela.faixas.length - 1].valor;
        // Proteção: uma entrega maior nunca sai mais barata que a última faixa.
        valor = Math.max(km * acima.porKm, valorUltimaFaixa);
        regra = tabela.rotulo + ": acima de " + limite + " km (" + km + " km × " + acima.porKm + ")";
      }
    } else {
      var fora = config.foraDaCidade;
      var kmCobrado = fora.idaEVolta ? km * 2 : km;
      valor = Math.max(kmCobrado * fora.porKm, fora.valorMinimo || 0);
      regra = "Fora da cidade: " + kmCobrado + " km" + (fora.idaEVolta ? " (ida e volta)" : "");
    }

    if (config.valorMinimoEntrega && valor < config.valorMinimoEntrega) {
      valor = config.valorMinimoEntrega;
      regra += " → valor mínimo";
    }

    var especial = config.cargaEspecial;
    if (pedido.cargaEspecial && especial && especial.ativo) {
      if (especial.tipo === "percentual") {
        valor = valor * (1 + especial.valor / 100);
      } else {
        valor = valor + especial.valor;
      }
      regra += " + carga especial";
    }

    return { valor: arredondar(valor, 2), kmConsiderado: km, regra: regra };
  }

  /** Este cliente pode usar a tabela agrupada? (ver modalidadesPermitidas no parceiros.js) */
  function podeAgrupar(config) {
    var modalidades = config.dentroDaCidade.modalidades;
    var permitidas = config.modalidadesPermitidas || Object.keys(modalidades);
    return !!modalidades.agrupada && permitidas.indexOf("agrupada") >= 0;
  }

  /**
   * Calcula um pedido com UMA OU VÁRIAS entregas saindo da mesma retirada.
   *
   * Regras (combinadas com o Luiz):
   *  - Cada entrega paga pela distância da RETIRADA até ela.
   *  - 1 entrega → tabela "avulsa".
   *  - 2 ou mais entregas no mesmo trajeto → tabela "agrupada" para cada uma
   *    (se o cliente puder usar a agrupada; ver modalidadesPermitidas no parceiros.js).
   *  - Entrega fora da cidade segue a regra de fora da cidade.
   *
   * @param {Object} pedido
   * @param {Array<{distanciaKm:number, dentroDaCidade:boolean}>} pedido.entregas
   * @param {boolean} [pedido.cargaEspecial]
   * @returns {{modalidade:string, itens:Array, total:number}}
   */
  function calcularPedido(pedido, config) {
    var entregas = pedido.entregas || [];
    if (!entregas.length) throw new Error("Pedido sem entregas");

    var modalidade = entregas.length >= 2 && podeAgrupar(config) ? "agrupada" : "avulsa";

    var itens = entregas.map(function (e) {
      var r = calcularFrete({
        distanciaKm: e.distanciaKm,
        dentroDaCidade: e.dentroDaCidade,
        modalidade: modalidade,
        cargaEspecial: pedido.cargaEspecial,
      }, config);
      r.dentroDaCidade = !!e.dentroDaCidade;
      return r;
    });
    var total = itens.reduce(function (soma, r) { return soma + r.valor; }, 0);
    return { modalidade: modalidade, itens: itens, total: arredondar(total, 2) };
  }

  /** Formata 29.5 como "R$ 29,50". */
  function formatarReais(valor) {
    return "R$ " + valor.toFixed(2).replace(".", ",");
  }

  var api = { calcularFrete: calcularFrete, calcularPedido: calcularPedido, podeAgrupar: podeAgrupar, formatarReais: formatarReais };

  // Disponível na página como LFM.precos.calcularFrete(...)
  global.LFM = global.LFM || {};
  global.LFM.precos = api;

  // Permite rodar os mesmos testes fora do navegador (Node.js).
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

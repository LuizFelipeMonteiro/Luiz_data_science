/*
 * Liga a TELA às REGRAS.
 *
 * - Lê o que o usuário escolheu na página.
 * - Chama LFM.precos.calcularFrete (do precos.js).
 * - Mostra o valor.
 *
 * Os preços não ficam aqui. Eles ficam no config.js.
 */
(function () {
  "use strict";

  // Lê o código do parceiro no link (ex.: index.html?parceiro=cliente-a)
  var codigoParceiro = new URLSearchParams(window.location.search).get("parceiro");
  var config = window.LFM.parceiro.montarConfig(window.LFM_CONFIG, window.LFM_PARCEIROS, codigoParceiro);
  var precos = window.LFM.precos;

  // Atalho: pega um elemento da página pelo id
  function el(id) { return document.getElementById(id); }

  // ---------- 1. Preenche a página com os dados do config ----------
  function montarCabecalho() {
    el("nome-empresa").textContent = config.empresa.nome;
    el("nome-cidade").textContent = config.empresa.cidade;
    document.title = "Calcule seu frete – " + config.empresa.nome;

    var logo = el("logo");
    logo.alt = "Logo " + config.empresa.nome;
    logo.onerror = function () {          // logo ainda não colocado → mostra a sigla
      logo.hidden = true;
      el("logo-reserva").hidden = false;
    };
    logo.src = config.empresa.logo;
  }

  function montarModalidades() {
    var caixa = el("opcoes-modalidade");
    var modalidades = config.dentroDaCidade.modalidades;
    var permitidas = config.modalidadesPermitidas || Object.keys(modalidades);
    // Só uma opção possível (ex.: cliente sempre avulsa) → nem mostra a escolha
    if (permitidas.length === 1) caixa.closest("fieldset").hidden = true;
    permitidas.forEach(function (chave, i) {
      var faixas = modalidades[chave].faixas;
      var label = document.createElement("label");
      label.className = "opcao";
      label.innerHTML =
        '<input type="radio" name="modalidade" value="' + chave + '"' + (i === 0 ? " checked" : "") + ">" +
        "<span></span>";
      var span = label.querySelector("span");
      span.textContent = modalidades[chave].rotulo;
      var dica = document.createElement("small");
      dica.textContent = "a partir de " +
        precos.formatarReais(Math.max(faixas[0].valor, config.valorMinimoEntrega || 0));
      span.appendChild(dica);
      caixa.appendChild(label);
    });
  }

  function montarCargaEspecial() {
    var esp = config.cargaEspecial;
    if (!esp || !esp.ativo) return;       // desligada no config → nem aparece
    var acrescimo = esp.tipo === "percentual"
      ? "+" + esp.valor + "%"
      : "+" + precos.formatarReais(esp.valor);
    el("rotulo-especial").textContent = esp.rotulo + " (" + acrescimo + ")";
    el("bloco-especial").hidden = false;
  }

  // ---------- 2. Lê o que o usuário escolheu ----------
  function valorMarcado(nome) {
    var marcado = document.querySelector('input[name="' + nome + '"]:checked');
    return marcado ? marcado.value : null;
  }

  // Aceita "4,5" ou "4.5"
  function lerKm() {
    var texto = el("km").value.trim().replace(",", ".");
    if (texto === "") return null;
    var km = Number(texto);
    return isFinite(km) && km >= 0 ? km : NaN;
  }

  // ---------- 3. Calcula e mostra ----------
  function atualizar() {
    var km = lerKm();
    var erro = el("erro");
    erro.hidden = true;

    if (km === null) { mostrarVazio(); return; }
    if (isNaN(km)) {
      mostrarVazio();
      erro.textContent = "Digite só números. Ex.: 4,5";
      erro.hidden = false;
      return;
    }

    var dentro = valorMarcado("local") === "dentro";
    var resultado = precos.calcularFrete({
      distanciaKm: km,
      dentroDaCidade: dentro,
      modalidade: valorMarcado("modalidade"),
      cargaEspecial: el("especial").checked,
    }, config);

    el("valor").textContent = precos.formatarReais(resultado.valor);
    el("detalhe").textContent =
      String(resultado.kmConsiderado).replace(".", ",") + " km" +
      (dentro ? " · dentro de " + config.dentroDaCidade.nomeCidade : " · fora da cidade (ida e volta)");
    el("resultado-vazio").hidden = true;
    el("resultado-cheio").hidden = false;
  }

  function mostrarVazio() {
    el("resultado-vazio").hidden = false;
    el("resultado-cheio").hidden = true;
  }

  // ---------- 4. Liga tudo ----------
  montarCabecalho();
  montarModalidades();
  montarCargaEspecial();

  // Recalcula a cada tecla digitada ou opção clicada
  document.querySelector(".cartao").addEventListener("input", atualizar);
  document.querySelector(".cartao").addEventListener("change", atualizar);
})();

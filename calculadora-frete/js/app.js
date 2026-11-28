/*
 * Liga a TELA às REGRAS.
 *
 * 1. A pessoa escolhe os endereços (autocompletar.js + mapas.js).
 * 2. Calculamos a rota de carro (mapas.js).
 * 3. Calculamos o preço (precos.js) e mostramos só o valor final.
 *
 * Os preços não ficam aqui. Eles ficam no config.js / parceiros.js.
 */
(function () {
  "use strict";

  // Lê o código do parceiro no link (ex.: index.html?parceiro=cliente-a)
  var codigoParceiro = new URLSearchParams(window.location.search).get("parceiro");
  var config = window.LFM.parceiro.montarConfig(window.LFM_CONFIG, window.LFM_PARCEIROS, codigoParceiro);
  var precos = window.LFM.precos;
  var mapas = window.LFM.mapas;

  // O que já foi escolhido na tela
  var estado = { retirada: null, entrega: null, rota: null };
  var calculoAtual = 0;   // evita mostrar resultado velho se a pessoa trocar o endereço no meio

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

  // ---------- 2. Endereços ----------

  // O celular lembra a última retirada (fica só no aparelho de quem usa)
  var CHAVE_SALVA = "lfm.retirada";
  function lerRetiradaSalva() {
    try { return JSON.parse(localStorage.getItem(CHAVE_SALVA)); } catch (e) { return null; }
  }
  function salvarRetirada(item) {
    try { localStorage.setItem(CHAVE_SALVA, JSON.stringify(item)); } catch (e) { /* sem problema */ }
  }

  function buscar(texto, sinal) { return mapas.buscarEnderecos(texto, config.mapas, sinal); }

  function montarEnderecos() {
    var campoRetirada = LFM.autocompletar(el("retirada"), {
      buscar: buscar,
      aoEscolher: function (item) {
        estado.retirada = item;
        if (item && config.mapas.lembrarRetirada) salvarRetirada(item);
        aoMudarEndereco();
        if (item && !estado.entrega) el("entrega").focus();
      },
    });
    LFM.autocompletar(el("entrega"), {
      buscar: buscar,
      aoEscolher: function (item) {
        estado.entrega = item;
        aoMudarEndereco();
        if (item) el("entrega").blur();   // fecha o teclado do celular para mostrar o valor
      },
    });

    var salva = config.mapas.lembrarRetirada && lerRetiradaSalva();
    if (salva && salva.lat) campoRetirada.definir(salva);
  }

  // ---------- 3. Rota ----------
  function aoMudarEndereco() {
    estado.rota = null;
    if (!estado.retirada || !estado.entrega) { mostrar("vazio"); return; }

    var meuCalculo = ++calculoAtual;
    mostrar("carregando");
    mapas.calcularRota(estado.retirada, estado.entrega, config.mapas, window.LFM_CHAVE_ROTAS)
      .then(function (rota) {
        if (meuCalculo !== calculoAtual) return;   // a pessoa já mudou o endereço
        estado.rota = rota;
        atualizarValor();
      })
      .catch(function (erro) {
        if (meuCalculo !== calculoAtual) return;
        console.error("Erro ao calcular rota:", erro);
        mostrar("erro", "Não conseguimos calcular a distância agora. Confira os endereços ou chame a LFM no WhatsApp.");
      });
  }

  // ---------- 4. Preço ----------
  function valorMarcado(nome) {
    var marcado = document.querySelector('input[name="' + nome + '"]:checked');
    return marcado ? marcado.value : null;
  }

  function atualizarValor() {
    if (!estado.rota) return;
    var nomeCidade = config.dentroDaCidade.nomeCidade;
    var dentro = mapas.mesmaCidade(estado.retirada.cidade, nomeCidade) &&
                 mapas.mesmaCidade(estado.entrega.cidade, nomeCidade);

    var resultado = precos.calcularFrete({
      distanciaKm: estado.rota.km,
      dentroDaCidade: dentro,
      modalidade: valorMarcado("modalidade"),
      cargaEspecial: el("especial").checked,
    }, config);

    el("valor").textContent = precos.formatarReais(resultado.valor);
    el("detalhe").textContent =
      String(resultado.kmConsiderado).replace(".", ",") + " km de carro · cerca de " +
      Math.max(1, Math.round(estado.rota.minutos)) + " min" +
      (dentro ? "" : " · fora de " + nomeCidade + " (ida e volta)");
    mostrar("valor");
  }

  // ---------- Mostra a parte certa do quadro de resultado ----------
  function mostrar(qual, mensagem) {
    el("resultado-vazio").hidden = !(qual === "vazio" || qual === "carregando");
    el("resultado-vazio").textContent = qual === "carregando"
      ? "Calculando a rota…"
      : "Escolha os dois endereços para ver o valor.";
    el("resultado-cheio").hidden = qual !== "valor";
    el("erro").hidden = qual !== "erro";
    if (qual === "erro") el("erro").textContent = mensagem;
  }

  // ---------- Liga tudo ----------
  montarCabecalho();
  montarModalidades();
  montarCargaEspecial();
  montarEnderecos();

  // Trocar avulsa/agrupada ou carga especial recalcula o preço (sem refazer a rota)
  document.querySelector(".cartao").addEventListener("change", function (e) {
    if (e.target.name === "modalidade" || e.target.id === "especial") atualizarValor();
  });
})();

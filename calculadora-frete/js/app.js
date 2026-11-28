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
  var whatsapp = window.LFM.whatsapp;

  // O que já foi escolhido na tela
  var estado = { retirada: null, entrega: null, rota: null, resultado: null };
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

  // O celular lembra a última retirada, com número e complemento
  // (fica só no aparelho de quem usa; nada vai para a LFM)
  var CHAVE_SALVA = "lfm.retirada";
  function lerRetiradaSalva() {
    try { return JSON.parse(localStorage.getItem(CHAVE_SALVA)); } catch (e) { return null; }
  }
  function salvarRetirada() {
    if (!config.mapas.lembrarRetirada || !estado.retirada) return;
    var item = Object.assign({}, estado.retirada, {
      numero: el("retirada-numero").value.trim(),
      complemento: el("retirada-complemento").value.trim(),
    });
    try { localStorage.setItem(CHAVE_SALVA, JSON.stringify(item)); } catch (e) { /* sem problema */ }
  }

  // Motor de mapas: Google ou gratuito (ver config.js → mapas.provedor)
  var motor = mapas.criar(config.mapas, { google: window.LFM_CHAVE_GOOGLE, ors: window.LFM_CHAVE_ROTAS });

  /*
   * Liga um campo de endereço ao motor de mapas.
   * Quando a pessoa escolhe uma sugestão, buscamos os detalhes
   * (coordenadas, número, bairro) e avisamos "aoDefinir".
   */
  function campoEndereco(id, idNumero, aoDefinir) {
    var sessao = mapas.novaSessao();
    var versao = 0;                     // ignora respostas velhas se a pessoa trocar de ideia

    return LFM.autocompletar(el(id), {
      buscar: function (texto, sinal) { return motor.buscar(texto, sinal, sessao); },
      rodape: function () { return motor.nome === "google" ? "Endereços por Google" : ""; },
      aoEscolher: function (item) {
        var minhaVersao = ++versao;
        if (!item) { aoDefinir(null); return; }
        if (item.lat != null) { aoDefinir(item); return; }   // já vem completo (motor gratuito ou endereço salvo)

        mostrar("carregando");
        motor.detalhar(item, sessao)
          .then(function (completo) {
            if (minhaVersao !== versao) return;
            sessao = mapas.novaSessao();                        // próxima busca = nova sessão
            if (completo.numero) el(idNumero).value = completo.numero;
            aoDefinir(completo);
          })
          .catch(function (erro) {
            if (minhaVersao !== versao) return;
            console.error("Erro ao detalhar endereço:", erro);
            mostrar("erro", erro.digitarDeNovo
              ? "Não conseguimos localizar esse endereço. Apague e digite de novo, por favor."
              : "Não conseguimos localizar esse endereço agora. Tente de novo ou chame a LFM no WhatsApp.");
          });
      },
    });
  }

  function montarEnderecos() {
    var campoRetirada = campoEndereco("retirada", "retirada-numero", function (item) {
      estado.retirada = item;
      salvarRetirada();
      aoMudarEndereco();
      if (item && !el("retirada-numero").value) el("retirada-numero").focus();   // próximo passo: o número
    });
    campoEndereco("entrega", "entrega-numero", function (item) {
      estado.entrega = item;
      aoMudarEndereco();
      if (item && !el("entrega-numero").value) el("entrega-numero").focus();
    });

    var salva = config.mapas.lembrarRetirada && lerRetiradaSalva();
    if (salva && salva.lat) {
      el("retirada-numero").value = salva.numero || "";
      el("retirada-complemento").value = salva.complemento || "";
      campoRetirada.definir(salva);
    }

    // Número e complemento da retirada também ficam lembrados
    ["retirada-numero", "retirada-complemento"].forEach(function (id) {
      el(id).addEventListener("input", salvarRetirada);
    });
  }

  // ---------- 3. Rota ----------
  function aoMudarEndereco() {
    estado.rota = null;
    if (!estado.retirada || !estado.entrega) { mostrar("vazio"); return; }

    var meuCalculo = ++calculoAtual;
    mostrar("carregando");
    motor.rota(estado.retirada, estado.entrega)
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

    estado.resultado = resultado;
    estado.dentro = dentro;
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
    if (qual !== "valor") estado.resultado = null;
    el("agendar").hidden = qual !== "valor";
    atualizarBotao();
  }

  // ---------- 5. Agendar pelo WhatsApp ----------
  var obrigatorios = [
    { id: "retirada-numero", nome: "o número da retirada" },
    { id: "entrega-numero",  nome: "o número da entrega" },
  ];

  function camposFaltando() {
    return obrigatorios.filter(function (c) { return !el(c.id).value.trim(); });
  }

  function atualizarBotao() {
    var botao = el("botao-whatsapp");
    if (!estado.resultado) { botao.setAttribute("aria-disabled", "true"); botao.href = "#"; return; }

    var faltando = camposFaltando();
    obrigatorios.forEach(function (c) {           // tira o vermelho de quem já foi preenchido
      if (el(c.id).value.trim()) el(c.id).classList.remove("faltando");
    });
    if (!faltando.length) el("aviso-falta").hidden = true;
    botao.setAttribute("aria-disabled", faltando.length ? "true" : "false");

    var modalidade = valorMarcado("modalidade");
    var texto = whatsapp.montarMensagem({
      retirada: Object.assign({}, estado.retirada, {
        numero: el("retirada-numero").value.trim(),
        complemento: el("retirada-complemento").value.trim(),
      }),
      entrega: Object.assign({}, estado.entrega, {
        numero: el("entrega-numero").value.trim(),
        complemento: el("entrega-complemento").value.trim(),
      }),
      km: estado.resultado.kmConsiderado,
      valorTexto: precos.formatarReais(estado.resultado.valor),
      modalidadeRotulo: estado.dentro ? config.dentroDaCidade.modalidades[modalidade].rotulo : "",
      cargaEspecial: el("especial").checked,
      parceiro: config.parceiroNome || null,
      data: el("data").value,
      horario: el("horario").value,
      oQue: el("oque").value.trim(),
    }, config);
    botao.href = whatsapp.linkWhatsApp(config.empresa.whatsapp, texto);
  }

  function aoClicarWhatsApp(e) {
    if (!estado.resultado) { e.preventDefault(); return; }
    var faltando = camposFaltando();
    if (!faltando.length) return;                 // tudo certo: o link abre o WhatsApp
    e.preventDefault();
    faltando.forEach(function (c) { el(c.id).classList.add("faltando"); });
    el("aviso-falta").textContent = "Falta preencher " + faltando.map(function (c) { return c.nome; }).join(" e ") + ".";
    el("aviso-falta").hidden = false;
    el(faltando[0].id).focus();
  }

  function montarAgendar() {
    // Não deixa escolher data no passado
    var hoje = new Date();
    hoje.setMinutes(hoje.getMinutes() - hoje.getTimezoneOffset());
    el("data").min = hoje.toISOString().slice(0, 10);

    el("botao-whatsapp").addEventListener("click", aoClicarWhatsApp);
    ["retirada-numero", "retirada-complemento", "entrega-numero", "entrega-complemento", "data", "horario", "oque"]
      .forEach(function (id) {
        el(id).addEventListener("input", atualizarBotao);
        el(id).addEventListener("change", atualizarBotao);
      });
  }

  // ---------- Liga tudo ----------
  montarCabecalho();
  montarModalidades();
  montarCargaEspecial();
  montarAgendar();
  montarEnderecos();

  // Trocar avulsa/agrupada ou carga especial recalcula o preço (sem refazer a rota)
  document.querySelector(".cartao").addEventListener("change", function (e) {
    if (e.target.name === "modalidade" || e.target.id === "especial") atualizarValor();
  });
})();

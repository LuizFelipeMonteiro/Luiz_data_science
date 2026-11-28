/*
 * Liga a TELA às REGRAS.
 *
 * 1. A pessoa escolhe a retirada e UMA OU VÁRIAS entregas (autocompletar.js + mapas.js).
 * 2. Calculamos a rota de carro da retirada até cada entrega (mapas.js).
 * 3. Calculamos o preço (precos.js): 1 entrega = avulsa; 2 ou mais = agrupada.
 * 4. Montamos a mensagem do WhatsApp (whatsapp.js).
 *
 * Os preços não ficam aqui. Eles ficam no config.js / parceiros.js.
 */
(function () {
  "use strict";

  function el(id) { return document.getElementById(id); }

  // ---------- 0. Se o config.js ou o parceiros.js tiver erro de digitação ----------
  // (ex.: vírgula no lugar de ponto), o arquivo não carrega. Em vez de uma
  // página "morta", mostramos um aviso claro.
  if (!window.LFM_CONFIG || !window.LFM_PARCEIROS) {
    var cartao = document.querySelector(".cartao");
    cartao.innerHTML =
      "<h2>Calculadora indisponível no momento</h2>" +
      "<p>Por favor, chame a LFM Transportes no WhatsApp.</p>" +
      '<p class="dica">Aviso técnico: há um erro de digitação no ' +
      (!window.LFM_CONFIG ? "config.js" : "parceiros.js") +
      " (confira vírgulas, pontos e aspas). Abra o testes.html para ver detalhes.</p>";
    console.error("config.js ou parceiros.js não carregou – provável erro de digitação.");
    return;
  }

  // Lê o código do parceiro no link (ex.: index.html?parceiro=cliente-a)
  var codigoParceiro = new URLSearchParams(window.location.search).get("parceiro");
  var config = window.LFM.parceiro.montarConfig(window.LFM_CONFIG, window.LFM_PARCEIROS, codigoParceiro);
  var precos = window.LFM.precos;
  var mapas = window.LFM.mapas;
  var whatsapp = window.LFM.whatsapp;
  var nomeCidade = config.dentroDaCidade.nomeCidade;

  // O que já foi escolhido na tela
  var estado = {
    retirada: null,   // endereço de retirada escolhido
    entregas: [],     // cada bloco de entrega: { item, rota, erro, versaoRota, el: {...} }
    prontas: [],      // entregas com endereço e rota usadas no último cálculo (na ordem da tela)
    pedido: null,     // resultado de precos.calcularPedido
  };
  var proximoId = 1;

  function kmTexto(km) { return String(km).replace(".", ","); }
  function juntar(lista) {          // ["a", "b", "c"] → "a, b e c"
    return lista.length <= 1 ? lista.join("") : lista.slice(0, -1).join(", ") + " e " + lista[lista.length - 1];
  }
  function dentroDaCidade(endereco) { return mapas.mesmaCidade(endereco.cidade, nomeCidade); }

  // Leva o cursor para o campo "Nº" só se a pessoa ainda estiver no campo do endereço.
  // (Se ela já foi digitar outra coisa enquanto o endereço carregava, não "rouba" o cursor.)
  function irParaNumero(inputEndereco, inputNumero) {
    var ativo = document.activeElement;
    if (!inputNumero.value && (ativo === inputEndereco || ativo === document.body || !ativo)) inputNumero.focus();
  }

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

  function montarCargaEspecial() {
    var esp = config.cargaEspecial;
    if (!esp || !esp.ativo) return;       // desligada no config → nem aparece
    var acrescimo = esp.tipo === "percentual"
      ? "+" + esp.valor + "%"
      : "+" + precos.formatarReais(esp.valor);
    el("rotulo-especial").textContent = esp.rotulo + " (" + acrescimo + ")";
    el("bloco-especial").hidden = false;
  }

  function montarDicaEntregas() {
    el("dica-entregas").textContent = precos.podeAgrupar(config)
      ? "Várias entregas saindo da mesma retirada? A partir de 2, cada uma sai pela tabela agrupada, mais barata."
      : "Cada entrega é calculada separadamente.";
  }

  // ---------- 2. Campo de endereço (serve para a retirada e para cada entrega) ----------

  // Motor de mapas: Google ou gratuito (ver config.js → mapas.provedor)
  var motor = mapas.criar(config.mapas, { google: window.LFM_CHAVE_GOOGLE, ors: window.LFM_CHAVE_ROTAS });

  /*
   * Liga um campo de endereço ao motor de mapas.
   * Quando a pessoa escolhe uma sugestão, buscamos os detalhes
   * (coordenadas, número, bairro) e avisamos "aoDefinir(item, restaurado)".
   */
  function campoEndereco(input, inputNumero, aoDefinir) {
    var sessao = mapas.novaSessao();
    var versao = 0;                     // ignora respostas velhas se a pessoa trocar de ideia
    var restaurando = false;

    // Endereço novo escolhido: o número vem DELE (ou fica vazio para a pessoa digitar).
    // Nunca reaproveita o número do endereço anterior.
    function usar(completo) {
      completo.obtidoEm = Date.now();
      inputNumero.value = completo.numero || "";
      aoDefinir(completo, false);
    }

    var campo = LFM.autocompletar(input, {
      buscar: function (texto, sinal) { return motor.buscar(texto, sinal, sessao); },
      // crédito obrigatório de quem fornece os endereços
      rodape: function () { return motor.nome === "google" ? "Google Maps" : "© OpenStreetMap"; },
      aoEscolher: function (item) {
        var minhaVersao = ++versao;
        if (!item) { aoDefinir(null, false); return; }
        if (restaurando) { aoDefinir(item, true); return; }   // endereço lembrado pelo celular
        if (item.lat != null) { usar(item); return; }        // motor gratuito: já vem completo

        mostrar("carregando");
        motor.detalhar(item, sessao)
          .then(function (completo) {
            if (minhaVersao !== versao) return;
            sessao = mapas.novaSessao();                       // próxima busca = nova sessão
            usar(completo);
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

    return {
      restaurar: function (item) { restaurando = true; campo.definir(item); restaurando = false; },
    };
  }

  // ---------- 3. Retirada ----------

  // O celular lembra a última retirada, com número e complemento.
  // Fica só no aparelho de quem usa (nada vai para a LFM), separado por
  // cliente parceiro, e vale por 30 dias (regra do Google para guardar
  // coordenadas; depois disso a pessoa digita o endereço de novo).
  var CHAVE_SALVA = "lfm.retirada." + (config.parceiroAtivo || "geral");
  var VALIDADE_MS = 30 * 24 * 60 * 60 * 1000;
  try { localStorage.removeItem("lfm.retirada"); } catch (e) { /* formato antigo */ }

  function lerRetiradaSalva() {
    try {
      var s = JSON.parse(localStorage.getItem(CHAVE_SALVA));
      if (!s || !s.item || s.item.lat == null) return null;
      if (!(Date.now() - (s.item.obtidoEm || 0) < VALIDADE_MS)) {
        localStorage.removeItem(CHAVE_SALVA);
        return null;
      }
      return s;
    } catch (e) { return null; }
  }

  function salvarRetirada() {
    if (!config.mapas.lembrarRetirada || !estado.retirada) return;
    var dados = {
      item: estado.retirada,
      numero: el("retirada-numero").value.trim(),
      complemento: el("retirada-complemento").value.trim(),
    };
    try { localStorage.setItem(CHAVE_SALVA, JSON.stringify(dados)); } catch (e) { /* sem problema */ }
  }

  function montarRetirada() {
    var campo = campoEndereco(el("retirada"), el("retirada-numero"), function (item, restaurado) {
      estado.retirada = item;
      if (!restaurado) salvarRetirada();
      estado.entregas.forEach(calcularRota);        // retirada nova → refaz a distância de cada entrega
      recalcular();
      if (item && !restaurado) irParaNumero(el("retirada"), el("retirada-numero"));   // próximo passo: o número
    });

    var salva = config.mapas.lembrarRetirada && lerRetiradaSalva();
    if (salva) {
      el("retirada-numero").value = salva.numero || "";
      el("retirada-complemento").value = salva.complemento || "";
      campo.restaurar(salva.item);
    }

    // Número e complemento da retirada também ficam lembrados
    ["retirada-numero", "retirada-complemento"].forEach(function (id) {
      el(id).addEventListener("input", salvarRetirada);
    });
  }

  // ---------- 4. Entregas (uma ou várias) ----------

  function adicionarEntrega(focar) {
    if (estado.entregas.length >= config.maxEntregas) return;
    var id = "entrega-" + proximoId++;
    var bloco = el("modelo-entrega").content.firstElementChild.cloneNode(true);
    var e = {
      item: null, rota: null, erro: false, versaoRota: 0,
      el: {
        bloco: bloco,
        titulo: bloco.querySelector(".titulo-entrega"),
        remover: bloco.querySelector(".remover-entrega"),
        endereco: bloco.querySelector(".endereco"),
        numero: bloco.querySelector(".numero"),
        complemento: bloco.querySelector(".complemento"),
      },
    };
    e.el.endereco.id = id;
    e.el.numero.id = id + "-numero";
    e.el.complemento.id = id + "-complemento";
    e.el.titulo.htmlFor = id;
    el("lista-entregas").appendChild(bloco);
    estado.entregas.push(e);

    campoEndereco(e.el.endereco, e.el.numero, function (item) {
      e.item = item;
      calcularRota(e);
      if (item) irParaNumero(e.el.endereco, e.el.numero);
    });
    e.el.remover.addEventListener("click", function () { removerEntrega(e); });
    [e.el.numero, e.el.complemento].forEach(function (campo) {
      campo.addEventListener("input", atualizarBotao);
    });

    organizarEntregas();
    if (focar) e.el.endereco.focus();
    return e;
  }

  function removerEntrega(e) {
    e.versaoRota++;                                   // ignora uma rota que ainda esteja chegando
    e.el.bloco.remove();
    estado.entregas = estado.entregas.filter(function (x) { return x !== e; });
    if (!estado.entregas.length) adicionarEntrega(false);   // sempre fica pelo menos uma
    organizarEntregas();
    recalcular();
  }

  // Numera os blocos ("Entrega 1", "Entrega 2"…) e mostra os botões certos
  function organizarEntregas() {
    var varias = estado.entregas.length > 1;
    estado.entregas.forEach(function (e, i) {
      e.el.titulo.textContent = varias ? "Entrega " + (i + 1) : "Entrega";
      e.el.remover.hidden = !varias;
      e.el.remover.setAttribute("aria-label", "Remover entrega " + (i + 1));
    });
    el("adicionar-entrega").hidden = estado.entregas.length >= config.maxEntregas;
  }

  // Distância de carro da retirada até UMA entrega
  function calcularRota(e) {
    var minhaVersao = ++e.versaoRota;
    e.rota = null;
    e.erro = false;
    if (!estado.retirada || !e.item) { recalcular(); return; }

    recalcular();                                     // mostra "Calculando…"
    motor.rota(estado.retirada, e.item)
      .then(function (rota) {
        if (minhaVersao !== e.versaoRota) return;     // a pessoa já mudou o endereço
        e.rota = rota;
        recalcular();
      })
      .catch(function (erro) {
        if (minhaVersao !== e.versaoRota) return;
        console.error("Erro ao calcular rota:", erro);
        e.erro = true;
        recalcular();
      });
  }

  // ---------- 5. Preço ----------
  function recalcular() {
    var comEndereco = estado.entregas.filter(function (e) { return e.item; });
    if (!estado.retirada || !comEndereco.length) { mostrar("vazio"); return; }
    if (comEndereco.some(function (e) { return e.erro; })) {
      mostrar("erro", "Não conseguimos calcular a distância agora. Confira os endereços ou chame a LFM no WhatsApp.");
      return;
    }
    if (comEndereco.some(function (e) { return !e.rota; })) { mostrar("carregando"); return; }

    var retiradaDentro = dentroDaCidade(estado.retirada);
    estado.prontas = comEndereco;
    estado.pedido = precos.calcularPedido({
      entregas: comEndereco.map(function (e) {
        return { distanciaKm: e.rota.km, dentroDaCidade: retiradaDentro && dentroDaCidade(e.item) };
      }),
      cargaEspecial: el("especial").checked,
    }, config);
    desenharResultado();
    mostrar("valor");
  }

  function desenharResultado() {
    var p = estado.pedido, prontas = estado.prontas;
    var lista = el("lista-valores");
    lista.innerHTML = "";
    el("valor").textContent = precos.formatarReais(p.total);

    if (prontas.length === 1) {
      var item = p.itens[0];
      el("resultado-rotulo").textContent = "Valor da entrega";
      el("detalhe").textContent = kmTexto(item.kmConsiderado) + " km de carro · cerca de " +
        Math.max(1, Math.round(prontas[0].rota.minutos)) + " min" +
        (item.dentroDaCidade ? "" : " · fora de " + nomeCidade + " (ida e volta)");
      lista.hidden = true;
      return;
    }

    el("resultado-rotulo").textContent = "Valor total (" + prontas.length + " entregas)";
    el("detalhe").textContent = p.modalidade === "agrupada"
      ? "Entregas no mesmo trajeto: tabela agrupada para cada uma"
      : "Cada entrega calculada separadamente";
    p.itens.forEach(function (item, i) {
      var li = document.createElement("li");
      var desc = document.createElement("span");
      desc.textContent = "Entrega " + (estado.entregas.indexOf(prontas[i]) + 1) + " · " +
        kmTexto(item.kmConsiderado) + " km" + (item.dentroDaCidade ? "" : " · fora da cidade");
      var valor = document.createElement("span");
      valor.textContent = precos.formatarReais(item.valor);
      li.appendChild(desc);
      li.appendChild(valor);
      lista.appendChild(li);
    });
    lista.hidden = false;
  }

  // ---------- Mostra a parte certa do quadro de resultado ----------
  function mostrar(qual, mensagem) {
    el("resultado-vazio").hidden = !(qual === "vazio" || qual === "carregando");
    el("resultado-vazio").textContent = qual === "carregando"
      ? "Calculando a rota…"
      : "Escolha a retirada e a entrega para ver o valor.";
    el("resultado-cheio").hidden = qual !== "valor";
    el("erro").hidden = qual !== "erro";
    if (qual === "erro") el("erro").textContent = mensagem;
    if (qual !== "valor") estado.pedido = null;
    el("agendar").hidden = qual !== "valor";
    atualizarBotao();
  }

  // ---------- 6. Agendar pelo WhatsApp ----------

  // O que ainda falta preencher: [{ campo, nome }]
  function camposFaltando() {
    var faltando = [];
    if (!el("retirada-numero").value.trim()) faltando.push({ campo: el("retirada-numero"), nome: "o número da retirada" });
    var varias = estado.entregas.length > 1;
    estado.entregas.forEach(function (e, i) {
      var qual = varias ? " da entrega " + (i + 1) : " da entrega";
      if (!e.item) faltando.push({ campo: e.el.endereco, nome: "o endereço" + qual + (varias ? " (ou remova)" : "") });
      else if (!e.el.numero.value.trim()) faltando.push({ campo: e.el.numero, nome: "o número" + qual });
    });
    return faltando;
  }

  function camposObrigatorios() {
    var lista = [el("retirada-numero")];
    estado.entregas.forEach(function (e) { lista.push(e.el.endereco, e.el.numero); });
    return lista;
  }

  // Texto do tipo de entrega que vai na mensagem
  function tipoParaMensagem() {
    var p = estado.pedido, n = p.itens.length;
    if (n === 1) return p.itens[0].dentroDaCidade ? "entrega avulsa" : "fora de " + nomeCidade + ", ida e volta";
    return n + (p.modalidade === "agrupada" ? " entregas agrupadas" : " entregas avulsas");
  }

  function atualizarBotao() {
    var botao = el("botao-whatsapp");
    var faltando = camposFaltando();
    camposObrigatorios().forEach(function (c) {      // tira o vermelho de quem já foi preenchido
      if (faltando.every(function (f) { return f.campo !== c; })) c.classList.remove("faltando");
    });
    if (!faltando.length) el("aviso-falta").hidden = true;

    if (!estado.pedido) { botao.setAttribute("aria-disabled", "true"); botao.href = "#"; return; }
    botao.setAttribute("aria-disabled", faltando.length ? "true" : "false");

    var p = estado.pedido;
    var texto = whatsapp.montarMensagem({
      retirada: Object.assign({}, estado.retirada, {
        numero: el("retirada-numero").value.trim(),
        complemento: el("retirada-complemento").value.trim(),
      }),
      entregas: estado.prontas.map(function (e, i) {
        var item = p.itens[i];
        return Object.assign({}, e.item, {
          numero: e.el.numero.value.trim(),
          complemento: e.el.complemento.value.trim(),
          km: item.kmConsiderado,
          valorTexto: precos.formatarReais(item.valor),
          obs: item.dentroDaCidade ? "" : "fora de " + nomeCidade + ", ida e volta",
        });
      }),
      totalTexto: precos.formatarReais(p.total),
      tipo: tipoParaMensagem(),
      cargaEspecial: el("especial").checked,
      parceiro: config.parceiroNome || null,
      data: el("data").value,
      horario: el("horario").value,
      oQue: el("oque").value.trim(),
    }, config);
    botao.href = whatsapp.linkWhatsApp(config.empresa.whatsapp, texto);
  }

  function aoClicarWhatsApp(ev) {
    if (!estado.pedido) { ev.preventDefault(); return; }
    var faltando = camposFaltando();
    if (!faltando.length) return;                 // tudo certo: o link abre o WhatsApp
    ev.preventDefault();
    faltando.forEach(function (f) { f.campo.classList.add("faltando"); });
    el("aviso-falta").textContent = "Falta preencher " + juntar(faltando.map(function (f) { return f.nome; })) + ".";
    el("aviso-falta").hidden = false;
    faltando[0].campo.focus();
  }

  function montarAgendar() {
    // Não deixa escolher data no passado
    var hoje = new Date();
    hoje.setMinutes(hoje.getMinutes() - hoje.getTimezoneOffset());
    el("data").min = hoje.toISOString().slice(0, 10);

    el("botao-whatsapp").addEventListener("click", aoClicarWhatsApp);
    ["retirada-numero", "retirada-complemento", "data", "horario", "oque"].forEach(function (id) {
      el(id).addEventListener("input", atualizarBotao);
      el(id).addEventListener("change", atualizarBotao);
    });
  }

  // ---------- Liga tudo ----------
  montarCabecalho();
  montarCargaEspecial();
  montarDicaEntregas();
  montarAgendar();
  adicionarEntrega(false);          // começa com uma entrega
  montarRetirada();                 // depois das entregas: a retirada lembrada já pode calcular
  el("adicionar-entrega").addEventListener("click", function () { adicionarEntrega(true); });
  el("especial").addEventListener("change", recalcular);   // carga especial muda o preço, não a rota
})();

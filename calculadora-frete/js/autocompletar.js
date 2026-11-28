/*
 * Campo de endereço com sugestões enquanto a pessoa digita.
 *
 * Uso: LFM.autocompletar(campoInput, { buscar: fn(texto, sinal), aoEscolher: fn(item|null) })
 * Reaproveitável depois no agendamento.
 */
(function (global) {
  "use strict";

  function autocompletar(input, opcoes) {
    var espera = opcoes.esperaMs || 350;
    var minimo = opcoes.minimoLetras || 3;

    var lista = document.createElement("ul");
    lista.className = "sugestoes";
    lista.setAttribute("role", "listbox");
    lista.id = input.id + "-sugestoes";
    lista.hidden = true;
    input.parentNode.appendChild(lista);
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", lista.id);
    input.setAttribute("aria-expanded", "false");

    var itens = [], ativo = -1, timer = null, controle = null, escolhido = null;

    function fechar() {
      lista.hidden = true;
      input.setAttribute("aria-expanded", "false");
      ativo = -1;
    }

    function mostrarMensagem(texto) {
      lista.innerHTML = "";
      var li = document.createElement("li");
      li.className = "sugestao-aviso";
      li.textContent = texto;
      lista.appendChild(li);
      lista.hidden = false;
    }

    function desenhar() {
      lista.innerHTML = "";
      if (!itens.length) { mostrarMensagem("Nenhum endereço encontrado. Tente só o nome da rua."); return; }
      itens.forEach(function (item, i) {
        var li = document.createElement("li");
        li.className = "sugestao" + (i === ativo ? " ativa" : "");
        li.setAttribute("role", "option");
        var t = document.createElement("strong"); t.textContent = item.titulo;
        var s = document.createElement("span"); s.textContent = item.subtitulo;
        li.appendChild(t); li.appendChild(s);
        // mousedown (e não click) para escolher antes do campo perder o foco
        li.addEventListener("mousedown", function (e) { e.preventDefault(); escolher(i); });
        lista.appendChild(li);
      });
      if (opcoes.rodape) {                 // crédito exigido pelo provedor (ex.: Google)
        var rod = document.createElement("li");
        rod.className = "sugestao-rodape";
        rod.textContent = opcoes.rodape;
        lista.appendChild(rod);
      }
      lista.hidden = false;
      input.setAttribute("aria-expanded", "true");
    }

    function escolher(i) {
      escolhido = itens[i];
      input.value = escolhido.titulo + (escolhido.subtitulo ? " – " + escolhido.subtitulo : "");
      fechar();
      opcoes.aoEscolher(escolhido);
    }

    input.addEventListener("input", function () {
      if (escolhido) { escolhido = null; opcoes.aoEscolher(null); }   // mexeu no texto → desfaz escolha
      clearTimeout(timer);
      var texto = input.value.trim();
      if (texto.length < minimo) { fechar(); return; }
      timer = setTimeout(function () {
        if (controle) controle.abort();          // cancela busca anterior ainda em andamento
        controle = new AbortController();
        mostrarMensagem("Buscando…");
        opcoes.buscar(texto, controle.signal)
          .then(function (res) { itens = res; ativo = -1; desenhar(); })
          .catch(function (e) {
            if (e.name !== "AbortError") mostrarMensagem("Não foi possível buscar agora. Verifique a internet.");
          });
      }, espera);
    });

    input.addEventListener("keydown", function (e) {
      if (lista.hidden || !itens.length) return;
      if (e.key === "ArrowDown") { ativo = (ativo + 1) % itens.length; desenhar(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { ativo = (ativo - 1 + itens.length) % itens.length; desenhar(); e.preventDefault(); }
      else if (e.key === "Enter" && ativo >= 0) { escolher(ativo); e.preventDefault(); }
      else if (e.key === "Escape") { fechar(); }
    });

    input.addEventListener("blur", function () { setTimeout(fechar, 150); });

    return {
      // Preenche o campo com um endereço já conhecido (ex.: retirada salva no celular)
      definir: function (item) {
        escolhido = item;
        input.value = item.titulo + (item.subtitulo ? " – " + item.subtitulo : "");
        opcoes.aoEscolher(item);
      },
    };
  }

  global.LFM = global.LFM || {};
  global.LFM.autocompletar = autocompletar;
})(typeof window !== "undefined" ? window : globalThis);

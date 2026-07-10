let todosDados = [];
let dados = [];
let selecionada = null;
let zoom = 1;

const estruturas = Array.isArray(CONFIG.STRUCTURES) && CONFIG.STRUCTURES.length
  ? CONFIG.STRUCTURES
  : [{ id: "bloco-1", nome: "Bloco 1" }];
const estruturaPadrao = CONFIG.DEFAULT_STRUCTURE || estruturas[0].id;
let estruturaAtual = estruturaPadrao;

const lockPanel = document.getElementById("lockPanel");
const execPanel = document.getElementById("execPanel");
const selEstrutura = document.getElementById("selEstrutura");
const selEstaca = document.getElementById("selEstaca");
const planta = document.getElementById("planta");
const mapa = document.getElementById("mapa");
const viewport = document.getElementById("viewport");
const markers = document.getElementById("markers");
const execMapCard = document.getElementById("execMapCard");
const btnToggleMapa = document.getElementById("btnToggleMapa");

function apiUrl(action, params = {}) {
  const url = new URL(CONFIG.API_URL);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v ?? ""));
  return url.toString();
}

async function api(action, params = {}) {
  const res = await fetch(apiUrl(action, params));
  if (!res.ok) throw new Error("Falha na API");
  const data = await res.json();
  if (data.erro) throw new Error(data.erro);
  return data;
}

function acessoLiberado() {
  return !CONFIG.EXECUTION_PIN || sessionStorage.getItem("pcdf-exec-pin") === CONFIG.EXECUTION_PIN;
}

function liberarAcesso() {
  lockPanel.classList.add("hidden");
  execPanel.classList.remove("hidden");
  carregar();
}

document.getElementById("btnEntrar").onclick = () => {
  const pin = document.getElementById("pinInput").value.trim();
  if (pin !== CONFIG.EXECUTION_PIN) {
    setText("lockMsg", "PIN invalido.");
    return;
  }
  sessionStorage.setItem("pcdf-exec-pin", pin);
  liberarAcesso();
};

document.getElementById("pinInput").addEventListener("keydown", ev => {
  if (ev.key === "Enter") document.getElementById("btnEntrar").click();
});

async function carregar() {
  msg("Carregando estacas...");
  montarEstruturas();

  try {
    const resp = await api("dados");
    todosDados = resp.dados || [];
    setText("syncStatus", "Online");
    trocarEstrutura(estruturaAtual, false);
    msg("Dados carregados.");
  } catch (err) {
    setText("syncStatus", "Erro");
    msg("Erro ao carregar: " + err.message);
  }
}

function montarEstruturas() {
  selEstrutura.innerHTML = "";
  estruturas.forEach(estrutura => {
    const opt = document.createElement("option");
    opt.value = estrutura.id;
    opt.textContent = estrutura.nome;
    selEstrutura.appendChild(opt);
  });
  selEstrutura.value = estruturaAtual;
}

function trocarEstrutura(id, manterSelecao = true) {
  estruturaAtual = estruturaValida(id);
  selEstrutura.value = estruturaAtual;
  const estrutura = estruturaConfig(estruturaAtual);
  planta.src = estrutura.planImageUrl || CONFIG.PLAN_IMAGE_URL;
  zoom = zoomPadraoEstrutura();
  aplicarZoom();
  viewport.scrollLeft = 0;
  viewport.scrollTop = 0;

  dados = todosDados
    .filter(e => estruturaDoItem(e) === estruturaAtual)
    .sort((a, b) => String(a.estaca).localeCompare(String(b.estaca), "pt-BR", { numeric: true }));

  montarLista();
  const atual = manterSelecao ? dados.find(e => e.estaca === selecionada?.estaca) : null;
  mostrar(atual || dados[0]);
  desenharMapa();
}

function montarLista() {
  selEstaca.innerHTML = "";
  dados.forEach(e => {
    const opt = document.createElement("option");
    opt.value = e.estaca;
    opt.textContent = `${e.estaca} - ${e.bloco || ""} - ${e.status || "Pendente"}`;
    selEstaca.appendChild(opt);
  });
}

function mostrar(e) {
  selecionada = e || null;
  if (!selecionada) {
    ["execEstaca", "execBloco", "execDiametro", "execStatusAtual"].forEach(id => setText(id, "-"));
    desenharMapa();
    return;
  }

  selEstaca.value = selecionada.estaca;
  setText("execEstaca", selecionada.estaca);
  setText("execBloco", selecionada.bloco || "-");
  setText("execDiametro", selecionada.diametro ? `O ${selecionada.diametro}` : "-");
  setText("execStatusAtual", selecionada.status || "Pendente");

  document.getElementById("statusInput").value = selecionada.status || "Pendente";
  document.getElementById("furacaoInput").value = dataParaInput(selecionada.dataFuracao);
  document.getElementById("concretagemInput").value = dataParaInput(selecionada.dataConcretagem);
  document.getElementById("volumeInput").value = numeroParaInput(selecionada.volumeUtilizado);
  document.getElementById("obsInput").value = selecionada.observacoes || "";
  desenharMapa();
}

function desenharMapa() {
  markers.innerHTML = "";
  dados.forEach(e => {
    if (e.x === "" || e.y === "" || e.x == null || e.y == null) return;
    const div = document.createElement("button");
    div.type = "button";
    div.className = `marker ${classeStatus(e.status)}${selecionada?.estaca === e.estaca ? " selected" : ""}`;
    div.style.left = `${Number(e.x)}px`;
    div.style.top = `${Number(e.y)}px`;
    div.title = `${e.estaca} - ${e.status || "Pendente"}`;
    div.onclick = ev => {
      ev.stopPropagation();
      mostrar(e);
      msg(`Estaca selecionada no mapa: ${e.estaca}.`);
      document.querySelector(".exec-selected").scrollIntoView({ behavior: "smooth", block: "start" });
    };
    markers.appendChild(div);
  });
}

document.getElementById("btnFuradaHoje").onclick = () => {
  if (!selecionada) return;
  const hoje = hojeInput();
  document.getElementById("furacaoInput").value = hoje;
  if (document.getElementById("statusInput").value !== "Concretada") {
    document.getElementById("statusInput").value = "Furada";
  }
  msg("Furacao preenchida com a data de hoje.");
};

document.getElementById("btnConcretadaHoje").onclick = () => {
  if (!selecionada) return;
  const hoje = hojeInput();
  if (!document.getElementById("furacaoInput").value) {
    document.getElementById("furacaoInput").value = hoje;
  }
  document.getElementById("concretagemInput").value = hoje;
  document.getElementById("statusInput").value = "Concretada";
  msg("Concretagem preenchida com a data de hoje.");
};

document.getElementById("btnSalvar").onclick = async () => {
  if (!selecionada) return;

  const botao = document.getElementById("btnSalvar");
  botao.disabled = true;
  msg("Salvando execucao...");

  const payload = {
    edificacao: estruturaNome(estruturaAtual),
    estrutura: estruturaNome(estruturaAtual),
    estaca: selecionada.estaca,
    bloco: selecionada.bloco || "",
    diametro: selecionada.diametro || "",
    comprimento: selecionada.comprimento || "",
    volumePrevisto: selecionada.volumePrevisto || "",
    dataFuracao: inputParaData(document.getElementById("furacaoInput").value),
    dataConcretagem: inputParaData(document.getElementById("concretagemInput").value),
    volumeUtilizado: document.getElementById("volumeInput").value,
    status: document.getElementById("statusInput").value,
    observacoes: document.getElementById("obsInput").value
  };

  try {
    await api("salvarEstaca", payload);
    Object.assign(selecionada, {
      dataFuracao: payload.dataFuracao,
      dataConcretagem: payload.dataConcretagem,
      volumeUtilizado: payload.volumeUtilizado,
      status: payload.status,
      observacoes: payload.observacoes
    });
    montarLista();
    mostrar(selecionada);
    desenharMapa();
    msg(`Execucao salva: ${selecionada.estaca}.`);
  } catch (err) {
    msg("Erro ao salvar: " + err.message);
  } finally {
    botao.disabled = false;
  }
};

document.getElementById("btnRecarregar").onclick = carregar;
selEstrutura.onchange = () => trocarEstrutura(selEstrutura.value, false);
selEstaca.onchange = () => mostrar(dados.find(e => e.estaca === selEstaca.value));
btnToggleMapa.onclick = () => {
  const aberto = execMapCard.classList.toggle("hidden") === false;
  btnToggleMapa.textContent = aberto ? "Ocultar mapa" : "Selecionar no mapa";
  if (aberto) {
    setTimeout(() => {
      aplicarZoom();
      execMapCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }
};
document.getElementById("btnMais").onclick = () => { zoom = Math.min(3, zoom + .15); aplicarZoom(); };
document.getElementById("btnMenos").onclick = () => { zoom = Math.max(.1, zoom - .15); aplicarZoom(); };
document.getElementById("btnReset").onclick = () => { zoom = zoomPadraoEstrutura(); aplicarZoom(); };

function estruturaConfig(id) {
  return estruturas.find(e => e.id === id) || estruturas[0];
}

function estruturaNome(id) {
  return estruturaConfig(id).nome;
}

function zoomPadraoEstrutura() {
  const z = Number(estruturaConfig(estruturaAtual).defaultZoom);
  const base = Number.isFinite(z) && z > 0 ? z : 1;
  if (window.matchMedia("(max-width: 560px)").matches) {
    return Math.max(.1, Math.min(base, base * .55));
  }
  return base;
}

function aplicarZoom() {
  mapa.style.transform = `scale(${zoom})`;
  setText("btnReset", `${Math.round(zoom * 100)}%`);
}

function estruturaValida(id) {
  return estruturas.some(e => e.id === id) ? id : estruturaPadrao;
}

function estruturaDoItem(item) {
  return normalizarEstrutura(item.edificacao || item.estrutura || item.setor || item.local || item.obra || estruturaNome(estruturaPadrao));
}

function normalizarEstrutura(valor) {
  const texto = normalizarTexto(valor);
  const match = estruturas.find(e => normalizarTexto(e.id) === texto || normalizarTexto(e.nome) === texto);
  return match ? match.id : texto || estruturaPadrao;
}

function dataParaInput(v) {
  if (!v) return "";
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return "";
  return `${m[3]}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
}

function inputParaData(v) {
  if (!v) return "";
  const [ano, mes, dia] = v.split("-");
  return `${dia}/${mes}/${ano}`;
}

function hojeInput() {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function numeroParaInput(v) {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? String(n) : "";
}

function normalizarTexto(valor) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function classeStatus(status) {
  return String(status || "Pendente").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function msg(text) {
  document.getElementById("msg").textContent = text;
}

if (acessoLiberado()) {
  liberarAcesso();
}

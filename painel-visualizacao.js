let todosDados = [];
let dados = [];
let zoom = 1;
let selecionada = null;

const estruturas = Array.isArray(CONFIG.STRUCTURES) && CONFIG.STRUCTURES.length
  ? CONFIG.STRUCTURES
  : [{ id: "bloco-1", nome: "Bloco 1", planImageUrl: CONFIG.PLAN_IMAGE_URL }];
const estruturaPadrao = CONFIG.DEFAULT_STRUCTURE || estruturas[0].id;
let estruturaAtual = estruturaPadrao;

const planta = document.getElementById("planta");
const mapa = document.getElementById("mapa");
const markers = document.getElementById("markers");
const selEstrutura = document.getElementById("selEstrutura");
const selEstaca = document.getElementById("selEstaca");

function apiConfigurada() {
  return CONFIG.API_URL && !CONFIG.API_URL.includes("COLE_AQUI");
}

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

async function carregar() {
  msg("Carregando painel...");
  montarEstruturas();

  try {
    if (apiConfigurada()) {
      const resp = await api("dados");
      todosDados = resp.dados || [];
      setText("syncStatus", "Online");
    } else {
      todosDados = await carregarLocais();
      aplicarCoordenadasLocais();
      setText("syncStatus", "Prototipo");
    }
  } catch (err) {
    todosDados = await carregarLocais();
    aplicarCoordenadasLocais();
    setText("syncStatus", "Prototipo");
    msg("Usando dados locais: " + err.message);
  }

  trocarEstrutura(estruturaAtual, false);
}

async function carregarLocais() {
  const res = await fetch(CONFIG.DEMO_DATA_URL);
  return res.ok ? await res.json() : [];
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

function trocarEstrutura(id, avisar = true) {
  estruturaAtual = estruturaValida(id);
  selEstrutura.value = estruturaAtual;

  const estrutura = estruturaConfig(estruturaAtual);
  planta.src = estrutura.planImageUrl || CONFIG.PLAN_IMAGE_URL;
  zoom = zoomPadraoEstrutura();
  aplicarZoom();
  document.getElementById("viewport").scrollLeft = 0;
  document.getElementById("viewport").scrollTop = 0;

  dados = todosDados.filter(e => estruturaDoItem(e) === estruturaAtual);
  renderizar();

  if (!dados.length) {
    msg(`Mapa ${estrutura.nome} carregado. Nao ha estacas desta edificacao na aba Estacas.`);
  } else if (avisar) {
    msg(`Painel filtrado: ${estrutura.nome}.`);
  } else {
    msg("Painel atualizado.");
  }
}

function aplicarCoordenadasLocais() {
  const coords = JSON.parse(localStorage.getItem("pcdf-coordenadas") || "{}");
  todosDados.forEach(e => {
    const estrutura = estruturaDoItem(e);
    const chave = chaveCoordenada(e.estaca, estrutura);
    if (coords[chave]) Object.assign(e, coords[chave]);
    else if (estrutura === estruturaPadrao && coords[e.estaca]) Object.assign(e, coords[e.estaca]);
  });
}

function renderizar() {
  montarLista();
  desenhar();
  resumoGeral();
  resumoEstrutura();
  dashboard();
  const atual = dados.find(e => e.estaca === selecionada?.estaca);
  mostrar(atual || dados[0]);
}

function montarLista() {
  selEstaca.innerHTML = "";
  dados.forEach(e => {
    const opt = document.createElement("option");
    opt.value = e.estaca;
    opt.textContent = `${e.estaca} - ${e.status || "Pendente"}`;
    selEstaca.appendChild(opt);
  });
}

function desenhar() {
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
    };
    markers.appendChild(div);
  });
}

function mostrar(e) {
  if (!e) {
    selecionada = null;
    selEstaca.value = "";
    document.getElementById("info").classList.add("empty");
    document.getElementById("info").textContent = "Nenhuma estaca nesta edificacao.";
    desenhar();
    return;
  }

  selecionada = e;
  selEstaca.value = e.estaca;
  desenhar();
  const status = e.status || "Pendente";
  document.getElementById("info").classList.remove("empty");
  document.getElementById("info").innerHTML = `
    <h3>${valor(e.estaca)}</h3>
    <div class="status-pill"><i class="dot ${classeStatus(status)}"></i>${valor(status)}</div>
    <div class="detail-grid">
      <div><span>Bloco</span><b>${valor(e.bloco)}</b></div>
      <div><span>Diametro</span><b>O ${valor(e.diametro)}</b></div>
      <div><span>Comprimento</span><b>${numero(e.comprimento)} m</b></div>
      <div><span>Volume</span><b>${numero(e.volumeUtilizado || e.volumePrevisto)} m3</b></div>
      <div><span>Furacao</span><b>${valor(e.dataFuracao)}</b></div>
      <div><span>Concretagem</span><b>${valor(e.dataConcretagem)}</b></div>
    </div>
    <div class="obs"><b>Observacao</b><br>${valor(e.observacoes)}</div>
  `;
}

function resumoGeral() {
  preencherResumo(todosDados, {
    total: "kpiGeralTotal",
    pendentes: "kpiGeralPendentes",
    furadas: "kpiGeralFuradas",
    concretadas: "kpiGeralConcretadas",
    percent: "execGeralPercent",
    bar: "execGeralBar"
  });
}

function resumoEstrutura() {
  preencherResumo(dados, {
    total: "kpiTotal",
    pendentes: "kpiPendentes",
    furadas: "kpiFuradas",
    concretadas: "kpiConcretadas",
    percent: "execPercent",
    bar: "execBar"
  });
  resumoDiametros(dados);
}

function preencherResumo(lista, ids) {
  const total = lista.length;
  const pendentes = lista.filter(e => classeStatus(e.status) === "pendente").length;
  const furadas = lista.filter(e => estaFurada(e.status)).length;
  const concretadas = lista.filter(e => estaConcretada(e.status)).length;
  const percent = total ? Math.round((concretadas / total) * 100) : 0;
  setText(ids.total, total);
  setText(ids.pendentes, pendentes);
  setText(ids.furadas, furadas);
  setText(ids.concretadas, concretadas);
  setText(ids.percent, `${percent}%`);
  document.getElementById(ids.bar).style.width = `${percent}%`;
}

function resumoDiametros(lista) {
  const grupos = {};

  lista.forEach(e => {
    const diametro = String(e.diametro || "Sem diametro").trim() || "Sem diametro";
    if (!grupos[diametro]) {
      grupos[diametro] = { diametro, total: 0, furadas: 0, concretadas: 0 };
    }

    const status = classeStatus(e.status);
    grupos[diametro].total += 1;
    if (estaFurada(status)) grupos[diametro].furadas += 1;
    if (estaConcretada(status)) grupos[diametro].concretadas += 1;
  });

  const linhas = Object.values(grupos).sort((a, b) => {
    const na = Number(String(a.diametro).replace(",", "."));
    const nb = Number(String(b.diametro).replace(",", "."));
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return String(a.diametro).localeCompare(String(b.diametro), "pt-BR");
  });

  const el = document.getElementById("diameterSummary");
  if (!linhas.length) {
    el.innerHTML = `<div class="diameter-empty">Sem dados.</div>`;
    return;
  }

  el.innerHTML = `
    <div class="diameter-row diameter-head">
      <span>Ø</span>
      <span>Total</span>
      <span>Furadas</span>
      <span>Concretadas</span>
    </div>
    ${linhas.map(item => `
      <div class="diameter-row">
        <strong>${escapeHtml(item.diametro)}</strong>
        <span>${item.total}</span>
        <span>${percentual(item.furadas, item.total)}%</span>
        <span>${percentual(item.concretadas, item.total)}%</span>
      </div>
    `).join("")}
  `;
}

function dashboard() {
  const concretadas = dados.filter(e => classeStatus(e.status) === "concretada");
  setText("dashVolume", `${numero(concretadas.reduce((acc, e) => acc + numeroBase(e.volumeUtilizado || e.volumePrevisto), 0))} m3`);
  setText("dashMetros", `${numero(soma(concretadas, "comprimento"))} m`);
  const porDia = {};
  concretadas.forEach(e => {
    const dia = e.dataConcretagem || "Sem data";
    porDia[dia] = (porDia[dia] || 0) + 1;
  });
  const vals = Object.values(porDia).slice(-7);
  const max = Math.max(...vals, 1);
  document.getElementById("dailyBars").innerHTML = (vals.length ? vals : [0]).map(v => `<i class="bar" style="height:${Math.max(8, Math.round((v / max) * 100))}%"></i>`).join("");
}

selEstrutura.onchange = () => trocarEstrutura(selEstrutura.value);
selEstaca.onchange = () => mostrar(dados.find(e => e.estaca === selEstaca.value));
const btnAtualizar = document.getElementById("btnAtualizar");
if (btnAtualizar) btnAtualizar.onclick = carregar;
document.getElementById("btnMais").onclick = () => { zoom = Math.min(3, zoom + .15); aplicarZoom(); };
document.getElementById("btnMenos").onclick = () => { zoom = Math.max(.1, zoom - .15); aplicarZoom(); };
document.getElementById("btnReset").onclick = () => { zoom = zoomPadraoEstrutura(); aplicarZoom(); };

function aplicarZoom() {
  mapa.style.transform = `scale(${zoom})`;
  setText("btnReset", `${Math.round(zoom * 100)}%`);
}

function estruturaConfig(id) {
  return estruturas.find(e => e.id === id) || estruturas[0];
}

function zoomPadraoEstrutura() {
  const z = Number(estruturaConfig(estruturaAtual).defaultZoom);
  const base = Number.isFinite(z) && z > 0 ? z : 1;
  if (window.matchMedia("(max-width: 560px)").matches) {
    return Math.max(.1, Math.min(base, base * .55));
  }
  return base;
}

function estruturaValida(id) {
  return estruturas.some(e => e.id === id) ? id : estruturaPadrao;
}

function estruturaDoItem(item) {
  return normalizarEstrutura(item.estrutura || item.setor || item.local || item.obra || estruturaConfig(estruturaPadrao).nome);
}

function normalizarEstrutura(valor) {
  const texto = normalizarTexto(valor);
  const match = estruturas.find(e => normalizarTexto(e.id) === texto || normalizarTexto(e.nome) === texto);
  return match ? match.id : texto || estruturaPadrao;
}

function chaveCoordenada(estaca, estrutura = estruturaAtual) {
  return `${estrutura}::${String(estaca || "").trim()}`;
}

function classeStatus(status) {
  return String(status || "Pendente").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function estaFurada(status) {
  const s = classeStatus(status);
  return s === "furada" || s === "concretada";
}

function estaConcretada(status) {
  return classeStatus(status) === "concretada";
}

function numeroBase(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function soma(lista, campo) {
  return lista.reduce((acc, item) => acc + numeroBase(item[campo]), 0);
}

function numero(v) {
  const n = numeroBase(v);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function valor(v) {
  return v === undefined || v === null || v === "" ? "-" : v;
}

function percentual(parte, total) {
  return total ? Math.round((parte / total) * 100) : 0;
}

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizarTexto(valor) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

function msg(text) {
  document.getElementById("msg").textContent = text;
}

carregar();

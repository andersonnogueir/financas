/**
 * FinFlow - Aplicação de Gestão Financeira Pessoal
 * Controlador SPA com Importação Inteligente de Extratos (OFX/CSV/TXT),
 * Conferência Interativa, Auto-Categorização com IA e Memória Contínua.
 */

// Estado Global da Aplicação
const state = {
  user: null,
  currentDate: new Date(),
  selectedMonth: new Date().getMonth() + 1, // 1-12
  selectedYear: new Date().getFullYear(),
  activeTab: 'dashboard',
  currentTipoLancamento: 'despesa',
  currentRecTipo: 'despesa',
  contas: [],
  categorias: [],
  transacoes: [],
  recorrencias: [],
  regrasAprendidas: [],
  // Estado de Importação de Arquivo
  import: {
    selectedFile: null,
    contaId: null,
    previewTransactions: []
  },
  charts: {
    categorias: null,
    historico: null
  }
};

const nomesMeses = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

// Utilitário de Formatação de Moeda BRL
function formatBRL(val) {
  const num = parseFloat(val) || 0;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Formatar data YYYY-MM-DD para DD/MM/YYYY
function formatDateBR(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

// Inicialização ao carregar a página
document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();
  initTheme();
  
  // 1. Verificar autenticação
  const isAuth = await checkAuth();
  if (!isAuth) return;

  setupEventListeners();
  setupImportEventListeners();
  updateMonthYearLabel();

  // 2. Carregar dados iniciais do usuário
  await loadAllData();
});

// ========================================================
// VERIFICAÇÃO DE AUTENTICAÇÃO & USUÁRIO
// ========================================================
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.href = '/login';
      return false;
    }
    const data = await res.json();
    state.user = data.user;

    const nomeEl = document.getElementById('user-nome-label');
    const emailEl = document.getElementById('user-email-label');
    const avatarEl = document.getElementById('user-avatar-img');

    if (nomeEl) nomeEl.textContent = state.user.nome;
    if (emailEl) emailEl.textContent = state.user.email;
    if (avatarEl) {
      avatarEl.src = state.user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(state.user.nome)}&background=6366f1&color=fff`;
    }

    return true;
  } catch (err) {
    window.location.href = '/login';
    return false;
  }
}

async function handleLogout() {
  const result = await Swal.fire({
    title: 'Sair do FinFlow?',
    text: 'Sua sessão será encerrada com segurança.',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#4f46e5',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Sim, sair',
    cancelButtonText: 'Cancelar'
  });

  if (result.isConfirmed) {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch (err) {
      window.location.href = '/login';
    }
  }
}

// ========================================================
// CONTROLE DE TEMA (DARK / LIGHT MODE)
// ========================================================
function initTheme() {
  const savedTheme = localStorage.getItem('finflow_theme') || 'dark';
  if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
  updateThemeIcon();
}

function toggleTheme() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('finflow_theme', isDark ? 'dark' : 'light');
  updateThemeIcon();
  
  if (state.activeTab === 'dashboard') {
    loadDashboard();
  }
}

function updateThemeIcon() {
  const isDark = document.documentElement.classList.contains('dark');
  const btn = document.getElementById('btn-toggle-theme');
  if (btn) {
    btn.innerHTML = `<i data-lucide="${isDark ? 'sun' : 'moon'}" class="w-5 h-5"></i>`;
    btn.setAttribute('title', isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro');
    lucide.createIcons();
  }
}

// ========================================================
// CONTROLE DO SELETOR DE MÊS E ANO
// ========================================================
function updateMonthYearLabel() {
  const label = document.getElementById('label-mes-ano');
  if (label) {
    label.textContent = `${nomesMeses[state.selectedMonth]} / ${state.selectedYear}`;
  }

  const btnExport = document.getElementById('btn-export-csv');
  if (btnExport) {
    btnExport.href = `/api/export/csv?mes=${state.selectedMonth}&ano=${state.selectedYear}`;
  }

  const tagMes = document.getElementById('tag-mes-grafico');
  if (tagMes) {
    tagMes.textContent = `${nomesMeses[state.selectedMonth]}/${state.selectedYear}`;
  }
}

function changeMonth(delta) {
  state.selectedMonth += delta;
  if (state.selectedMonth > 12) {
    state.selectedMonth = 1;
    state.selectedYear += 1;
  } else if (state.selectedMonth < 1) {
    state.selectedMonth = 12;
    state.selectedYear -= 1;
  }
  updateMonthYearLabel();
  loadAllData();
}

function resetToCurrentMonth() {
  const now = new Date();
  state.selectedMonth = now.getMonth() + 1;
  state.selectedYear = now.getFullYear();
  updateMonthYearLabel();
  loadAllData();
}

// ========================================================
// CARREGAMENTO CENTRALIZADO DE DADOS
// ========================================================
async function loadAllData() {
  await Promise.all([
    fetchContas(),
    fetchCategorias(),
    fetchRegrasAprendidas()
  ]);

  const onboardingEl = document.getElementById('banner-onboarding');
  if (onboardingEl) {
    if (state.contas.length === 0) {
      onboardingEl.classList.remove('hidden');
    } else {
      onboardingEl.classList.add('hidden');
    }
  }

  if (state.activeTab === 'dashboard') {
    loadDashboard();
  } else if (state.activeTab === 'transacoes') {
    loadTransacoes();
  } else if (state.activeTab === 'recorrencias') {
    loadRecorrencias();
  } else if (state.activeTab === 'contas') {
    renderContasTab();
  } else if (state.activeTab === 'categorias') {
    renderCategoriasTab();
  }
}

// ========================================================
// REQUISIÇÕES BÁSICAS: CONTAS & CATEGORIAS & REGRAS
// ========================================================
async function fetchContas() {
  try {
    const res = await fetch('/api/contas');
    if (res.status === 401) { window.location.href = '/login'; return; }
    state.contas = await res.json();
    populateContasSelects();
  } catch (err) {
    console.error('Erro ao buscar contas:', err);
  }
}

async function fetchCategorias() {
  try {
    const res = await fetch('/api/categorias');
    if (res.status === 401) { window.location.href = '/login'; return; }
    state.categorias = await res.json();
    populateCategoriasSelects();
  } catch (err) {
    console.error('Erro ao buscar categorias:', err);
  }
}

async function fetchRegrasAprendidas() {
  try {
    const res = await fetch('/api/regras-categorizacao');
    if (res.status === 401) return;
    state.regrasAprendidas = await res.json();
    renderRegrasAprendidasGrid();
  } catch (err) {
    console.error('Erro ao buscar regras:', err);
  }
}

function populateContasSelects() {
  const selects = [
    document.getElementById('filtro-conta'),
    document.getElementById('lancamento-conta'),
    document.getElementById('lancamento-conta-destino'),
    document.getElementById('transf-origem'),
    document.getElementById('transf-destino'),
    document.getElementById('rec-conta'),
    document.getElementById('import-conta-id')
  ];

  selects.forEach(select => {
    if (!select) return;
    const isFilter = select.id === 'filtro-conta';
    const isOptional = select.id === 'rec-conta';
    const isImport = select.id === 'import-conta-id';
    
    let html = isFilter ? '<option value="">Todas as Contas</option>' : (isOptional ? '<option value="">Sem conta padrão</option>' : '');
    
    if (state.contas.length === 0) {
      html += '<option value="">(Nenhuma conta cadastrada)</option>';
    }

    state.contas.forEach(c => {
      html += `<option value="${c.id}">${c.nome} (${formatBRL(c.saldo_atual)})</option>`;
    });

    select.innerHTML = html;
  });
}

function populateCategoriasSelects() {
  const filterSelect = document.getElementById('filtro-categoria');
  const recSelect = document.getElementById('rec-categoria');

  if (filterSelect) {
    let html = '<option value="">Todas as Categorias</option>';
    state.categorias.forEach(cat => {
      html += `<option value="${cat.id}">${cat.nome} (${cat.tipo})</option>`;
    });
    filterSelect.innerHTML = html;
  }

  updateLancamentoCategorias();
  
  if (recSelect) {
    let html = '<option value="">Sem categoria</option>';
    const filteredCats = state.categorias.filter(c => c.tipo === state.currentRecTipo);
    filteredCats.forEach(cat => {
      html += `<option value="${cat.id}">${cat.nome}</option>`;
    });
    recSelect.innerHTML = html;
  }
}

function updateLancamentoCategorias() {
  const lancamentoSelect = document.getElementById('lancamento-categoria');
  if (!lancamentoSelect) return;

  let html = '<option value="">Sem categoria</option>';
  const filteredCats = state.categorias.filter(c => c.tipo === state.currentTipoLancamento);
  filteredCats.forEach(cat => {
    html += `<option value="${cat.id}">${cat.nome}</option>`;
  });
  lancamentoSelect.innerHTML = html;
}

// ========================================================
// DASHBOARD & GRÁFICOS
// ========================================================
async function loadDashboard() {
  try {
    const res = await fetch(`/api/dashboard?mes=${state.selectedMonth}&ano=${state.selectedYear}`);
    if (res.status === 401) { window.location.href = '/login'; return; }
    const data = await res.json();

    document.getElementById('card-saldo-total').textContent = formatBRL(data.saldo_consolidado_geral);
    document.getElementById('card-receitas-total').textContent = formatBRL(data.total_receitas);
    document.getElementById('card-receitas-pagas').textContent = formatBRL(data.receitas_pagas);
    document.getElementById('card-receitas-pendentes').textContent = formatBRL(data.receitas_pendentes);

    document.getElementById('card-despesas-total').textContent = formatBRL(data.total_despesas);
    document.getElementById('card-despesas-pagas').textContent = formatBRL(data.despesas_pagas);
    document.getElementById('card-despesas-pendentes').textContent = formatBRL(data.despesas_pendentes);

    document.getElementById('card-saldo-previsto').textContent = formatBRL(data.saldo_previsto_mes);
    
    const balancoEl = document.getElementById('card-balanco-mes');
    const sinal = data.balanco_mes >= 0 ? '+' : '';
    balancoEl.innerHTML = `Balanço mensal: <b class="${data.balanco_mes >= 0 ? 'text-emerald-500' : 'text-rose-500'}">${sinal}${formatBRL(data.balanco_mes)}</b>`;

    renderContasDashboard(data.contas);
    renderChartCategorias(data.despesas_por_categoria);
    renderChartHistorico(data.historico_meses);
    renderAlertas(data.alertas);

    lucide.createIcons();
  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
  }
}

function renderContasDashboard(contas) {
  const container = document.getElementById('grid-contas-dashboard');
  if (!container) return;

  if (contas.length === 0) {
    container.innerHTML = `
      <div class="col-span-full p-8 text-center bg-white dark:bg-slate-900/90 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
        <div class="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500 flex items-center justify-center mx-auto mb-2.5">
          <i data-lucide="credit-card" class="w-5 h-5"></i>
        </div>
        <p class="text-xs font-semibold text-slate-700 dark:text-slate-300">Nenhuma conta cadastrada ainda</p>
        <p class="text-[11px] text-slate-400 mt-0.5">Adicione sua conta corrente, carteira ou cartão para começar a controlar.</p>
        <button onclick="document.getElementById('btn-quick-new-account').click()" class="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition">
          <i data-lucide="plus" class="w-3.5 h-3.5"></i>
          Cadastrar Primeira Conta
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = contas.map(c => {
    const isConectada = c.integracao_status === 'conectado';
    return `
    <div class="bank-card bg-white dark:bg-slate-900/90 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between transition hover:shadow-md" style="--account-color: ${c.cor};">
      <div>
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm" style="background-color: ${c.cor};">
              <i data-lucide="${c.tipo === 'Carteira' ? 'wallet' : (c.tipo === 'Investimento' ? 'trending-up' : 'landmark')}" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0">
              <h4 class="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[120px]" title="${c.nome}">${c.nome}</h4>
              <span class="text-[10px] text-slate-400 font-medium truncate block">${c.instituicao || c.tipo}</span>
            </div>
          </div>
          <span class="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border border-slate-200/60 dark:border-slate-700/60 shrink-0">${c.tipo}</span>
        </div>

        <!-- Open Finance Badge & Botão de Sync Rápido -->
        <div class="my-2 flex items-center justify-between gap-1">
          ${isConectada ? `
            <span class="inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40">
              <i data-lucide="zap" class="w-2.5 h-2.5"></i>
              <span>API Conectada</span>
            </span>
            <button onclick="sincronizarExtratoConta(${c.id})" title="Sincronizar extrato bancário agora via API" class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-800/50 transition">
              <i data-lucide="refresh-cw" class="w-2.5 h-2.5"></i>
              <span>Sincronizar</span>
            </button>
          ` : `
            <button onclick="abrirModalOpenFinance(${c.id})" title="Conectar banco via Open Finance" class="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60 transition">
              <i data-lucide="link" class="w-2.5 h-2.5"></i>
              <span>Conectar Banco</span>
            </button>
          `}
        </div>
      </div>

      <div class="pt-2.5 border-t border-slate-100 dark:border-slate-800/60 flex items-end justify-between">
        <div>
          <span class="text-[10px] uppercase font-semibold text-slate-400 dark:text-slate-500">Saldo Atual</span>
          <div class="text-base font-black ${c.saldo_atual >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-500'}">
            ${formatBRL(c.saldo_atual)}
          </div>
        </div>
        <span class="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">Ativa</span>
      </div>
    </div>
    `;
  }).join('');
}

function renderChartCategorias(despesasPorCategoria) {
  const ctx = document.getElementById('chart-categorias');
  const emptyMsg = document.getElementById('chart-empty-msg');
  if (!ctx) return;

  if (state.charts.categorias) {
    state.charts.categorias.destroy();
  }

  if (!despesasPorCategoria || despesasPorCategoria.length === 0) {
    ctx.style.display = 'none';
    if (emptyMsg) emptyMsg.classList.remove('hidden');
    return;
  }

  ctx.style.display = 'block';
  if (emptyMsg) emptyMsg.classList.add('hidden');

  const isDark = document.documentElement.classList.contains('dark');
  const labels = despesasPorCategoria.map(d => d.categoria);
  const dataValues = despesasPorCategoria.map(d => d.total);
  const bgColors = despesasPorCategoria.map(d => d.cor || '#6366f1');

  state.charts.categorias = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: dataValues,
        backgroundColor: bgColors,
        borderWidth: 2,
        borderColor: isDark ? '#0f172a' : '#ffffff',
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: isDark ? '#cbd5e1' : '#475569',
            font: { size: 11, family: 'Inter', weight: 500 },
            boxWidth: 10,
            padding: 10,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          titleColor: isDark ? '#f8fafc' : '#0f172a',
          bodyColor: isDark ? '#cbd5e1' : '#475569',
          borderColor: isDark ? '#334155' : '#e2e8f0',
          borderWidth: 1,
          padding: 10,
          boxPadding: 4,
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = formatBRL(context.raw);
              return ` ${label}: ${value}`;
            }
          }
        }
      },
      cutout: '72%'
    }
  });
}

function renderChartHistorico(historico) {
  const ctx = document.getElementById('chart-historico');
  if (!ctx) return;

  if (state.charts.historico) {
    state.charts.historico.destroy();
  }

  const isDark = document.documentElement.classList.contains('dark');
  const labels = historico.map(h => h.label);
  const receitas = historico.map(h => h.receitas);
  const despesas = historico.map(h => h.despesas);

  state.charts.historico = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Receitas',
          data: receitas,
          backgroundColor: '#10b981',
          borderRadius: 6,
          barPercentage: 0.55
        },
        {
          label: 'Despesas',
          data: despesas,
          backgroundColor: '#f43f5e',
          borderRadius: 6,
          barPercentage: 0.55
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          align: 'end',
          labels: {
            color: isDark ? '#cbd5e1' : '#475569',
            font: { size: 11, family: 'Inter', weight: 500 },
            boxWidth: 10,
            usePointStyle: true,
            pointStyle: 'circle'
          }
        },
        tooltip: {
          backgroundColor: isDark ? '#1e293b' : '#ffffff',
          titleColor: isDark ? '#f8fafc' : '#0f172a',
          bodyColor: isDark ? '#cbd5e1' : '#475569',
          borderColor: isDark ? '#334155' : '#e2e8f0',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function(context) {
              return ` ${context.dataset.label}: ${formatBRL(context.raw)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { size: 10, family: 'Inter' } }
        },
        y: {
          grid: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' },
          ticks: {
            color: isDark ? '#94a3b8' : '#64748b',
            font: { size: 10, family: 'Inter' },
            callback: function(value) { return 'R$ ' + value.toLocaleString('pt-BR'); }
          }
        }
      }
    }
  });
}

function renderAlertas(alertas) {
  const container = document.getElementById('lista-alertas-dashboard');
  const badgeCount = document.getElementById('badge-alertas-count');
  if (!container) return;

  if (badgeCount) {
    badgeCount.textContent = alertas.length;
    if (alertas.length > 0) {
      badgeCount.className = "text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-bold";
    } else {
      badgeCount.className = "text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium";
    }
  }

  if (alertas.length === 0) {
    container.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
        <div class="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-500 flex items-center justify-center mb-2">
          <i data-lucide="check-circle-2" class="w-5 h-5"></i>
        </div>
        <p class="text-xs font-bold text-slate-700 dark:text-slate-300">Tudo em dia!</p>
        <p class="text-[11px] text-slate-400 mt-0.5">Nenhuma conta com vencimento pendente para os próximos 7 dias.</p>
      </div>
    `;
    return;
  }

  const hoje = new Date().toISOString().split('T')[0];

  container.innerHTML = alertas.map(a => {
    const isVencida = a.data < hoje;
    const isHoje = a.data === hoje;
    
    let statusLabel = `Vence em ${formatDateBR(a.data)}`;
    let badgeClass = "bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40";
    
    if (isVencida) {
      statusLabel = `Venceu em ${formatDateBR(a.data)}`;
      badgeClass = "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/40 font-bold";
    } else if (isHoje) {
      statusLabel = "Vence Hoje!";
      badgeClass = "bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 font-bold";
    }

    return `
      <div class="flex items-center justify-between p-3 rounded-xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 transition">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-2 h-2 rounded-full ${isVencida ? 'bg-rose-500 animate-pulse' : (isHoje ? 'bg-amber-500' : 'bg-amber-400')} shrink-0"></div>
          <div class="min-w-0">
            <h4 class="text-xs font-bold text-slate-800 dark:text-slate-200 truncate" title="${a.descricao}">${a.descricao}</h4>
            <div class="flex items-center gap-2 mt-0.5">
              <span class="text-[10px] px-1.5 py-0.2 rounded-md ${badgeClass}">${statusLabel}</span>
              <span class="text-[10px] text-slate-400 truncate">${a.conta_nome || 'Sem conta'}</span>
            </div>
          </div>
        </div>
        
        <div class="text-right flex items-center gap-2.5 shrink-0 pl-2">
          <span class="text-xs font-black text-rose-600 dark:text-rose-400">${formatBRL(a.valor)}</span>
          <button onclick="toggleTransacaoStatus(${a.id})" title="Marcar como Pago" class="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40 transition shadow-sm">
            <i data-lucide="check" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ========================================================
// TRANSAÇÕES / EXTRATO
// ========================================================
async function loadTransacoes() {
  const busca = document.getElementById('filtro-busca')?.value || '';
  const contaId = document.getElementById('filtro-conta')?.value || '';
  const categoriaId = document.getElementById('filtro-categoria')?.value || '';
  const tipo = document.getElementById('filtro-tipo')?.value || '';
  const status = document.getElementById('filtro-status')?.value || '';

  const params = new URLSearchParams({
    mes: state.selectedMonth,
    ano: state.selectedYear,
    q: busca,
    conta_id: contaId,
    categoria_id: categoriaId,
    tipo: tipo,
    status: status
  });

  try {
    const res = await fetch(`/api/transacoes?${params.toString()}`);
    if (res.status === 401) { window.location.href = '/login'; return; }
    state.transacoes = await res.json();
    renderTransacoesTable();
  } catch (err) {
    console.error('Erro ao buscar transações:', err);
  }
}

function renderTransacoesTable() {
  const tbody = document.getElementById('tbody-transacoes');
  const emptyMsg = document.getElementById('transacoes-empty-msg');
  const lblTotalReg = document.getElementById('lbl-total-registros');
  const lblTotalVal = document.getElementById('lbl-total-valor-filtrado');

  if (!tbody) return;

  if (state.transacoes.length === 0) {
    tbody.innerHTML = '';
    if (emptyMsg) emptyMsg.classList.remove('hidden');
    if (lblTotalReg) lblTotalReg.textContent = '0';
    if (lblTotalVal) lblTotalVal.textContent = 'R$ 0,00';
    return;
  }

  if (emptyMsg) emptyMsg.classList.add('hidden');

  let totalFiltrado = 0;
  state.transacoes.forEach(t => {
    if (t.tipo === 'receita') totalFiltrado += t.valor;
    else if (t.tipo === 'despesa') totalFiltrado -= t.valor;
  });

  if (lblTotalReg) lblTotalReg.textContent = state.transacoes.length;
  if (lblTotalVal) {
    const sinal = totalFiltrado >= 0 ? '+' : '';
    lblTotalVal.textContent = `${sinal}${formatBRL(totalFiltrado)}`;
    lblTotalVal.className = totalFiltrado >= 0 ? 'text-emerald-500 font-bold' : 'text-rose-500 font-bold';
  }

  tbody.innerHTML = state.transacoes.map(t => {
    const isReceita = t.tipo === 'receita';
    const isDespesa = t.tipo === 'despesa';
    const isTransf = t.tipo === 'transferencia';
    const isPago = t.status === 'pago';

    let valorColorClass = isReceita ? 'text-emerald-600 dark:text-emerald-400' : (isDespesa ? 'text-rose-600 dark:text-rose-400' : 'text-indigo-600 dark:text-indigo-400');
    let prefixoValor = isReceita ? '+ ' : (isDespesa ? '- ' : '⇄ ');

    let iconeCategoria = t.categoria_icone || (isReceita ? 'trending-up' : (isTransf ? 'arrow-left-right' : 'shopping-bag'));
    let corCategoria = t.categoria_cor || (isReceita ? '#10b981' : (isTransf ? '#6366f1' : '#f43f5e'));

    return `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
        <td class="py-3 px-4 whitespace-nowrap text-slate-500 dark:text-slate-400 font-mono text-xs">
          ${formatDateBR(t.data)}
        </td>
        <td class="py-3 px-4">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm" style="background-color: ${corCategoria};">
              <i data-lucide="${iconeCategoria}" class="w-4 h-4"></i>
            </div>
            <div>
              <div class="font-semibold text-slate-900 dark:text-white">${t.descricao}</div>
              <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span>${t.categoria_nome || (isTransf ? 'Transferência' : 'Geral')}</span>
                ${t.observacoes ? `<span>&bull;</span> <span class="italic truncate max-w-[180px]">${t.observacoes}</span>` : ''}
              </div>
            </div>
          </div>
        </td>
        <td class="py-3 px-4 whitespace-nowrap">
          ${isTransf ? `
            <div class="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
              <span class="font-medium">${t.conta_nome}</span>
              <i data-lucide="arrow-right" class="w-3 h-3 text-slate-400"></i>
              <span class="font-medium">${t.conta_destino_nome}</span>
            </div>
          ` : `
            <div class="flex items-center gap-2">
              <span class="w-2.5 h-2.5 rounded-full" style="background-color: ${t.conta_cor || '#3b82f6'};"></span>
              <span class="text-xs font-medium text-slate-800 dark:text-slate-200">${t.conta_nome || 'Sem conta'}</span>
            </div>
          `}
        </td>
        <td class="py-3 px-4 text-right whitespace-nowrap font-bold text-sm ${valorColorClass}">
          ${prefixoValor}${formatBRL(t.valor)}
        </td>
        <td class="py-3 px-4 text-center whitespace-nowrap">
          <button onclick="toggleTransacaoStatus(${t.id})" title="Clique para alternar Pago / Pendente" class="status-pill cursor-pointer hover:opacity-80 ${isPago ? 'status-pago' : 'status-pendente'}">
            <i data-lucide="${isPago ? 'check-circle-2' : 'clock'}" class="w-3.5 h-3.5"></i>
            <span>${isPago ? 'Pago' : 'Pendente'}</span>
          </button>
        </td>
        <td class="py-3 px-4 text-center whitespace-nowrap">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="editarTransacao(${t.id})" title="Editar Lançamento" class="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition">
              <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="excluirTransacao(${t.id})" title="Excluir" class="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

async function toggleTransacaoStatus(id) {
  try {
    const res = await fetch(`/api/transacoes/${id}/status`, { method: 'PATCH' });
    const data = await res.json();
    if (data.success) {
      await loadAllData();
      const Toast = Swal.mixin({
        toast: true, position: 'top-end', showConfirmButton: false, timer: 1800, timerProgressBar: true
      });
      Toast.fire({ icon: 'success', title: data.message });
    }
  } catch (err) {
    console.error('Erro ao alternar status:', err);
  }
}

async function excluirTransacao(id) {
  const result = await Swal.fire({
    title: 'Excluir Lançamento?',
    text: 'Esta ação não pode ser desfeita e atualizará o saldo da conta.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Sim, excluir',
    cancelButtonText: 'Cancelar'
  });

  if (result.isConfirmed) {
    try {
      const res = await fetch(`/api/transacoes/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await loadAllData();
        Swal.fire({ title: 'Excluído!', text: 'O lançamento foi removido com sucesso.', icon: 'success', timer: 1200, showConfirmButton: false });
      }
    } catch (err) {
      console.error('Erro ao excluir transação:', err);
    }
  }
}

async function zerarLancamentosMesAtual() {
  const mesNome = nomesMeses[state.selectedMonth];
  const ano = state.selectedYear;

  const result = await Swal.fire({
    title: `Zerar ${mesNome}/${ano}?`,
    html: `
      <p class="text-sm text-slate-400">Você tem certeza que deseja <b>apagar todos os lançamentos</b> de <b>${mesNome}/${ano}</b>?</p>
      <p class="text-xs text-rose-400 mt-2 font-semibold">Os saldos das suas contas serão recalculados imediatamente.</p>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Sim, zerar tudo deste mês',
    cancelButtonText: 'Cancelar'
  });

  if (result.isConfirmed) {
    try {
      const res = await fetch('/api/transacoes/zerar-mes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes: state.selectedMonth, ano: state.selectedYear })
      });
      const data = await res.json();
      if (data.success) {
        await loadAllData();
        Swal.fire({
          icon: 'success',
          title: 'Mês Zerado!',
          text: data.message,
          timer: 1800,
          showConfirmButton: false
        });
      }
    } catch (err) {
      console.error('Erro ao zerar mês:', err);
    }
  }
}

function editarTransacao(id) {
  const trans = state.transacoes.find(t => t.id === id);
  if (!trans) return;

  document.getElementById('modal-lancamento-titulo').textContent = 'Editar Lançamento';
  document.getElementById('lancamento-id').value = trans.id;
  document.getElementById('lancamento-descricao').value = trans.descricao;
  document.getElementById('lancamento-valor').value = trans.valor;
  document.getElementById('lancamento-data').value = trans.data;
  document.getElementById('lancamento-status').value = trans.status;
  document.getElementById('lancamento-observacoes').value = trans.observacoes || '';

  setTipoLancamento(trans.tipo);

  if (trans.conta_id) {
    document.getElementById('lancamento-conta').value = trans.conta_id;
  }
  if (trans.conta_destino_id) {
    document.getElementById('lancamento-conta-destino').value = trans.conta_destino_id;
  }
  if (trans.categoria_id) {
    document.getElementById('lancamento-categoria').value = trans.categoria_id;
  }

  openModal('modal-lancamento');
}

// ========================================================
// ========================================================
// IMPORTAÇÃO BANCÁRIA INTELIGENTE & OPEN FINANCE
// ========================================================
function setupImportEventListeners() {
  const dropzone = document.getElementById('import-dropzone');
  const fileInput = document.getElementById('import-file-input');
  const btnProcess = document.getElementById('btn-import-process-file');
  const btnVoltar = document.getElementById('btn-import-voltar');
  const btnConfirmFinal = document.getElementById('btn-import-confirmar-final');
  const btnSelectAll = document.getElementById('btn-import-select-all');
  const btnUnselectAll = document.getElementById('btn-import-unselect-all');

  const tabApi = document.getElementById('tab-import-api');
  const tabFile = document.getElementById('tab-import-file');
  const paneApi = document.getElementById('import-pane-api');
  const paneFile = document.getElementById('import-pane-file');
  const btnSyncApi = document.getElementById('btn-import-sync-api');

  // Alternar abas do modal de importação
  if (tabApi && tabFile && paneApi && paneFile) {
    tabApi.addEventListener('click', () => {
      tabApi.className = 'py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 bg-indigo-600 text-white shadow-md shadow-indigo-600/30';
      tabFile.className = 'py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200';
      paneApi.classList.remove('hidden');
      paneFile.classList.add('hidden');
    });

    tabFile.addEventListener('click', () => {
      tabFile.className = 'py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 bg-indigo-600 text-white shadow-md shadow-indigo-600/30';
      tabApi.className = 'py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200';
      paneFile.classList.remove('hidden');
      paneApi.classList.add('hidden');
    });
  }

  // Disparar sincronização direta via API Bancária
  btnSyncApi?.addEventListener('click', async () => {
    const contaId = document.getElementById('import-api-conta-id')?.value;
    const dias = parseInt(document.getElementById('import-api-dias')?.value || '30');
    if (!contaId) {
      Swal.fire({ icon: 'warning', title: 'Selecione uma conta', text: 'Escolha a conta bancária para sincronizar o extrato.' });
      return;
    }
    await sincronizarExtratoViaAPI(contaId, dias);
  });

  // Abrir modal de importação
  ['btn-open-modal-import', 'btn-quick-import', 'btn-extrato-importar'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      if (state.contas.length === 0) {
        Swal.fire({
          icon: 'info',
          title: 'Cadastre uma Conta Primeiro',
          text: 'Você precisa ter pelo menos uma conta bancária cadastrada para onde importar o extrato.',
          confirmButtonColor: '#4f46e5'
        }).then(() => {
          document.getElementById('btn-quick-new-account')?.click();
        });
        return;
      }
      resetImportModal();
      openModal('modal-import');
    });
  });

  // Dropzone click & drag
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-indigo-500', 'bg-indigo-50/50', 'dark:bg-indigo-950/40');
    });

    ['dragleave', 'drop'].forEach(evt => {
      dropzone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropzone.classList.remove('border-indigo-500', 'bg-indigo-50/50', 'dark:bg-indigo-950/40');
      });
    });

    dropzone.addEventListener('drop', (e) => {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelected(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelected(e.target.files[0]);
      }
    });
  }

  // Processar e Gerar Prévia do Arquivo
  btnProcess?.addEventListener('click', processImportFilePreview);

  // Voltar para Etapa 1
  btnVoltar?.addEventListener('click', () => {
    document.getElementById('import-etapa-2')?.classList.add('hidden');
    document.getElementById('import-etapa-1')?.classList.remove('hidden');
  });

  // Selecionar / Desmarcar Todos
  btnSelectAll?.addEventListener('click', () => toggleAllImportSelection(true));
  btnUnselectAll?.addEventListener('click', () => toggleAllImportSelection(false));

  // Confirmar Importação Final
  btnConfirmFinal?.addEventListener('click', confirmImportTransactions);

  // Inicializar handlers do modal Open Finance
  setupOpenFinanceModalHandlers();
}

async function sincronizarExtratoViaAPI(contaId, dias = 30) {
  state.import.contaId = contaId;

  Swal.fire({
    title: '<span class="flex items-center justify-center gap-2"><i data-lucide="refresh-cw" class="w-5 h-5 text-indigo-500 animate-spin"></i> Conectando à API Bancária...</span>',
    html: `
      <div class="text-xs text-slate-500 dark:text-slate-400 space-y-2 mt-2">
        <p>Consultando transações via <b>Open Finance Brasil</b> (Modo Somente Leitura)...</p>
        <p class="text-indigo-600 dark:text-indigo-400 font-semibold">Aplicando motor de Auto-Categorização com IA ✨</p>
      </div>
    `,
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
      lucide.createIcons();
    }
  });

  try {
    const res = await fetch(`/api/open-finance/sync/${contaId}?dias=${dias}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await res.json();
    Swal.close();

    if (!res.ok || !data.success) {
      Swal.fire({
        icon: 'error',
        title: 'Falha na consulta bancária',
        text: data.error || 'Não foi possível obter os dados da instituição financeira.'
      });
      return;
    }

    state.import.previewTransactions = data.transacoes;
    renderImportPreviewTable(data);

    // Mudar para Etapa 2 (Analisar e Consolidar)
    document.getElementById('import-etapa-1')?.classList.add('hidden');
    document.getElementById('import-etapa-2')?.classList.remove('hidden');

    // Notificação discreta de sucesso
    const toast = Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3000
    });
    toast.fire({
      icon: 'success',
      title: `${data.total_transacoes} transações sincronizadas!`
    });

  } catch (err) {
    Swal.close();
    console.error('Erro na sincronização Open Finance:', err);
    Swal.fire({ icon: 'error', title: 'Erro de conexão', text: 'Não foi possível comunicar com o servidor para sincronização bancária.' });
  }
}

function sincronizarExtratoConta(contaId) {
  resetImportModal();
  openModal('modal-import');
  
  // Seleciona a conta nos selects
  const selectApi = document.getElementById('import-api-conta-id');
  if (selectApi) selectApi.value = contaId;

  // Dispara a sincronização
  sincronizarExtratoViaAPI(contaId, 30);
}

function resetImportModal() {
  state.import.selectedFile = null;
  state.import.previewTransactions = [];
  const fileInput = document.getElementById('import-file-input');
  if (fileInput) fileInput.value = '';

  document.getElementById('import-selected-file-info')?.classList.add('hidden');
  document.getElementById('import-etapa-1')?.classList.remove('hidden');
  document.getElementById('import-etapa-2')?.classList.add('hidden');
}

function handleFileSelected(file) {
  state.import.selectedFile = file;
  const infoContainer = document.getElementById('import-selected-file-info');
  const nameEl = document.getElementById('import-file-name');
  const sizeEl = document.getElementById('import-file-size');

  if (infoContainer && nameEl && sizeEl) {
    nameEl.textContent = file.name;
    sizeEl.textContent = (file.size / 1024).toFixed(1) + ' KB';
    infoContainer.classList.remove('hidden');
  }
}

async function processImportFilePreview() {
  if (!state.import.selectedFile) {
    Swal.fire({ icon: 'warning', title: 'Atenção', text: 'Selecione um arquivo de extrato bancário.' });
    return;
  }

  const contaId = document.getElementById('import-conta-id')?.value;
  if (!contaId) {
    Swal.fire({ icon: 'warning', title: 'Atenção', text: 'Selecione a conta bancária de destino.' });
    return;
  }

  state.import.contaId = contaId;

  const formData = new FormData();
  formData.append('arquivo', state.import.selectedFile);
  formData.append('conta_id', contaId);

  // Exibir loading
  Swal.fire({
    title: 'Analisando Extrato...',
    text: 'Identificando movimentações e aplicando Auto-Categorização com IA.',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  try {
    const res = await fetch('/api/import/preview', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    Swal.close();

    if (!res.ok || !data.success) {
      Swal.fire({ icon: 'error', title: 'Erro ao processar extrato', text: data.error || 'Verifique o formato do arquivo.' });
      return;
    }

    state.import.previewTransactions = data.transacoes;
    renderImportPreviewTable(data);

    // Mudar para etapa 2
    document.getElementById('import-etapa-1')?.classList.add('hidden');
    document.getElementById('import-etapa-2')?.classList.remove('hidden');
  } catch (err) {
    Swal.close();
    console.error('Erro na requisição de preview:', err);
    Swal.fire({ icon: 'error', title: 'Erro de conexão', text: 'Não foi possível enviar o arquivo para análise.' });
  }
}

function renderImportPreviewTable(previewData) {
  const tbody = document.getElementById('tbody-import-preview');
  const statsEl = document.getElementById('import-preview-stats');
  const recEl = document.getElementById('import-preview-rec');
  const despEl = document.getElementById('import-preview-desp');
  const btnConfirmLbl = document.getElementById('lbl-btn-confirm-import');

  if (statsEl) statsEl.textContent = `${previewData.total_transacoes} lançamentos encontrados`;
  if (recEl) recEl.textContent = `+${formatBRL(previewData.total_receitas)}`;
  if (despEl) despEl.textContent = `-${formatBRL(previewData.total_despesas)}`;

  if (!tbody) return;

  tbody.innerHTML = previewData.transacoes.map((t, idx) => {
    const isReceita = t.tipo === 'receita';
    const valorColor = isReceita ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
    const valorPrefix = isReceita ? '+' : '-';

    // Opções de categorias filtradas por tipo
    const catsForType = state.categorias.filter(c => c.tipo === t.tipo);
    const catOptionsHtml = catsForType.map(c => `
      <option value="${c.id}" ${c.id === t.categoria_id ? 'selected' : ''}>${c.nome}</option>
    `).join('');

    // Badge de origem da sugestão
    let badgeOrigem = '';
    if (t.origem_sugestao === 'regra_aprendida') {
      badgeOrigem = '<span class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold">🧠 Regra</span>';
    } else if (t.origem_sugestao === 'historico') {
      badgeOrigem = '<span class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold">🕒 Histórico</span>';
    } else if (t.origem_sugestao === 'semantica') {
      badgeOrigem = '<span class="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-bold">✨ IA Sugerido</span>';
    }

    return `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition ${t.is_duplicada ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''}" data-row-id="${t.temp_id}">
        
        <!-- Checkbox de Seleção -->
        <td class="py-2.5 px-3 text-center">
          <input type="checkbox" class="import-row-checkbox w-4 h-4 text-indigo-600 rounded cursor-pointer" 
                 data-id="${t.temp_id}" ${t.selecionada ? 'checked' : ''} onchange="updateImportSelectionState(${t.temp_id}, this.checked)">
        </td>

        <!-- Data -->
        <td class="py-2.5 px-3 whitespace-nowrap font-mono text-slate-500 dark:text-slate-400">
          ${formatDateBR(t.data)}
        </td>

        <!-- Descrição -->
        <td class="py-2.5 px-3">
          <div class="font-semibold text-slate-900 dark:text-white text-xs">${t.descricao}</div>
          ${t.is_duplicada ? '<span class="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-semibold">⚠️ Possível duplicata</span>' : ''}
        </td>

        <!-- Valor -->
        <td class="py-2.5 px-3 text-right whitespace-nowrap font-bold ${valorColor}">
          ${valorPrefix}${formatBRL(t.valor)}
        </td>

        <!-- Seletor de Categoria Interativo -->
        <td class="py-2.5 px-3">
          <div class="flex items-center gap-1.5">
            <select class="import-category-select text-xs px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-1 focus:ring-indigo-500 dark:text-white"
                    data-id="${t.temp_id}" onchange="handleCategoryChange(${t.temp_id}, this.value)">
              <option value="">Sem categoria</option>
              ${catOptionsHtml}
            </select>
            ${badgeOrigem}
          </div>
        </td>

        <!-- Checkbox Lembrar Regra -->
        <td class="py-2.5 px-3 text-center">
          <label class="inline-flex items-center cursor-pointer" title="Lembrar esta categoria para descrições similares nos próximos extratos">
            <input type="checkbox" class="import-remember-checkbox w-4 h-4 text-indigo-600 rounded cursor-pointer"
                   data-id="${t.temp_id}" ${t.origem_sugestao !== 'regra_aprendida' ? 'checked' : ''}
                   onchange="updateRememberRuleState(${t.temp_id}, this.checked)">
          </label>
        </td>

      </tr>
    `;
  }).join('');

  updateImportConfirmButtonLabel();
  lucide.createIcons();
}

function updateImportSelectionState(tempId, isChecked) {
  const trans = state.import.previewTransactions.find(t => t.temp_id === tempId);
  if (trans) trans.selecionada = isChecked;
  updateImportConfirmButtonLabel();
}

function handleCategoryChange(tempId, newCatId) {
  const trans = state.import.previewTransactions.find(t => t.temp_id === tempId);
  if (trans) {
    trans.categoria_id = newCatId ? parseInt(newCatId) : null;
    // Marca para memorizar por padrão quando o usuário altera manualmente a categoria
    trans.lembrar_regra = true;
    const rememberCheckbox = document.querySelector(`.import-remember-checkbox[data-id="${tempId}"]`);
    if (rememberCheckbox) rememberCheckbox.checked = true;
  }
}

function updateRememberRuleState(tempId, isChecked) {
  const trans = state.import.previewTransactions.find(t => t.temp_id === tempId);
  if (trans) trans.lembrar_regra = isChecked;
}

function toggleAllImportSelection(selected) {
  state.import.previewTransactions.forEach(t => t.selecionada = selected);
  document.querySelectorAll('.import-row-checkbox').forEach(cb => cb.checked = selected);
  updateImportConfirmButtonLabel();
}

function updateImportConfirmButtonLabel() {
  const count = state.import.previewTransactions.filter(t => t.selecionada).length;
  const lbl = document.getElementById('lbl-btn-confirm-import');
  if (lbl) {
    lbl.textContent = `Confirmar Importação (${count} selecionadas)`;
  }
}

async function confirmImportTransactions() {
  const selectedTrans = state.import.previewTransactions.filter(t => t.selecionada);

  if (selectedTrans.length === 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Nenhum lançamento selecionado',
      text: 'Marque pelo menos uma transação na tabela para importar.'
    });
    return;
  }

  // Prepara payload
  const payload = {
    conta_id: state.import.contaId,
    transacoes: selectedTrans.map(t => {
      const rememberCb = document.querySelector(`.import-remember-checkbox[data-id="${t.temp_id}"]`);
      const isLembrar = rememberCb ? rememberCb.checked : (t.lembrar_regra ?? true);

      return {
        data: t.data,
        descricao: t.descricao,
        valor: t.valor,
        tipo: t.tipo,
        categoria_id: t.categoria_id,
        fitid: t.fitid,
        lembrar_regra: isLembrar,
        termo_regra: t.termo_regra_sugerido || t.descricao
      };
    })
  };

  Swal.fire({
    title: 'Gravando Lançamentos...',
    text: 'Atualizando seus saldos e memorizando regras aprendidas.',
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  try {
    const res = await fetch('/api/import/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    Swal.close();

    if (data.success) {
      closeModal('modal-import');
      resetImportModal();
      await loadAllData();

      Swal.fire({
        icon: 'success',
        title: 'Importação Concluída com Sucesso!',
        html: `
          <p class="text-sm text-slate-600 dark:text-slate-300">${data.message}</p>
        `,
        confirmButtonColor: '#4f46e5'
      });
    } else {
      Swal.fire({ icon: 'error', title: 'Erro ao gravar transações', text: data.error });
    }
  } catch (err) {
    Swal.close();
    console.error('Erro na confirmação:', err);
    Swal.fire({ icon: 'error', title: 'Erro de conexão', text: 'Não foi possível gravar os lançamentos.' });
  }
}

// ========================================================
// RECORRÊNCIAS & DESPESAS FIXAS
// ========================================================
async function loadRecorrencias() {
  try {
    const res = await fetch('/api/recorrencias');
    if (res.status === 401) { window.location.href = '/login'; return; }
    state.recorrencias = await res.json();
    renderRecorrenciasTable();
  } catch (err) {
    console.error('Erro ao carregar recorrências:', err);
  }
}

function renderRecorrenciasTable() {
  const tbody = document.getElementById('tbody-recorrencias');
  const emptyMsg = document.getElementById('recorrencias-empty-msg');
  if (!tbody) return;

  if (state.recorrencias.length === 0) {
    tbody.innerHTML = '';
    if (emptyMsg) emptyMsg.classList.remove('hidden');
    return;
  }

  if (emptyMsg) emptyMsg.classList.add('hidden');

  tbody.innerHTML = state.recorrencias.map(r => {
    const isReceita = r.tipo === 'receita';
    return `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
        <td class="py-3.5 px-4 font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
          Todo dia ${r.dia_vencimento}
        </td>
        <td class="py-3.5 px-4">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl flex items-center justify-center text-white" style="background-color: ${r.categoria_cor || (isReceita ? '#10b981' : '#f43f5e')};">
              <i data-lucide="${r.categoria_icone || 'refresh-cw'}" class="w-4 h-4"></i>
            </div>
            <div>
              <span class="font-bold text-slate-900 dark:text-white">${r.descricao}</span>
              <div class="text-xs text-slate-500">${r.categoria_nome || 'Sem Categoria'}</div>
            </div>
          </div>
        </td>
        <td class="py-3.5 px-4 text-xs font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
          ${formatDateBR(r.data_inicio)}
        </td>
        <td class="py-3.5 px-4 text-slate-700 dark:text-slate-300 whitespace-nowrap">
          ${r.conta_nome || '<span class="text-slate-400">Não definida</span>'}
        </td>
        <td class="py-3.5 px-4 text-right font-extrabold whitespace-nowrap ${isReceita ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
          ${isReceita ? '+ ' : '- '}${formatBRL(r.valor)}
        </td>
        <td class="py-3.5 px-4 text-center whitespace-nowrap">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="editarRecorrencia(${r.id})" title="Editar Recorrência" class="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg transition">
              <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="excluirRecorrenciaDefinitivo(${r.id})" title="Excluir Definitivo (Remove do Dashboard)" class="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg transition">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

async function forceGenerateRecurring() {
  try {
    const res = await fetch('/api/recorrencias/gerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mes: state.selectedMonth, ano: state.selectedYear })
    });
    const data = await res.json();
    await loadAllData();

    Swal.fire({
      icon: 'success',
      title: 'Recorrências Sincronizadas!',
      text: data.message,
      timer: 2000,
      showConfirmButton: false
    });
  } catch (err) {
    console.error('Erro ao gerar recorrências:', err);
  }
}

function editarRecorrencia(id) {
  const rec = state.recorrencias.find(r => r.id === id);
  if (!rec) return;

  document.getElementById('modal-rec-titulo').textContent = 'Editar Recorrência';
  document.getElementById('rec-id').value = rec.id;
  document.getElementById('rec-descricao').value = rec.descricao;
  document.getElementById('rec-valor').value = rec.valor;
  document.getElementById('rec-dia').value = rec.dia_vencimento;
  document.getElementById('rec-data-inicio').value = rec.data_inicio || new Date().toISOString().split('T')[0];
  document.getElementById('rec-data-fim').value = rec.data_fim || '';

  setTipoRecorrencia(rec.tipo);

  if (rec.conta_id) {
    document.getElementById('rec-conta').value = rec.conta_id;
  }
  if (rec.categoria_id) {
    document.getElementById('rec-categoria').value = rec.categoria_id;
  }

  openModal('modal-recorrencia');
}

async function excluirRecorrenciaDefinitivo(id) {
  const result = await Swal.fire({
    title: 'Excluir Recorrência?',
    html: `
      <p class="text-sm text-slate-400">A recorrência será removida e <b>todas as despesas pendentes geradas no dashboard serão excluídas imediatamente</b>.</p>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Sim, excluir definitivo',
    cancelButtonText: 'Cancelar'
  });

  if (result.isConfirmed) {
    try {
      const res = await fetch(`/api/recorrencias/${id}?remover_pendentes=true`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await loadAllData();
        Swal.fire({
          title: 'Removida com Sucesso!',
          text: data.message,
          icon: 'success',
          timer: 1600,
          showConfirmButton: false
        });
      }
    } catch (err) {
      console.error(err);
    }
  }
}

// ========================================================
// CONTAS BANCÁRIAS (TAB GESTÃO)
// ========================================================
function renderContasTab() {
  const container = document.getElementById('grid-contas-gerenciamento');
  if (!container) return;

  if (state.contas.length === 0) {
    container.innerHTML = `
      <div class="col-span-full p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
        <div class="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center mx-auto mb-3 text-indigo-500">
          <i data-lucide="landmark" class="w-6 h-6"></i>
        </div>
        <p class="text-sm font-bold text-slate-800 dark:text-slate-200">Você ainda não possui contas bancárias cadastradas</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Cadastre seus bancos ou carteira em dinheiro para gerenciar saldos e transferências.</p>
        <button onclick="document.getElementById('btn-nova-conta-tab').click()" class="mt-4 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold shadow-md shadow-indigo-600/30">
          + Cadastrar Minha Primeira Conta
        </button>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  container.innerHTML = state.contas.map(c => {
    const isConectada = c.integracao_status === 'conectado';
    return `
    <div class="bank-card bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between" style="--account-color: ${c.cor};">
      <div>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold" style="background-color: ${c.cor};">
              <i data-lucide="landmark" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="font-bold text-slate-900 dark:text-white">${c.nome}</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400">${c.instituicao || ''} &bull; ${c.tipo}</p>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button onclick="editarConta(${c.id})" title="Editar Conta" class="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg">
              <i data-lucide="pencil" class="w-4 h-4"></i>
            </button>
            <button onclick="excluirConta(${c.id})" title="Desativar Conta" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg">
              <i data-lucide="trash-2" class="w-4 h-4"></i>
            </button>
          </div>
        </div>

        <!-- Open Finance Badge & Ações de Conexão -->
        <div class="mt-3.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            ${isConectada ? `
              <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <div>
                <span class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">Open Finance Conectado</span>
                ${c.ultimo_sync ? `<p class="text-[9px] text-slate-400">Sync: ${c.ultimo_sync}</p>` : ''}
              </div>
            ` : `
              <div class="w-2 h-2 rounded-full bg-slate-400"></div>
              <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400">Modo Manual</span>
            `}
          </div>

          <div class="flex items-center gap-1.5">
            ${isConectada ? `
              <button onclick="sincronizarExtratoConta(${c.id})" title="Sincronizar extrato bancário agora" class="px-2.5 py-1 text-[11px] font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition flex items-center gap-1">
                <i data-lucide="zap" class="w-3 h-3"></i>
                <span>Sincronizar</span>
              </button>
              <button onclick="abrirModalOpenFinance(${c.id})" title="Alterar banco ou reconectar" class="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                <i data-lucide="settings-2" class="w-3.5 h-3.5"></i>
              </button>
            ` : `
              <button onclick="abrirModalOpenFinance(${c.id})" class="px-2.5 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 rounded-lg border border-indigo-200/60 dark:border-indigo-800/40 transition flex items-center gap-1">
                <i data-lucide="link" class="w-3 h-3"></i>
                <span>Conectar Banco</span>
              </button>
            `}
          </div>
        </div>

        <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2">
          <div class="flex justify-between text-xs">
            <span class="text-slate-500">Saldo Inicial:</span>
            <span class="font-medium text-slate-700 dark:text-slate-300">${formatBRL(c.saldo_inicial)}</span>
          </div>
          <div class="flex justify-between text-xs">
            <span class="text-slate-500">Receitas Recebidas:</span>
            <span class="font-medium text-emerald-500">+${formatBRL(c.receitas_pagas || 0)}</span>
          </div>
          <div class="flex justify-between text-xs">
            <span class="text-slate-500">Despesas Pagas:</span>
            <span class="font-medium text-rose-500">-${formatBRL(c.despesas_pagas || 0)}</span>
          </div>
        </div>
      </div>

      <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <span class="text-xs font-semibold text-slate-500">Saldo Atual:</span>
        <span class="text-xl font-extrabold ${c.saldo_atual >= 0 ? 'text-slate-900 dark:text-white' : 'text-rose-500'}">
          ${formatBRL(c.saldo_atual)}
        </span>
      </div>
    </div>
    `;
  }).join('');

  lucide.createIcons();
}

function editarConta(id) {
  const conta = state.contas.find(c => c.id === id);
  if (!conta) return;

  document.getElementById('modal-conta-titulo').textContent = 'Editar Conta Bancária';
  document.getElementById('conta-id').value = conta.id;
  document.getElementById('conta-nome').value = conta.nome;
  document.getElementById('conta-instituicao').value = conta.instituicao || '';
  document.getElementById('conta-tipo').value = conta.tipo;
  document.getElementById('conta-saldo-inicial').value = conta.saldo_inicial;
  document.getElementById('conta-cor').value = conta.cor || '#3b82f6';
  document.getElementById('conta-cor-label').textContent = conta.cor || '#3b82f6';

  const bancoSelect = document.getElementById('conta-banco-id');
  if (bancoSelect) {
    bancoSelect.value = conta.banco_id || '';
  }

  openModal('modal-conta');
}

// ========================================================
// CONTROLE DO MODAL OPEN FINANCE
// ========================================================
let selectedOpenFinanceBank = null;
let supportedBanksList = [];

async function setupOpenFinanceModalHandlers() {
  const btnLive = document.getElementById('btn-connect-pluggy-live');
  const btnSandbox = document.getElementById('btn-confirm-sandbox-connect');
  const btnDesconectar = document.getElementById('btn-desconectar-banco-modal');

  // 1. CONEXÃO AO VIVO (BANCO REAL VIA PLUGGY)
  btnLive?.addEventListener('click', async () => {
    const contaId = document.getElementById('open-finance-target-conta-id')?.value;
    if (!contaId) {
      Swal.fire({ icon: 'warning', title: 'Atenção', text: 'Nenhuma conta bancária selecionada.' });
      return;
    }

    Swal.fire({
      title: 'Iniciando Open Finance...',
      text: 'Comunicando com o Banco Central e autenticador Pluggy.ai...',
      allowOutsideClick: false,
      didOpen: () => { Swal.showLoading(); }
    });

    try {
      const tokenRes = await fetch('/api/open-finance/connect-token');
      const tokenData = await tokenRes.json();
      Swal.close();

      if (tokenData.success && tokenData.connectToken && typeof PluggyConnect !== 'undefined') {
        closeModal('modal-open-finance');

        const pluggyConnect = new PluggyConnect({
          connectToken: tokenData.connectToken,
          includeSandbox: true,
          onSuccess: async (itemData) => {
            try {
              const itemId = itemData.item ? itemData.item.id : itemData.id;
              const connectorName = itemData.item?.connector?.name || 'pluggy';

              Swal.fire({
                title: 'Vinculando Conta...',
                text: 'Registrando conexão Open Finance segura.',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
              });

              await fetch('/api/open-finance/save-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  conta_id: parseInt(contaId),
                  item_id: itemId,
                  banco_id: connectorName.toLowerCase()
                })
              });

              await loadAllData();
              Swal.fire({
                icon: 'success',
                title: 'Banco Real Conectado!',
                text: 'Sua conta bancária foi vinculada com sucesso via Open Finance Brasil! Agora você pode sincronizar seus extratos reais.',
                confirmButtonColor: '#4f46e5'
              });
            } catch (saveErr) {
              console.error('Erro ao salvar conexão:', saveErr);
            }
          },
          onError: (error) => {
            console.error('Pluggy Connect Error:', error);
            Swal.fire({
              icon: 'error',
              title: 'Erro na Conexão Bancária',
              text: error?.message || 'Não foi possível concluir a autenticação no banco.'
            });
          },
          onClose: () => {
            console.log('Pluggy Connect fechado pelo usuário.');
          }
        });

        pluggyConnect.init();
      } else {
        // Exibe diagnóstico detalhado
        Swal.fire({
          icon: 'warning',
          title: 'Atenção: Chaves da Pluggy Pendentes',
          html: `
            <div class="text-left space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <p class="font-semibold text-rose-500">${tokenData.error || 'Não foi possível obter o token da Pluggy.'}</p>
              <div class="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl space-y-1.5 border border-slate-200 dark:border-slate-700">
                <p class="font-bold text-slate-800 dark:text-white">Como ativar a conexão com seu banco real:</p>
                <p><b>1. Na Vercel:</b> Acesse seu projeto ➔ <b>Settings</b> ➔ <b>Environment Variables</b> e adicione <code>PLUGGY_CLIENT_ID</code> e <code>PLUGGY_CLIENT_SECRET</code>.</p>
                <p><b>2. Redeploy:</b> Acesse a aba <b>Deployments</b> ➔ clique nos <code>...</code> ➔ <b>Redeploy</b> para aplicar as novas variáveis.</p>
                <p><b>3. No Local (Localhost):</b> Crie um arquivo <code>.env</code> na raiz do projeto com as chaves.</p>
              </div>
            </div>
          `,
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#4f46e5'
        });
      }
    } catch (err) {
      Swal.close();
      console.error('Erro ao chamar connect-token:', err);
      Swal.fire({ icon: 'error', title: 'Erro', text: 'Falha na comunicação com o servidor.' });
    }
  });

  // 2. CONEXÃO SANDBOX (SIMULADOR DE DEMONSTRAÇÃO)
  btnSandbox?.addEventListener('click', async () => {
    const contaId = document.getElementById('open-finance-target-conta-id')?.value;
    if (!contaId) {
      Swal.fire({ icon: 'warning', title: 'Atenção', text: 'Nenhuma conta selecionada.' });
      return;
    }

    if (!selectedOpenFinanceBank) {
      Swal.fire({ icon: 'warning', title: 'Selecione um Banco', text: 'Por favor, clique em um dos bancos da lista para simular o extrato.' });
      return;
    }

    try {
      const res = await fetch('/api/open-finance/conectar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conta_id: parseInt(contaId),
          banco_id: selectedOpenFinanceBank.id,
          tipo: 'open_finance_sandbox'
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        closeModal('modal-open-finance');
        await loadAllData();
        Swal.fire({
          icon: 'success',
          title: 'Modo Simulado Ativado!',
          text: `A conta foi vinculada ao ${selectedOpenFinanceBank.nome} no modo Simulador/Sandbox. Ao clicar em Sincronizar, a IA gerará lançamentos fictícios de alta fidelidade para você testar.`,
          confirmButtonColor: '#4f46e5'
        });
      } else {
        Swal.fire({ icon: 'error', title: 'Erro na conexão', text: data.error });
      }
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: 'error', title: 'Erro', text: 'Falha na comunicação com o servidor.' });
    }
  });

  // 3. DESCONECTAR BANCO
  btnDesconectar?.addEventListener('click', async () => {
    const contaId = document.getElementById('open-finance-target-conta-id')?.value;
    if (!contaId) return;

    const result = await Swal.fire({
      title: 'Desconectar Banco?',
      text: 'A conta voltará ao modo manual. Nenhum lançamento já importado será apagado.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Sim, desconectar',
      cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        const res = await fetch('/api/open-finance/desconectar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conta_id: parseInt(contaId) })
        });
        const data = await res.json();
        if (data.success) {
          closeModal('modal-open-finance');
          await loadAllData();
          Swal.fire({ icon: 'success', title: 'Desconectado', text: 'A integração bancária foi removida com sucesso.', timer: 1500, showConfirmButton: false });
        }
      } catch (err) {
        console.error(err);
      }
    }
  });
}

async function abrirModalOpenFinance(contaId) {
  document.getElementById('open-finance-target-conta-id').value = contaId;
  const container = document.getElementById('grid-bancos-open-finance');
  const statusContainer = document.getElementById('open-finance-current-status');
  const btnDesconectar = document.getElementById('btn-desconectar-banco-modal');
  selectedOpenFinanceBank = null;

  const conta = state.contas.find(c => c.id === contaId);
  const isConectada = conta && conta.integracao_status === 'conectado';
  const isLive = conta && (conta.integracao_tipo === 'pluggy_live' || Boolean(conta.integracao_item_id));

  if (statusContainer) {
    if (isConectada) {
      statusContainer.innerHTML = `
        <div class="flex items-center gap-2">
          <div class="w-2.5 h-2.5 rounded-full ${isLive ? 'bg-emerald-500' : 'bg-amber-500'} animate-pulse"></div>
          <div>
            <p class="font-bold text-slate-800 dark:text-white">Status: ${isLive ? '🟢 Banco Real Conectado (Pluggy Live)' : '🟡 Modo Simulador (Sandbox)'}</p>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Instituição: <b>${conta.banco_id ? conta.banco_id.toUpperCase() : 'Bancária'}</b></p>
          </div>
        </div>
      `;
      btnDesconectar?.classList.remove('hidden');
    } else {
      statusContainer.innerHTML = `
        <div class="flex items-center gap-2">
          <div class="w-2.5 h-2.5 rounded-full bg-slate-400"></div>
          <div>
            <p class="font-bold text-slate-800 dark:text-white">Status: ⚪ Modo Manual (Sem Integração)</p>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Escolha uma das opções abaixo para sincronizar extratos</p>
          </div>
        </div>
      `;
      btnDesconectar?.classList.add('hidden');
    }
  }

  if (container) {
    container.innerHTML = `
      <div class="col-span-full py-4 text-center text-xs text-slate-400">
        <i data-lucide="refresh-cw" class="w-4 h-4 mx-auto animate-spin mb-1 text-indigo-500"></i>
        <span>Carregando bancos...</span>
      </div>
    `;
    lucide.createIcons();
  }

  openModal('modal-open-finance');

  try {
    if (supportedBanksList.length === 0) {
      const res = await fetch('/api/open-finance/bancos');
      const data = await res.json();
      if (data.success) {
        supportedBanksList = data.bancos;
      }
    }

    const bancoAtualId = conta?.banco_id;

    if (container) {
      container.innerHTML = supportedBanksList.map(b => {
        const isSelected = bancoAtualId === b.id;
        if (isSelected) selectedOpenFinanceBank = b;

        return `
          <button type="button" onclick="selectOpenFinanceBank('${b.id}')" id="bank-card-${b.id}" class="bank-select-card p-2.5 rounded-xl border text-left transition flex items-center gap-2.5 ${isSelected ? 'border-indigo-600 ring-2 ring-indigo-500/20 bg-indigo-50/40 dark:bg-indigo-950/40' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:border-slate-300 dark:hover:border-slate-600'}">
            <div class="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-white text-[10px] font-bold shadow-sm" style="background-color: ${b.cor};">
              <i data-lucide="${b.icone || 'landmark'}" class="w-3.5 h-3.5"></i>
            </div>
            <div class="overflow-hidden">
              <p class="text-xs font-bold text-slate-900 dark:text-white truncate">${b.nome}</p>
              <p class="text-[10px] text-slate-400 truncate">Cód. ${b.codigo}</p>
            </div>
          </button>
        `;
      }).join('');
      lucide.createIcons();
    }
  } catch (err) {
    console.error('Erro ao buscar bancos:', err);
  }
}

function selectOpenFinanceBank(bankId) {
  const bank = supportedBanksList.find(b => b.id === bankId);
  if (!bank) return;

  selectedOpenFinanceBank = bank;

  // Atualiza classes visuais dos cards
  document.querySelectorAll('.bank-select-card').forEach(card => {
    card.classList.remove('border-indigo-600', 'ring-2', 'ring-indigo-500/20', 'bg-indigo-50/40', 'dark:bg-indigo-950/40');
    card.classList.add('border-slate-200', 'dark:border-slate-700', 'bg-white', 'dark:bg-slate-800/80');
  });

  const activeCard = document.getElementById(`bank-card-${bankId}`);
  if (activeCard) {
    activeCard.classList.remove('border-slate-200', 'dark:border-slate-700', 'bg-white', 'dark:bg-slate-800/80');
    activeCard.classList.add('border-indigo-600', 'ring-2', 'ring-indigo-500/20', 'bg-indigo-50/40', 'dark:bg-indigo-950/40');
  }
}


async function excluirConta(id) {
  const result = await Swal.fire({
    title: 'Desativar Conta Bancária?',
    text: 'A conta será arquivada e não aparecerá nos novos lançamentos.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    confirmButtonText: 'Sim, desativar',
    cancelButtonText: 'Cancelar'
  });

  if (result.isConfirmed) {
    try {
      const res = await fetch(`/api/contas/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await loadAllData();
        Swal.fire({ title: 'Desativada!', icon: 'success', timer: 1200, showConfirmButton: false });
      } else {
        Swal.fire({ title: 'Atenção', text: data.error, icon: 'info' });
      }
    } catch (err) {
      console.error(err);
    }
  }
}

// ========================================================
// CATEGORIAS & MEMÓRIA DE REGRAS INTELIGENTES
// ========================================================
function renderCategoriasTab() {
  const listaDespesas = document.getElementById('lista-categorias-despesa');
  const listaReceitas = document.getElementById('lista-categorias-receita');

  const despesas = state.categorias.filter(c => c.tipo === 'despesa');
  const receitas = state.categorias.filter(c => c.tipo === 'receita');

  if (listaDespesas) {
    listaDespesas.innerHTML = despesas.map(c => `
      <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
        <div class="flex items-center gap-3">
          <div class="w-7 h-7 rounded-lg flex items-center justify-center text-white" style="background-color: ${c.cor || '#64748b'};">
            <i data-lucide="${c.icone || 'tag'}" class="w-3.5 h-3.5"></i>
          </div>
          <span class="text-xs font-semibold text-slate-800 dark:text-slate-200">${c.nome}</span>
        </div>
      </div>
    `).join('');
  }

  if (listaReceitas) {
    listaReceitas.innerHTML = receitas.map(c => `
      <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
        <div class="flex items-center gap-3">
          <div class="w-7 h-7 rounded-lg flex items-center justify-center text-white" style="background-color: ${c.cor || '#10b981'};">
            <i data-lucide="${c.icone || 'trending-up'}" class="w-3.5 h-3.5"></i>
          </div>
          <span class="text-xs font-semibold text-slate-800 dark:text-slate-200">${c.nome}</span>
        </div>
      </div>
    `).join('');
  }

  renderRegrasAprendidasGrid();
  lucide.createIcons();
}

function renderRegrasAprendidasGrid() {
  const container = document.getElementById('grid-regras-aprendidas');
  const countBadge = document.getElementById('badge-regras-count');
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${state.regrasAprendidas.length} regras`;
  }

  if (state.regrasAprendidas.length === 0) {
    container.innerHTML = `
      <div class="col-span-full p-6 text-center text-slate-400 bg-slate-50/50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700/60">
        <p class="text-xs">Nenhuma regra personalizada memorizada ainda.</p>
        <p class="text-[11px] text-slate-500 mt-1">Ao importar extratos bancários, marque "Lembrar" para memorizar novos padrões.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.regrasAprendidas.map(r => `
    <div class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between gap-2">
      <div class="min-w-0 flex-1">
        <span class="text-xs font-mono font-bold text-slate-900 dark:text-white uppercase truncate block">${r.termo_busca}</span>
        <span class="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium truncate block">➜ ${r.categoria_nome}</span>
      </div>
      <button onclick="excluirRegraAprendida(${r.id})" title="Remover Regra" class="p-1 text-slate-400 hover:text-rose-500 rounded">
        <i data-lucide="x" class="w-3.5 h-3.5"></i>
      </button>
    </div>
  `).join('');

  lucide.createIcons();
}

async function excluirRegraAprendida(id) {
  try {
    const res = await fetch(`/api/regras-categorizacao/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      await fetchRegrasAprendidas();
    }
  } catch (err) {
    console.error('Erro ao excluir regra:', err);
  }
}

// ========================================================
// CONTROLE DE MODAIS E FORMULÁRIOS
// ========================================================
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('hidden');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

function closeAllModals() {
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.classList.add('hidden');
  });
}

function setTipoLancamento(tipo) {
  state.currentTipoLancamento = tipo;

  const btnDespesa = document.querySelector('.btn-tipo-transacao[data-tipo="despesa"]');
  const btnReceita = document.querySelector('.btn-tipo-transacao[data-tipo="receita"]');
  const btnTransf = document.querySelector('.btn-tipo-transacao[data-tipo="transferencia"]');

  [btnDespesa, btnReceita, btnTransf].forEach(btn => {
    if (btn) {
      btn.className = 'btn-tipo-transacao py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white';
    }
  });

  const containerDestino = document.getElementById('container-conta-destino');
  const containerCategoria = document.getElementById('container-categoria');
  const containerStatus = document.getElementById('container-campo-status');
  const lblContaOrigem = document.getElementById('lbl-conta-origem');

  if (tipo === 'despesa') {
    btnDespesa.className = 'btn-tipo-transacao py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 bg-rose-600 text-white shadow-sm';
    containerDestino.classList.add('hidden');
    containerCategoria.classList.remove('hidden');
    containerStatus.classList.remove('hidden');
    lblContaOrigem.textContent = 'Conta Bancária *';
  } else if (tipo === 'receita') {
    btnReceita.className = 'btn-tipo-transacao py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 bg-emerald-600 text-white shadow-sm';
    containerDestino.classList.add('hidden');
    containerCategoria.classList.remove('hidden');
    containerStatus.classList.remove('hidden');
    lblContaOrigem.textContent = 'Conta de Depósito *';
  } else if (tipo === 'transferencia') {
    btnTransf.className = 'btn-tipo-transacao py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 bg-indigo-600 text-white shadow-sm';
    containerDestino.classList.remove('hidden');
    containerCategoria.classList.add('hidden');
    containerStatus.classList.add('hidden');
    lblContaOrigem.textContent = 'Conta de Origem *';
  }

  updateLancamentoCategorias();
  lucide.createIcons();
}

function setTipoRecorrencia(tipo) {
  state.currentRecTipo = tipo;
  const btnDesp = document.querySelector('.btn-rec-tipo[data-tipo="despesa"]');
  const btnRec = document.querySelector('.btn-rec-tipo[data-tipo="receita"]');

  if (tipo === 'despesa') {
    btnDesp.className = 'btn-rec-tipo py-1.5 rounded-lg text-xs font-bold transition bg-rose-600 text-white';
    btnRec.className = 'btn-rec-tipo py-1.5 rounded-lg text-xs font-bold transition text-slate-600 dark:text-slate-400';
  } else {
    btnRec.className = 'btn-rec-tipo py-1.5 rounded-lg text-xs font-bold transition bg-emerald-600 text-white';
    btnDesp.className = 'btn-rec-tipo py-1.5 rounded-lg text-xs font-bold transition text-slate-600 dark:text-slate-400';
  }

  populateCategoriasSelects();
}

// ========================================================
// CONFIGURAÇÃO DOS EVENT LISTENERS GERAIS
// ========================================================
function setupEventListeners() {
  document.getElementById('btn-logout')?.addEventListener('click', handleLogout);
  document.getElementById('btn-zerar-mes')?.addEventListener('click', zerarLancamentosMesAtual);

  document.getElementById('btn-mes-anterior')?.addEventListener('click', () => changeMonth(-1));
  document.getElementById('btn-mes-proximo')?.addEventListener('click', () => changeMonth(1));
  document.getElementById('btn-mes-atual')?.addEventListener('click', resetToCurrentMonth);
  document.getElementById('btn-toggle-theme')?.addEventListener('click', toggleTheme);

  // Tabs
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => {
        t.className = 'nav-tab flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 whitespace-nowrap';
      });
      tab.className = 'nav-tab active-tab flex items-center gap-2 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 border-indigo-600 text-indigo-600 dark:text-indigo-400 whitespace-nowrap';

      const tabTarget = tab.getAttribute('data-tab');
      state.activeTab = tabTarget;

      document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
      const activePane = document.getElementById(`tab-${tabTarget}`);
      if (activePane) activePane.classList.remove('hidden');

      loadAllData();
    });
  });

  // Botões de Modal
  document.getElementById('btn-open-modal-lancamento')?.addEventListener('click', () => {
    if (state.contas.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Cadastre uma Conta Primeiro',
        text: 'Para fazer um lançamento, você precisa cadastrar pelo menos uma conta bancária ou carteira.',
        confirmButtonText: 'Cadastrar Conta',
        confirmButtonColor: '#4f46e5'
      }).then(() => {
        document.getElementById('btn-quick-new-account')?.click();
      });
      return;
    }

    document.getElementById('form-lancamento').reset();
    document.getElementById('modal-lancamento-titulo').textContent = 'Novo Lançamento';
    document.getElementById('lancamento-id').value = '';
    document.getElementById('lancamento-data').value = new Date().toISOString().split('T')[0];
    setTipoLancamento('despesa');
    openModal('modal-lancamento');
  });

  document.getElementById('btn-quick-transfer')?.addEventListener('click', () => {
    if (state.contas.length < 2) {
      Swal.fire({
        icon: 'info',
        title: 'Necessário 2 Contas',
        text: 'Você precisa ter pelo menos 2 contas cadastradas para realizar transferências entre elas.',
        confirmButtonColor: '#4f46e5'
      });
      return;
    }
    document.getElementById('form-transferencia-modal').reset();
    document.getElementById('transf-data').value = new Date().toISOString().split('T')[0];
    openModal('modal-transferencia');
  });

  document.getElementById('btn-quick-new-account')?.addEventListener('click', () => {
    document.getElementById('form-conta').reset();
    document.getElementById('modal-conta-titulo').textContent = 'Nova Conta Bancária';
    document.getElementById('conta-id').value = '';
    document.getElementById('conta-cor').value = '#3b82f6';
    document.getElementById('conta-cor-label').textContent = '#3b82f6';
    openModal('modal-conta');
  });

  document.getElementById('btn-onboarding-conta')?.addEventListener('click', () => {
    document.getElementById('btn-quick-new-account')?.click();
  });

  document.getElementById('btn-nova-conta-tab')?.addEventListener('click', () => {
    document.getElementById('btn-quick-new-account')?.click();
  });

  document.getElementById('btn-modal-recorrencia')?.addEventListener('click', () => {
    document.getElementById('form-recorrencia').reset();
    document.getElementById('modal-rec-titulo').textContent = 'Nova Despesa / Receita Recorrente';
    document.getElementById('rec-id').value = '';
    document.getElementById('rec-dia').value = '5';
    document.getElementById('rec-data-inicio').value = new Date().toISOString().split('T')[0];
    document.getElementById('rec-data-fim').value = '';
    setTipoRecorrencia('despesa');
    openModal('modal-recorrencia');
  });

  document.getElementById('btn-nova-categoria-tab')?.addEventListener('click', () => {
    document.getElementById('form-categoria').reset();
    openModal('modal-categoria');
  });

  document.getElementById('btn-force-generate-recurring')?.addEventListener('click', forceGenerateRecurring);

  document.querySelectorAll('.btn-tipo-transacao').forEach(btn => {
    btn.addEventListener('click', () => setTipoLancamento(btn.getAttribute('data-tipo')));
  });

  document.querySelectorAll('.btn-rec-tipo').forEach(btn => {
    btn.addEventListener('click', () => setTipoRecorrencia(btn.getAttribute('data-tipo')));
  });

  document.getElementById('conta-cor')?.addEventListener('input', (e) => {
    document.getElementById('conta-cor-label').textContent = e.target.value;
  });

  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.addEventListener('click', closeAllModals);
  });

  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) closeAllModals();
  });

  // Filtros
  ['filtro-busca', 'filtro-conta', 'filtro-categoria', 'filtro-tipo', 'filtro-status'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => loadTransacoes());
      el.addEventListener('change', () => loadTransacoes());
    }
  });

  document.getElementById('btn-limpar-filtros')?.addEventListener('click', () => {
    document.getElementById('filtro-busca').value = '';
    document.getElementById('filtro-conta').value = '';
    document.getElementById('filtro-categoria').value = '';
    document.getElementById('filtro-tipo').value = '';
    document.getElementById('filtro-status').value = '';
    loadTransacoes();
  });

  // Form Lançamento
  document.getElementById('form-lancamento')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('lancamento-id').value;
    const tipo = state.currentTipoLancamento;
    const descricao = document.getElementById('lancamento-descricao').value;
    const valor = parseFloat(document.getElementById('lancamento-valor').value);
    const data = document.getElementById('lancamento-data').value;
    const status = tipo === 'transferencia' ? 'pago' : document.getElementById('lancamento-status').value;
    const contaId = document.getElementById('lancamento-conta').value;
    const contaDestinoId = tipo === 'transferencia' ? document.getElementById('lancamento-conta-destino').value : null;
    const categoriaId = tipo !== 'transferencia' ? document.getElementById('lancamento-categoria').value || null : null;
    const observacoes = document.getElementById('lancamento-observacoes').value;

    const payload = { tipo, descricao, valor, data, status, conta_id: contaId, conta_destino_id: contaDestinoId, categoria_id: categoriaId, observacoes };
    const url = id ? `/api/transacoes/${id}` : '/api/transacoes';
    const method = id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const resData = await res.json();
      if (resData.success) {
        closeModal('modal-lancamento');
        await loadAllData();
        Swal.fire({ icon: 'success', title: id ? 'Lançamento Atualizado!' : 'Lançamento Salvo!', timer: 1400, showConfirmButton: false });
      } else {
        Swal.fire({ icon: 'error', title: 'Erro', text: resData.error });
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Form Transferência
  document.getElementById('form-transferencia-modal')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const contaOrigem = document.getElementById('transf-origem').value;
    const contaDestino = document.getElementById('transf-destino').value;
    const valor = parseFloat(document.getElementById('transf-valor').value);
    const data = document.getElementById('transf-data').value;
    const descricao = document.getElementById('transf-descricao').value;

    try {
      const res = await fetch('/api/transferencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conta_origem_id: contaOrigem, conta_destino_id: contaDestino, valor, data, descricao })
      });
      const resData = await res.json();
      if (resData.success) {
        closeModal('modal-transferencia');
        await loadAllData();
        Swal.fire({ icon: 'success', title: 'Transferência Realizada!', timer: 1400, showConfirmButton: false });
      } else {
        Swal.fire({ icon: 'error', title: 'Erro', text: resData.error });
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Form Conta
  document.getElementById('form-conta')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('conta-id').value;
    const nome = document.getElementById('conta-nome').value;
    const instituicao = document.getElementById('conta-instituicao').value;
    const tipo = document.getElementById('conta-tipo').value;
    const saldoInicial = parseFloat(document.getElementById('conta-saldo-inicial').value) || 0;
    const cor = document.getElementById('conta-cor').value;
    const bancoId = document.getElementById('conta-banco-id')?.value || null;

    const payload = { 
      nome, 
      instituicao, 
      tipo, 
      saldo_inicial: saldoInicial, 
      cor,
      banco_id: bancoId,
      integracao_status: bancoId ? 'conectado' : 'desconectado',
      integracao_tipo: bancoId ? 'open_finance_sandbox' : 'manual'
    };
    const url = id ? `/api/contas/${id}` : '/api/contas';
    const method = id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const resData = await res.json();
      if (resData.success) {
        closeModal('modal-conta');
        await loadAllData();
        Swal.fire({ icon: 'success', title: id ? 'Conta Atualizada!' : 'Conta Criada!', timer: 1400, showConfirmButton: false });
      } else {
        Swal.fire({ icon: 'error', title: 'Erro', text: resData.error });
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Form Recorrência
  document.getElementById('form-recorrencia')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('rec-id').value;
    const tipo = state.currentRecTipo;
    const descricao = document.getElementById('rec-descricao').value;
    const valor = parseFloat(document.getElementById('rec-valor').value);
    const diaVencimento = parseInt(document.getElementById('rec-dia').value);
    const dataInicio = document.getElementById('rec-data-inicio').value;
    const dataFim = document.getElementById('rec-data-fim').value || null;
    const contaId = document.getElementById('rec-conta').value || null;
    const categoriaId = document.getElementById('rec-categoria').value || null;

    const payload = { tipo, descricao, valor, dia_vencimento: diaVencimento, data_inicio: dataInicio, data_fim: dataFim, frequencia: 'mensal', conta_id: contaId, categoria_id: categoriaId };
    const url = id ? `/api/recorrencias/${id}` : '/api/recorrencias';
    const method = id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const resData = await res.json();
      if (resData.success) {
        closeModal('modal-recorrencia');
        await loadAllData();
        Swal.fire({ icon: 'success', title: id ? 'Recorrência Atualizada!' : 'Recorrência Cadastrada!', timer: 1400, showConfirmButton: false });
      } else {
        Swal.fire({ icon: 'error', title: 'Erro', text: resData.error });
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Form Categoria
  document.getElementById('form-categoria')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('cat-nome').value;
    const tipo = document.getElementById('cat-tipo').value;
    const cor = document.getElementById('cat-cor').value;

    try {
      const res = await fetch('/api/categorias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, tipo, cor })
      });
      const resData = await res.json();
      if (resData.success) {
        closeModal('modal-categoria');
        await fetchCategorias();
        renderCategoriasTab();
        Swal.fire({ icon: 'success', title: 'Categoria Criada!', timer: 1400, showConfirmButton: false });
      } else {
        Swal.fire({ icon: 'error', title: 'Erro', text: resData.error });
      }
    } catch (err) {
      console.error(err);
    }
  });

  // Atalhos de Teclado
  window.addEventListener('keydown', (e) => {
    const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
    if (!isInput && !e.ctrlKey && !e.metaKey) {
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        document.getElementById('btn-open-modal-lancamento')?.click();
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        document.getElementById('btn-open-modal-import')?.click();
      }
    } else if (e.key === 'Escape') {
      closeAllModals();
    }
  });
}

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
  modalBillingCycle: 'anual',
  subscription: null,
  // Estado de Importação de Arquivo
  import: {
    selectedFile: null,
    contaId: null,
    previewTransactions: []
  },
  charts: {
    categorias: null,
    historico: null,
    gastosDiarios: null
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

    // Exibir aba de Gestão Master / Clientes caso seja administrador
    updateAdminNavVisibility();

    updateSubscriptionUI(state.user);

    // Verificar se é o primeiro acesso para exibir o Guia Interativo de Boas-Vindas
    if (state.user && state.user.id) {
      const tourSeen = localStorage.getItem(`finflow_tour_seen_${state.user.id}`);
      if (!tourSeen) {
        setTimeout(() => {
          openTourModal(1);
        }, 700);
      }
    }

    return true;
  } catch (err) {
    window.location.href = '/login';
    return false;
  }
}

// ========================================================
// CONTROLE DE ASSINATURA & PLANOS SAAS
// ========================================================
function updateSubscriptionUI(sub) {
  if (!sub) return;
  const badgeNome = document.getElementById('badge-plano-nome');
  const badgeTag = document.getElementById('badge-plano-tag');
  const statusTitulo = document.getElementById('status-plano-titulo');
  const statusUsoContas = document.getElementById('status-uso-contas');
  const statusUsoTrans = document.getElementById('status-uso-trans');

  const planoNomeMap = {
    'free': 'Freemium (Grátis)',
    'starter': 'Starter / MVP',
    'pro': 'Padrão PRO',
    'family': 'Família / MEI'
  };

  const planoNomeCurto = {
    'free': 'GRÁTIS',
    'starter': 'STARTER',
    'pro': 'PRO',
    'family': 'FAMÍLIA'
  };

  const planoKey = sub.plano || 'free';
  const isTrial = sub.is_trial || false;
  const diasTrial = sub.dias_restantes_trial || 0;
  const status = sub.plano_status || 'active';

  if (badgeNome) {
    badgeNome.textContent = planoNomeCurto[planoKey] || planoKey.toUpperCase();
  }

  if (badgeTag) {
    if (isTrial) {
      badgeTag.textContent = `${diasTrial}d Trial`;
      badgeTag.className = 'text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/30';
      badgeTag.classList.remove('hidden');
    } else if (status === 'expired' || status === 'canceled') {
      badgeTag.textContent = 'Expirado';
      badgeTag.className = 'text-[9px] px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-300 border border-rose-500/30';
      badgeTag.classList.remove('hidden');
    } else if (planoKey !== 'free') {
      badgeTag.textContent = 'Ativo';
      badgeTag.className = 'text-[9px] px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30';
      badgeTag.classList.remove('hidden');
    } else {
      badgeTag.classList.add('hidden');
    }
  }

  if (statusTitulo) {
    const badgeText = isTrial ? `${diasTrial} dias restantes (Trial)` : (status === 'active' ? 'Ativo' : (status === 'expired' ? 'Expirado' : 'Gratuito'));
    const badgeStyle = isTrial 
      ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/30' 
      : (status === 'active' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-slate-500/20 text-slate-600 dark:text-slate-400 border-slate-500/30');

    statusTitulo.innerHTML = `
      ${sub.plano_nome || planoNomeMap[planoKey] || 'Padrão PRO'}
      <span id="status-plano-badge-sub" class="text-[10px] px-2 py-0.5 rounded-full border ${badgeStyle}">${badgeText}</span>
    `;
  }

  if (statusUsoContas && sub.uso && sub.limites) {
    const maxC = sub.limites.max_contas > 1000 ? 'Ilimitadas' : sub.limites.max_contas;
    statusUsoContas.textContent = `${sub.uso.total_contas || 0} / ${maxC}`;
  }

  if (statusUsoTrans && sub.uso && sub.limites) {
    const maxT = sub.limites.max_transacoes_mes > 1000 ? 'Ilimitados' : sub.limites.max_transacoes_mes;
    statusUsoTrans.textContent = `${sub.uso.total_transacoes_mes || 0} / ${maxT}`;
  }
}

async function loadSubscriptionStatus() {
  try {
    const res = await fetch('/api/subscription/status');
    if (!res.ok) return;
    const data = await res.json();
    if (data.subscription) {
      state.subscription = data.subscription;
      if (state.user) {
        state.user.plano = data.subscription.plano;
        state.user.plano_nome = data.subscription.plano_nome;
        state.user.plano_status = data.subscription.plano_status;
        state.user.is_trial = data.subscription.is_trial;
        state.user.dias_restantes_trial = data.subscription.dias_restantes_trial;
        state.user.limites = data.subscription.limites;
        state.user.uso = data.subscription.uso;
        state.user.permissoes = data.subscription.permissoes;
      }
      updateSubscriptionUI(data.subscription);
    }
  } catch (err) {
    console.error('Erro ao carregar status da assinatura:', err);
  }
}

function openModalPlanos() {
  loadSubscriptionStatus();
  openModal('modal-planos');
}
window.openModalPlanos = openModalPlanos;

function switchModalBillingCycle(cycle) {
  state.modalBillingCycle = cycle;
  const btnMensal = document.getElementById('btn-modal-cycle-mensal');
  const btnAnual = document.getElementById('btn-modal-cycle-anual');

  const pStarter = document.getElementById('modal-price-starter');
  const uStarter = document.getElementById('modal-unit-starter');
  const sStarter = document.getElementById('modal-sub-starter');

  const pPro = document.getElementById('modal-price-pro');
  const uPro = document.getElementById('modal-unit-pro');
  const sPro = document.getElementById('modal-sub-pro');

  const pFam = document.getElementById('modal-price-family');
  const uFam = document.getElementById('modal-unit-family');
  const sFam = document.getElementById('modal-sub-family');

  if (cycle === 'anual') {
    if (btnAnual) btnAnual.className = 'px-4 py-1.5 rounded-xl text-xs font-bold transition bg-indigo-600 text-white shadow-md shadow-indigo-600/30 flex items-center gap-1.5';
    if (btnMensal) btnMensal.className = 'px-4 py-1.5 rounded-xl text-xs font-bold transition text-slate-600 dark:text-slate-400';

    if (pStarter) pStarter.textContent = 'R$ 99,00';
    if (uStarter) uStarter.textContent = '/ano';
    if (sStarter) sStarter.textContent = 'Equivalente a R$ 8,25/mês (45% OFF)';

    if (pPro) pPro.textContent = 'R$ 199,00';
    if (uPro) uPro.textContent = '/ano';
    if (sPro) sPro.textContent = 'Equivalente a R$ 16,58/mês (45% OFF)';

    if (pFam) pFam.textContent = 'R$ 349,00';
    if (uFam) uFam.textContent = '/ano';
    if (sFam) sFam.textContent = 'Equivalente a R$ 29,00/mês (45% OFF)';
  } else {
    if (btnMensal) btnMensal.className = 'px-4 py-1.5 rounded-xl text-xs font-bold transition bg-indigo-600 text-white shadow-md shadow-indigo-600/30 flex items-center gap-1.5';
    if (btnAnual) btnAnual.className = 'px-4 py-1.5 rounded-xl text-xs font-bold transition text-slate-600 dark:text-slate-400';

    if (pStarter) pStarter.textContent = 'R$ 14,90';
    if (uStarter) uStarter.textContent = '/mês';
    if (sStarter) sStarter.textContent = 'Cobrança mensal flexível';

    if (pPro) pPro.textContent = 'R$ 29,90';
    if (uPro) uPro.textContent = '/mês';
    if (sPro) sPro.textContent = 'Cobrança mensal flexível';

    if (pFam) pFam.textContent = 'R$ 49,90';
    if (uFam) uFam.textContent = '/mês';
    if (sFam) sFam.textContent = 'Cobrança mensal flexível';
  }
}
window.switchModalBillingCycle = switchModalBillingCycle;

async function iniciarCheckoutPlano(plano, metodo = 'cartao') {
  const periodo = state.modalBillingCycle || 'anual';
  
  Swal.fire({
    title: 'Processando Assinatura...',
    text: `Configurando sua ativação no plano ${plano.toUpperCase()}...`,
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    }
  });

  try {
    const res = await fetch('/api/subscription/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plano, periodo, metodo, gateway: 'stripe' })
    });

    const data = await res.json();
    Swal.close();

    if (res.ok && data.success) {
      closeModal('modal-planos');
      await loadSubscriptionStatus();
      await loadAllData();

      Swal.fire({
        icon: 'success',
        title: 'Assinatura Ativada com Sucesso!',
        html: `
          <div class="space-y-2 text-center">
            <p class="text-sm font-bold text-slate-800 dark:text-slate-200">Parabéns! Seu plano <b>${data.plano_nome}</b> (${data.periodo === 'anual' ? 'Anual' : 'Mensal'}) já está ativo.</p>
            <p class="text-xs text-slate-500">Todos os recursos avançados foram liberados na sua conta.</p>
          </div>
        `,
        confirmButtonColor: '#4f46e5',
        confirmButtonText: 'Continuar no FinFlow'
      });
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Erro ao processar assinatura',
        text: data.error || 'Não foi possível concluir o checkout.'
      });
    }
  } catch (err) {
    Swal.close();
    console.error('Erro no checkout:', err);
    Swal.fire({ icon: 'error', title: 'Erro de Conexão', text: 'Não foi possível comunicar com o gateway de pagamento.' });
  }
}
window.iniciarCheckoutPlano = iniciarCheckoutPlano;

function handleApiUpgradeOrError(res, data) {
  if (data && data.upgrade_required) {
    Swal.fire({
      title: 'Recurso Exclusivo FinFlow',
      text: data.error,
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'Ver Planos & Fazer Upgrade',
      cancelButtonText: 'Agora Não',
      confirmButtonColor: '#4f46e5',
      cancelButtonColor: '#64748b'
    }).then((result) => {
      if (result.isConfirmed) {
        openModalPlanos();
      }
    });
    return true;
  }
  return false;
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
  } else if (state.activeTab === 'admin') {
    loadAdminData();
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

    renderInsightsIA(data.insights_ia, data.despesas_por_categoria);
    renderChartCategorias(data.despesas_por_categoria);
    renderChartHistorico(data.historico_meses);
    renderChartGastosDiarios(data.despesas_diarias);
    renderAlertas(data.alertas);

    lucide.createIcons();
  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
  }
}

function renderInsightsIA(insights, despesasPorCategoria) {
  const container = document.getElementById('card-insights-ia-container');
  const sugestoesContainer = document.getElementById('insights-ia-sugestoes');
  const badgeSaude = document.getElementById('badge-saude-financeira');
  const maiorCatNome = document.getElementById('maior-cat-nome');
  const maiorCatPct = document.getElementById('maior-cat-pct');
  const maiorCatValor = document.getElementById('maior-cat-valor');
  const maiorCatIconBox = document.getElementById('maior-cat-icon-box');
  const labelPoupanca = document.getElementById('label-taxa-poupanca');
  const barPoupanca = document.getElementById('bar-taxa-poupanca');

  if (!container) return;

  if (!insights) {
    if (sugestoesContainer) sugestoesContainer.innerHTML = '<p class="text-xs text-slate-400">Carregando análise da IA...</p>';
    return;
  }

  // 1. Sugestões da IA
  if (sugestoesContainer) {
    const sugestoes = insights.sugestoes || [];
    if (sugestoes.length === 0) {
      sugestoesContainer.innerHTML = '<p class="text-xs text-slate-300">Nenhuma movimentação para analisar neste período.</p>';
    } else {
      sugestoesContainer.innerHTML = sugestoes.map(s => `
        <div class="flex items-start gap-2 text-xs leading-relaxed">
          <span class="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0"></span>
          <span>${s}</span>
        </div>
      `).join('');
    }
  }

  // 2. Badge de Saúde Financeira
  if (badgeSaude) {
    const status = insights.status_saude || 'neutro';
    if (status === 'excelente') {
      badgeSaude.textContent = 'Excelente (Poupança Alta)';
      badgeSaude.className = 'text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    } else if (status === 'estavel') {
      badgeSaude.textContent = 'Equilibrado';
      badgeSaude.className = 'text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40';
    } else if (status === 'alerta') {
      badgeSaude.textContent = 'Alerta de Gastos';
      badgeSaude.className = 'text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40';
    } else {
      badgeSaude.textContent = 'Sem Lançamentos';
      badgeSaude.className = 'text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/40';
    }
  }

  // 3. Maior Categoria de Gastos
  const maiorCat = insights.maior_categoria;
  if (maiorCat) {
    if (maiorCatNome) maiorCatNome.textContent = maiorCat.nome;
    if (maiorCatPct) maiorCatPct.textContent = `${maiorCat.percentual}% do total de despesas`;
    if (maiorCatValor) maiorCatValor.textContent = formatBRL(maiorCat.total);
    if (maiorCatIconBox) {
      maiorCatIconBox.style.backgroundColor = (maiorCat.cor || '#6366f1') + '33';
      maiorCatIconBox.style.color = maiorCat.cor || '#a5b4fc';
      maiorCatIconBox.innerHTML = `<i data-lucide="${maiorCat.icone || 'tag'}" class="w-3.5 h-3.5"></i>`;
    }
  } else {
    if (maiorCatNome) maiorCatNome.textContent = 'Sem despesas';
    if (maiorCatPct) maiorCatPct.textContent = '0% do total';
    if (maiorCatValor) maiorCatValor.textContent = formatBRL(0);
  }

  // 4. Taxa de Poupança
  const poupanca = Math.max(0, Math.min(100, insights.taxa_poupanca || 0));
  if (labelPoupanca) labelPoupanca.textContent = `${insights.taxa_poupanca || 0}%`;
  if (barPoupanca) {
    barPoupanca.style.width = `${poupanca}%`;
    if (insights.taxa_poupanca >= 20) {
      barPoupanca.className = 'bg-gradient-to-r from-emerald-500 to-teal-400 h-2 rounded-full transition-all duration-500';
    } else if (insights.taxa_poupanca > 0) {
      barPoupanca.className = 'bg-gradient-to-r from-indigo-500 to-cyan-400 h-2 rounded-full transition-all duration-500';
    } else {
      barPoupanca.className = 'bg-gradient-to-r from-rose-500 to-amber-500 h-2 rounded-full transition-all duration-500';
    }
  }
}

function renderChartCategorias(despesasPorCategoria) {
  const ctx = document.getElementById('chart-categorias');
  const emptyMsg = document.getElementById('chart-empty-msg');
  if (!ctx) return;

  if (state.charts.categorias) {
    try { state.charts.categorias.destroy(); } catch (e) {}
  }

  if (typeof Chart === 'undefined') {
    return;
  }

  if (!despesasPorCategoria || despesasPorCategoria.length === 0) {
    ctx.style.display = 'none';
    if (emptyMsg) emptyMsg.classList.remove('hidden');
    return;
  }

  ctx.style.display = 'block';
  if (emptyMsg) emptyMsg.classList.add('hidden');

  const isDark = document.documentElement.classList.contains('dark');
  const labels = despesasPorCategoria.map(d => `${d.categoria} (${d.percentual}%)`);
  const dataValues = despesasPorCategoria.map(d => d.total);
  const bgColors = despesasPorCategoria.map(d => d.cor || '#6366f1');

  try {
    state.charts.categorias = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: dataValues,
          backgroundColor: bgColors,
          borderWidth: 2,
          borderColor: isDark ? '#0f172a' : '#ffffff',
          hoverOffset: 6
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
        cutout: '70%'
      }
    });
  } catch (err) {
    console.error('Erro ao renderizar gráfico de categorias:', err);
  }
}

function renderChartHistorico(historico) {
  const ctx = document.getElementById('chart-historico');
  if (!ctx) return;

  if (state.charts.historico) {
    try { state.charts.historico.destroy(); } catch (e) {}
  }

  if (typeof Chart === 'undefined' || !historico || historico.length === 0) {
    return;
  }

  const isDark = document.documentElement.classList.contains('dark');
  const labels = historico.map(h => h.label);
  const receitas = historico.map(h => h.receitas);
  const despesas = historico.map(h => h.despesas);

  try {
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
  } catch (err) {
    console.error('Erro ao renderizar gráfico de histórico:', err);
  }
}



function renderChartGastosDiarios(despesasDiarias) {
  const ctx = document.getElementById('chart-gastos-diarios');
  const emptyMsg = document.getElementById('chart-diarios-empty');
  if (!ctx) return;

  if (state.charts.gastosDiarios) {
    try { state.charts.gastosDiarios.destroy(); } catch (e) {}
  }

  if (typeof Chart === 'undefined') {
    return;
  }

  if (!despesasDiarias || despesasDiarias.length === 0) {
    ctx.style.display = 'none';
    if (emptyMsg) emptyMsg.classList.remove('hidden');
    return;
  }

  ctx.style.display = 'block';
  if (emptyMsg) emptyMsg.classList.add('hidden');

  const isDark = document.documentElement.classList.contains('dark');
  const labels = despesasDiarias.map(d => `Dia ${d.dia}`);
  const dataValues = despesasDiarias.map(d => d.total);

  try {
    state.charts.gastosDiarios = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Despesas do Dia',
          data: dataValues,
          borderColor: '#f43f5e',
          backgroundColor: isDark ? 'rgba(244, 63, 94, 0.12)' : 'rgba(244, 63, 94, 0.08)',
          fill: true,
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#f43f5e',
          pointBorderColor: isDark ? '#0f172a' : '#ffffff',
          pointBorderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            titleColor: isDark ? '#f8fafc' : '#0f172a',
            bodyColor: isDark ? '#cbd5e1' : '#475569',
            borderColor: isDark ? '#334155' : '#e2e8f0',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: function(context) {
                return ` Gastos no Dia: ${formatBRL(context.raw)}`;
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
  } catch (err) {
    console.error('Erro ao renderizar gráfico de gastos diários:', err);
  }
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
// IMPORTAÇÃO BANCÁRIA INTELIGENTE (OFX / CSV / TXT COM IA)
// ========================================================
function setupImportEventListeners() {
  const dropzone = document.getElementById('import-dropzone');
  const fileInput = document.getElementById('import-file-input');
  const btnProcess = document.getElementById('btn-import-process-file');
  const btnVoltar = document.getElementById('btn-import-voltar');
  const btnConfirmFinal = document.getElementById('btn-import-confirmar-final');
  const btnSelectAll = document.getElementById('btn-import-select-all');
  const btnUnselectAll = document.getElementById('btn-import-unselect-all');

  // Abrir modal de importação pelos botões da interface
  ['btn-open-modal-import', 'btn-quick-import', 'btn-extrato-importar'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', () => {
      abrirModalImportacao();
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
}

function abrirModalImportacao(contaId = null) {
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

  const selectConta = document.getElementById('import-conta-id');
  if (selectConta) {
    selectConta.innerHTML = state.contas.map(c => `
      <option value="${c.id}" ${contaId === c.id ? 'selected' : ''}>${c.nome} (${c.instituicao || c.tipo})</option>
    `).join('');

    if (contaId) selectConta.value = contaId;
  }

  openModal('modal-import');
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
      if (handleApiUpgradeOrError(res, data)) return;
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
      if (handleApiUpgradeOrError(res, data)) return;
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
        <button onclick="abrirModalConta()" class="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold shadow-md shadow-indigo-600/30 transition transform hover:-translate-y-0.5 cursor-pointer">
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

        <!-- Botão Ação Rápida: Importar Extrato OFX/CSV -->
        <div class="mt-3.5">
          <button onclick="abrirModalImportacao(${c.id})" class="w-full py-2 px-3 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-xl border border-indigo-200/60 dark:border-indigo-800/40 transition flex items-center justify-center gap-1.5 shadow-sm">
            <i data-lucide="file-up" class="w-3.5 h-3.5"></i>
            <span>Importar Extrato (OFX / CSV)</span>
          </button>
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

  openModal('modal-conta');
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
// ========================================================
// CONTROLE DE MODAIS E FORMULÁRIOS
// ========================================================
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('hidden');
}
window.openModal = openModal;

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}
window.closeModal = closeModal;

function closeAllModals() {
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.classList.add('hidden');
  });
}
window.closeAllModals = closeAllModals;

// Funções Universais de Abertura de Modais
function abrirModalConta(id = null) {
  if (id) {
    editarConta(id);
    return;
  }
  const form = document.getElementById('form-conta');
  if (form) form.reset();
  const titulo = document.getElementById('modal-conta-titulo');
  if (titulo) titulo.textContent = 'Nova Conta Bancária';
  const idEl = document.getElementById('conta-id');
  if (idEl) idEl.value = '';
  const corEl = document.getElementById('conta-cor');
  if (corEl) corEl.value = '#3b82f6';
  const corLabel = document.getElementById('conta-cor-label');
  if (corLabel) corLabel.textContent = '#3b82f6';
  openModal('modal-conta');
}
window.abrirModalConta = abrirModalConta;

function abrirModalLancamento() {
  if (state.contas.length === 0) {
    Swal.fire({
      icon: 'info',
      title: 'Cadastre uma Conta Primeiro',
      text: 'Para fazer um lançamento, você precisa cadastrar pelo menos uma conta bancária ou carteira.',
      confirmButtonText: 'Cadastrar Conta Agora',
      confirmButtonColor: '#4f46e5'
    }).then(() => {
      abrirModalConta();
    });
    return;
  }

  const form = document.getElementById('form-lancamento');
  if (form) form.reset();
  const titulo = document.getElementById('modal-lancamento-titulo');
  if (titulo) titulo.textContent = 'Novo Lançamento';
  const idEl = document.getElementById('lancamento-id');
  if (idEl) idEl.value = '';
  const dataEl = document.getElementById('lancamento-data');
  if (dataEl) dataEl.value = new Date().toISOString().split('T')[0];
  setTipoLancamento('despesa');
  openModal('modal-lancamento');
}
window.abrirModalLancamento = abrirModalLancamento;

function abrirModalTransferencia() {
  if (state.contas.length < 2) {
    Swal.fire({
      icon: 'info',
      title: 'Necessário 2 Contas',
      text: 'Você precisa ter pelo menos 2 contas cadastradas para realizar transferências entre elas.',
      confirmButtonText: 'Cadastrar Segunda Conta',
      confirmButtonColor: '#4f46e5'
    }).then(() => {
      abrirModalConta();
    });
    return;
  }
  const form = document.getElementById('form-transferencia-modal');
  if (form) form.reset();
  const dataEl = document.getElementById('transf-data');
  if (dataEl) dataEl.value = new Date().toISOString().split('T')[0];
  openModal('modal-transferencia');
}
window.abrirModalTransferencia = abrirModalTransferencia;

function abrirModalRecorrencia() {
  const form = document.getElementById('form-recorrencia');
  if (form) form.reset();
  const titulo = document.getElementById('modal-rec-titulo');
  if (titulo) titulo.textContent = 'Nova Despesa / Receita Recorrente';
  const idEl = document.getElementById('rec-id');
  if (idEl) idEl.value = '';
  const diaEl = document.getElementById('rec-dia');
  if (diaEl) diaEl.value = '5';
  const dataInicioEl = document.getElementById('rec-data-inicio');
  if (dataInicioEl) dataInicioEl.value = new Date().toISOString().split('T')[0];
  const dataFimEl = document.getElementById('rec-data-fim');
  if (dataFimEl) dataFimEl.value = '';
  setTipoRecorrencia('despesa');
  openModal('modal-recorrencia');
}
window.abrirModalRecorrencia = abrirModalRecorrencia;

function abrirModalCategoria() {
  const form = document.getElementById('form-categoria');
  if (form) form.reset();
  openModal('modal-categoria');
}
window.abrirModalCategoria = abrirModalCategoria;

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
    if (btnDespesa) btnDespesa.className = 'btn-tipo-transacao py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 bg-rose-600 text-white shadow-sm';
    if (containerDestino) containerDestino.classList.add('hidden');
    if (containerCategoria) containerCategoria.classList.remove('hidden');
    if (containerStatus) containerStatus.classList.remove('hidden');
    if (lblContaOrigem) lblContaOrigem.textContent = 'Conta Bancária *';
  } else if (tipo === 'receita') {
    if (btnReceita) btnReceita.className = 'btn-tipo-transacao py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 bg-emerald-600 text-white shadow-sm';
    if (containerDestino) containerDestino.classList.add('hidden');
    if (containerCategoria) containerCategoria.classList.remove('hidden');
    if (containerStatus) containerStatus.classList.remove('hidden');
    if (lblContaOrigem) lblContaOrigem.textContent = 'Conta de Depósito *';
  } else if (tipo === 'transferencia') {
    if (btnTransf) btnTransf.className = 'btn-tipo-transacao py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 bg-indigo-600 text-white shadow-sm';
    if (containerDestino) containerDestino.classList.remove('hidden');
    if (containerCategoria) containerCategoria.classList.add('hidden');
    if (containerStatus) containerStatus.classList.add('hidden');
    if (lblContaOrigem) lblContaOrigem.textContent = 'Conta de Origem *';
  }

  updateLancamentoCategorias();
  lucide.createIcons();
}

function setTipoRecorrencia(tipo) {
  state.currentRecTipo = tipo;
  const btnDesp = document.querySelector('.btn-rec-tipo[data-tipo="despesa"]');
  const btnRec = document.querySelector('.btn-rec-tipo[data-tipo="receita"]');

  if (tipo === 'despesa') {
    if (btnDesp) btnDesp.className = 'btn-rec-tipo py-1.5 rounded-lg text-xs font-bold transition bg-rose-600 text-white';
    if (btnRec) btnRec.className = 'btn-rec-tipo py-1.5 rounded-lg text-xs font-bold transition text-slate-600 dark:text-slate-400';
  } else {
    if (btnRec) btnRec.className = 'btn-rec-tipo py-1.5 rounded-lg text-xs font-bold transition bg-emerald-600 text-white';
    if (btnDesp) btnDesp.className = 'btn-rec-tipo py-1.5 rounded-lg text-xs font-bold transition text-slate-600 dark:text-slate-400';
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

  // Gatilho do Modal de Planos & Assinatura
  document.getElementById('btn-open-modal-planos')?.addEventListener('click', openModalPlanos);

  // Guarda de permissão para Exportação CSV
  document.getElementById('btn-export-csv')?.addEventListener('click', (e) => {
    if (state.user && state.user.permissoes && !state.user.permissoes.can_export) {
      e.preventDefault();
      handleApiUpgradeOrError(null, {
        upgrade_required: true,
        error: "A exportação completa de extratos em CSV/Excel é um recurso exclusivo dos planos Starter e PRO."
      });
    }
  });

  // Gatilho de Importação com verificação de plano
  document.getElementById('btn-open-modal-import')?.addEventListener('click', (e) => {
    if (state.user && state.user.permissoes && !state.user.permissoes.can_import_ofx) {
      e.stopPropagation();
      handleApiUpgradeOrError(null, {
        upgrade_required: true,
        error: "A Importação Inteligente de Extratos (OFX/CSV) com Auto-Categorização por IA é exclusiva do plano Padrão PRO."
      });
      return;
    }
    abrirModalImportacao();
  });

  document.getElementById('btn-extrato-importar')?.addEventListener('click', () => {
    if (state.user && state.user.permissoes && !state.user.permissoes.can_import_ofx) {
      handleApiUpgradeOrError(null, {
        upgrade_required: true,
        error: "A Importação Inteligente de Extratos (OFX/CSV) com Auto-Categorização por IA é exclusiva do plano Padrão PRO."
      });
      return;
    }
    abrirModalImportacao();
  });

  // Menu do Usuário & Perfil
  window.toggleUserMenu = function(forceState) {
    const dropdown = document.getElementById('user-menu-dropdown');
    const chevron = document.getElementById('user-menu-chevron');
    if (!dropdown) return;

    const isHidden = dropdown.classList.contains('hidden');
    const shouldOpen = forceState !== undefined ? forceState : isHidden;

    if (shouldOpen) {
      dropdown.classList.remove('hidden');
      if (chevron) chevron.style.transform = 'rotate(180deg)';
    } else {
      dropdown.classList.add('hidden');
      if (chevron) chevron.style.transform = 'rotate(0deg)';
    }
  };

  document.addEventListener('click', (e) => {
    const container = document.getElementById('user-menu-container');
    if (container && !container.contains(e.target)) {
      window.toggleUserMenu(false);
    }
  });

  // Tabs de Navegação
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabTarget = tab.getAttribute('data-tab');
      if (tabTarget) switchAppTab(tabTarget);
    });
  });

  // Botões de Abertura de Modal
  document.getElementById('btn-open-modal-lancamento')?.addEventListener('click', abrirModalLancamento);
  document.getElementById('btn-quick-transfer')?.addEventListener('click', abrirModalTransferencia);
  document.getElementById('btn-onboarding-conta')?.addEventListener('click', () => abrirModalConta());
  document.getElementById('btn-nova-conta-tab')?.addEventListener('click', () => abrirModalConta());
  document.getElementById('btn-modal-recorrencia')?.addEventListener('click', abrirModalRecorrencia);
  document.getElementById('btn-nova-categoria-tab')?.addEventListener('click', abrirModalCategoria);

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
        if (handleApiUpgradeOrError(res, resData)) return;
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
        if (handleApiUpgradeOrError(res, resData)) return;
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
        if (handleApiUpgradeOrError(res, resData)) return;
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

  // Filtros e Busca do Painel Administrativo
  document.getElementById('admin-search-input')?.addEventListener('input', () => loadAdminData());
  document.getElementById('admin-filter-plano')?.addEventListener('change', () => loadAdminData());
  document.getElementById('admin-filter-status')?.addEventListener('change', () => loadAdminData());

  // Form Admin Edit Client
  document.getElementById('form-admin-edit-client')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userId = document.getElementById('admin-edit-user-id').value;
    const plano = document.getElementById('admin-edit-plano').value;
    const status = document.getElementById('admin-edit-status').value;
    const periodo = document.getElementById('admin-edit-periodo').value;
    const diasTrial = parseInt(document.getElementById('admin-edit-dias-trial').value) || 0;
    const expira = document.getElementById('admin-edit-expira').value;
    const isAdmin = document.getElementById('admin-edit-is-admin-check').checked ? 1 : 0;

    const payload = {
      plano,
      plano_status: status,
      plano_periodo: periodo,
      dias_trial_add: diasTrial,
      plano_expira_em: expira || null,
      is_admin: isAdmin
    };

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok && data.success) {
        closeModal('modal-admin-edit-client');
        await loadAdminData();
        Swal.fire({
          icon: 'success',
          title: 'Cliente Atualizado!',
          text: data.message || 'Plano e permissões salvos com sucesso.',
          timer: 1800,
          showConfirmButton: false
        });
      } else {
        Swal.fire({ icon: 'error', title: 'Erro ao atualizar cliente', text: data.error || 'Falha ao salvar permissões.' });
      }
    } catch (err) {
      console.error('Erro na atualização do cliente:', err);
    }
  });

  // Fechar dropdown de usuário ao clicar fora
  window.addEventListener('click', (e) => {
    const userContainer = document.getElementById('user-menu-container');
    if (userContainer && !userContainer.contains(e.target)) {
      toggleUserMenu(false);
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
      toggleUserMenu(false);
    }
  });
}

function toggleUserMenu(show = null) {
  const menu = document.getElementById('user-menu-dropdown');
  const chevron = document.getElementById('user-menu-chevron');
  if (!menu) return;

  const isCurrentlyOpen = !menu.classList.contains('hidden');
  const shouldOpen = show !== null ? show : !isCurrentlyOpen;

  if (shouldOpen) {
    menu.classList.remove('hidden');
    if (chevron) chevron.style.transform = 'rotate(180deg)';
  } else {
    menu.classList.add('hidden');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
  }
}
window.toggleUserMenu = toggleUserMenu;

// ========================================================
// PAINEL MASTER / GESTÃO SAAS DO GERENTE (ADMIN)
// ========================================================

async function loadAdminData() {
  if (!state.user || !state.user.is_admin) return;

  const search = document.getElementById('admin-search-input')?.value.trim() || '';
  const planoFilter = document.getElementById('admin-filter-plano')?.value || '';
  const statusFilter = document.getElementById('admin-filter-status')?.value || '';

  try {
    const [resMetrics, resUsers] = await Promise.all([
      fetch('/api/admin/metrics'),
      fetch(`/api/admin/users?search=${encodeURIComponent(search)}&plano=${encodeURIComponent(planoFilter)}&status=${encodeURIComponent(statusFilter)}`)
    ]);

    if (resMetrics.ok) {
      const dataM = await resMetrics.json();
      if (dataM.success && dataM.metrics) {
        const m = dataM.metrics;
        const totalUsersEl = document.getElementById('admin-kpi-total-users');
        const freeUsersEl = document.getElementById('admin-kpi-free-users');
        const pagantesEl = document.getElementById('admin-kpi-pagantes');
        const trialEl = document.getElementById('admin-kpi-trial');
        const mrrEl = document.getElementById('admin-kpi-mrr');

        if (totalUsersEl) totalUsersEl.textContent = m.total_usuarios || 0;
        if (freeUsersEl) freeUsersEl.textContent = m.total_free || 0;
        if (pagantesEl) pagantesEl.textContent = m.total_pagantes || 0;
        if (trialEl) trialEl.textContent = m.total_trial || 0;
        if (mrrEl) mrrEl.textContent = formatBRL(m.mrr_estimado || 0);
      }
    }

    if (resUsers.ok) {
      const dataU = await resUsers.json();
      if (dataU.success) {
        state.adminUsers = dataU.users || [];
        renderAdminUsersTable(state.adminUsers);
      }
    }
  } catch (err) {
    console.error('Erro ao carregar dados administrativos:', err);
  }
}
window.loadAdminData = loadAdminData;

function renderAdminUsersTable(users) {
  const tbody = document.getElementById('tbody-admin-users');
  const emptyMsg = document.getElementById('admin-empty-msg');
  if (!tbody) return;

  if (!users || users.length === 0) {
    tbody.innerHTML = '';
    if (emptyMsg) emptyMsg.classList.remove('hidden');
    return;
  }

  if (emptyMsg) emptyMsg.classList.add('hidden');

  const planoBadgeMap = {
    'free': '<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border border-slate-300 dark:border-slate-700">Freemium</span>',
    'starter': '<span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-800">Starter MVP</span>',
    'pro': '<span class="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold border border-indigo-200 dark:border-indigo-800">Padrão PRO</span>',
    'family': '<span class="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 font-bold border border-purple-200 dark:border-purple-800">Família/MEI</span>'
  };

  tbody.innerHTML = users.map(u => {
    const isCurrentUser = state.user && state.user.id === u.id;
    const avatar = u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.nome)}&background=6366f1&color=fff`;
    
    // Status Badge
    let statusBadge = '';
    if (u.is_trial) {
      statusBadge = `<span class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 font-bold border border-amber-200 dark:border-amber-800"><i data-lucide="sparkles" class="w-3 h-3"></i> ${u.dias_restantes_trial}d Trial</span>`;
    } else if (u.plano_status === 'active') {
      statusBadge = `<span class="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-200 dark:border-emerald-800"><i data-lucide="check" class="w-3 h-3"></i> Ativo</span>`;
    } else if (u.plano_status === 'expired') {
      statusBadge = `<span class="text-[10px] px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 font-bold border border-rose-200 dark:border-rose-800">Expirado</span>`;
    } else if (u.plano_status === 'canceled') {
      statusBadge = `<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold border border-slate-200 dark:border-slate-700">Cancelado</span>`;
    } else {
      statusBadge = `<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold">${u.plano_status || 'Free'}</span>`;
    }

    const adminBadge = u.is_admin ? '<span class="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300 font-extrabold border border-amber-500/30">ADMIN</span>' : '';
    const cadastroData = u.created_at ? formatDateBR(u.created_at.split(' ')[0]) : '-';

    return `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
        <!-- Cliente -->
        <td class="py-3 px-4">
          <div class="flex items-center gap-2.5">
            <img src="${avatar}" class="w-8 h-8 rounded-full border border-slate-200 dark:border-slate-700 object-cover shrink-0" alt="Avatar">
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-slate-900 dark:text-white">${u.nome}</span>
                ${adminBadge}
                ${isCurrentUser ? '<span class="text-[9px] px-1 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-semibold">(Você)</span>' : ''}
              </div>
              <div class="text-[11px] text-slate-500 dark:text-slate-400 font-mono">${u.email}</div>
              <div class="text-[10px] text-slate-400">Cadastrado em: ${cadastroData}</div>
            </div>
          </div>
        </td>

        <!-- Plano Atual -->
        <td class="py-3 px-4 whitespace-nowrap">
          <div class="space-y-1">
            ${planoBadgeMap[u.plano] || planoBadgeMap['free']}
            <div class="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Ciclo: ${u.plano_periodo || 'Mensal'}</div>
          </div>
        </td>

        <!-- Status & Validade -->
        <td class="py-3 px-4 whitespace-nowrap">
          <div class="space-y-1">
            ${statusBadge}
            ${u.plano_expira_em ? `<div class="text-[10px] text-slate-400">Expira: ${formatDateBR(u.plano_expira_em.split(' ')[0])}</div>` : ''}
          </div>
        </td>

        <!-- Uso / Dados -->
        <td class="py-3 px-4 text-center whitespace-nowrap">
          <div class="inline-flex flex-col items-center">
            <span class="font-bold text-slate-700 dark:text-slate-200 text-xs">${u.total_contas} contas &bull; ${u.total_transacoes} lançamentos</span>
            <span class="text-[10px] text-slate-400">Última transação: ${u.ultima_atividade ? formatDateBR(u.ultima_atividade) : 'Sem atividade'}</span>
          </div>
        </td>

        <!-- Ações Rápidas -->
        <td class="py-3 px-4 text-center whitespace-nowrap">
          <div class="flex items-center justify-center gap-1.5">
            <!-- Botão Gerenciar / Liberar -->
            <button onclick="openModalAdminEditClient(${u.id})" title="Liberar Planos, Prorrogar ou Alterar Permissões" class="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800/80 font-bold text-[11px] transition flex items-center gap-1 shadow-sm">
              <i data-lucide="sliders" class="w-3.5 h-3.5 text-indigo-500"></i>
              <span>Gerenciar</span>
            </button>

            <!-- Prorrogar Teste Rápido (+15 dias) -->
            <button onclick="adminQuickExtendTrial(${u.id}, 15)" title="Prorrogar Teste por +15 Dias Gratuitamente" class="px-2 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800/80 font-semibold text-[11px] transition flex items-center gap-1">
              <i data-lucide="plus-circle" class="w-3.5 h-3.5 text-amber-500"></i>
              <span>+15d Trial</span>
            </button>

            <!-- Excluir Cliente (se não for a si mesmo) -->
            ${!isCurrentUser ? `
              <button onclick="adminDeleteClient(${u.id}, '${u.nome}')" title="Excluir Conta do Cliente" class="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

function openModalAdminEditClient(userId) {
  const user = (state.adminUsers || []).find(u => u.id === userId);
  if (!user) return;

  document.getElementById('admin-edit-user-id').value = user.id;
  document.getElementById('admin-modal-client-name-email').textContent = `${user.nome} (${user.email})`;
  
  const planoEl = document.getElementById('admin-edit-plano');
  const statusEl = document.getElementById('admin-edit-status');
  const periodoEl = document.getElementById('admin-edit-periodo');
  const diasTrialEl = document.getElementById('admin-edit-dias-trial');
  const expiraEl = document.getElementById('admin-edit-expira');
  const isAdminCheck = document.getElementById('admin-edit-is-admin-check');

  if (planoEl) planoEl.value = user.plano || 'free';
  if (statusEl) statusEl.value = user.plano_status || 'active';
  if (periodoEl) periodoEl.value = user.plano_periodo || 'mensal';
  if (diasTrialEl) diasTrialEl.value = '0';
  if (expiraEl) expiraEl.value = '';
  if (isAdminCheck) isAdminCheck.checked = Boolean(user.is_admin);

  openModal('modal-admin-edit-client');
}
window.openModalAdminEditClient = openModalAdminEditClient;

async function adminQuickExtendTrial(userId, dias = 15) {
  try {
    const res = await fetch(`/api/admin/users/${userId}/extend-trial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dias })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      Swal.fire({
        icon: 'success',
        title: 'Período de Teste Estendido!',
        text: data.message,
        timer: 1800,
        showConfirmButton: false
      });
      await loadAdminData();
    } else {
      Swal.fire({ icon: 'error', title: 'Erro', text: data.error || 'Não foi possível estender o teste.' });
    }
  } catch (err) {
    console.error(err);
  }
}
window.adminQuickExtendTrial = adminQuickExtendTrial;

async function adminDeleteClient(userId, userName = 'este cliente') {
  const result = await Swal.fire({
    title: `Excluir ${userName}?`,
    html: `
      <p class="text-xs text-rose-500 font-bold mb-2">Atenção: Ação irreversível!</p>
      <p class="text-xs text-slate-500">Todas as contas, transações, categorias e histórico do cliente serão permanentemente excluídos do banco de dados.</p>
    `,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Sim, excluir cliente',
    cancelButtonText: 'Cancelar'
  });

  if (result.isConfirmed) {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        Swal.fire({ icon: 'success', title: 'Cliente Excluído', text: data.message, timer: 1500, showConfirmButton: false });
        await loadAdminData();
      } else {
        Swal.fire({ icon: 'error', title: 'Erro', text: data.error || 'Não foi possível excluir o usuário.' });
      }
    } catch (err) {
      console.error(err);
    }
  }
}
window.adminDeleteClient = adminDeleteClient;

// ========================================================
// CONTROLE DE NAVEGAÇÃO DE ABAS & VISIBILIDADE ADMIN
// ========================================================
function updateAdminNavVisibility() {
  const btnAdmin = document.getElementById('btn-nav-admin');
  const isAdmin = Boolean(state.user && (state.user.is_admin === 1 || state.user.is_admin === true || state.user.is_admin === '1'));
  if (btnAdmin) {
    if (isAdmin) {
      btnAdmin.classList.remove('hidden');
      btnAdmin.style.removeProperty('display');
      btnAdmin.style.setProperty('display', 'flex', 'important');
    } else {
      btnAdmin.classList.add('hidden');
      btnAdmin.style.setProperty('display', 'none', 'important');
    }
  }
}
window.updateAdminNavVisibility = updateAdminNavVisibility;

function switchAppTab(tabName) {
  const isAdmin = Boolean(state.user && (state.user.is_admin === 1 || state.user.is_admin === true || state.user.is_admin === '1'));
  if (tabName === 'admin' && !isAdmin) {
    tabName = 'dashboard';
  }

  const targetTabBtn = document.querySelector(`.nav-tab[data-tab="${tabName}"]`);
  if (targetTabBtn) {
    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.remove('active-tab', 'border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400', 'font-semibold');
      t.classList.add('border-transparent', 'text-slate-500', 'dark:text-slate-400', 'font-medium');
    });

    targetTabBtn.classList.remove('border-transparent', 'text-slate-500', 'dark:text-slate-400', 'font-medium');
    targetTabBtn.classList.add('active-tab', 'border-indigo-600', 'text-indigo-600', 'dark:text-indigo-400', 'font-semibold');

    state.activeTab = tabName;

    document.querySelectorAll('.tab-pane').forEach(p => p.classList.add('hidden'));
    const activePane = document.getElementById(`tab-${tabName}`);
    if (activePane) activePane.classList.remove('hidden');

    updateAdminNavVisibility();

    loadAllData();
  }
}
window.switchAppTab = switchAppTab;

// ========================================================
// GUIA INTERATIVO AO VIVO (LIVE SPOTLIGHT TOUR)
// ========================================================

state.currentTourStep = 1;
const TOTAL_TOUR_STEPS = 6;

const TOUR_STEPS = [
  {
    step: 1,
    tab: 'contas',
    targetSelector: '#btn-nova-conta-tab',
    fallbackSelector: '#tab-contas',
    icon: 'landmark',
    title: '1. Cadastre suas Contas & Carteiras',
    desc: 'O primeiro passo é cadastrar onde seu dinheiro fica guardado (Nubank, Itaú, Inter, Poupança, Dinheiro ou Investimentos). O FinFlow consolida todos os saldos em tempo real!',
    actionLabel: 'Cadastrar Primeira Conta Agora',
    actionIcon: 'plus',
    action: () => {
      closeLiveTour();
      abrirModalConta();
    }
  },
  {
    step: 2,
    tab: 'transacoes',
    targetSelector: '#btn-extrato-importar',
    fallbackSelector: '#btn-open-modal-import',
    icon: 'file-up',
    title: '2. Importação com IA (OFX / CSV)',
    desc: 'Nunca mais digite extratos manualmente! Arraste arquivos .OFX ou .CSV do seu banco. A Inteligência Artificial auto-categoriza tudo em segundos com memória contínua e proteção anti-duplicidade.',
    actionLabel: 'Abrir Importador Inteligente',
    actionIcon: 'upload-cloud',
    action: () => {
      closeLiveTour();
      abrirModalImportacao();
    }
  },
  {
    step: 3,
    tab: 'transacoes',
    targetSelector: '#btn-open-modal-lancamento',
    fallbackSelector: '#tbody-transacoes',
    icon: 'plus-circle',
    title: '3. Lançamentos Rápidos & Transferências',
    desc: 'Lance despesas e receitas do dia a dia com 1 clique (ou aperte a tecla N no teclado). Use "Transferência" para mover saldo entre suas contas sem alterar seu balanço de receitas e despesas!',
    actionLabel: 'Criar Lançamento de Teste',
    actionIcon: 'plus-circle',
    action: () => {
      closeLiveTour();
      document.getElementById('btn-open-modal-lancamento')?.click();
    }
  },
  {
    step: 4,
    tab: 'recorrencias',
    targetSelector: '#btn-modal-recorrencia',
    fallbackSelector: '#tab-recorrencias',
    icon: 'refresh-cw',
    title: '4. Contas Fixas & Recorrências',
    desc: 'Cadastre contas mensais (Aluguel, Luz, Internet, Assinaturas, Salário) uma única vez. O FinFlow gera os lançamentos automaticamente e prevê seu saldo futuro no final do mês!',
    actionLabel: 'Criar Nova Recorrência',
    actionIcon: 'refresh-cw',
    action: () => {
      closeLiveTour();
      document.getElementById('btn-modal-recorrencia')?.click();
    }
  },
  {
    step: 5,
    tab: 'categorias',
    targetSelector: '#grid-regras-aprendidas',
    fallbackSelector: '#btn-nova-categoria-tab',
    icon: 'tags',
    title: '5. Categorias & Memória da IA',
    desc: 'Personalize suas categorias com cores e ícones exclusivos. Acompanhe no painel de memória as regras automáticas que a IA aprendeu a partir das suas correções de extratos.',
    actionLabel: 'Criar Nova Categoria',
    actionIcon: 'tags',
    action: () => {
      closeLiveTour();
      document.getElementById('btn-nova-categoria-tab')?.click();
    }
  },
  {
    step: 6,
    tab: 'dashboard',
    targetSelector: '#card-insights-ia-container',
    fallbackSelector: '#tab-dashboard',
    icon: 'layout-dashboard',
    title: '6. Dashboard & Métricas Inteligentes',
    desc: 'Sua central financeira completa! Acompanhe saldos consolidados, onde você mais gasta por categoria, taxa de economia e sugestões automáticas da IA de onde economizar.',
    actionLabel: 'Concluir Guia & Ir ao Dashboard 🚀',
    actionIcon: 'sparkles',
    action: () => {
      finishLiveTour();
    }
  }
];

let tourResizeHandler = null;
let tourKeyHandler = null;

function startLiveTour(step = 1) {
  closeAllModals();
  const container = document.getElementById('live-tour-container');
  if (!container) return;

  container.classList.remove('hidden');
  container.style.opacity = '1';

  goToLiveTourStep(step);

  if (tourKeyHandler) window.removeEventListener('keydown', tourKeyHandler);
  tourKeyHandler = (e) => {
    if (e.key === 'Escape') closeLiveTour();
    if (e.key === 'ArrowRight') nextLiveTourStep();
    if (e.key === 'ArrowLeft') prevLiveTourStep();
  };
  window.addEventListener('keydown', tourKeyHandler);

  if (tourResizeHandler) window.removeEventListener('resize', tourResizeHandler);
  tourResizeHandler = () => {
    updateTourSpotlight();
  };
  window.addEventListener('resize', tourResizeHandler);
}
window.startLiveTour = startLiveTour;
window.openTourModal = startLiveTour;

function closeLiveTour() {
  const container = document.getElementById('live-tour-container');
  if (container) {
    container.style.opacity = '0';
    setTimeout(() => container.classList.add('hidden'), 250);
  }

  const pulseRing = document.getElementById('spotlight-pulse-ring');
  if (pulseRing) pulseRing.style.display = 'none';

  if (tourKeyHandler) {
    window.removeEventListener('keydown', tourKeyHandler);
    tourKeyHandler = null;
  }
  if (tourResizeHandler) {
    window.removeEventListener('resize', tourResizeHandler);
    tourResizeHandler = null;
  }

  if (state.user && state.user.id) {
    localStorage.setItem(`finflow_tour_seen_${state.user.id}`, 'true');
  }
}
window.closeLiveTour = closeLiveTour;
window.closeTourModal = closeLiveTour;

function goToLiveTourStep(step) {
  if (step < 1 || step > TOTAL_TOUR_STEPS) return;
  state.currentTourStep = step;
  const currentStepData = TOUR_STEPS[step - 1];

  // 1. Troca para a aba real do sistema
  if (currentStepData.tab && currentStepData.tab !== state.activeTab) {
    switchAppTab(currentStepData.tab);
  }

  // 2. Atualiza UI do popover
  renderTourPopoverUI(currentStepData);

  // 3. Atualiza destaque e posicionamento com breve delay para transição de DOM
  setTimeout(() => {
    updateTourSpotlight();
  }, 120);
}
window.goToLiveTourStep = goToLiveTourStep;
window.jumpToTourStep = goToLiveTourStep;

function nextLiveTourStep() {
  if (state.currentTourStep < TOTAL_TOUR_STEPS) {
    goToLiveTourStep(state.currentTourStep + 1);
  } else {
    finishLiveTour();
  }
}
window.nextLiveTourStep = nextLiveTourStep;
window.nextTourStep = nextLiveTourStep;

function prevLiveTourStep() {
  if (state.currentTourStep > 1) {
    goToLiveTourStep(state.currentTourStep - 1);
  }
}
window.prevLiveTourStep = prevLiveTourStep;
window.prevTourStep = prevLiveTourStep;

function executeLiveTourAction() {
  const currentStepData = TOUR_STEPS[state.currentTourStep - 1];
  if (currentStepData && typeof currentStepData.action === 'function') {
    currentStepData.action();
  }
}
window.executeLiveTourAction = executeLiveTourAction;

function renderTourPopoverUI(stepData) {
  const step = stepData.step;

  // Contador e progresso
  const stepNumEl = document.getElementById('live-tour-step-num');
  const progressEl = document.getElementById('live-tour-progress');
  if (stepNumEl) stepNumEl.textContent = step;
  if (progressEl) {
    progressEl.style.width = `${(step / TOTAL_TOUR_STEPS) * 100}%`;
  }

  // Título e Descrição
  const titleEl = document.getElementById('live-tour-title');
  const descEl = document.getElementById('live-tour-desc');
  const iconEl = document.getElementById('live-tour-icon');
  if (titleEl) titleEl.textContent = stepData.title;
  if (descEl) descEl.textContent = stepData.desc;
  if (iconEl) iconEl.setAttribute('data-lucide', stepData.icon || 'sparkles');

  // Botão de ação prática
  const actionLabelEl = document.getElementById('live-tour-action-label');
  const actionIconEl = document.getElementById('live-tour-action-icon');
  if (actionLabelEl) actionLabelEl.textContent = stepData.actionLabel;
  if (actionIconEl) actionIconEl.setAttribute('data-lucide', stepData.actionIcon || 'arrow-right');

  // Dots
  const dots = document.querySelectorAll('.live-tour-dot');
  dots.forEach((dot, idx) => {
    if (idx + 1 === step) {
      dot.className = 'live-tour-dot w-4 h-1.5 rounded-full bg-indigo-600 transition-all cursor-pointer';
    } else {
      dot.className = 'live-tour-dot w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 hover:bg-indigo-400 transition-all cursor-pointer';
    }
  });

  // Botão Voltar
  const btnPrev = document.getElementById('live-tour-btn-prev');
  if (btnPrev) {
    if (step === 1) {
      btnPrev.disabled = true;
      btnPrev.className = 'px-2.5 py-1.5 text-xs font-semibold rounded-lg text-slate-300 dark:text-slate-600 cursor-not-allowed transition';
    } else {
      btnPrev.disabled = false;
      btnPrev.className = 'px-2.5 py-1.5 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer';
    }
  }

  // Botão Próximo / Concluir
  const nextTextEl = document.getElementById('live-tour-next-text');
  const nextIconEl = document.getElementById('live-tour-next-icon');
  const btnNext = document.getElementById('live-tour-btn-next');
  if (nextTextEl) {
    nextTextEl.textContent = step === TOTAL_TOUR_STEPS ? 'Concluir' : 'Próximo';
  }
  if (nextIconEl) {
    nextIconEl.setAttribute('data-lucide', step === TOTAL_TOUR_STEPS ? 'sparkles' : 'chevron-right');
  }
  if (btnNext) {
    if (step === TOTAL_TOUR_STEPS) {
      btnNext.className = 'px-4 py-1.5 text-xs font-extrabold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-95 rounded-xl shadow-md transition flex items-center gap-1';
    } else {
      btnNext.className = 'px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md shadow-indigo-600/30 transition flex items-center gap-1';
    }
  }

  lucide.createIcons();
}

function updateTourSpotlight() {
  const currentStepData = TOUR_STEPS[state.currentTourStep - 1];
  if (!currentStepData) return;

  const targetEl = document.querySelector(currentStepData.targetSelector) ||
                   document.querySelector(currentStepData.fallbackSelector) ||
                   document.getElementById(`tab-${currentStepData.tab}`);

  const cutout = document.getElementById('spotlight-cutout');
  const pulseRing = document.getElementById('spotlight-pulse-ring');
  const popover = document.getElementById('live-tour-popover');

  if (!targetEl || !cutout || !pulseRing || !popover) return;

  // Rolagem suave até o elemento alvo
  targetEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

  setTimeout(() => {
    const rect = targetEl.getBoundingClientRect();
    const pad = 10;

    const x = Math.max(4, rect.left - pad);
    const y = Math.max(4, rect.top - pad);
    const w = Math.min(window.innerWidth - x - 4, rect.width + (pad * 2));
    const h = rect.height + (pad * 2);

    // Ajustar SVG Cutout
    cutout.setAttribute('x', x);
    cutout.setAttribute('y', y);
    cutout.setAttribute('width', Math.max(10, w));
    cutout.setAttribute('height', Math.max(10, h));
    cutout.setAttribute('rx', 14);
    cutout.setAttribute('ry', 14);

    // Ajustar Pulse Ring
    pulseRing.style.display = 'block';
    pulseRing.style.left = `${x}px`;
    pulseRing.style.top = `${y}px`;
    pulseRing.style.width = `${w}px`;
    pulseRing.style.height = `${h}px`;

    // Posicionar Popover em Telas Maiores (no Mobile o CSS media query cuida do bottom fixed)
    const isMobile = window.innerWidth <= 640;
    if (!isMobile) {
      const popoverWidth = 420;
      const popoverHeight = 240;

      let topPos;
      if (rect.bottom + popoverHeight + 20 < window.innerHeight) {
        topPos = rect.bottom + 16;
      } else if (rect.top - popoverHeight - 20 > 60) {
        topPos = rect.top - popoverHeight - 16;
      } else {
        topPos = Math.max(70, (window.innerHeight - popoverHeight) / 2);
      }

      let leftPos = rect.left + (rect.width / 2) - (popoverWidth / 2);
      leftPos = Math.max(16, Math.min(leftPos, window.innerWidth - popoverWidth - 20));

      popover.style.top = `${topPos}px`;
      popover.style.left = `${leftPos}px`;
      popover.style.bottom = 'auto';
      popover.style.right = 'auto';
      popover.style.transform = 'scale(1)';
    }

    popover.style.opacity = '1';
    popover.style.transform = isMobile ? 'none' : 'scale(1)';
  }, 100);
}

function finishLiveTour() {
  closeLiveTour();
  switchAppTab('dashboard');

  if (state.user && state.user.id) {
    localStorage.setItem(`finflow_tour_seen_${state.user.id}`, 'true');
  }

  Swal.fire({
    icon: 'success',
    title: 'Tudo pronto para você decolar!',
    html: `
      <p class="text-sm text-slate-600 dark:text-slate-300">Sua conta está configurada e pronta para o uso diário.</p>
      <p class="text-xs text-slate-500 mt-2">Você pode rever este guia a qualquer momento no seu menu de usuário no topo da tela.</p>
    `,
    confirmButtonColor: '#4f46e5',
    confirmButtonText: 'Acessar Meu Dashboard 🚀'
  });
}
window.finishLiveTour = finishLiveTour;
window.finishTourAndGoToDashboard = finishLiveTour;

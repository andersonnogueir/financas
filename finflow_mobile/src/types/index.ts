export interface User {
  id: number;
  nome: string;
  email: string;
  avatar_url?: string;
}

export interface Account {
  id: number;
  user_id: number;
  nome: string;
  instituicao?: string;
  tipo: 'Corrente' | 'Poupança' | 'Carteira' | 'Investimento' | 'Outros';
  saldo_inicial: number;
  saldo_atual?: number;
  receitas_pagas?: number;
  despesas_pagas?: number;
  cor: string;
  icone: string;
  banco_id?: string;
  integracao_tipo?: string;
  integracao_status?: 'conectado' | 'desconectado' | 'sincronizando' | string;
  integracao_agencia?: string;
  integracao_conta?: string;
  ultimo_sync?: string;
  ativo: number;
}

export interface Category {
  id: number;
  user_id: number;
  nome: string;
  tipo: 'despesa' | 'receita';
  icone: string;
  cor: string;
  ativo: number;
}

export interface Transaction {
  id: number;
  user_id: number;
  tipo: 'despesa' | 'receita' | 'transferencia';
  descricao: string;
  valor: number;
  data: string; // YYYY-MM-DD
  conta_id?: number;
  conta_destino_id?: number;
  categoria_id?: number;
  status: 'pago' | 'pendente';
  observacoes?: string;
  recorrencia_id?: number;
  fitid?: string;
  categoria_nome?: string;
  categoria_cor?: string;
  categoria_icone?: string;
  conta_nome?: string;
  conta_cor?: string;
  conta_icone?: string;
  conta_destino_nome?: string;
  conta_destino_cor?: string;
}

export interface Recurring {
  id: number;
  user_id: number;
  tipo: 'despesa' | 'receita';
  descricao: string;
  valor: number;
  dia_vencimento: number;
  frequencia: string;
  conta_id?: number;
  categoria_id?: number;
  ativo: number;
  data_inicio: string;
  data_fim?: string;
  categoria_nome?: string;
  categoria_cor?: string;
  conta_nome?: string;
}

export interface DashboardData {
  mes: number;
  ano: number;
  saldo_consolidado_geral: number;
  total_receitas: number;
  receitas_pagas: number;
  receitas_pendentes: number;
  total_despesas: number;
  despesas_pagas: number;
  despesas_pendentes: number;
  saldo_previsto_mes: number;
  balanco_mes: number;
  contas: Account[];
  despesas_por_categoria: Array<{
    categoria_id: number;
    nome: string;
    cor: string;
    icone: string;
    total: number;
    percentual: number;
  }>;
  historico_meses: Array<{
    mes: number;
    ano: number;
    label: string;
    receitas: number;
    despesas: number;
    saldo: number;
  }>;
  alertas: Transaction[];
}

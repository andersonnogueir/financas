import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { DashboardData } from '../types';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

export const DashboardScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const { user } = useAuth();

  const [mes, setMes] = useState(8);
  const [ano, setAno] = useState(2026);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const mesesNomes = [
    '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];

  const loadDashboard = useCallback(async () => {
    try {
      const res = await api.get(`/api/dashboard?mes=${mes}&ano=${ano}`);
      if (res.data) {
        setData(res.data);
      }
    } catch (e) {
      console.warn('Erro ao carregar dashboard:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mes, ano]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loadDashboard();
  };

  const mudarMes = (delta: number) => {
    Haptics.selectionAsync();
    let novoMes = mes + delta;
    let novoAno = ano;
    if (novoMes > 12) {
      novoMes = 1;
      novoAno++;
    } else if (novoMes < 1) {
      novoMes = 12;
      novoAno--;
    }
    setMes(novoMes);
    setAno(novoAno);
  };

  const formatCurrency = (val: number) => {
    return `R$ ${(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (loading && !refreshing) {
    return (
      <View style={[styles.loadingBox, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header com Saudação e Seletor de Mês */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.greetingSub, { color: colors.textMuted }]}>Olá,</Text>
          <Text style={[styles.greetingName, { color: colors.text }]}>{user?.nome || 'Usuário'}</Text>
        </View>

        {/* Seletor de Mês */}
        <View style={[styles.monthPill, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
          <TouchableOpacity onPress={() => mudarMes(-1)} style={styles.monthArrow}>
            <ChevronLeft size={16} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.monthLabel, { color: colors.text }]}>
            {mesesNomes[mes]} / {ano}
          </Text>
          <TouchableOpacity onPress={() => mudarMes(1)} style={styles.monthArrow}>
            <ChevronRight size={16} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Card de Saldo Consolidado */}
        <View style={[styles.kpiCardHero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.kpiHeroTop}>
            <Text style={[styles.kpiHeroLabel, { color: colors.textMuted }]}>Saldo Consolidado Geral</Text>
            <View style={[styles.iconBadgeHero, { backgroundColor: `${colors.primary}20` }]}>
              <Wallet size={20} color={colors.primary} />
            </View>
          </View>
          <Text style={[styles.kpiHeroValue, { color: colors.text }]}>
            {formatCurrency(data?.saldo_consolidado_geral || 0)}
          </Text>
          <View style={styles.heroFooter}>
            <Text style={[styles.heroFooterText, { color: colors.success }]}>
              ● Disponível em {data?.contas?.length || 0} contas ativas
            </Text>
          </View>
        </View>

        {/* Grid de Receitas e Despesas */}
        <View style={styles.gridRow}>
          <View style={[styles.gridCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.iconBadgeSmall, { backgroundColor: `${colors.success}20` }]}>
              <TrendingUp size={16} color={colors.success} />
            </View>
            <Text style={[styles.gridLabel, { color: colors.textMuted }]}>Receitas do Mês</Text>
            <Text style={[styles.gridValue, { color: colors.success }]}>
              {formatCurrency(data?.total_receitas || 0)}
            </Text>
            <Text style={[styles.gridSub, { color: colors.textSubtle }]}>
              Recebidas: {formatCurrency(data?.receitas_pagas || 0)}
            </Text>
          </View>

          <View style={[styles.gridCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[styles.iconBadgeSmall, { backgroundColor: `${colors.danger}20` }]}>
              <TrendingDown size={16} color={colors.danger} />
            </View>
            <Text style={[styles.gridLabel, { color: colors.textMuted }]}>Despesas do Mês</Text>
            <Text style={[styles.gridValue, { color: colors.danger }]}>
              {formatCurrency(data?.total_despesas || 0)}
            </Text>
            <Text style={[styles.gridSub, { color: colors.textSubtle }]}>
              Pagas: {formatCurrency(data?.despesas_pagas || 0)}
            </Text>
          </View>
        </View>

        {/* Minhas Contas Bancárias */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Minhas Contas e Carteiras</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Contas')}>
            <Text style={[styles.sectionAction, { color: colors.primary }]}>Ver Todas</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountsRow}>
          {data?.contas && data.contas.length > 0 ? (
            data.contas.map((conta) => (
              <View
                key={conta.id}
                style={[
                  styles.accountCard,
                  { backgroundColor: colors.surface, borderColor: colors.border, borderTopColor: conta.cor || colors.primary },
                ]}
              >
                <Text style={[styles.accountName, { color: colors.text }]} numberOfLines={1}>
                  {conta.nome}
                </Text>
                <Text style={[styles.accountType, { color: colors.textMuted }]}>
                  {conta.instituicao || conta.tipo}
                </Text>
                <Text style={[styles.accountBalance, { color: colors.text }]}>
                  {formatCurrency(conta.saldo_atual || 0)}
                </Text>
              </View>
            ))
          ) : (
            <View style={[styles.emptyAccount, { backgroundColor: colors.surfaceSubtle }]}>
              <Text style={{ color: colors.textMuted }}>Nenhuma conta cadastrada.</Text>
            </View>
          )}
        </ScrollView>

        {/* Despesas por Categoria */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Despesas por Categoria</Text>
        </View>

        <View style={[styles.cardSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {data?.despesas_por_categoria && data.despesas_por_categoria.length > 0 ? (
            data.despesas_por_categoria.slice(0, 5).map((cat, idx) => (
              <View key={idx} style={styles.categoryItem}>
                <View style={styles.catLeft}>
                  <View style={[styles.catColorDot, { backgroundColor: cat.cor || colors.primary }]} />
                  <Text style={[styles.catName, { color: colors.text }]} numberOfLines={1}>
                    {cat.nome}
                  </Text>
                </View>
                <View style={styles.catRight}>
                  <Text style={[styles.catAmount, { color: colors.text }]}>{formatCurrency(cat.total)}</Text>
                  <Text style={[styles.catPercent, { color: colors.textMuted }]}>{cat.percentual.toFixed(1)}%</Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>Sem despesas registradas no mês.</Text>
          )}
        </View>

        {/* Alertas e Contas a Vencer */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>A Vencer / Pendentes</Text>
        </View>

        <View style={[styles.cardSection, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {data?.alertas && data.alertas.length > 0 ? (
            data.alertas.map((alerta) => (
              <View key={alerta.id} style={styles.alertItem}>
                <View style={styles.alertLeft}>
                  <AlertCircle size={18} color={colors.warning} />
                  <View>
                    <Text style={[styles.alertTitle, { color: colors.text }]}>{alerta.descricao}</Text>
                    <Text style={[styles.alertDate, { color: colors.textMuted }]}>Vence em {alerta.data}</Text>
                  </View>
                </View>
                <Text style={[styles.alertAmount, { color: colors.danger }]}>{formatCurrency(alerta.valor)}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyAlerts}>
              <CheckCircle2 size={24} color={colors.success} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>Tudo pago e em dia por aqui!</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Botão Flutuante de Novo Lançamento */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          navigation.navigate('NovoLancamento');
        }}
      >
        <Plus size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  greetingSub: {
    fontSize: 12,
  },
  greetingName: {
    fontSize: 18,
    fontWeight: '800',
  },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  monthArrow: {
    padding: 4,
  },
  monthLabel: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 6,
  },
  scrollBody: {
    padding: 20,
    paddingBottom: 90,
  },
  kpiCardHero: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    marginBottom: 14,
  },
  kpiHeroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  kpiHeroLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  iconBadgeHero: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiHeroValue: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heroFooter: {
    marginTop: 10,
  },
  heroFooterText: {
    fontSize: 11,
    fontWeight: '600',
  },
  gridRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  gridCard: {
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  iconBadgeSmall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  gridLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
  gridValue: {
    fontSize: 16,
    fontWeight: '800',
    marginVertical: 4,
  },
  gridSub: {
    fontSize: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  sectionAction: {
    fontSize: 12,
    fontWeight: '700',
  },
  accountsRow: {
    gap: 12,
    paddingBottom: 16,
  },
  accountCard: {
    width: 140,
    borderRadius: 16,
    borderWidth: 1,
    borderTopWidth: 3,
    padding: 12,
  },
  accountName: {
    fontSize: 13,
    fontWeight: '700',
  },
  accountType: {
    fontSize: 10,
    marginBottom: 8,
  },
  accountBalance: {
    fontSize: 14,
    fontWeight: '800',
  },
  emptyAccount: {
    padding: 20,
    borderRadius: 14,
  },
  cardSection: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#33415520',
  },
  catLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  catColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  catName: {
    fontSize: 13,
    fontWeight: '600',
  },
  catRight: {
    alignItems: 'flex-end',
  },
  catAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  catPercent: {
    fontSize: 10,
  },
  emptyText: {
    textAlign: 'center',
    paddingVertical: 12,
    fontSize: 12,
  },
  alertItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  alertLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  alertDate: {
    fontSize: 11,
  },
  alertAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyAlerts: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
});

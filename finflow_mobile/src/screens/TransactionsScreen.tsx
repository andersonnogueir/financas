import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { Transaction } from '../types';
import { Search, Filter, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Trash2, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

export const TransactionsScreen = ({ navigation }: any) => {
  const { colors } = useTheme();

  const [mes, setMes] = useState(8);
  const [ano, setAno] = useState(2026);
  const [transacoes, setTransacoes] = useState<Transaction[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('todos');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const mesesNomes = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  const loadTransactions = useCallback(async () => {
    try {
      let url = `/api/transacoes?mes=${mes}&ano=${ano}`;
      if (filtroTipo !== 'todos') {
        url += `&tipo=${filtroTipo}`;
      }
      if (busca.trim()) {
        url += `&q=${encodeURIComponent(busca.trim())}`;
      }
      const res = await api.get(url);
      if (res.data) {
        setTransacoes(res.data);
      }
    } catch (e) {
      console.warn('Erro ao carregar transações:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mes, ano, filtroTipo, busca]);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loadTransactions();
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

  const handleDelete = (id: number) => {
    Alert.alert('Excluir Lançamento', 'Tem certeza que deseja excluir esta transação?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/api/transacoes/${id}`);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            loadTransactions();
          } catch (e) {
            Alert.alert('Erro', 'Não foi possível excluir a transação.');
          }
        },
      },
    ]);
  };

  const formatCurrency = (val: number) => {
    return `R$ ${(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const renderItem = ({ item }: { item: Transaction }) => {
    const isDespesa = item.tipo === 'despesa';
    const isReceita = item.tipo === 'receita';

    return (
      <View style={[styles.cardItem, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={styles.cardLeft}>
          <View
            style={[
              styles.typeBadge,
              {
                backgroundColor: isReceita ? `${colors.success}20` : isDespesa ? `${colors.danger}20` : `${colors.primary}20`,
              },
            ]}
          >
            {isReceita ? (
              <ArrowDownLeft size={18} color={colors.success} />
            ) : isDespesa ? (
              <ArrowUpRight size={18} color={colors.danger} />
            ) : (
              <ArrowLeftRight size={18} color={colors.primary} />
            )}
          </View>

          <View style={styles.cardInfo}>
            <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
              {item.descricao}
            </Text>
            <View style={styles.cardMeta}>
              <Text style={[styles.metaDate, { color: colors.textMuted }]}>{item.data}</Text>
              {item.categoria_nome && (
                <Text style={[styles.metaCat, { color: item.categoria_cor || colors.primary }]}>
                  • {item.categoria_nome}
                </Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.cardRight}>
          <Text
            style={[
              styles.cardAmount,
              { color: isReceita ? colors.success : isDespesa ? colors.danger : colors.text },
            ]}
          >
            {isReceita ? '+' : isDespesa ? '-' : ''}
            {formatCurrency(item.valor)}
          </Text>

          <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
            <Trash2 size={14} color={colors.textSubtle} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Lançamentos & Extrato</Text>

        {/* Seletor de Mês Compacto */}
        <View style={[styles.monthPill, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
          <TouchableOpacity onPress={() => mudarMes(-1)} style={styles.arrowBtn}>
            <ChevronLeft size={16} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.monthText, { color: colors.text }]}>
            {mesesNomes[mes]} / {ano}
          </Text>
          <TouchableOpacity onPress={() => mudarMes(1)} style={styles.arrowBtn}>
            <ChevronRight size={16} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Barra de Busca e Filtros */}
      <View style={[styles.filterBar, { backgroundColor: colors.background }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Search size={16} color={colors.textSubtle} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Buscar lançamentos..."
            placeholderTextColor={colors.textSubtle}
            value={busca}
            onChangeText={setBusca}
          />
        </View>

        {/* Filtros rápidos: Todos, Despesas, Receitas */}
        <View style={styles.chipRow}>
          {[
            { id: 'todos', label: 'Todos' },
            { id: 'despesa', label: 'Despesas' },
            { id: 'receita', label: 'Receitas' },
          ].map((chip) => (
            <TouchableOpacity
              key={chip.id}
              style={[
                styles.chip,
                {
                  backgroundColor: filtroTipo === chip.id ? colors.primary : colors.surface,
                  borderColor: filtroTipo === chip.id ? colors.primary : colors.border,
                },
              ]}
              onPress={() => {
                setFiltroTipo(chip.id);
                Haptics.selectionAsync();
              }}
            >
              <Text
                style={[
                  styles.chipText,
                  { color: filtroTipo === chip.id ? '#fff' : colors.textMuted },
                ]}
              >
                {chip.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Lista de Transações */}
      {loading && !refreshing ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={transacoes}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>Nenhum lançamento encontrado</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                {busca ? 'Tente mudar os termos da busca.' : 'Importe um extrato bancário ou adicione um novo lançamento.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  arrowBtn: {
    padding: 4,
  },
  monthText: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  filterBar: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  listContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  cardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  typeBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaDate: {
    fontSize: 11,
  },
  metaCat: {
    fontSize: 11,
    fontWeight: '600',
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  cardAmount: {
    fontSize: 14,
    fontWeight: '800',
  },
  deleteBtn: {
    padding: 4,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
});

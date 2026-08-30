import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { Account } from '../types';
import { Landmark, Wallet, Plus, ArrowDownLeft, ArrowUpRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

export const AccountsScreen = () => {
  const { colors } = useTheme();

  const [contas, setContas] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAccounts = async () => {
    try {
      const res = await api.get('/api/contas');
      if (res.data) {
        setContas(res.data);
      }
    } catch (e) {
      console.warn('Erro ao carregar contas:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    loadAccounts();
  };

  const formatCurrency = (val: number) => {
    return `R$ ${(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const renderItem = ({ item }: { item: Account }) => (
    <View
      style={[
        styles.accountCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderLeftColor: item.cor || colors.primary,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconCircle, { backgroundColor: `${item.cor || colors.primary}20` }]}>
            <Landmark size={20} color={item.cor || colors.primary} />
          </View>
          <View>
            <Text style={[styles.accountName, { color: colors.text }]}>{item.nome}</Text>
            <Text style={[styles.accountType, { color: colors.textMuted }]}>
              {item.instituicao || item.tipo} • {item.tipo}
            </Text>
          </View>
        </View>

        <Text style={[styles.accountBalance, { color: colors.text }]}>
          {formatCurrency(item.saldo_atual || item.saldo_inicial)}
        </Text>
      </View>

      <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

      <View style={styles.metricsRow}>
        <View style={styles.metricItem}>
          <View style={styles.metricLabelRow}>
            <ArrowDownLeft size={12} color={colors.success} />
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Receitas</Text>
          </View>
          <Text style={[styles.metricVal, { color: colors.success }]}>
            {formatCurrency(item.receitas_pagas || 0)}
          </Text>
        </View>

        <View style={styles.metricItem}>
          <View style={styles.metricLabelRow}>
            <ArrowUpRight size={12} color={colors.danger} />
            <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Despesas</Text>
          </View>
          <Text style={[styles.metricVal, { color: colors.danger }]}>
            {formatCurrency(item.despesas_pagas || 0)}
          </Text>
        </View>

        <View style={styles.metricItem}>
          <Text style={[styles.metricLabel, { color: colors.textMuted }]}>Saldo Inicial</Text>
          <Text style={[styles.metricVal, { color: colors.text }]}>
            {formatCurrency(item.saldo_inicial || 0)}
          </Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Contas & Carteiras</Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={contas}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Text style={{ color: colors.textMuted }}>Nenhuma conta cadastrada.</Text>
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
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  list: {
    padding: 20,
    paddingBottom: 40,
  },
  accountCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 16,
    marginBottom: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountName: {
    fontSize: 15,
    fontWeight: '700',
  },
  accountType: {
    fontSize: 11,
    marginTop: 2,
  },
  accountBalance: {
    fontSize: 16,
    fontWeight: '800',
  },
  cardDivider: {
    height: 1,
    marginVertical: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricItem: {
    gap: 2,
  },
  metricLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  metricVal: {
    fontSize: 12,
    fontWeight: '700',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
  },
});

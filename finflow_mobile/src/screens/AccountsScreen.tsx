import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { Account } from '../types';
import { Landmark, Wallet, Plus, ArrowDownLeft, ArrowUpRight, Zap, Link, ShieldCheck, X, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BANCOS_DISPONIVEIS = [
  { id: 'nubank', nome: 'Nubank', codigo: '260', cor: '#820ad1' },
  { id: 'inter', nome: 'Banco Inter', codigo: '077', cor: '#ff7a00' },
  { id: 'bradesco', nome: 'Bradesco', codigo: '237', cor: '#cc092f' },
  { id: 'bb', nome: 'Banco do Brasil', codigo: '001', cor: '#003882' },
  { id: 'itau', nome: 'Itaú Unibanco', codigo: '341', cor: '#ec7000' },
  { id: 'santander', nome: 'Santander', codigo: '033', cor: '#ec0000' },
  { id: 'caixa', nome: 'Caixa Econômica', codigo: '104', cor: '#0066b3' },
  { id: 'c6', nome: 'C6 Bank', codigo: '336', cor: '#242424' },
];

export const AccountsScreen = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [contas, setContas] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAccountForBank, setSelectedAccountForBank] = useState<Account | null>(null);
  const [bankModalVisible, setBankModalVisible] = useState(false);
  const [selectedBankId, setSelectedBankId] = useState<string>('nubank');
  const [syncingAccountId, setSyncingAccountId] = useState<number | null>(null);

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

  const handleOpenBankModal = (conta: Account) => {
    setSelectedAccountForBank(conta);
    setSelectedBankId(conta.banco_id || 'nubank');
    setBankModalVisible(true);
    Haptics.selectionAsync();
  };

  const handleConnectBank = async () => {
    if (!selectedAccountForBank) return;

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const res = await api.post('/api/open-finance/conectar', {
        conta_id: selectedAccountForBank.id,
        banco_id: selectedBankId,
        tipo: 'open_finance_sandbox',
      });

      if (res.data && res.data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setBankModalVisible(false);
        await loadAccounts();
        Alert.alert('Sucesso', res.data.message || 'Conta conectada com sucesso via Open Finance!');
      }
    } catch (e: any) {
      Alert.alert('Erro', e.response?.data?.error || 'Não foi possível conectar ao banco.');
    }
  };

  const handleSyncAccount = async (conta: Account) => {
    setSyncingAccountId(conta.id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const res = await api.get(`/api/open-finance/sync/${conta.id}?dias=30`);
      if (res.data && res.data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await loadAccounts();
        Alert.alert('Sincronizado!', `${res.data.total_transacoes} transações consultadas com sucesso via API.`);
      }
    } catch (e: any) {
      Alert.alert('Erro', e.response?.data?.error || 'Falha ao sincronizar extrato da conta.');
    } finally {
      setSyncingAccountId(null);
    }
  };

  const formatCurrency = (val: number) => {
    return `R$ ${(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const renderItem = ({ item }: { item: Account }) => {
    const isConectada = item.integracao_status === 'conectado';
    const isSyncing = syncingAccountId === item.id;

    return (
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

        {/* Open Finance Bar */}
        <View style={[styles.openFinanceBar, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
          <View style={styles.openFinanceInfo}>
            {isConectada ? (
              <>
                <View style={styles.activeDot} />
                <View>
                  <Text style={[styles.openFinanceTitle, { color: colors.success }]}>Open Finance Conectado</Text>
                  {item.ultimo_sync ? (
                    <Text style={[styles.openFinanceSub, { color: colors.textMuted }]}>Sync: {item.ultimo_sync}</Text>
                  ) : null}
                </View>
              </>
            ) : (
              <>
                <View style={[styles.activeDot, { backgroundColor: colors.textMuted }]} />
                <Text style={[styles.openFinanceTitle, { color: colors.textMuted }]}>Modo Manual</Text>
              </>
            )}
          </View>

          <View style={styles.openFinanceActions}>
            {isConectada ? (
              <TouchableOpacity
                style={[styles.syncBtn, { backgroundColor: colors.primary }]}
                onPress={() => handleSyncAccount(item)}
                disabled={isSyncing}
              >
                {isSyncing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Zap size={12} color="#fff" />
                    <Text style={styles.syncBtnText}>Sincronizar</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.connectBtn, { borderColor: colors.border }]}
                onPress={() => handleOpenBankModal(item)}
              >
                <Link size={12} color={colors.primary} />
                <Text style={[styles.connectBtnText, { color: colors.primary }]}>Conectar Banco</Text>
              </TouchableOpacity>
            )}
          </View>
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
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.surface,
            borderBottomColor: colors.border,
            paddingTop: Math.max(insets.top, 16) + 10,
          },
        ]}
      >
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
          contentContainerStyle={[styles.list, { paddingBottom: 110 + insets.bottom }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          ListEmptyComponent={
            <View style={styles.centerBox}>
              <Text style={{ color: colors.textMuted }}>Nenhuma conta cadastrada.</Text>
            </View>
          }
        />
      )}

      {/* Modal de Conexão Open Finance */}
      <Modal visible={bankModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.surface }]}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleBox}>
                <ShieldCheck size={20} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.text }]}>Conectar via Open Finance</Text>
              </View>
              <TouchableOpacity onPress={() => setBankModalVisible(false)}>
                <X size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
              Selecione o banco correspondente para habilitar a consulta automática de extrato (Modo Somente Leitura).
            </Text>

            <ScrollView style={styles.banksGrid} showsVerticalScrollIndicator={false}>
              {BANCOS_DISPONIVEIS.map((b) => {
                const isSelected = selectedBankId === b.id;
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={[
                      styles.bankOption,
                      {
                        backgroundColor: isSelected ? `${colors.primary}15` : colors.surfaceSubtle,
                        borderColor: isSelected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setSelectedBankId(b.id)}
                  >
                    <View style={[styles.bankColorDot, { backgroundColor: b.cor }]} />
                    <View style={styles.bankOptionInfo}>
                      <Text style={[styles.bankOptionName, { color: colors.text }]}>{b.nome}</Text>
                      <Text style={[styles.bankOptionCode, { color: colors.textMuted }]}>Cód. {b.codigo}</Text>
                    </View>
                    {isSelected && <Check size={18} color={colors.primary} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setBankModalVisible(false)}
              >
                <Text style={[styles.modalCancelText, { color: colors.text }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: colors.primary }]}
                onPress={handleConnectBank}
              >
                <Text style={styles.modalConfirmText}>Autorizar Conexão</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
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
  openFinanceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  openFinanceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  openFinanceTitle: {
    fontSize: 11,
    fontWeight: '700',
  },
  openFinanceSub: {
    fontSize: 9,
  },
  openFinanceActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  syncBtnText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  connectBtnText: {
    fontSize: 10,
    fontWeight: '700',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalHeaderTitleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  modalSubtitle: {
    fontSize: 12,
    marginBottom: 16,
  },
  banksGrid: {
    maxHeight: 280,
  },
  bankOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  bankColorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  bankOptionInfo: {
    flex: 1,
  },
  bankOptionName: {
    fontSize: 13,
    fontWeight: '700',
  },
  bankOptionCode: {
    fontSize: 11,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modalConfirmBtn: {
    flex: 2,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});


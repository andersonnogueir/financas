import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { Account } from '../types';
import * as DocumentPicker from 'expo-document-picker';
import { FileUp, Sparkles, Check, AlertCircle, UploadCloud, CheckCircle2, FileText, ArrowRight, Zap, ShieldCheck } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const ImportScreen = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<'api' | 'file'>('api');
  const [contas, setContas] = useState<Account[]>([]);
  const [selectedContaId, setSelectedContaId] = useState<number | null>(null);
  const [selectedDays, setSelectedDays] = useState<number>(30);
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const res = await api.get('/api/contas');
      if (res.data && res.data.length > 0) {
        setContas(res.data);
        setSelectedContaId(res.data[0].id);
      }
    } catch (e) {
      console.warn('Erro ao carregar contas para importação:', e);
    }
  };

  const handleSyncApi = async () => {
    if (!selectedContaId) {
      Alert.alert('Atenção', 'Selecione uma conta bancária primeiro.');
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const res = await api.get(`/api/open-finance/sync/${selectedContaId}?dias=${selectedDays}`);
      if (res.data && res.data.success) {
        setPreviewData(res.data);
        setSelectedItems(res.data.transacoes.map((_: any, idx: number) => idx));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert('Aviso', res.data?.error || 'Erro ao sincronizar extrato bancário.');
      }
    } catch (e: any) {
      Alert.alert('Erro', e.response?.data?.error || 'Não foi possível consultar a API bancária.');
    } finally {
      setLoading(false);
    }
  };

  const handlePickDocument = async () => {
    if (!selectedContaId) {
      Alert.alert('Atenção', 'Selecione uma conta bancária de destino primeiro.');
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['*/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        uploadForPreview(file);
      }
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível selecionar o arquivo.');
    }
  };

  const uploadForPreview = async (file: any) => {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const formData = new FormData();
    formData.append('arquivo', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || 'application/octet-stream',
    } as any);
    formData.append('conta_id', String(selectedContaId));

    try {
      const res = await api.post('/api/import/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data && res.data.success) {
        setPreviewData(res.data);
        setSelectedItems(res.data.transacoes.map((_: any, idx: number) => idx));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Alert.alert('Aviso', res.data?.error || 'Erro ao processar extrato.');
      }
    } catch (e: any) {
      Alert.alert('Erro', e.response?.data?.error || 'Não foi possível ler o arquivo.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewData || selectedItems.length === 0) return;

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const transacoesParaSalvar = previewData.transacoes.filter((_: any, idx: number) =>
      selectedItems.includes(idx)
    );

    try {
      const res = await api.post('/api/import/confirm', {
        conta_id: selectedContaId,
        transacoes: transacoesParaSalvar,
      });

      if (res.data?.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('Sucesso!', `${res.data.salvas} transações importadas e categorizadas com IA!`, [
          {
            text: 'OK',
            onPress: () => {
              setPreviewData(null);
              setSelectedItems([]);
            },
          },
        ]);
      }
    } catch (e: any) {
      Alert.alert('Erro', e.response?.data?.error || 'Falha ao confirmar importação.');
    } finally {
      setLoading(false);
    }
  };

  const toggleItem = (idx: number) => {
    Haptics.selectionAsync();
    setSelectedItems((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Extrato Inteligente & Open Finance</Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 110 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Abas: Sincronização Direta API vs Upload de Arquivo */}
        {!previewData && (
          <View style={[styles.tabsRow, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === 'api' && { backgroundColor: colors.primary },
              ]}
              onPress={() => {
                setActiveTab('api');
                Haptics.selectionAsync();
              }}
            >
              <Zap size={14} color={activeTab === 'api' ? '#fff' : colors.textMuted} />
              <Text style={[styles.tabBtnText, { color: activeTab === 'api' ? '#fff' : colors.textMuted }]}>
                Sincronizar API
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.tabBtn,
                activeTab === 'file' && { backgroundColor: colors.primary },
              ]}
              onPress={() => {
                setActiveTab('file');
                Haptics.selectionAsync();
              }}
            >
              <FileUp size={14} color={activeTab === 'file' ? '#fff' : colors.textMuted} />
              <Text style={[styles.tabBtnText, { color: activeTab === 'file' ? '#fff' : colors.textMuted }]}>
                Upload OFX/CSV
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Seleção de Conta Destino */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>1. Conta Bancária *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountsRow}>
            {contas.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.accountPill,
                  {
                    backgroundColor: selectedContaId === c.id ? colors.primary : colors.surfaceSubtle,
                    borderColor: selectedContaId === c.id ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => {
                  setSelectedContaId(c.id);
                  Haptics.selectionAsync();
                }}
              >
                <Text style={[styles.accountPillText, { color: selectedContaId === c.id ? '#fff' : colors.text }]}>
                  {c.integracao_status === 'conectado' ? '⚡ ' : ''}{c.nome}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* MODO 1: SINCRONIZAÇÃO DIRETA VIA API */}
        {!previewData && activeTab === 'api' && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.label, { color: colors.textMuted }]}>2. Período do Extrato</Text>
            <View style={styles.periodRow}>
              {[7, 15, 30, 60].map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[
                    styles.periodPill,
                    {
                      backgroundColor: selectedDays === d ? `${colors.primary}20` : colors.surfaceSubtle,
                      borderColor: selectedDays === d ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    setSelectedDays(d);
                    Haptics.selectionAsync();
                  }}
                >
                  <Text style={[styles.periodText, { color: selectedDays === d ? colors.primary : colors.text }]}>
                    {d} dias
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.securityBadge, { backgroundColor: `${colors.success}15`, borderColor: `${colors.success}30` }]}>
              <ShieldCheck size={16} color={colors.success} />
              <Text style={[styles.securityText, { color: colors.success }]}>
                Conexão Segura & Criptografada (Somente Leitura BACEN)
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.syncDirectBtn, { backgroundColor: colors.primary }]}
              onPress={handleSyncApi}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Zap size={18} color="#fff" />
                  <Text style={styles.syncDirectBtnText}>Sincronizar Extrato via API</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* MODO 2: BOTÃO DE UPLOAD MANUAL OFX / CSV */}
        {!previewData && activeTab === 'file' && (
          <TouchableOpacity
            style={[styles.uploadBox, { backgroundColor: colors.surface, borderColor: colors.primary }]}
            onPress={handlePickDocument}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : (
              <>
                <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}20` }]}>
                  <FileUp size={32} color={colors.primary} />
                </View>
                <Text style={[styles.uploadTitle, { color: colors.text }]}>Selecionar Arquivo OFX ou CSV</Text>
                <Text style={[styles.uploadSub, { color: colors.textMuted }]}>
                  Extratos do Bradesco, Itaú, Nubank, Banco do Brasil, Inter, Caixa, etc.
                </Text>
                <View style={styles.aiBadge}>
                  <Sparkles size={14} color="#6366f1" />
                  <Text style={styles.aiBadgeText}>Auto-categorização Inteligente</Text>
                </View>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Prévia da Importação com IA */}
        {previewData && (
          <View>
            <View style={styles.previewHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Prévia: {previewData.transacoes.length} transações encontradas
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setPreviewData(null);
                  setSelectedItems([]);
                }}
              >
                <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700' }}>Cancelar</Text>
              </TouchableOpacity>
            </View>

            {previewData.transacoes.map((item: any, idx: number) => {
              const selected = selectedItems.includes(idx);
              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.previewItem,
                    {
                      backgroundColor: colors.surface,
                      borderColor: selected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => toggleItem(idx)}
                >
                  <View style={[styles.checkCircle, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : 'transparent' }]}>
                    {selected && <Check size={12} color="#fff" />}
                  </View>

                  <View style={styles.itemInfo}>
                    <Text style={[styles.itemDesc, { color: colors.text }]} numberOfLines={1}>
                      {item.descricao}
                    </Text>
                    <View style={styles.itemMeta}>
                      <Text style={[styles.itemDate, { color: colors.textMuted }]}>{item.data}</Text>
                      {item.categoria_nome && (
                        <Text style={[styles.itemCat, { color: colors.primary }]}>
                          • {item.categoria_nome}
                        </Text>
                      )}
                    </View>
                  </View>

                  <Text
                    style={[
                      styles.itemAmount,
                      { color: item.tipo === 'receita' ? colors.success : colors.danger },
                    ]}
                  >
                    {item.tipo === 'receita' ? '+' : '-'} R$ {Number(item.valor || 0).toFixed(2)}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Botão Confirmar Importação */}
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
              onPress={handleConfirmImport}
              disabled={loading || selectedItems.length === 0}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>
                  Confirmar Importação ({selectedItems.length})
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
  scrollContent: {
    padding: 20,
    paddingBottom: 50,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
  },
  accountsRow: {
    gap: 8,
  },
  accountPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  accountPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  uploadBox: {
    borderRadius: 24,
    borderWidth: 2,
    borderStyle: 'dashed',
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  uploadTitle: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
  },
  uploadSub: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 14,
    paddingHorizontal: 10,
  },
  aiBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  aiBadgeText: {
    color: '#4338ca',
    fontSize: 11,
    fontWeight: '700',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  previewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemDesc: {
    fontSize: 13,
    fontWeight: '700',
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  itemDate: {
    fontSize: 11,
  },
  itemCat: {
    fontSize: 11,
    fontWeight: '600',
  },
  itemAmount: {
    fontSize: 13,
    fontWeight: '800',
  },
  confirmBtn: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});

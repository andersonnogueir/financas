import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { api } from '../services/api';
import { Account, Category } from '../types';
import { ArrowLeft, Check, Calendar as CalendarIcon, Tag, Wallet } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const NewTransactionScreen = ({ navigation }: any) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [tipo, setTipo] = useState<'despesa' | 'receita'>('despesa');
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(new Date().toISOString().substring(0, 10));
  const [contaId, setContaId] = useState<number | null>(null);
  const [categoriaId, setCategoriaId] = useState<number | null>(null);

  const [contas, setContas] = useState<Account[]>([]);
  const [categorias, setCategorias] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAuxData();
  }, []);

  const loadAuxData = async () => {
    try {
      const [resContas, resCats] = await Promise.all([
        api.get('/api/contas'),
        api.get('/api/categorias'),
      ]);
      if (resContas.data && resContas.data.length > 0) {
        setContas(resContas.data);
        setContaId(resContas.data[0].id);
      }
      if (resCats.data) {
        setCategorias(resCats.data);
      }
    } catch (e) {
      console.warn('Erro ao carregar dados auxiliares:', e);
    }
  };

  const handleSave = async () => {
    const numValor = parseFloat(valor.replace(',', '.'));
    if (!descricao.trim() || isNaN(numValor) || numValor <= 0 || !contaId) {
      Alert.alert('Atenção', 'Preencha a descrição, um valor válido e selecione a conta bancária.');
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await api.post('/api/transacoes', {
        tipo,
        descricao: descricao.trim(),
        valor: numValor,
        data,
        conta_id: contaId,
        categoria_id: categoriaId,
        status: 'pago',
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Sucesso', 'Lançamento adicionado com sucesso!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('Erro', e.response?.data?.error || 'Não foi possível salvar o lançamento.');
    } finally {
      setLoading(false);
    }
  };

  const catsFiltradas = categorias.filter((c) => c.tipo === tipo);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Novo Lançamento</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 60 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Toggle Despesa / Receita */}
        <View style={[styles.typeToggle, { backgroundColor: colors.surfaceSubtle }]}>
          <TouchableOpacity
            style={[styles.typeBtn, tipo === 'despesa' && { backgroundColor: colors.danger }]}
            onPress={() => {
              setTipo('despesa');
              Haptics.selectionAsync();
            }}
          >
            <Text style={[styles.typeBtnText, { color: tipo === 'despesa' ? '#fff' : colors.textMuted }]}>
              Despesa
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.typeBtn, tipo === 'receita' && { backgroundColor: colors.success }]}
            onPress={() => {
              setTipo('receita');
              Haptics.selectionAsync();
            }}
          >
            <Text style={[styles.typeBtnText, { color: tipo === 'receita' ? '#fff' : colors.textMuted }]}>
              Receita
            </Text>
          </TouchableOpacity>
        </View>

        {/* Input Valor Grande */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Valor (R$)</Text>
          <TextInput
            style={[styles.valueInput, { color: tipo === 'despesa' ? colors.danger : colors.success }]}
            placeholder="0,00"
            placeholderTextColor={colors.textSubtle}
            value={valor}
            onChangeText={setValor}
            keyboardType="decimal-pad"
          />
        </View>

        {/* Descrição e Data */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Descrição *</Text>
          <TextInput
            style={[styles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSubtle }]}
            placeholder="Ex: Supermercado, Aluguel, Salário..."
            placeholderTextColor={colors.textSubtle}
            value={descricao}
            onChangeText={setDescricao}
          />

          <Text style={[styles.label, { color: colors.textMuted, marginTop: 14 }]}>Data (AAAA-MM-DD)</Text>
          <TextInput
            style={[styles.textInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceSubtle }]}
            value={data}
            onChangeText={setData}
          />
        </View>

        {/* Seleção de Conta */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Conta Bancária *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalOptions}>
            {contas.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[
                  styles.optionPill,
                  {
                    backgroundColor: contaId === c.id ? colors.primary : colors.surfaceSubtle,
                    borderColor: contaId === c.id ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => {
                  setContaId(c.id);
                  Haptics.selectionAsync();
                }}
              >
                <Text style={[styles.optionPillText, { color: contaId === c.id ? '#fff' : colors.text }]}>
                  {c.nome}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Seleção de Categoria */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textMuted }]}>Categoria</Text>
          <View style={styles.catGrid}>
            {catsFiltradas.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.catBadge,
                  {
                    backgroundColor: categoriaId === cat.id ? colors.primary : colors.surfaceSubtle,
                    borderColor: categoriaId === cat.id ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => {
                  setCategoriaId(cat.id);
                  Haptics.selectionAsync();
                }}
              >
                <Text style={[styles.catBadgeText, { color: categoriaId === cat.id ? '#fff' : colors.text }]}>
                  {cat.nome}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Botão Salvar */}
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Check size={20} color="#fff" />
              <Text style={styles.saveBtnText}>Salvar Lançamento</Text>
            </>
          )}
        </TouchableOpacity>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  typeToggle: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  typeBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 14,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  valueInput: {
    fontSize: 32,
    fontWeight: '900',
    paddingVertical: 4,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    fontSize: 14,
  },
  horizontalOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  optionPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  optionPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  catBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  catBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 16,
    marginTop: 10,
    gap: 8,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});

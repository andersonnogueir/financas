import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Lock, Mail, User as UserIcon, Fingerprint, Moon, Sun, ArrowRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';

export const LoginScreen = () => {
  const { login, register, loginWithGoogle, loginWithBiometrics, isBiometricsAvailable } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();

  const [isRegister, setIsRegister] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('anderson@gmail.com');
  const [senha, setSenha] = useState('123456');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email || !senha || (isRegister && !nome)) {
      Alert.alert('Atenção', 'Por favor, preencha todos os campos.');
      return;
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    let res;
    if (isRegister) {
      res = await register(nome, email, senha);
    } else {
      res = await login(email, senha);
    }

    setLoading(false);
    if (!res.success) {
      Alert.alert('Aviso', res.error || 'Erro na autenticação.');
    }
  };

  const handleGoogleMock = async () => {
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const res = await loginWithGoogle({
      nome: nome || 'Anderson Nogueira',
      email: email || 'anderson@gmail.com',
    });
    setLoading(false);
    if (!res.success) {
      Alert.alert('Aviso', res.error || 'Erro ao conectar com Google.');
    }
  };

  const handleBiometrics = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const success = await loginWithBiometrics();
    if (!success) {
      Alert.alert('Biometria', 'Não foi possível autenticar por biometria. Use seu e-mail e senha.');
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Header com Logo e Theme Toggle */}
        <View style={styles.topRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoIcon}>💳</Text>
            <View>
              <Text style={[styles.brandTitle, { color: colors.text }]}>FinFlow</Text>
              <Text style={[styles.brandSub, { color: colors.textMuted }]}>Gestão Financeira Inteligente</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.themeBtn, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}
            onPress={toggleTheme}
          >
            {isDark ? <Sun size={18} color="#f59e0b" /> : <Moon size={18} color="#6366f1" />}
          </TouchableOpacity>
        </View>

        {/* Card Principal */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {/* Abas Entrar / Criar Conta */}
          <View style={[styles.tabBar, { backgroundColor: colors.surfaceSubtle }]}>
            <TouchableOpacity
              style={[styles.tabBtn, !isRegister && { backgroundColor: colors.primary }]}
              onPress={() => {
                setIsRegister(false);
                Haptics.selectionAsync();
              }}
            >
              <Text style={[styles.tabText, { color: !isRegister ? '#fff' : colors.textMuted }]}>Entrar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, isRegister && { backgroundColor: colors.primary }]}
              onPress={() => {
                setIsRegister(true);
                Haptics.selectionAsync();
              }}
            >
              <Text style={[styles.tabText, { color: isRegister ? '#fff' : colors.textMuted }]}>Criar Conta</Text>
            </TouchableOpacity>
          </View>

          {/* Botão Google */}
          <TouchableOpacity
            style={[styles.googleBtn, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}
            onPress={handleGoogleMock}
            disabled={loading}
          >
            <Text style={styles.googleIcon}>G</Text>
            <Text style={[styles.googleText, { color: colors.text }]}>Continuar com Google / Gmail</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.textSubtle }]}>ou com seu e-mail</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          {/* Campos de Entrada */}
          {isRegister && (
            <View style={styles.inputGroup}>
              <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Nome Completo</Text>
              <View style={[styles.inputBox, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
                <UserIcon size={18} color={colors.textSubtle} />
                <TextInput
                  style={[styles.textInput, { color: colors.text }]}
                  placeholder="Seu nome"
                  placeholderTextColor={colors.textSubtle}
                  value={nome}
                  onChangeText={setNome}
                  autoCapitalize="words"
                />
              </View>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>E-mail</Text>
            <View style={[styles.inputBox, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
              <Mail size={18} color={colors.textSubtle} />
              <TextInput
                style={[styles.textInput, { color: colors.text }]}
                placeholder="seuemail@exemplo.com"
                placeholderTextColor={colors.textSubtle}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: colors.textMuted }]}>Senha</Text>
            <View style={[styles.inputBox, { backgroundColor: colors.surfaceSubtle, borderColor: colors.border }]}>
              <Lock size={18} color={colors.textSubtle} />
              <TextInput
                style={[styles.textInput, { color: colors.text }]}
                placeholder="••••••••"
                placeholderTextColor={colors.textSubtle}
                value={senha}
                onChangeText={setSenha}
                secureTextEntry
              />
            </View>
          </View>

          {/* Botão Principal */}
          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: colors.primary }]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.submitText}>{isRegister ? 'Criar Minha Conta' : 'Acessar FinFlow'}</Text>
                <ArrowRight size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>

          {/* Botão de Biometria */}
          {isBiometricsAvailable && (
            <TouchableOpacity
              style={[styles.bioBtn, { borderColor: colors.border, backgroundColor: colors.surfaceSubtle }]}
              onPress={handleBiometrics}
            >
              <Fingerprint size={20} color={colors.primaryLight} />
              <Text style={[styles.bioText, { color: colors.text }]}>Entrar com Biometria / Face ID</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={[styles.footerText, { color: colors.textSubtle }]}>
          Dados protegidos com criptografia de ponta a ponta.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 40,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  logoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoIcon: {
    fontSize: 28,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  brandSub: {
    fontSize: 12,
  },
  themeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  googleIcon: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4285f4',
  },
  googleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 11,
    paddingHorizontal: 10,
    textTransform: 'uppercase',
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: 14,
    marginTop: 8,
    gap: 8,
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  bioBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    height: 48,
    borderRadius: 14,
    marginTop: 12,
    gap: 8,
  },
  bioText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footerText: {
    textAlign: 'center',
    fontSize: 11,
    marginTop: 24,
  },
});

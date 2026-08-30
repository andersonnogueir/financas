import React, { createContext, useContext, useState, useEffect } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { api, authStorage } from '../services/api';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isBiometricsAvailable: boolean;
  login: (email: string, senha: string) => Promise<{ success: boolean; error?: string }>;
  register: (nome: string, email: string, senha: string) => Promise<{ success: boolean; error?: string }>;
  loginWithGoogle: (payload: { email: string; nome: string; avatar_url?: string; credential?: string }) => Promise<{ success: boolean; error?: string }>;
  loginWithBiometrics: () => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBiometricsAvailable, setIsBiometricsAvailable] = useState<boolean>(false);

  useEffect(() => {
    checkBiometrics();
    loadStoredAuth();
  }, []);

  const checkBiometrics = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setIsBiometricsAvailable(compatible && enrolled);
    } catch (e) {
      console.warn('Biometria não disponível:', e);
    }
  };

  const loadStoredAuth = async () => {
    try {
      const token = await authStorage.getToken();
      if (token) {
        const res = await api.get('/api/auth/verify');
        if (res.data && res.data.authenticated && res.data.user) {
          setUser(res.data.user);
        } else {
          await authStorage.removeToken();
        }
      }
    } catch (e) {
      console.log('Sessão expirada ou sem conexão:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, senha: string) => {
    try {
      const res = await api.post('/api/auth/login', { email, senha });
      if (res.data && res.data.success && res.data.token) {
        await authStorage.saveToken(res.data.token);
        setUser(res.data.user);
        return { success: true };
      }
      return { success: false, error: res.data?.error || 'Erro ao realizar login.' };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.error || 'Erro de conexão com o servidor.' };
    }
  };

  const register = async (nome: string, email: string, senha: string) => {
    try {
      const res = await api.post('/api/auth/register', { nome, email, senha });
      if (res.data && res.data.success && res.data.token) {
        await authStorage.saveToken(res.data.token);
        setUser(res.data.user);
        return { success: true };
      }
      return { success: false, error: res.data?.error || 'Erro ao criar conta.' };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.error || 'Erro de conexão com o servidor.' };
    }
  };

  const loginWithGoogle = async (payload: { email: string; nome: string; avatar_url?: string; credential?: string }) => {
    try {
      const res = await api.post('/api/auth/google', payload);
      if (res.data && res.data.success && res.data.token) {
        await authStorage.saveToken(res.data.token);
        setUser(res.data.user);
        return { success: true };
      }
      return { success: false, error: res.data?.error || 'Erro no login com Google.' };
    } catch (err: any) {
      return { success: false, error: err.response?.data?.error || 'Erro de comunicação com o servidor.' };
    }
  };

  const loginWithBiometrics = async (): Promise<boolean> => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloquear FinFlow com Biometria',
        fallbackLabel: 'Usar Senha',
        cancelLabel: 'Cancelar',
      });
      if (result.success) {
        const token = await authStorage.getToken();
        if (token) {
          const res = await api.get('/api/auth/verify');
          if (res.data?.user) {
            setUser(res.data.user);
            return true;
          }
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch (_) {}
    await authStorage.removeToken();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isBiometricsAvailable,
        login,
        register,
        loginWithGoogle,
        loginWithBiometrics,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

# 📱 FinFlow Mobile (iOS & Android)

Aplicativo mobile financeiro multiplataforma desenvolvido em **React Native + Expo (TypeScript)** com suporte nativo a **Face ID / Biometria**, **Notificações**, **Importação de Extratos OFX/CSV com IA** e conexão em tempo real com seu banco PostgreSQL no Supabase.

---

## 🚀 Como Executar no seu Celular (iPhone ou Android)

### 1. Instalar o App do Expo no Celular:
- **iPhone (iOS)**: Baixe o **Expo Go** na [Apple App Store](https://apps.apple.com/app/expo-go/id982107779).
- **Android**: Baixe o **Expo Go** na [Google Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent).

### 2. Instalar Dependências e Iniciar no Computador:
No terminal, dentro da pasta `finflow_mobile`:
```bash
npm install
npx expo start
```

### 3. Conectar:
- Um **QR Code** aparecerá no terminal.
- **No iPhone**: Abra o app Câmera nativo e aponte para o QR Code.
- **No Android**: Abra o app **Expo Go** e toque em *Scan QR Code*.
- O aplicativo abrirá imediatamente no seu celular com recarregamento em tempo real (*Fast Refresh*)!

---

## 📦 Como Gerar o Arquivo Instalável (.APK para Android ou .IPA para iOS)

Para gerar o arquivo `.apk` final para instalar diretamente em qualquer celular ou publicar nas lojas:
```bash
npx eas-cli build -p android --profile preview
```

---

## 📁 Estrutura do Projeto Mobile

```
finflow_mobile/
├── App.tsx                     # Ponto de entrada com Providers
├── app.json                    # Configuração nativa (iOS bundle, Android package, Face ID)
├── package.json                # Dependências Expo e React Native
├── src/
│   ├── context/
│   │   ├── AuthContext.tsx     # Autenticação JWT + Biometria (Face ID)
│   │   └── ThemeContext.tsx    # Gerenciador de Dark / Light Mode
│   ├── navigation/
│   │   └── RootNavigator.tsx   # Navegação em Abas Inferiores (Bottom Tabs)
│   ├── screens/
│   │   ├── LoginScreen.tsx     # Tela de login e cadastro nativo
│   │   ├── DashboardScreen.tsx # Visão geral de saldos, contas e alertas
│   │   ├── TransactionsScreen.tsx # Lista com busca e filtros de extrato
│   │   ├── NewTransactionScreen.tsx # Modal de novo lançamento com haptics
│   │   ├── ImportScreen.tsx    # Leitor de arquivos bancários com IA
│   │   ├── AccountsScreen.tsx  # Gestão de contas e carteiras
│   │   └── SettingsScreen.tsx  # Perfil, preferências e tema
│   ├── services/
│   │   └── api.ts              # Cliente HTTP com injeção de Bearer Token
│   └── types/
│       └── index.ts            # Interfaces de dados TypeScript
```

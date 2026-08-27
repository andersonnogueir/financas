# 💸 FinFlow - Sistema de Gestão Financeira Pessoal

Sistema web completo, moderno e prático para controle de contas bancárias, saldos em tempo real, lançamento ágil de receitas e despesas, e gestão de despesas fixas recorrentes.

---

## 🌟 Funcionalidades Principais

1. **Dashboard & Indicadores Financeiros**:
   - **Saldo Consolidado em Contas**: Saldo real acumulado em todas as suas contas.
   - **Receitas do Mês**: Totais recebidos e valores previstos a receber.
   - **Despesas do Mês**: Despesas já pagas vs. despesas pendentes a pagar.
   - **Saldo Previsto no Fim do Mês**: Estimativa exata de quanto você terá após quitar todas as pendências.
   - **Balanço Mensal**: Receitas menos despesas do mês atual.
   - **Gráficos Visuais**:
     - Gráfico de Rosca de gastos por categoria.
     - Gráfico de Barras com fluxo histórico dos últimos 6 meses.
   - **Painel de Alertas**: Contas que vencem hoje ou nos próximos 7 dias.

2. **Gestão de Contas Bancárias & Saldos**:
   - Cadastro de contas correntes, contas digitais, poupança, carteira (dinheiro físico) e investimentos.
   - Ajuste de saldo inicial e cálculo dinâmico de saldo atual com base nas movimentações.
   - **Transferência Instantânea entre Contas**: Transfira valores entre bancos com débito e crédito automáticos.

3. **Lançamentos Práticos & Extrato Completo**:
   - **Atalho de Teclado**: Pressione <kbd>N</kbd> a qualquer momento para abrir a tela de novo lançamento.
   - **Baixa Rápida com 1 Clique**: Marque uma despesa como *Paga* ou *Pendente* diretamente na tabela, atualizando os saldos instantaneamente.
   - **Filtros Avançados**: Filtre por mês/ano, conta bancária, categoria, tipo (receita/despesa/transferência) e busca textual.
   - **Exportação para Excel / CSV**: Baixe seu extrato mensal formatado com 1 clique.

4. **Despesas Fixas & Recorrências**:
   - Cadastro de despesas e receitas que se repetem todo mês (Aluguel, Internet, Netflix, Salário, etc.).
   - O sistema gera os lançamentos automaticamente para o mês selecionado.

5. **Interface Moderna**:
   - Suporte a Modo Escuro (Dark Mode) e Modo Claro (Light Mode).
   - Design responsivo para computadores, tablets e smartphones.

---

## 🚀 Como Executar

Abra o terminal (PowerShell ou Prompt de Comando) e navegue até a pasta do projeto:

```bash
cd "C:\Users\Anderson Nogueira\.gemini\antigravity\scratch\financas_app"
python run.py
```

O sistema será iniciado e abrirá automaticamente no seu navegador padrão em:  
👉 **http://127.0.0.1:5000**

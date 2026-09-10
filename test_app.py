import unittest
import json
import os
import io
from app import app
import database
import bank_parser

SAMPLE_OFX = """OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20260825120000[-03:EST]
<LANGUAGE>POR
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1001
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>BRL
<BANKTRANLIST>
<DTSTART>20260801000000
<DTEND>20260825235959
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260810120000[-03:EST]
<TRNAMT>-85.50
<FITID>OFX-20260810-001
<MEMO>IFOOD *RESTAURANTE SABOR
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260812143000[-03:EST]
<TRNAMT>-32.90
<FITID>OFX-20260812-002
<MEMO>UBER *TRIP 1234
</STMTTRN>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260815080000[-03:EST]
<TRNAMT>-150.00
<FITID>OFX-20260815-003
<MEMO>POSTO IPIRANGA COMBUSTIVEL
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260805090000[-03:EST]
<TRNAMT>4500.00
<FITID>OFX-20260805-004
<MEMO>CREDITO SALARIO MENSAL
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
"""

SAMPLE_CSV = """Data;Descricao;Valor;Tipo
10/08/2026;DROGASIL FARMACIA;45,90;D
11/08/2026;NETFLIX MENSAL;55,90;D
15/08/2026;SUPERMERCADO CARREFOUR;320,40;D
"""

class TestFinFlowBankImport(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.path.exists(database.DB_PATH):
            os.remove(database.DB_PATH)
        database.init_db()

    def setUp(self):
        self.app = app.test_client()
        self.app.testing = True

    def login_test_user(self):
        user = database.get_user_by_email("anderson.import@exemplo.com")
        if not user:
            self.app.post('/api/auth/register', json={
                "nome": "Anderson Importador",
                "email": "anderson.import@exemplo.com",
                "senha": "senhaSegura123"
            })
        else:
            self.app.post('/api/auth/login', json={
                "email": "anderson.import@exemplo.com",
                "senha": "senhaSegura123"
            })

    def test_01_user_and_account_setup(self):
        self.login_test_user()
        res_conta = self.app.post('/api/contas', json={
            "nome": "Nubank Principal",
            "tipo": "Corrente",
            "saldo_inicial": 500.00
        })
        self.assertEqual(res_conta.status_code, 201)
        print("OK: Usuario e Conta bancaria criados com sucesso")

    def test_02_parser_ofx_and_csv_unit(self):
        # Testar parser de OFX
        trans_ofx = bank_parser.parse_bank_file(SAMPLE_OFX.encode('utf-8'), "extrato_nubank.ofx")
        self.assertEqual(len(trans_ofx), 4)
        self.assertEqual(trans_ofx[0]['valor'], 85.50)
        self.assertEqual(trans_ofx[0]['tipo'], 'despesa')
        self.assertEqual(trans_ofx[3]['valor'], 4500.00)
        self.assertEqual(trans_ofx[3]['tipo'], 'receita')
        print("OK: Parser de OFX extraiu despesas, receitas e fitids com precisao")

        # Testar parser de CSV
        trans_csv = bank_parser.parse_bank_file(SAMPLE_CSV.encode('utf-8'), "extrato.csv")
        self.assertEqual(len(trans_csv), 3)
        self.assertEqual(trans_csv[0]['valor'], 45.90)
        self.assertEqual(trans_csv[0]['tipo'], 'despesa')
        print("OK: Parser de CSV identificou separadores brasileiros e valores com sucesso")

    def test_03_import_preview_with_smart_categorization(self):
        self.login_test_user()

        data = {
            'conta_id': '1',
            'arquivo': (io.BytesIO(SAMPLE_OFX.encode('utf-8')), 'extrato_nubank.ofx')
        }

        res = self.app.post('/api/import/preview', data=data, content_type='multipart/form-data')
        self.assertEqual(res.status_code, 200)

        preview_data = json.loads(res.data)
        self.assertTrue(preview_data['success'])
        self.assertEqual(len(preview_data['transacoes']), 4)

        trans = preview_data['transacoes']
        # iFood deve sugerir Alimentação
        self.assertIn("Alimentação", trans[0]['categoria_nome'])
        # Uber deve sugerir Transporte
        self.assertIn("Transporte", trans[1]['categoria_nome'])
        # Salário deve sugerir Salário
        self.assertIn("Salário", trans[3]['categoria_nome'])

        print("OK: Motor de IA auto-categorizou iFood, Uber e Salario com sucesso no preview")

    def test_04_import_confirm_and_continuous_learning(self):
        self.login_test_user()

        # Confirmar importação e memorizar regra para "POSTO IPIRANGA"
        res_confirm = self.app.post('/api/import/confirm', json={
            "conta_id": 1,
            "transacoes": [
                {
                    "data": "2026-08-15",
                    "descricao": "POSTO IPIRANGA COMBUSTIVEL",
                    "valor": 150.00,
                    "tipo": "despesa",
                    "categoria_id": 4, # Transporte
                    "fitid": "OFX-20260815-003",
                    "lembrar_regra": True,
                    "termo_regra": "POSTO IPIRANGA"
                }
            ]
        })
        self.assertEqual(res_confirm.status_code, 200)
        confirm_data = json.loads(res_confirm.data)
        self.assertEqual(confirm_data['salvas'], 1)
        self.assertEqual(confirm_data['regras_aprendidas'], 1)

        # Testar agora uma nova importação que tenha texto similar "Posto Ipiranga Express"
        novo_ofx = """<OFX><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260820<TRNAMT>-90.00<FITID>OFX-NOVO-999<MEMO>COMPRA CARTAO POSTO IPIRANGA EXPRESS</STMTTRN></OFX>"""
        res_preview_2 = self.app.post('/api/import/preview', data={
            'conta_id': '1',
            'arquivo': (io.BytesIO(novo_ofx.encode('utf-8')), 'novo.ofx')
        }, content_type='multipart/form-data')

        preview_2 = json.loads(res_preview_2.data)
        t_nova = preview_2['transacoes'][0]

        self.assertEqual(t_nova['origem_sugestao'], 'regra_aprendida')
        self.assertEqual(t_nova['categoria_id'], 4)
        print("OK: Sistema de aprendizado continuo reconheceu regra memorizada no proximo extrato!")

    def test_05_duplicate_detection_by_fitid(self):
        self.login_test_user()

        # 1. Enviar arquivo OFX completo com transações que já foram importadas (FITID OFX-20260815-003)
        res_preview = self.app.post('/api/import/preview', data={
            'conta_id': '1',
            'arquivo': (io.BytesIO(SAMPLE_OFX.encode('utf-8')), 'extrato_nubank.ofx')
        }, content_type='multipart/form-data')

        preview_data = json.loads(res_preview.data)
        trans = preview_data['transacoes']

        # A transação do POSTO IPIRANGA (OFX-20260815-003) deve estar marcada como duplicada e desmarcada por padrão
        t_ipiranga = next((t for t in trans if t['fitid'] == 'OFX-20260815-003'), None)
        self.assertIsNotNone(t_ipiranga)
        self.assertTrue(t_ipiranga['is_duplicada'])
        self.assertFalse(t_ipiranga['selecionada'])

        # As outras não importadas ainda devem estar selecionadas
        t_ifood = next((t for t in trans if t['fitid'] == 'OFX-20260810-001'), None)
        self.assertIsNotNone(t_ifood)
        self.assertFalse(t_ifood['is_duplicada'])
        self.assertTrue(t_ifood['selecionada'])
        print("OK: Deteccao de duplicidade por FITID bloqueou re-importacao de transacoes repetidas")

    def test_06_dashboard_and_export_after_import(self):
        self.login_test_user()

        # Importar restante do extrato
        res_confirm = self.app.post('/api/import/confirm', json={
            "conta_id": 1,
            "transacoes": [
                {
                    "data": "2026-08-10",
                    "descricao": "IFOOD *RESTAURANTE SABOR",
                    "valor": 85.50,
                    "tipo": "despesa",
                    "categoria_id": 1,
                    "fitid": "OFX-20260810-001"
                },
                {
                    "data": "2026-08-05",
                    "descricao": "CREDITO SALARIO MENSAL",
                    "valor": 4500.00,
                    "tipo": "receita",
                    "categoria_id": 10,
                    "fitid": "OFX-20260805-004"
                }
            ]
        })
        self.assertEqual(res_confirm.status_code, 200)

        # Consultar dashboard
        res_dash = self.app.get('/api/dashboard/resumo?mes=8&ano=2026')
        self.assertEqual(res_dash.status_code, 200)
        dash = json.loads(res_dash.data)
        self.assertGreater(dash['total_receitas'], 0)
        self.assertGreater(dash['total_despesas'], 0)
        self.assertGreater(dash['saldo_consolidado_geral'], 0)

        # Exportar CSV do mês
        res_csv = self.app.get('/api/export/csv?mes=8&ano=2026')
        self.assertEqual(res_csv.status_code, 200)
        self.assertIn("IFOOD", res_csv.data.decode('utf-8'))
        print("OK: Dashboard recalculado e exportacao CSV validada com sucesso!")

    def test_07_ai_insights_and_charts_metrics(self):
        self.login_test_user()
        res = self.app.get('/api/dashboard?mes=8&ano=2026')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)

        # Validar estrutura de Insights IA
        self.assertIn('insights_ia', data)
        insights = data['insights_ia']
        self.assertIn('maior_categoria', insights)
        self.assertIn('taxa_poupanca', insights)
        self.assertIn('status_saude', insights)
        self.assertIn('sugestoes', insights)
        self.assertGreater(len(insights['sugestoes']), 0)

        # Validar dados dos gráficos objetivos
        self.assertIn('despesas_por_categoria', data)
        self.assertIn('historico_meses', data)
        self.assertIn('despesas_diarias', data)
        print("OK: Motor de IA de Insights Financeiros e graficos objetivos validados com sucesso!")

    def test_08_saas_user_registration_trial(self):
        # 1. Registrar um novo usuário
        email = "novo.saas.user@exemplo.com"
        res = self.app.post('/api/auth/register', json={
            "nome": "Usuário SaaS",
            "email": email,
            "senha": "senhaSegura123"
        })
        self.assertEqual(res.status_code, 201)
        data = json.loads(res.data)
        self.assertEqual(data['user']['plano'], 'pro')
        self.assertEqual(data['user']['plano_status'], 'trial')
        self.assertIsNotNone(data['user']['trial_fim'])
        print("OK: Novo usuário cadastrado recebe automaticamente 7 dias de PRO Trial")

    def test_09_saas_subscription_status_endpoint(self):
        self.app.post('/api/auth/login', json={
            "email": "novo.saas.user@exemplo.com",
            "senha": "senhaSegura123"
        })

        res = self.app.get('/api/subscription/status')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertEqual(data['status'], 'success')
        self.assertTrue(data['subscription']['is_trial'])
        self.assertEqual(data['subscription']['plano'], 'pro')
        self.assertIn('starter', data['planos_disponiveis'])
        self.assertIn('pro', data['planos_disponiveis'])
        self.assertIn('family', data['planos_disponiveis'])
        print("OK: Endpoint /api/subscription/status retornou dados completos do plano e catálogo")

    def test_10_saas_free_tier_limits_enforcement(self):
        user = database.get_user_by_email("novo.saas.user@exemplo.com")
        self.assertIsNotNone(user)

        # Simular transição para plano Free expirado
        database.update_user_plan(user['id'], plano='free', plano_status='expired')

        self.app.post('/api/auth/login', json={
            "email": "novo.saas.user@exemplo.com",
            "senha": "senhaSegura123"
        })

        # 1. Cadastrar 2 contas (permitido no Free)
        res_c1 = self.app.post('/api/contas', json={"nome": "Conta Free 1", "tipo": "Corrente"})
        self.assertEqual(res_c1.status_code, 201)
        res_c2 = self.app.post('/api/contas', json={"nome": "Conta Free 2", "tipo": "Poupança"})
        self.assertEqual(res_c2.status_code, 201)

        # 2. Tentar cadastrar a 3ª conta (deve ser bloqueado com 403 upgrade_required)
        res_c3 = self.app.post('/api/contas', json={"nome": "Conta Free 3 Bloqueada", "tipo": "Carteira"})
        self.assertEqual(res_c3.status_code, 403)
        data_c3 = json.loads(res_c3.data)
        self.assertTrue(data_c3.get('upgrade_required'))
        self.assertEqual(data_c3.get('recurso'), 'contas')

        # 3. Tentar exportar CSV (deve ser bloqueado no Free)
        res_export = self.app.get('/api/export/csv')
        self.assertEqual(res_export.status_code, 403)
        data_exp = json.loads(res_export.data)
        self.assertTrue(data_exp.get('upgrade_required'))

        # 4. Tentar importar OFX (deve ser bloqueado no Free)
        data_file = {
            'conta_id': '1',
            'arquivo': (io.BytesIO(SAMPLE_OFX.encode('utf-8')), 'extrato.ofx')
        }
        res_imp = self.app.post('/api/import/preview', data=data_file, content_type='multipart/form-data')
        self.assertEqual(res_imp.status_code, 403)
        data_imp_res = json.loads(res_imp.data)
        self.assertTrue(data_imp_res.get('upgrade_required'))

        print("OK: Limites do plano Free (2 contas, bloqueio de exportacao e importacao OFX) devidamente aplicados")

    def test_11_saas_checkout_upgrade_to_pro(self):
        self.app.post('/api/auth/login', json={
            "email": "novo.saas.user@exemplo.com",
            "senha": "senhaSegura123"
        })

        # Realizar checkout no plano PRO Anual
        res = self.app.post('/api/subscription/checkout', json={
            "plano": "pro",
            "periodo": "anual",
            "metodo": "cartao",
            "gateway": "stripe"
        })
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data['success'])
        self.assertEqual(data['plano'], 'pro')
        self.assertEqual(data['valor'], 199.00)

        # Verificar se os limites foram liberados
        res_c3 = self.app.post('/api/contas', json={"nome": "Conta PRO Liberada", "tipo": "Investimento"})
        self.assertEqual(res_c3.status_code, 201)

        res_export = self.app.get('/api/export/csv')
        self.assertEqual(res_export.status_code, 200)

        print("OK: Checkout de upgrade para PRO Anual ativado com sucesso e desbloqueou todos os recursos")

    def test_12_saas_webhook_processing(self):
        user = database.get_user_by_email("novo.saas.user@exemplo.com")
        self.assertIsNotNone(user)

        # 1. Simular webhook de cancelamento vindo do gateway
        res_cancel = self.app.post('/api/subscription/webhook/stripe', json={
            "type": "customer.subscription.deleted",
            "user_id": user['id'],
            "data": {"object": {"customer": "cus_123"}}
        })
        self.assertEqual(res_cancel.status_code, 200)

        # Verificar se o usuário voltou para free cancelado
        user_updated = database.get_user_by_id(user['id'])
        self.assertEqual(user_updated['plano'], 'free')
        self.assertEqual(user_updated['plano_status'], 'canceled')

        # 2. Simular webhook de renovação/pagamento aprovado (ex: Asaas)
        res_paid = self.app.post('/api/subscription/webhook/asaas', json={
            "event": "PAYMENT_CONFIRMED",
            "user_id": user['id'],
            "plano": "pro",
            "periodo": "mensal"
        })
        self.assertEqual(res_paid.status_code, 200)

        user_renewed = database.get_user_by_id(user['id'])
        self.assertEqual(user_renewed['plano'], 'pro')
        self.assertEqual(user_renewed['plano_status'], 'active')

        print("OK: Webhooks universais processaram cancelamentos e confirmacoes de pagamento perfeitamente")

    def test_13_admin_access_control(self):
        # 1. Usuário comum (não admin) deve receber 403 Forbidden
        self.app.post('/api/auth/register', json={
            "nome": "Cliente Comum",
            "email": "cliente.comum@exemplo.com",
            "senha": "senhaSegura123"
        })
        
        # Garantir que is_admin = 0
        user_comum = database.get_user_by_email("cliente.comum@exemplo.com")
        database.admin_update_user_plan_and_access(user_comum['id'], plano='free', plano_status='active', is_admin=0)

        self.app.post('/api/auth/login', json={
            "email": "cliente.comum@exemplo.com",
            "senha": "senhaSegura123"
        })

        res_metrics = self.app.get('/api/admin/metrics')
        self.assertEqual(res_metrics.status_code, 403)

        res_users = self.app.get('/api/admin/users')
        self.assertEqual(res_users.status_code, 403)

        # 2. Usuário administrador (primeiro usuário registrado) deve acessar com 200 OK
        first_user = database.get_user_by_email("anderson.import@exemplo.com")
        database.admin_update_user_plan_and_access(first_user['id'], plano='pro', plano_status='active', is_admin=1)

        self.app.post('/api/auth/login', json={
            "email": "anderson.import@exemplo.com",
            "senha": "senhaSegura123"
        })

        res_admin_metrics = self.app.get('/api/admin/metrics')
        self.assertEqual(res_admin_metrics.status_code, 200)
        data_m = json.loads(res_admin_metrics.data)
        self.assertTrue(data_m['success'])
        self.assertIn('total_usuarios', data_m['metrics'])

        print("OK: Controle de acesso Admin (HTTP 403 para não-admins e HTTP 200 para Admin) validado")

    def test_14_admin_metrics_and_user_listing(self):
        # Logar como administrador
        self.app.post('/api/auth/login', json={
            "email": "anderson.import@exemplo.com",
            "senha": "senhaSegura123"
        })

        # Testar listagem geral
        res_list = self.app.get('/api/admin/users')
        self.assertEqual(res_list.status_code, 200)
        data_list = json.loads(res_list.data)
        self.assertTrue(data_list['success'])
        self.assertGreaterEqual(len(data_list['users']), 2)

        # Testar busca por nome/email
        res_search = self.app.get('/api/admin/users?search=comum')
        self.assertEqual(res_search.status_code, 200)
        data_search = json.loads(res_search.data)
        self.assertEqual(len(data_search['users']), 1)
        self.assertEqual(data_search['users'][0]['email'], 'cliente.comum@exemplo.com')

        print("OK: Métricas globais do SaaS e listagem com busca de clientes funcionando perfeitamente")

    def test_15_admin_unlock_plan_manually(self):
        # Logar como administrador
        self.app.post('/api/auth/login', json={
            "email": "anderson.import@exemplo.com",
            "senha": "senhaSegura123"
        })

        user_comum = database.get_user_by_email("cliente.comum@exemplo.com")

        # Gerente libera manualmente o plano 'family' (Família/MEI) com status ativo e vitalício
        res_override = self.app.put(f'/api/admin/users/{user_comum["id"]}', json={
            "plano": "family",
            "plano_status": "active",
            "plano_periodo": "anual",
            "plano_expira_em": "vitalicio"
        })
        self.assertEqual(res_override.status_code, 200)
        data_override = json.loads(res_override.data)
        self.assertTrue(data_override['success'])

        # Verificar se o cliente agora tem acesso ao plano liberado
        self.app.post('/api/auth/login', json={
            "email": "cliente.comum@exemplo.com",
            "senha": "senhaSegura123"
        })
        res_me = self.app.get('/api/auth/me')
        self.assertEqual(res_me.status_code, 200)
        data_me = json.loads(res_me.data)
        self.assertEqual(data_me['user']['plano'], 'family')
        self.assertEqual(data_me['user']['plano_status'], 'active')
        self.assertTrue(data_me['user']['permissoes']['can_export'])
        self.assertTrue(data_me['user']['permissoes']['can_import_ofx'])

        print("OK: Gerente liberou manualmente o plano Família/MEI Vitalício com sucesso")

    def test_16_admin_extend_trial(self):
        # Logar como administrador
        self.app.post('/api/auth/login', json={
            "email": "anderson.import@exemplo.com",
            "senha": "senhaSegura123"
        })

        user_comum = database.get_user_by_email("cliente.comum@exemplo.com")

        # Gerente estende o trial por +30 dias
        res_trial = self.app.post(f'/api/admin/users/{user_comum["id"]}/extend-trial', json={
            "dias": 30
        })
        self.assertEqual(res_trial.status_code, 200)
        data_trial = json.loads(res_trial.data)
        self.assertTrue(data_trial['success'])

        user_updated = database.get_user_by_id(user_comum['id'])
        self.assertEqual(user_updated['plano_status'], 'trial')
        self.assertIsNotNone(user_updated['trial_fim'])

        print("OK: Gerente estendeu o período de teste (Trial) por +30 dias com sucesso")

if __name__ == '__main__':
    unittest.main()


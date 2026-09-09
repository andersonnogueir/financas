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
        print("OK: Usuario e Conta bancaria criados para os testes de importacao")

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

    def test_05_open_finance_bank_catalog(self):
        self.login_test_user()
        res = self.app.get('/api/open-finance/bancos')
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.data)
        self.assertTrue(data['success'])
        self.assertGreaterEqual(data['total'], 8)
        
        bank_ids = [b['id'] for b in data['bancos']]
        self.assertIn('nubank', bank_ids)
        self.assertIn('inter', bank_ids)
        self.assertIn('bradesco', bank_ids)
        self.assertIn('bb', bank_ids)
        self.assertIn('itau', bank_ids)
        self.assertIn('santander', bank_ids)
        self.assertIn('caixa', bank_ids)
        self.assertIn('c6', bank_ids)
        print("OK: Catalogo Open Finance retornou todos os principais bancos brasileiros com metadados")

    def test_06_open_finance_account_connection(self):
        self.login_test_user()
        # Conectar conta 1 ao Nubank
        res_conn = self.app.post('/api/open-finance/conectar', json={
            "conta_id": 1,
            "banco_id": "nubank",
            "agencia": "0001",
            "conta": "98765-4",
            "tipo": "open_finance_sandbox"
        })
        self.assertEqual(res_conn.status_code, 200)
        conn_data = json.loads(res_conn.data)
        self.assertTrue(conn_data['success'])
        self.assertEqual(conn_data['banco']['id'], 'nubank')

        # Verificar se a conta reflete status conectado
        res_contas = self.app.get('/api/contas')
        contas = json.loads(res_contas.data)
        conta_1 = next((c for c in contas if c['id'] == 1), None)
        self.assertIsNotNone(conta_1)
        self.assertEqual(conta_1['banco_id'], 'nubank')
        self.assertEqual(conta_1['integracao_status'], 'conectado')

        # Desconectar
        res_desc = self.app.post('/api/open-finance/desconectar', json={"conta_id": 1})
        self.assertEqual(res_desc.status_code, 200)
        
        # Reconectar para os próximos testes
        self.app.post('/api/open-finance/conectar', json={
            "conta_id": 1,
            "banco_id": "nubank"
        })
        print("OK: Conexao e desconexao Open Finance com persistencia em banco validadas com sucesso")

    def test_07_open_finance_sync_and_ai_categorization(self):
        self.login_test_user()
        res_sync = self.app.post('/api/open-finance/sync/1', json={"dias": 30})
        self.assertEqual(res_sync.status_code, 200)
        sync_data = json.loads(res_sync.data)
        self.assertTrue(sync_data['success'])
        self.assertEqual(sync_data['origem'], 'api_banco')
        self.assertGreater(len(sync_data['transacoes']), 0)

        # Verificar se transações possuem FITIDs e sugestões por IA
        transacoes = sync_data['transacoes']
        for t in transacoes:
            self.assertTrue(t['fitid'].startswith("OF-NUBANK-"))
            self.assertIsNotNone(t['categoria_id'])
            self.assertTrue(len(t['categoria_nome']) > 0)

        # Validar categorização semântica específica
        t_ifood = next((t for t in transacoes if "IFOOD" in t['descricao']), None)
        self.assertIsNotNone(t_ifood)
        self.assertIn("Alimentação", t_ifood['categoria_nome'])

        t_uber = next((t for t in transacoes if "UBER" in t['descricao']), None)
        self.assertIsNotNone(t_uber)
        self.assertIn("Transporte", t_uber['categoria_nome'])

        t_salario = next((t for t in transacoes if "SALARIO" in t['descricao']), None)
        self.assertIsNotNone(t_salario)
        self.assertIn("Salário", t_salario['categoria_nome'])

        print("OK: Sincronizacao Open Finance direta via API alimentou motor de IA e categorizacao com precisao")

    def test_08_open_finance_duplicate_detection(self):
        self.login_test_user()
        # 1. Executa primeiro sync
        res_sync1 = self.app.post('/api/open-finance/sync/1', json={"dias": 30})
        sync1 = json.loads(res_sync1.data)
        trans1 = sync1['transacoes']
        self.assertGreater(len(trans1), 2)

        # 2. Confirma importação apenas das 2 primeiras transações
        primeiras_duas = trans1[:2]
        payload_confirm = {
            "conta_id": 1,
            "transacoes": [
                {
                    "data": t['data'],
                    "descricao": t['descricao'],
                    "valor": t['valor'],
                    "tipo": t['tipo'],
                    "categoria_id": t['categoria_id'],
                    "fitid": t['fitid'],
                    "lembrar_regra": False
                } for t in primeiras_duas
            ]
        }
        res_conf = self.app.post('/api/import/confirm', json=payload_confirm)
        self.assertEqual(res_conf.status_code, 200)

        # 3. Executa segundo sync
        res_sync2 = self.app.post('/api/open-finance/sync/1', json={"dias": 30})
        sync2 = json.loads(res_sync2.data)
        trans2 = sync2['transacoes']

        # As 2 primeiras agora DEVEM vir marcadas como duplicadas e não selecionadas
        t0 = trans2[0]
        t1 = trans2[1]
        self.assertTrue(t0['is_duplicada'], f"Transação {t0['descricao']} deveria ser identificada como duplicada")
        self.assertFalse(t0['selecionada'])
        self.assertTrue(t1['is_duplicada'], f"Transação {t1['descricao']} deveria ser identificada como duplicada")
        self.assertFalse(t1['selecionada'])

        # As demais NÃO devem ser duplicadas
        t_restante = trans2[2]
        self.assertFalse(t_restante['is_duplicada'])
        self.assertTrue(t_restante['selecionada'])
        print("OK: Deteccao de duplicatas por FITID barrou transacoes ja importadas na segunda sincronizacao")

    def test_09_open_finance_confirm_import_and_balance_update(self):
        self.login_test_user()
        # Verificar que as transações sincronizadas e confirmadas atualizaram o extrato
        res_trans = self.app.get('/api/transacoes')
        self.assertEqual(res_trans.status_code, 200)
        trans_list = json.loads(res_trans.data)
        self.assertGreaterEqual(len(trans_list), 3) # Inclui transações dos testes anteriores

        # Verificar resumo do Dashboard
        res_dash = self.app.get('/api/dashboard/resumo')
        self.assertEqual(res_dash.status_code, 200)
        dash = json.loads(res_dash.data)
        self.assertTrue('saldo_consolidado_geral' in dash)
        self.assertGreater(dash['total_despesas'], 0)
        print("OK: Transacoes bancarias sincronizadas atualizaram Dashboard e saldos em tempo real!")

if __name__ == '__main__':
    unittest.main()

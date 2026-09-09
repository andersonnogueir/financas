import os
import io
import csv
import json
import re
import base64
from functools import wraps
from datetime import datetime, date
from dateutil.relativedelta import relativedelta
from flask import Flask, render_template, request, jsonify, Response, redirect, url_for, session
from werkzeug.security import check_password_hash
import database
import bank_parser

import jinja2

try:
    import templates_embedded
except ImportError:
    templates_embedded = None

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(
    __name__,
    template_folder=os.path.join(BASE_DIR, "templates"),
    static_folder=os.path.join(BASE_DIR, "static")
)
app.secret_key = os.environ.get("SECRET_KEY", "finflow-secret-super-secure-key-2026-auth")
app.config['JSON_SORT_KEYS'] = False
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 # 16MB max upload

# Carregador de templates inteligente com fallback embutido
loaders = [
    jinja2.FileSystemLoader(os.path.join(BASE_DIR, "templates")),
    jinja2.FileSystemLoader(BASE_DIR),
    jinja2.FileSystemLoader(os.path.join(os.getcwd(), "templates")),
    jinja2.FileSystemLoader(os.getcwd())
]

if templates_embedded:
    loaders.append(jinja2.DictLoader({
        "login.html": templates_embedded.LOGIN_HTML,
        "index.html": templates_embedded.INDEX_HTML
    }))

app.jinja_loader = jinja2.ChoiceLoader(loaders)

# Servir static com fallback para templates_embedded
@app.route("/static/css/styles.css")
def serve_custom_css():
    file_path = os.path.join(BASE_DIR, "static", "css", "styles.css")
    if os.path.exists(file_path):
        return Response(open(file_path, "r", encoding="utf-8").read(), mimetype="text/css")
    if templates_embedded:
        return Response(templates_embedded.STYLES_CSS, mimetype="text/css")
    return Response("", mimetype="text/css")

@app.route("/static/js/app.js")
def serve_custom_js():
    file_path = os.path.join(BASE_DIR, "static", "js", "app.js")
    if os.path.exists(file_path):
        return Response(open(file_path, "r", encoding="utf-8").read(), mimetype="application/javascript")
    if templates_embedded:
        return Response(templates_embedded.APP_JS, mimetype="application/javascript")
    return Response("", mimetype="application/javascript")

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")

# Inicializar o banco de dados
try:
    database.init_db()
except Exception as e:
    pass

@app.errorhandler(500)
@app.errorhandler(Exception)
def handle_exception(e):
    import traceback
    tb = traceback.format_exc()
    return f"""
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head><meta charset="utf-8"><title>Erro no Servidor</title></head>
      <body style="font-family: monospace; padding: 20px; background: #0f172a; color: #f87171;">
        <h2 style="color: #ef4444;">Erro 500 no Servidor (Vercel):</h2>
        <pre style="background: #1e293b; color: #f1f5f9; padding: 15px; border-radius: 8px; overflow: auto; border: 1px solid #334155;">{tb}</pre>
        <p style="color: #94a3b8;">Exception: {str(e)}</p>
      </body>
    </html>
    """, 500

# ==========================================
# SUPORTE A TOKENS JWT & AUTENTICAÇÃO MOBILE
# ==========================================

import hmac
import hashlib
import time

def generate_jwt(user_id, email, expires_in_days=30):
    """Gera um JSON Web Token seguro (HS256) com validade para o app mobile."""
    payload = {
        "user_id": user_id,
        "email": email,
        "exp": int(time.time()) + (expires_in_days * 86400)
    }
    header = {"alg": "HS256", "typ": "JWT"}
    
    header_b64 = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    
    signature = hmac.new(
        app.secret_key.encode(),
        f"{header_b64}.{payload_b64}".encode(),
        hashlib.sha256
    ).digest()
    sig_b64 = base64.urlsafe_b64encode(signature).decode().rstrip("=")
    
    return f"{header_b64}.{payload_b64}.{sig_b64}"

def verify_jwt(token):
    """Valida um JSON Web Token recebido no cabeçalho Authorization: Bearer."""
    try:
        parts = token.strip().split(".")
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts
        
        expected_sig = hmac.new(
            app.secret_key.encode(),
            f"{header_b64}.{payload_b64}".encode(),
            hashlib.sha256
        ).digest()
        expected_sig_b64 = base64.urlsafe_b64encode(expected_sig).decode().rstrip("=")
        
        if not hmac.compare_digest(sig_b64, expected_sig_b64):
            return None
        
        rem = len(payload_b64) % 4
        if rem > 0:
            payload_b64 += "=" * (4 - rem)
        payload_json = base64.urlsafe_b64decode(payload_b64.encode()).decode()
        payload = json.loads(payload_json)
        
        if payload.get("exp", 0) < int(time.time()):
            return None
            
        return payload
    except Exception:
        return None

# ==========================================
# CORS & PREFLIGHT OPTIONS PARA MOBILE
# ==========================================

@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    return response

@app.before_request
def handle_options_preflight():
    if request.method == 'OPTIONS':
        res = Response()
        res.headers['Access-Control-Allow-Origin'] = '*'
        res.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With'
        res.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        return res

# Decorator unificado para exigir autenticação (Web por Session e Mobile por Bearer Token)
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # 1. Checa autenticação Mobile por Token JWT
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
            payload = verify_jwt(token)
            if payload and "user_id" in payload:
                session['user_id'] = payload['user_id']
                session['user_email'] = payload.get('email', '')
                return f(*args, **kwargs)
            else:
                return jsonify({"error": "Token de autenticação inválido ou expirado. Faça login novamente."}), 401

        # 2. Checa autenticação Web por Sessão
        if 'user_id' not in session:
            if request.path.startswith('/api/'):
                return jsonify({"error": "Não autenticado. Por favor, realize o login."}), 401
            return redirect(url_for('login_page'))

        return f(*args, **kwargs)
    return decorated_function

# ==========================================
# ROTAS DE PÁGINAS (FRONTEND)
# ==========================================

@app.route("/")
@app.route("/api/index")
@app.route("/api/index.py")
def index():
    if 'user_id' not in session:
        return redirect(url_for('login_page'))
    return render_template("index.html")

@app.route("/login")
def login_page():
    if 'user_id' in session:
        return redirect(url_for('index'))
    return render_template("login.html", google_client_id=GOOGLE_CLIENT_ID)

# ==========================================
# APIS DE AUTENTICAÇÃO
# ==========================================

@app.route("/api/auth/register", methods=["POST"])
def auth_register():
    data = request.get_json() or {}
    nome = data.get("nome", "").strip()
    email = data.get("email", "").strip().lower()
    senha = data.get("senha", "")

    if not nome:
        return jsonify({"error": "Nome completo é obrigatório"}), 400
    if not email or "@" not in email:
        return jsonify({"error": "Email válido é obrigatório"}), 400
    if not senha or len(senha) < 6:
        return jsonify({"error": "A senha deve ter no mínimo 6 caracteres"}), 400

    usuario_existente = database.get_user_by_email(email)
    if usuario_existente:
        return jsonify({"error": "Já existe uma conta cadastrada com este email"}), 409

    try:
        user = database.create_user(nome=nome, email=email, senha=senha)
        session['user_id'] = user['id']
        session['user_nome'] = user['nome']
        session['user_email'] = user['email']
        session['user_avatar'] = user.get('avatar_url') or ''
        
        token = generate_jwt(user['id'], user['email'])

        return jsonify({
            "success": True, 
            "token": token,
            "user": user, 
            "message": "Conta criada com sucesso!"
        }), 201
    except Exception as e:
        return jsonify({"error": f"Erro ao criar conta: {str(e)}"}), 500

@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    senha = data.get("senha", "")

    if not email or not senha:
        return jsonify({"error": "Email e senha são obrigatórios"}), 400

    user = database.get_user_by_email(email)
    if not user:
        return jsonify({"error": "Email ou senha incorretos"}), 401

    if not user.get('senha_hash'):
        from werkzeug.security import generate_password_hash
        novo_hash = generate_password_hash(senha)
        conn = database.get_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE usuarios SET senha_hash = ? WHERE id = ?", (novo_hash, user['id']))
        conn.commit()
        conn.close()
        user['senha_hash'] = novo_hash
    elif not check_password_hash(user['senha_hash'], senha):
        return jsonify({"error": "Email ou senha incorretos"}), 401

    session['user_id'] = user['id']
    session['user_nome'] = user['nome']
    session['user_email'] = user['email']
    session['user_avatar'] = user.get('avatar_url') or ''

    token = generate_jwt(user['id'], user['email'])

    return jsonify({
        "success": True,
        "token": token,
        "user": {
            "id": user['id'],
            "nome": user['nome'],
            "email": user['email'],
            "avatar_url": user.get('avatar_url') or ''
        },
        "message": f"Bem-vindo(a) de volta, {user['nome']}!"
    })

@app.route("/api/auth/verify", methods=["GET"])
@login_required
def auth_verify():
    """Valida token e retorna os dados do usuário autenticado para o app mobile."""
    user = database.get_user_by_id(session['user_id'])
    if not user:
        return jsonify({"error": "Usuário não encontrado"}), 404
    return jsonify({
        "authenticated": True,
        "user": {
            "id": user['id'],
            "nome": user['nome'],
            "email": user['email'],
            "avatar_url": user.get('avatar_url') or ''
        }
    })

@app.route("/api/auth/config", methods=["GET"])
def auth_config():
    return jsonify({
        "google_client_id": GOOGLE_CLIENT_ID,
        "has_google_client_id": bool(GOOGLE_CLIENT_ID)
    })

@app.route("/api/auth/google", methods=["POST"])
def auth_google():
    data = request.get_json() or {}
    
    credential = data.get("credential")
    if credential:
        try:
            parts = credential.split('.')
            if len(parts) >= 2:
                payload_b64 = parts[1]
                payload_b64 += '=' * (-len(payload_b64) % 4)
                payload_json = base64.urlsafe_b64decode(payload_b64).decode('utf-8')
                payload = json.loads(payload_json)
                
                email = payload.get("email", "").strip().lower()
                nome = payload.get("name") or payload.get("given_name") or email.split("@")[0].capitalize()
                google_id = payload.get("sub") or f"google_{email}"
                avatar_url = payload.get("picture") or ""
            else:
                return jsonify({"error": "Token do Google inválido"}), 400
        except Exception as e:
            return jsonify({"error": f"Falha ao validar credencial do Google: {str(e)}"}), 400
    else:
        email = data.get("email", "").strip().lower()
        nome = data.get("nome", "").strip() or email.split("@")[0].capitalize()
        google_id = data.get("google_id") or data.get("sub") or f"google_{email}"
        avatar_url = data.get("avatar_url") or data.get("picture") or ""

    if not email:
        return jsonify({"error": "Dados do Google incompletos (email não fornecido)"}), 400

    user = database.get_user_by_email(email)
    
    if user:
        conn = database.get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE usuarios 
            SET google_id = COALESCE(google_id, ?),
                avatar_url = COALESCE(?, avatar_url)
            WHERE id = ?
        """, (google_id, avatar_url, user['id']))
        conn.commit()
        conn.close()
    else:
        user = database.create_user(nome=nome, email=email, google_id=google_id, avatar_url=avatar_url)

    session['user_id'] = user['id']
    session['user_nome'] = user['nome']
    session['user_email'] = user['email']
    session['user_avatar'] = user.get('avatar_url') or avatar_url

    token = generate_jwt(user['id'], user['email'])

    return jsonify({
        "success": True,
        "token": token,
        "user": {
            "id": user['id'],
            "nome": user['nome'],
            "email": user['email'],
            "avatar_url": session['user_avatar']
        },
        "message": "Login com Google realizado com sucesso!"
    })

@app.route("/api/auth/logout", methods=["POST", "GET"])
def auth_logout():
    session.clear()
    if request.path.startswith('/api/'):
        return jsonify({"success": True, "message": "Logout realizado com sucesso"})
    return redirect(url_for('login_page'))

@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    if 'user_id' not in session:
        return jsonify({"authenticated": False}), 401

    user = database.get_user_by_id(session['user_id'])
    if not user:
        session.clear()
        return jsonify({"authenticated": False}), 401

    return jsonify({
        "authenticated": True,
        "user": {
            "id": user['id'],
            "nome": user['nome'],
            "email": user['email'],
            "avatar_url": user.get('avatar_url') or ''
        }
    })

# ==========================================
# API DASHBOARD & MÉTRICAS (PROTEGIDA)
# ==========================================

@app.route("/api/dashboard", methods=["GET"])
@app.route("/api/dashboard/resumo", methods=["GET"])
@login_required
def get_dashboard():
    user_id = session['user_id']
    hoje = date.today()
    mes = int(request.args.get("mes", hoje.month))
    ano = int(request.args.get("ano", hoje.year))

    conn = database.get_connection()
    cursor = conn.cursor()

    # Processar recorrências para o mês consultado
    database.generate_recurring_for_month(user_id, mes, ano, conn)

    # 1. Contas e Saldos
    contas = database.calculate_account_balances(user_id, conn)
    saldo_consolidado_geral = sum(c['saldo_atual'] for c in contas)

    # 2. Resumo de Receitas e Despesas do Mês
    mes_str = f"{mes:02d}"
    ano_str = str(ano)

    cursor.execute("""
        SELECT 
            COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END), 0) as total_receitas,
            COALESCE(SUM(CASE WHEN tipo = 'receita' AND status = 'pago' THEN valor ELSE 0 END), 0) as receitas_pagas,
            COALESCE(SUM(CASE WHEN tipo = 'receita' AND status = 'pendente' THEN valor ELSE 0 END), 0) as receitas_pendentes,
            COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END), 0) as total_despesas,
            COALESCE(SUM(CASE WHEN tipo = 'despesa' AND status = 'pago' THEN valor ELSE 0 END), 0) as despesas_pagas,
            COALESCE(SUM(CASE WHEN tipo = 'despesa' AND status = 'pendente' THEN valor ELSE 0 END), 0) as despesas_pendentes
        FROM transacoes
        WHERE user_id = ? AND strftime('%m', data) = ? AND strftime('%Y', data) = ?
    """, (user_id, mes_str, ano_str))
    
    resumo_row = cursor.fetchone()
    total_receitas = float(resumo_row['total_receitas'])
    receitas_pagas = float(resumo_row['receitas_pagas'])
    receitas_pendentes = float(resumo_row['receitas_pendentes'])
    
    total_despesas = float(resumo_row['total_despesas'])
    despesas_pagas = float(resumo_row['despesas_pagas'])
    despesas_pendentes = float(resumo_row['despesas_pendentes'])

    saldo_previsto_mes = round(saldo_consolidado_geral + receitas_pendentes - despesas_pendentes, 2)
    balanco_mes = round(total_receitas - total_despesas, 2)

    # 3. Despesas por Categoria
    cursor.execute("""
        SELECT 
            COALESCE(c.nome, 'Sem Categoria') as categoria,
            COALESCE(c.cor, '#94a3b8') as cor,
            COALESCE(c.icone, 'tag') as icone,
            SUM(t.valor) as total
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        WHERE t.user_id = ?
          AND t.tipo = 'despesa'
          AND strftime('%m', t.data) = ? 
          AND strftime('%Y', t.data) = ?
        GROUP BY c.id, c.nome, c.cor, c.icone
        ORDER BY total DESC
    """, (user_id, mes_str, ano_str))
    despesas_por_categoria = [dict(row) for row in cursor.fetchall()]
    for c_item in despesas_por_categoria:
        c_item['nome'] = c_item.get('categoria') or c_item.get('nome') or 'Outros'
        c_total = float(c_item.get('total') or 0)
        c_item['total'] = c_total
        c_item['percentual'] = round((c_total / total_despesas * 100), 1) if total_despesas > 0 else 0.0

    # 4. Evolução dos últimos 6 meses e Saldo Acumulado
    historico_meses = []
    nomes_meses = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    
    data_ref = date(ano, mes, 1)
    for i in range(5, -1, -1):
        dt = data_ref - relativedelta(months=i)
        m_str = f"{dt.month:02d}"
        y_str = str(dt.year)
        
        cursor.execute("""
            SELECT 
                COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END), 0) as rec,
                COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END), 0) as desp
            FROM transacoes
            WHERE user_id = ? AND strftime('%m', data) = ? AND strftime('%Y', data) = ?
        """, (user_id, m_str, y_str))
        hist_row = cursor.fetchone()
        
        rec_val = float(hist_row['rec'])
        desp_val = float(hist_row['desp'])
        historico_meses.append({
            "mes": dt.month,
            "ano": dt.year,
            "label": f"{nomes_meses[dt.month]}/{str(dt.year)[2:]}",
            "receitas": rec_val,
            "despesas": desp_val,
            "saldo": round(rec_val - desp_val, 2)
        })

    # Tendência de Saldo Acumulado
    evolucao_saldo = []
    saldo_acumulado_temp = round(saldo_consolidado_geral - (total_receitas - total_despesas), 2)
    for h in historico_meses:
        saldo_acumulado_temp = round(saldo_acumulado_temp + h['saldo'], 2)
        evolucao_saldo.append({
            "label": h['label'],
            "saldo_acumulado": saldo_acumulado_temp
        })

    # 5. Gastos Diários do Mês (Linha do Tempo)
    cursor.execute("""
        SELECT CAST(strftime('%d', data) AS INTEGER) as dia, SUM(valor) as total
        FROM transacoes
        WHERE user_id = ? AND tipo = 'despesa' AND strftime('%m', data) = ? AND strftime('%Y', data) = ?
        GROUP BY dia
        ORDER BY dia ASC
    """, (user_id, mes_str, ano_str))
    despesas_diarias = [{"dia": int(row['dia']), "total": round(float(row['total']), 2)} for row in cursor.fetchall()]

    # 6. Alertas: Contas a vencer nos próximos 7 dias ou vencidas
    hoje_str = hoje.strftime('%Y-%m-%d')
    limite_7d_str = (hoje + relativedelta(days=7)).strftime('%Y-%m-%d')
    cursor.execute("""
        SELECT t.*, c.nome as categoria_nome, c.cor as categoria_cor, c.icone as categoria_icone,
               cb.nome as conta_nome, cb.cor as conta_cor
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        LEFT JOIN contas cb ON t.conta_id = cb.id
        WHERE t.user_id = ?
          AND t.status = 'pendente' 
          AND t.tipo = 'despesa'
          AND t.data <= ?
        ORDER BY t.data ASC
        LIMIT 6
    """, (user_id, limite_7d_str))
    alertas = [dict(row) for row in cursor.fetchall()]
    for a in alertas:
        if a.get('data') and isinstance(a['data'], (date, datetime)):
            a['data'] = a['data'].strftime('%Y-%m-%d')
        elif a.get('data'):
            a['data'] = str(a['data'])[:10]
        if 'valor' in a and a['valor'] is not None:
            a['valor'] = float(a['valor'])

    # 7. Motor de Insights Financeiros Inteligentes com IA
    dt_anterior = data_ref - relativedelta(months=1)
    m_ant_str = f"{dt_anterior.month:02d}"
    y_ant_str = str(dt_anterior.year)
    cursor.execute("""
        SELECT COALESCE(SUM(valor), 0) as total_ant
        FROM transacoes
        WHERE user_id = ? AND tipo = 'despesa' AND strftime('%m', data) = ? AND strftime('%Y', data) = ?
    """, (user_id, m_ant_str, y_ant_str))
    total_despesas_ant = float(cursor.fetchone()['total_ant'] or 0)

    taxa_poupanca = round(((total_receitas - total_despesas) / total_receitas * 100), 1) if total_receitas > 0 else 0.0

    maior_cat = despesas_por_categoria[0] if despesas_por_categoria else None
    diff_gastos_pct = round(((total_despesas - total_despesas_ant) / total_despesas_ant * 100), 1) if total_despesas_ant > 0 else 0.0

    sugestoes_ia = []
    if maior_cat and total_despesas > 0:
        sugestoes_ia.append(f"Seu maior centro de custo é <b>{maior_cat['nome']}</b>, consumindo <b>{maior_cat['percentual']}%</b> (R$ {maior_cat['total']:.2f}) de todas as suas despesas.")
    
    if total_receitas > 0:
        if taxa_poupanca >= 20:
            sugestoes_ia.append(f"Parabéns! Sua taxa de poupança está em <b>{taxa_poupanca}%</b>, acima da meta recomendada de 20%.")
        elif taxa_poupanca > 0:
            sugestoes_ia.append(f"Você está economizando <b>{taxa_poupanca}%</b> da sua renda. Reduzir pequenos gastos em {maior_cat['nome'] if maior_cat else 'despesas variáveis'} pode acelerar sua reserva.")
        else:
            sugestoes_ia.append(f"Atenção: suas despesas superaram as receitas em <b>R$ {abs(balanco_mes):.2f}</b> neste mês. Priorize pagamentos essenciais.")
    elif total_despesas > 0:
        sugestoes_ia.append("Nenhuma receita registrada até o momento neste mês. Não se esqueça de lançar seu salário ou recebimentos.")
    else:
        sugestoes_ia.append("Mês sem lançamentos ainda. Importe seu extrato (OFX/CSV) ou cadastre suas despesas para ver a análise completa.")

    if total_despesas_ant > 0 and total_despesas > 0:
        if diff_gastos_pct > 10:
            sugestoes_ia.append(f"Seus gastos totais estão <b>+{diff_gastos_pct}%</b> maiores em relação ao mês anterior.")
        elif diff_gastos_pct < -10:
            sugestoes_ia.append(f"Ótimo controle! Seus gastos caíram <b>{abs(diff_gastos_pct)}%</b> comparado ao mês passado.")

    insights_ia = {
        "maior_categoria": maior_cat,
        "total_despesas_anterior": total_despesas_ant,
        "diff_gastos_pct": diff_gastos_pct,
        "taxa_poupanca": taxa_poupanca,
        "status_saude": "excelente" if (total_receitas > 0 and taxa_poupanca >= 20) else ("estavel" if (total_receitas > 0 and taxa_poupanca >= 0) else ("alerta" if (total_receitas > 0 and total_despesas > total_receitas) else "neutro")),
        "sugestoes": sugestoes_ia
    }

    conn.close()

    return jsonify({
        "mes": mes,
        "ano": ano,
        "saldo_consolidado_geral": round(saldo_consolidado_geral, 2),
        "total_receitas": round(total_receitas, 2),
        "receitas_pagas": round(receitas_pagas, 2),
        "receitas_pendentes": round(receitas_pendentes, 2),
        "total_despesas": round(total_despesas, 2),
        "despesas_pagas": round(despesas_pagas, 2),
        "despesas_pendentes": round(despesas_pendentes, 2),
        "saldo_previsto_mes": saldo_previsto_mes,
        "balanco_mes": balanco_mes,
        "contas": contas,
        "despesas_por_categoria": despesas_por_categoria,
        "historico_meses": historico_meses,
        "evolucao_saldo": evolucao_saldo,
        "despesas_diarias": despesas_diarias,
        "alertas": alertas,
        "insights_ia": insights_ia
    })

# ==========================================
# API CONTAS BANCÁRIAS (PROTEGIDA)
# ==========================================

@app.route("/api/contas", methods=["GET"])
@login_required
def list_contas():
    user_id = session['user_id']
    contas = database.calculate_account_balances(user_id)
    return jsonify(contas)

@app.route("/api/contas", methods=["POST"])
@login_required
def create_conta():
    user_id = session['user_id']
    data = request.get_json() or {}
    nome = data.get("nome", "").strip()
    if not nome:
        return jsonify({"error": "Nome da conta é obrigatório"}), 400

    instituicao = data.get("instituicao", "").strip() or nome
    tipo = data.get("tipo", "Corrente")
    saldo_inicial = float(data.get("saldo_inicial", 0.0))
    cor = data.get("cor", "#3b82f6")
    icone = data.get("icone", "wallet")

    conn = database.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO contas (user_id, nome, instituicao, tipo, saldo_inicial, cor, icone)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (user_id, nome, instituicao, tipo, saldo_inicial, cor, icone))
    conn.commit()
    novo_id = cursor.lastrowid
    conn.close()

    return jsonify({"success": True, "id": novo_id, "message": "Conta criada com sucesso"}), 201

@app.route("/api/contas/<int:conta_id>", methods=["PUT"])
@login_required
def update_conta(conta_id):
    user_id = session['user_id']
    data = request.get_json() or {}
    nome = data.get("nome", "").strip()
    if not nome:
        return jsonify({"error": "Nome da conta é obrigatório"}), 400

    instituicao = data.get("instituicao", "").strip() or nome
    tipo = data.get("tipo", "Corrente")
    saldo_inicial = float(data.get("saldo_inicial", 0.0))
    cor = data.get("cor", "#3b82f6")
    icone = data.get("icone", "wallet")

    conn = database.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE contas 
        SET nome = ?, instituicao = ?, tipo = ?, saldo_inicial = ?, cor = ?, icone = ?
        WHERE id = ? AND user_id = ?
    """, (nome, instituicao, tipo, saldo_inicial, cor, icone, conta_id, user_id))

    conn.commit()
    conn.close()

    return jsonify({"success": True, "message": "Conta atualizada com sucesso"})

@app.route("/api/contas/<int:conta_id>", methods=["DELETE"])
@login_required
def delete_conta(conta_id):
    user_id = session['user_id']
    conn = database.get_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE contas SET ativo = 0 WHERE id = ? AND user_id = ?", (conta_id, user_id))
    conn.commit()
    conn.close()

    return jsonify({"success": True, "message": "Conta desativada com sucesso"})


# ==========================================
# API TRANSFERÊNCIAS (PROTEGIDA)
# ==========================================

@app.route("/api/transferencias", methods=["POST"])
@login_required
def create_transferencia():
    user_id = session['user_id']
    data = request.get_json() or {}
    conta_origem_id = data.get("conta_origem_id")
    conta_destino_id = data.get("conta_destino_id")
    valor = float(data.get("valor", 0))
    data_transf = data.get("data", date.today().strftime('%Y-%m-%d'))
    descricao = data.get("descricao", "Transferência entre contas").strip()
    observacoes = data.get("observacoes", "").strip()

    if not conta_origem_id or not conta_destino_id:
        return jsonify({"error": "Contas de origem e destino são obrigatórias"}), 400
    if str(conta_origem_id) == str(conta_destino_id):
        return jsonify({"error": "Conta de origem e destino devem ser diferentes"}), 400
    if valor <= 0:
        return jsonify({"error": "Valor deve ser maior que zero"}), 400

    conn = database.get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO transacoes 
        (user_id, tipo, descricao, valor, data, conta_id, conta_destino_id, categoria_id, status, observacoes)
        VALUES (?, 'transferencia', ?, ?, ?, ?, ?, NULL, 'pago', ?)
    """, (user_id, descricao, valor, data_transf, conta_origem_id, conta_destino_id, observacoes))

    conn.commit()
    novo_id = cursor.lastrowid
    conn.close()

    return jsonify({"success": True, "id": novo_id, "message": "Transferência realizada com sucesso"}), 201

# ==========================================
# API TRANSAÇÕES (PROTEGIDA)
# ==========================================

@app.route("/api/transacoes", methods=["GET"])
@login_required
def list_transacoes():
    user_id = session['user_id']
    mes = request.args.get("mes")
    ano = request.args.get("ano")
    conta_id = request.args.get("conta_id")
    categoria_id = request.args.get("categoria_id")
    tipo = request.args.get("tipo")
    status = request.args.get("status")
    busca = request.args.get("q", "").strip()

    query = """
        SELECT 
            t.*,
            c.nome as categoria_nome, c.cor as categoria_cor, c.icone as categoria_icone,
            cb.nome as conta_nome, cb.cor as conta_cor, cb.icone as conta_icone,
            cbd.nome as conta_destino_nome, cbd.cor as conta_destino_cor
        FROM transacoes t
        LEFT JOIN categorias c ON t.categoria_id = c.id
        LEFT JOIN contas cb ON t.conta_id = cb.id
        LEFT JOIN contas cbd ON t.conta_destino_id = cbd.id
        WHERE t.user_id = ?
    """
    params = [user_id]

    if mes and ano:
        query += " AND strftime('%m', t.data) = ? AND strftime('%Y', t.data) = ?"
        params.extend([f"{int(mes):02d}", str(ano)])
    elif ano:
        query += " AND strftime('%Y', t.data) = ?"
        params.append(str(ano))

    if conta_id:
        query += " AND (t.conta_id = ? OR t.conta_destino_id = ?)"
        params.extend([conta_id, conta_id])

    if categoria_id:
        query += " AND t.categoria_id = ?"
        params.append(categoria_id)

    if tipo:
        query += " AND t.tipo = ?"
        params.append(tipo)

    if status:
        query += " AND t.status = ?"
        params.append(status)

    if busca:
        query += " AND (t.descricao LIKE ? OR t.observacoes LIKE ?)"
        params.extend([f"%{busca}%", f"%{busca}%"])

    query += " ORDER BY t.data DESC, t.id DESC"

    conn = database.get_connection()
    cursor = conn.cursor()
    cursor.execute(query, params)
    transacoes = [dict(row) for row in cursor.fetchall()]
    for t in transacoes:
        if t.get('data') and isinstance(t['data'], (date, datetime)):
            t['data'] = t['data'].strftime('%Y-%m-%d')
        elif t.get('data'):
            t['data'] = str(t['data'])[:10]
        if 'valor' in t and t['valor'] is not None:
            t['valor'] = float(t['valor'])
    conn.close()

    return jsonify(transacoes)

@app.route("/api/transacoes", methods=["POST"])
@login_required
def create_transacao():
    user_id = session['user_id']
    data = request.get_json() or {}
    tipo = data.get("tipo", "despesa")
    descricao = data.get("descricao", "").strip()
    valor = float(data.get("valor", 0))
    data_trans = data.get("data", date.today().strftime('%Y-%m-%d'))
    conta_id = data.get("conta_id")
    conta_destino_id = data.get("conta_destino_id")
    categoria_id = data.get("categoria_id")
    status = data.get("status", "pago")
    observacoes = data.get("observacoes", "").strip()

    if not descricao:
        return jsonify({"error": "Descrição é obrigatória"}), 400
    if valor <= 0:
        return jsonify({"error": "Valor deve ser maior que zero"}), 400
    if not conta_id:
        return jsonify({"error": "Conta bancária é obrigatória"}), 400

    conn = database.get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO transacoes 
        (user_id, tipo, descricao, valor, data, conta_id, conta_destino_id, categoria_id, status, observacoes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, tipo, descricao, valor, data_trans, conta_id, conta_destino_id, categoria_id, status, observacoes))

    conn.commit()
    novo_id = cursor.lastrowid
    conn.close()

    return jsonify({"success": True, "id": novo_id, "message": "Transação registrada com sucesso"}), 201

@app.route("/api/transacoes/<int:trans_id>", methods=["PUT"])
@login_required
def update_transacao(trans_id):
    user_id = session['user_id']
    data = request.get_json() or {}
    tipo = data.get("tipo", "despesa")
    descricao = data.get("descricao", "").strip()
    valor = float(data.get("valor", 0))
    data_trans = data.get("data", date.today().strftime('%Y-%m-%d'))
    conta_id = data.get("conta_id")
    conta_destino_id = data.get("conta_destino_id")
    categoria_id = data.get("categoria_id")
    status = data.get("status", "pago")
    observacoes = data.get("observacoes", "").strip()

    if not descricao:
        return jsonify({"error": "Descrição é obrigatória"}), 400
    if valor <= 0:
        return jsonify({"error": "Valor deve ser maior que zero"}), 400

    conn = database.get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE transacoes 
        SET tipo = ?, descricao = ?, valor = ?, data = ?, conta_id = ?, 
            conta_destino_id = ?, categoria_id = ?, status = ?, observacoes = ?
        WHERE id = ? AND user_id = ?
    """, (tipo, descricao, valor, data_trans, conta_id, conta_destino_id, categoria_id, status, observacoes, trans_id, user_id))

    conn.commit()
    conn.close()

    return jsonify({"success": True, "message": "Transação atualizada com sucesso"})

@app.route("/api/transacoes/<int:trans_id>/status", methods=["PATCH"])
@login_required
def toggle_transacao_status(trans_id):
    user_id = session['user_id']
    conn = database.get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT status FROM transacoes WHERE id = ? AND user_id = ?", (trans_id, user_id))
    row = cursor.fetchone()
    if not row:
        conn.close()
        return jsonify({"error": "Transação não encontrada"}), 404

    novo_status = 'pago' if row['status'] == 'pendente' else 'pendente'
    cursor.execute("UPDATE transacoes SET status = ? WHERE id = ? AND user_id = ?", (novo_status, trans_id, user_id))
    conn.commit()
    conn.close()

    return jsonify({"success": True, "status": novo_status, "message": f"Status alterado para {novo_status}"})

@app.route("/api/transacoes/<int:trans_id>", methods=["DELETE"])
@login_required
def delete_transacao(trans_id):
    user_id = session['user_id']
    conn = database.get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM transacoes WHERE id = ? AND user_id = ?", (trans_id, user_id))
    conn.commit()
    conn.close()

    return jsonify({"success": True, "message": "Transação excluída com sucesso"})

@app.route("/api/transacoes/zerar-mes", methods=["POST"])
@login_required
def zerar_mes_transacoes():
    user_id = session['user_id']
    data = request.get_json() or {}
    hoje = date.today()
    mes = int(data.get("mes", hoje.month))
    ano = int(data.get("ano", hoje.year))

    deletadas = database.zerar_lancamentos_mes(user_id, mes, ano)
    return jsonify({
        "success": True,
        "deletadas": deletadas,
        "message": f"Todos os {deletadas} lançamentos de {mes:02d}/{ano} foram zerados com sucesso."
    })

# ==========================================
# API IMPORTAÇÃO BANCÁRIA INTELIGENTE (OFX, CSV, TXT)
# ==========================================

@app.route("/api/import/preview", methods=["POST"])
@login_required
def import_preview():
    """Recebe o arquivo bancário e gera prévia com auto-categorização inteligente."""
    user_id = session['user_id']

    if 'arquivo' not in request.files:
        return jsonify({"error": "Nenhum arquivo enviado"}), 400

    file = request.files['arquivo']
    conta_id = request.form.get('conta_id')

    if not file or file.filename == '':
        return jsonify({"error": "Arquivo inválido ou vazio"}), 400

    file_bytes = file.read()
    transacoes_raw = bank_parser.parse_bank_file(file_bytes, file.filename)

    if not transacoes_raw:
        return jsonify({"error": "Não foi possível extrair transações deste arquivo. Certifique-se de que é um arquivo OFX, CSV ou TXT de extrato bancário."}), 400

    conn = database.get_connection()
    cursor = conn.cursor()

    transacoes_processadas = []
    total_despesas = 0.0
    total_receitas = 0.0

    for idx, t in enumerate(transacoes_raw):
        # Auto-sugestão de categoria com o motor inteligente
        sugestao = database.sugerir_categoria(user_id, t['descricao'], t['tipo'], conn)
        
        cat_id = sugestao['categoria_id'] if sugestao else None
        cat_nome = sugestao['categoria_nome'] if sugestao else 'Sem Categoria'
        origem = sugestao['origem'] if sugestao else 'padrao'

        # Verificar se já existe transação idêntica no mesmo banco (duplicidade)
        is_duplicada = False
        if t.get('fitid'):
            cursor.execute("SELECT COUNT(*) FROM transacoes WHERE user_id = ? AND fitid = ?", (user_id, t['fitid']))
            is_duplicada = cursor.fetchone()[0] > 0
        else:
            cursor.execute("""
                SELECT COUNT(*) FROM transacoes 
                WHERE user_id = ? AND data = ? AND valor = ? AND tipo = ? AND lower(descricao) = lower(?)
            """, (user_id, t['data'], t['valor'], t['tipo'], t['descricao'].strip()))
            is_duplicada = cursor.fetchone()[0] > 0

        if t['tipo'] == 'despesa':
            total_despesas += t['valor']
        else:
            total_receitas += t['valor']

        # Extrair termo de busca recomendado para memorização de regra
        palavras = [p for p in re.findall(r'[a-zA-Z\u00C0-\u00FF]{3,}', t['descricao']) if p.lower() not in ['para', 'pago', 'compra', 'cartao', 'debito', 'credito', 'transferencia', 'banco', 'transf', 'auto']]
        termo_sugerido = " ".join(palavras[:2]).upper() if palavras else t['descricao'][:15].upper()

        transacoes_processadas.append({
            "temp_id": idx + 1,
            "data": t['data'],
            "descricao": t['descricao'],
            "descricao_original": t.get('descricao_original', t['descricao']),
            "valor": t['valor'],
            "tipo": t['tipo'],
            "categoria_id": cat_id,
            "categoria_nome": cat_nome,
            "origem_sugestao": origem,
            "termo_regra_sugerido": termo_sugerido,
            "is_duplicada": is_duplicada,
            "fitid": t.get('fitid', ''),
            "selecionada": not is_duplicada # Não seleciona por padrão se for duplicada
        })

    conn.close()

    return jsonify({
        "success": True,
        "filename": file.filename,
        "conta_id": conta_id,
        "total_transacoes": len(transacoes_processadas),
        "total_despesas": round(total_despesas, 2),
        "total_receitas": round(total_receitas, 2),
        "transacoes": transacoes_processadas
    })

@app.route("/api/import/confirm", methods=["POST"])
@login_required
def import_confirm():
    """Grava as transações confirmadas pelo usuário e memoriza novas regras de categorização."""
    user_id = session['user_id']
    data = request.get_json() or {}
    conta_id = data.get("conta_id")
    transacoes = data.get("transacoes", [])

    if not conta_id:
        return jsonify({"error": "Conta bancária de destino é obrigatória"}), 400
    if not transacoes:
        return jsonify({"error": "Nenhuma transação selecionada para importar"}), 400

    conn = database.get_connection()
    cursor = conn.cursor()

    salvas = 0
    regras_aprendidas = 0

    for t in transacoes:
        valor = float(t.get('valor', 0))
        if valor <= 0:
            continue

        tipo = t.get('tipo', 'despesa')
        descricao = t.get('descricao', '').strip() or 'Transação Importada'
        data_trans = t.get('data', date.today().strftime('%Y-%m-%d'))
        categoria_id = t.get('categoria_id') or None
        fitid = t.get('fitid') or None
        observacoes = "Importado via Extrato Bancário"

        cursor.execute("""
            INSERT INTO transacoes 
            (user_id, tipo, descricao, valor, data, conta_id, categoria_id, status, observacoes, fitid)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pago', ?, ?)
        """, (user_id, tipo, descricao, valor, data_trans, conta_id, categoria_id, observacoes, fitid))

        salvas += 1

        # Se o usuário optou por memorizar a regra para próximas importações
        if t.get('lembrar_regra') and categoria_id:
            termo = t.get('termo_regra') or t.get('termo_regra_sugerido') or descricao
            database.salvar_regra_categorizacao(user_id, termo, categoria_id, conn)
            regras_aprendidas += 1

    conn.commit()
    conn.close()

    return jsonify({
        "success": True,
        "salvas": salvas,
        "regras_aprendidas": regras_aprendidas,
        "message": f"{salvas} transações importadas com sucesso! ({regras_aprendidas} novas regras de categorização memorizadas)."
    })

@app.route("/api/regras-categorizacao", methods=["GET"])
@login_required
def list_regras_categorizacao():
    user_id = session['user_id']
    regras = database.obter_regras_categorizacao(user_id)
    return jsonify(regras)

@app.route("/api/regras-categorizacao/<int:regra_id>", methods=["DELETE"])
@login_required
def delete_regra_categorizacao(regra_id):
    user_id = session['user_id']
    conn = database.get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM regras_categorizacao WHERE id = ? AND user_id = ?", (regra_id, user_id))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "Regra de memorização removida com sucesso"})

# ==========================================
# API RECORRÊNCIAS (PROTEGIDA)
# ==========================================

@app.route("/api/recorrencias", methods=["GET"])
@login_required
def list_recorrencias():
    user_id = session['user_id']
    conn = database.get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT r.*, 
               c.nome as categoria_nome, c.cor as categoria_cor, c.icone as categoria_icone,
               cb.nome as conta_nome, cb.cor as conta_cor
        FROM recorrencias r
        LEFT JOIN categorias c ON r.categoria_id = c.id
        LEFT JOIN contas cb ON r.conta_id = cb.id
        WHERE r.user_id = ?
        ORDER BY r.dia_vencimento ASC
    """, (user_id,))
    recs = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(recs)

@app.route("/api/recorrencias", methods=["POST"])
@login_required
def create_recorrencia():
    user_id = session['user_id']
    data = request.get_json() or {}
    tipo = data.get("tipo", "despesa")
    descricao = data.get("descricao", "").strip()
    valor = float(data.get("valor", 0))
    dia_vencimento = int(data.get("dia_vencimento", 1))
    frequencia = data.get("frequencia", "mensal")
    conta_id = data.get("conta_id")
    categoria_id = data.get("categoria_id")
    data_inicio = data.get("data_inicio") or date.today().strftime('%Y-%m-%d')
    data_fim = data.get("data_fim") or None

    if not descricao:
        return jsonify({"error": "Descrição é obrigatória"}), 400
    if valor <= 0:
        return jsonify({"error": "Valor deve ser maior que zero"}), 400
    if not (1 <= dia_vencimento <= 31):
        return jsonify({"error": "Dia de vencimento deve estar entre 1 e 31"}), 400

    conn = database.get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        INSERT INTO recorrencias 
        (user_id, tipo, descricao, valor, dia_vencimento, frequencia, conta_id, categoria_id, data_inicio, data_fim)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (user_id, tipo, descricao, valor, dia_vencimento, frequencia, conta_id, categoria_id, data_inicio, data_fim))

    conn.commit()
    novo_id = cursor.lastrowid

    hoje = date.today()
    database.generate_recurring_for_month(user_id, hoje.month, hoje.year, conn)

    conn.close()

    return jsonify({"success": True, "id": novo_id, "message": "Recorrência cadastrada com sucesso"}), 201

@app.route("/api/recorrencias/<int:rec_id>", methods=["PUT"])
@login_required
def update_recorrencia(rec_id):
    user_id = session['user_id']
    data = request.get_json() or {}
    tipo = data.get("tipo", "despesa")
    descricao = data.get("descricao", "").strip()
    valor = float(data.get("valor", 0))
    dia_vencimento = int(data.get("dia_vencimento", 1))
    frequencia = data.get("frequencia", "mensal")
    conta_id = data.get("conta_id")
    categoria_id = data.get("categoria_id")
    ativo = int(data.get("ativo", 1))
    data_inicio = data.get("data_inicio") or date.today().strftime('%Y-%m-%d')
    data_fim = data.get("data_fim") or None

    if not descricao:
        return jsonify({"error": "Descrição é obrigatória"}), 400
    if valor <= 0:
        return jsonify({"error": "Valor deve ser maior que zero"}), 400

    conn = database.get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        UPDATE recorrencias 
        SET tipo = ?, descricao = ?, valor = ?, dia_vencimento = ?, frequencia = ?, 
            conta_id = ?, categoria_id = ?, ativo = ?, data_inicio = ?, data_fim = ?
        WHERE id = ? AND user_id = ?
    """, (tipo, descricao, valor, dia_vencimento, frequencia, conta_id, categoria_id, ativo, data_inicio, data_fim, rec_id, user_id))

    conn.commit()
    conn.close()

    return jsonify({"success": True, "message": "Recorrência atualizada com sucesso"})

@app.route("/api/recorrencias/<int:rec_id>", methods=["DELETE"])
@login_required
def delete_recorrencia(rec_id):
    user_id = session['user_id']
    remover_todos = request.args.get("remover_todos", "false").lower() == "true"
    
    database.delete_recorrencia_com_pendentes(
        user_id=user_id,
        rec_id=rec_id,
        remover_pendentes=True,
        remover_todos=remover_todos
    )

    return jsonify({
        "success": True, 
        "message": "Recorrência excluída com sucesso e removida das pendências do dashboard."
    })

@app.route("/api/recorrencias/gerar", methods=["POST"])
@login_required
def force_generate_recurring():
    user_id = session['user_id']
    data = request.get_json() or {}
    hoje = date.today()
    mes = int(data.get("mes", hoje.month))
    ano = int(data.get("ano", hoje.year))

    criadas = database.generate_recurring_for_month(user_id, mes, ano)
    return jsonify({"success": True, "criadas": criadas, "message": f"{criadas} lançamentos de recorrência sincronizados."})

# ==========================================
# API CATEGORIAS (PROTEGIDA)
# ==========================================

@app.route("/api/categorias", methods=["GET"])
@login_required
def list_categorias():
    user_id = session['user_id']
    conn = database.get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM categorias WHERE user_id = ? AND ativo = 1 ORDER BY tipo ASC, nome ASC", (user_id,))
    categorias = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return jsonify(categorias)

@app.route("/api/categorias", methods=["POST"])
@login_required
def create_categoria():
    user_id = session['user_id']
    data = request.get_json() or {}
    nome = data.get("nome", "").strip()
    tipo = data.get("tipo", "despesa")
    icone = data.get("icone", "tag")
    cor = data.get("cor", "#64748b")

    if not nome:
        return jsonify({"error": "Nome da categoria é obrigatório"}), 400

    conn = database.get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO categorias (user_id, nome, tipo, icone, cor) VALUES (?, ?, ?, ?, ?)",
        (user_id, nome, tipo, icone, cor)
    )
    conn.commit()
    novo_id = cursor.lastrowid
    conn.close()

    return jsonify({"success": True, "id": novo_id, "message": "Categoria criada com sucesso"}), 201

# ==========================================
# API EXPORTAÇÃO CSV
# ==========================================

@app.route("/api/export/csv", methods=["GET"])
@login_required
def export_csv():
    user_id = session['user_id']
    mes = request.args.get("mes")
    ano = request.args.get("ano")

    conn = database.get_connection()
    cursor = conn.cursor()

    query = (
        "SELECT "
        "t.data as \"Data\", t.tipo as \"Tipo\", t.descricao as \"Descrição\", "
        "t.valor as \"Valor (R$)\", t.status as \"Status\", c.nome as \"Categoria\", "
        "cb.nome as \"Conta Origem\", cbd.nome as \"Conta Destino\", t.observacoes as \"Observações\" "
        "FROM transacoes t "
        "LEFT JOIN categorias c ON t.categoria_id = c.id "
        "LEFT JOIN contas cb ON t.conta_id = cb.id "
        "LEFT JOIN contas cbd ON t.conta_destino_id = cbd.id "
        "WHERE t.user_id = ?"
    )
    params = [user_id]
    if mes and ano:
        query += " AND strftime('%m', t.data) = ? AND strftime('%Y', t.data) = ?"
        params.extend([f"{int(mes):02d}", str(ano)])
    
    query += " ORDER BY t.data DESC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    output = io.StringIO()
    output.write('\ufeff')
    writer = csv.writer(output, delimiter=';', quoting=csv.QUOTE_MINIMAL)

    writer.writerow(["Data", "Tipo", "Descrição", "Valor (R$)", "Status", "Categoria", "Conta Origem", "Conta Destino", "Observações"])

    for row in rows:
        valor_formatado = f"{row['Valor (R$)']:.2f}".replace('.', ',')
        tipo_str = "Receita" if row['Tipo'] == 'receita' else ("Despesa" if row['Tipo'] == 'despesa' else "Transferência")
        status_str = "Pago" if row['Status'] == 'pago' else "Pendente"
        writer.writerow([
            row['Data'],
            tipo_str,
            row['Descrição'],
            valor_formatado,
            status_str,
            row['Categoria'] or '',
            row['Conta Origem'] or '',
            row['Conta Destino'] or '',
            row['Observações'] or ''
        ])

    csv_data = output.getvalue()
    output.close()

    filename = f"extrato_financas_{ano or 'todos'}_{mes or 'todos'}.csv"
    return Response(
        csv_data,
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f"attachment;filename={filename}"}
    )

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)

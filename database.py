import os
import re
import sqlite3
from datetime import datetime, date, timedelta
from dateutil.relativedelta import relativedelta
from werkzeug.security import generate_password_hash, check_password_hash

try:
    import psycopg2
    import psycopg2.extras
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False

DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()

# Corrige prefixo postgres:// para postgresql:// exigido pelo psycopg2
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

def _get_sqlite_path():
    if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME") or os.environ.get("NOW_REGION"):
        return os.path.join("/tmp", "financas.db")
    local_dir = os.path.dirname(os.path.abspath(__file__))
    try:
        test_file = os.path.join(local_dir, ".write_test")
        with open(test_file, "w") as f:
            f.write("1")
        os.remove(test_file)
        return os.environ.get("DATABASE_PATH", os.path.join(local_dir, "financas.db"))
    except Exception:
        return os.path.join("/tmp", "financas.db")

SQLITE_PATH = _get_sqlite_path()
DB_PATH = SQLITE_PATH

class PostgresCursorWrapper:
    """Wrapper para padronizar o cursor do PostgreSQL com o padrão do SQLite."""
    def __init__(self, real_cursor):
        self.cur = real_cursor
        self.lastrowid = None

    def execute(self, sql, params=None):
        # Converte funções de data strftime do SQLite para TO_CHAR do PostgreSQL (suporta aliases como t.data)
        sql_pg = re.sub(r"strftime\('%m',\s*([^)]+)\)", r"TO_CHAR(\1::date, 'MM')", sql, flags=re.IGNORECASE)
        sql_pg = re.sub(r"strftime\('%Y',\s*([^)]+)\)", r"TO_CHAR(\1::date, 'YYYY')", sql_pg, flags=re.IGNORECASE)
        sql_pg = re.sub(r"strftime\('%d',\s*([^)]+)\)", r"TO_CHAR(\1::date, 'DD')", sql_pg, flags=re.IGNORECASE)
        sql_pg = re.sub(r"strftime\('%Y-%m-%d',\s*([^)]+)\)", r"TO_CHAR(\1::date, 'YYYY-MM-DD')", sql_pg, flags=re.IGNORECASE)

        # Converte placeholders ? do SQLite para %s do PostgreSQL
        sql_pg = sql_pg.replace("?", "%s")

        # Se for INSERT e não tiver RETURNING, adiciona RETURNING id para emular cursor.lastrowid
        is_insert = sql_pg.strip().upper().startswith("INSERT INTO")
        if is_insert and "RETURNING" not in sql_pg.upper():
            sql_pg_ret = sql_pg.rstrip(";") + " RETURNING id;"
            try:
                self.cur.execute(sql_pg_ret, params or ())
                res = self.cur.fetchone()
                if res:
                    self.lastrowid = res["id"] if isinstance(res, dict) or hasattr(res, "keys") else res[0]
                return self
            except Exception:
                # Se falhar o RETURNING id (ex: tabela sem coluna id), executa normal
                pass

        self.cur.execute(sql_pg, params or ())
        return self

    def executemany(self, sql, seq_of_params):
        sql_pg = re.sub(r"strftime\('%m',\s*([^)]+)\)", r"TO_CHAR(\1::date, 'MM')", sql, flags=re.IGNORECASE)
        sql_pg = re.sub(r"strftime\('%Y',\s*([^)]+)\)", r"TO_CHAR(\1::date, 'YYYY')", sql_pg, flags=re.IGNORECASE)
        sql_pg = re.sub(r"strftime\('%d',\s*([^)]+)\)", r"TO_CHAR(\1::date, 'DD')", sql_pg, flags=re.IGNORECASE)
        sql_pg = re.sub(r"strftime\('%Y-%m-%d',\s*([^)]+)\)", r"TO_CHAR(\1::date, 'YYYY-MM-DD')", sql_pg, flags=re.IGNORECASE)
        sql_pg = sql_pg.replace("?", "%s")
        self.cur.executemany(sql_pg, seq_of_params)
        return self

    def fetchone(self):
        return self.cur.fetchone()

    def fetchall(self):
        return self.cur.fetchall()

    @property
    def rowcount(self):
        return self.cur.rowcount

    def close(self):
        self.cur.close()

class PostgresConnectionWrapper:
    """Wrapper de conexão PostgreSQL para unificar métodos com SQLite."""
    def __init__(self, real_conn):
        self.conn = real_conn

    def cursor(self):
        return PostgresCursorWrapper(self.conn.cursor(cursor_factory=psycopg2.extras.DictCursor))

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()

def is_postgres():
    return bool(DATABASE_URL and HAS_PSYCOPG2)

def get_connection():
    """Retorna uma conexão unificada (PostgreSQL se DATABASE_URL estiver configurado, senão SQLite)."""
    if is_postgres():
        try:
            # Conexão com timeout para evitar travamento em serverless
            raw_conn = psycopg2.connect(DATABASE_URL, connect_timeout=5)
            conn = PostgresConnectionWrapper(raw_conn)
            _init_postgres_tables_if_needed(conn)
            return conn
        except Exception as e:
            print("[AVISO] Falha ao conectar no PostgreSQL, usando SQLite:", str(e))

    # Fallback seguro para SQLite local
    db_exists = os.path.exists(SQLITE_PATH)
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    if not db_exists:
        _init_sqlite_tables(conn)
    return conn

def init_db():
    """Inicializa as tabelas do banco de dados correspondente."""
    if is_postgres():
        try:
            conn = get_connection()
            _init_postgres_tables(conn)
            conn.close()
            return
        except Exception as e:
            print("[AVISO] Falha ao inicializar PostgreSQL:", str(e))

    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    _init_sqlite_tables(conn)
    conn.close()

_pg_initialized = False

def _init_postgres_tables_if_needed(conn):
    global _pg_initialized
    if not _pg_initialized:
        _init_postgres_tables(conn)
        _pg_initialized = True

def _init_postgres_tables(conn):
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id SERIAL PRIMARY KEY,
            nome TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            senha_hash TEXT,
            google_id TEXT UNIQUE,
            avatar_url TEXT,
            plano TEXT DEFAULT 'pro',
            plano_status TEXT DEFAULT 'trial',
            trial_fim TIMESTAMP,
            gateway TEXT,
            customer_id TEXT,
            subscription_id TEXT,
            plano_periodo TEXT DEFAULT 'mensal',
            plano_expira_em TIMESTAMP,
            is_admin INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS assinaturas_historico (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            gateway TEXT NOT NULL,
            event_type TEXT NOT NULL,
            plano TEXT,
            valor NUMERIC DEFAULT 0.0,
            status TEXT,
            payload TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS contas (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            nome TEXT NOT NULL,
            instituicao TEXT,
            tipo TEXT NOT NULL DEFAULT 'Corrente',
            saldo_inicial NUMERIC NOT NULL DEFAULT 0.0,
            cor TEXT DEFAULT '#3b82f6',
            icone TEXT DEFAULT 'wallet',
            banco_id TEXT,
            integracao_tipo TEXT DEFAULT 'manual',
            integracao_status TEXT DEFAULT 'desconectado',
            integracao_agencia TEXT,
            integracao_conta TEXT,
            ultimo_sync TEXT,
            sync_auto INTEGER DEFAULT 0,
            ativo INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS categorias (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            nome TEXT NOT NULL,
            tipo TEXT NOT NULL,
            icone TEXT DEFAULT 'tag',
            cor TEXT DEFAULT '#64748b',
            ativo INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE IF NOT EXISTS recorrencias (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            tipo TEXT NOT NULL,
            descricao TEXT NOT NULL,
            valor NUMERIC NOT NULL,
            dia_vencimento INTEGER NOT NULL,
            frequencia TEXT NOT NULL DEFAULT 'mensal',
            conta_id INTEGER REFERENCES contas(id) ON DELETE SET NULL,
            categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
            ativo INTEGER NOT NULL DEFAULT 1,
            data_inicio DATE NOT NULL,
            data_fim DATE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS transacoes (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            tipo TEXT NOT NULL,
            descricao TEXT NOT NULL,
            valor NUMERIC NOT NULL,
            data DATE NOT NULL,
            conta_id INTEGER REFERENCES contas(id) ON DELETE CASCADE,
            conta_destino_id INTEGER REFERENCES contas(id) ON DELETE SET NULL,
            categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
            status TEXT NOT NULL DEFAULT 'pago',
            observacoes TEXT,
            recorrencia_id INTEGER REFERENCES recorrencias(id) ON DELETE SET NULL,
            fitid TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS regras_categorizacao (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
            termo_busca TEXT NOT NULL,
            categoria_id INTEGER NOT NULL REFERENCES categorias(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, termo_busca)
        );
    """)
    _migrate_postgres_tables(conn)
    conn.commit()

def _migrate_postgres_tables(conn):
    cur = conn.cursor()
    # Migrações na tabela contas
    cols_contas = [
        ("banco_id", "TEXT"),
        ("integracao_tipo", "TEXT DEFAULT 'manual'"),
        ("integracao_status", "TEXT DEFAULT 'desconectado'"),
        ("integracao_agencia", "TEXT"),
        ("integracao_conta", "TEXT"),
        ("integracao_item_id", "TEXT"),
        ("integracao_account_id", "TEXT"),
        ("ultimo_sync", "TEXT"),
        ("sync_auto", "INTEGER DEFAULT 0")
    ]
    for col_name, col_def in cols_contas:
        try:
            cur.execute(f"ALTER TABLE contas ADD COLUMN IF NOT EXISTS {col_name} {col_def};")
        except Exception:
            pass

    # Migrações na tabela usuarios (SaaS Tiers & Subscriptions)
    cols_usuarios = [
        ("plano", "TEXT DEFAULT 'pro'"),
        ("plano_status", "TEXT DEFAULT 'trial'"),
        ("trial_fim", "TIMESTAMP"),
        ("gateway", "TEXT"),
        ("customer_id", "TEXT"),
        ("subscription_id", "TEXT"),
        ("plano_periodo", "TEXT DEFAULT 'mensal'"),
        ("plano_expira_em", "TIMESTAMP"),
        ("is_admin", "INTEGER DEFAULT 0")
    ]
    for col_name, col_def in cols_usuarios:
        try:
            cur.execute(f"ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS {col_name} {col_def};")
        except Exception:
            pass

    # Tabela assinaturas_historico
    try:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS assinaturas_historico (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
                gateway TEXT NOT NULL,
                event_type TEXT NOT NULL,
                plano TEXT,
                valor NUMERIC DEFAULT 0.0,
                status TEXT,
                payload TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
    except Exception:
        pass

    conn.commit()

def _migrate_sqlite_tables(conn):
    cursor = conn.cursor()
    
    # Contas
    try:
        cursor.execute("PRAGMA table_info(contas)")
        existing_cols = [row[1] for row in cursor.fetchall()]
    except Exception:
        existing_cols = []

    cols_contas = [
        ("banco_id", "TEXT"),
        ("integracao_tipo", "TEXT DEFAULT 'manual'"),
        ("integracao_status", "TEXT DEFAULT 'desconectado'"),
        ("integracao_agencia", "TEXT"),
        ("integracao_conta", "TEXT"),
        ("integracao_item_id", "TEXT"),
        ("integracao_account_id", "TEXT"),
        ("ultimo_sync", "TEXT"),
        ("sync_auto", "INTEGER DEFAULT 0")
    ]
    for col_name, col_def in cols_contas:
        if col_name not in existing_cols:
            try:
                cursor.execute(f"ALTER TABLE contas ADD COLUMN {col_name} {col_def};")
            except Exception:
                pass

    # Usuarios
    try:
        cursor.execute("PRAGMA table_info(usuarios)")
        existing_user_cols = [row[1] for row in cursor.fetchall()]
    except Exception:
        existing_user_cols = []

    cols_usuarios = [
        ("plano", "TEXT DEFAULT 'pro'"),
        ("plano_status", "TEXT DEFAULT 'trial'"),
        ("trial_fim", "DATETIME"),
        ("gateway", "TEXT"),
        ("customer_id", "TEXT"),
        ("subscription_id", "TEXT"),
        ("plano_periodo", "TEXT DEFAULT 'mensal'"),
        ("plano_expira_em", "DATETIME"),
        ("is_admin", "INTEGER DEFAULT 0")
    ]
    for col_name, col_def in cols_usuarios:
        if col_name not in existing_user_cols:
            try:
                cursor.execute(f"ALTER TABLE usuarios ADD COLUMN {col_name} {col_def};")
            except Exception:
                pass

    # Tabela assinaturas_historico
    try:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS assinaturas_historico (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                gateway TEXT NOT NULL,
                event_type TEXT NOT NULL,
                plano TEXT,
                valor REAL DEFAULT 0.0,
                status TEXT,
                payload TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
            );
        """)
    except Exception:
        pass

    conn.commit()

def _init_sqlite_tables(conn):
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            senha_hash TEXT,
            google_id TEXT UNIQUE,
            avatar_url TEXT,
            plano TEXT DEFAULT 'pro',
            plano_status TEXT DEFAULT 'trial',
            trial_fim DATETIME,
            gateway TEXT,
            customer_id TEXT,
            subscription_id TEXT,
            plano_periodo TEXT DEFAULT 'mensal',
            plano_expira_em DATETIME,
            is_admin INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS assinaturas_historico (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            gateway TEXT NOT NULL,
            event_type TEXT NOT NULL,
            plano TEXT,
            valor REAL DEFAULT 0.0,
            status TEXT,
            payload TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
        );
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS contas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            nome TEXT NOT NULL,
            instituicao TEXT,
            tipo TEXT NOT NULL DEFAULT 'Corrente',
            saldo_inicial REAL NOT NULL DEFAULT 0.0,
            cor TEXT DEFAULT '#3b82f6',
            icone TEXT DEFAULT 'wallet',
            banco_id TEXT,
            integracao_tipo TEXT DEFAULT 'manual',
            integracao_status TEXT DEFAULT 'desconectado',
            integracao_agencia TEXT,
            integracao_conta TEXT,
            ultimo_sync TEXT,
            sync_auto INTEGER DEFAULT 0,
            ativo INTEGER NOT NULL DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
        );
    """)
    _migrate_sqlite_tables(conn)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS categorias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            nome TEXT NOT NULL,
            tipo TEXT NOT NULL,
            icone TEXT DEFAULT 'tag',
            cor TEXT DEFAULT '#64748b',
            ativo INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE
        );
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS recorrencias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            tipo TEXT NOT NULL,
            descricao TEXT NOT NULL,
            valor REAL NOT NULL,
            dia_vencimento INTEGER NOT NULL,
            frequencia TEXT NOT NULL DEFAULT 'mensal',
            conta_id INTEGER,
            categoria_id INTEGER,
            ativo INTEGER NOT NULL DEFAULT 1,
            data_inicio DATE NOT NULL,
            data_fim DATE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE,
            FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE SET NULL,
            FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
        );
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS transacoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            tipo TEXT NOT NULL,
            descricao TEXT NOT NULL,
            valor REAL NOT NULL,
            data DATE NOT NULL,
            conta_id INTEGER,
            conta_destino_id INTEGER,
            categoria_id INTEGER,
            status TEXT NOT NULL DEFAULT 'pago',
            observacoes TEXT,
            recorrencia_id INTEGER,
            fitid TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE,
            FOREIGN KEY (conta_id) REFERENCES contas(id) ON DELETE CASCADE,
            FOREIGN KEY (conta_destino_id) REFERENCES contas(id) ON DELETE SET NULL,
            FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL,
            FOREIGN KEY (recorrencia_id) REFERENCES recorrencias(id) ON DELETE SET NULL
        );
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS regras_categorizacao (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            termo_busca TEXT NOT NULL,
            categoria_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE,
            FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE CASCADE,
            UNIQUE(user_id, termo_busca)
        );
    """)
    conn.commit()

def seed_user_default_categories(user_id, conn):
    """Cria o conjunto padrão de categorias úteis para o novo usuário."""
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM categorias WHERE user_id = ?", (user_id,))
    first_row = cursor.fetchone()
    count = first_row[0] if first_row else 0
    if count == 0:
        categorias_padrao = [
            (user_id, 'Alimentação & Supermercado', 'despesa', 'utensils', '#ef4444'),
            (user_id, 'Moradia (Aluguel, Condomínio, IPTU)', 'despesa', 'home', '#f97316'),
            (user_id, 'Contas Básicas (Luz, Água, Gás, Net)', 'despesa', 'zap', '#f59e0b'),
            (user_id, 'Transporte & Combustível', 'despesa', 'car', '#84cc16'),
            (user_id, 'Saúde & Farmácia', 'despesa', 'heart-pulse', '#10b981'),
            (user_id, 'Lazer & Entretenimento', 'despesa', 'film', '#06b6d4'),
            (user_id, 'Educação & Cursos', 'despesa', 'book-open', '#6366f1'),
            (user_id, 'Assinaturas & Serviços', 'despesa', 'tv', '#8b5cf6'),
            (user_id, 'Compras & Vestuário', 'despesa', 'shopping-bag', '#ec4899'),
            (user_id, 'Outras Despesas', 'despesa', 'more-horizontal', '#64748b'),
            (user_id, 'Salário / Proventos', 'receita', 'briefcase', '#10b981'),
            (user_id, 'Rendimentos & Investimentos', 'receita', 'trending-up', '#059669'),
            (user_id, 'Freelance / Serviços Extras', 'receita', 'laptop', '#3b82f6'),
            (user_id, 'Reembolsos & Outros', 'receita', 'arrow-down-left', '#14b8a6')
        ]
        cursor.executemany(
            "INSERT INTO categorias (user_id, nome, tipo, icone, cor) VALUES (?, ?, ?, ?, ?)",
            categorias_padrao
        )
        conn.commit()

# ==========================================
# GERENCIAMENTO DE USUÁRIOS
# ==========================================

def create_user(nome, email, senha=None, google_id=None, avatar_url=None, plano='pro', plano_status='trial', is_admin=None):
    conn = get_connection()
    cursor = conn.cursor()

    email_clean = email.strip().lower()
    nome_clean = nome.strip()
    senha_hash = generate_password_hash(senha) if senha else None
    trial_fim = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d %H:%M:%S')

    # Primeiro usuário cadastrado no sistema é automaticamente definido como Administrador / Dono
    if is_admin is None:
        cursor.execute("SELECT COUNT(*) FROM usuarios")
        count_row = cursor.fetchone()
        user_count = count_row[0] if count_row else 0
        is_admin_flag = 1 if user_count == 0 else 0
    else:
        is_admin_flag = int(is_admin)

    cursor.execute("""
        INSERT INTO usuarios (nome, email, senha_hash, google_id, avatar_url, plano, plano_status, trial_fim, plano_periodo, is_admin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'mensal', ?)
    """, (nome_clean, email_clean, senha_hash, google_id, avatar_url, plano, plano_status, trial_fim, is_admin_flag))

    user_id = cursor.lastrowid
    conn.commit()

    seed_user_default_categories(user_id, conn)

    cursor.execute("""
        SELECT id, nome, email, avatar_url, plano, plano_status, trial_fim, 
               gateway, customer_id, subscription_id, plano_periodo, plano_expira_em, is_admin, created_at 
        FROM usuarios WHERE id = ?
    """, (user_id,))
    user = dict(cursor.fetchone())
    conn.close()

    return user

def get_user_by_email(email):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM usuarios WHERE lower(email) = lower(?)", (email.strip(),))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_user_by_id(user_id):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, nome, email, google_id, avatar_url, plano, plano_status, trial_fim, 
               gateway, customer_id, subscription_id, plano_periodo, plano_expira_em, is_admin, created_at 
        FROM usuarios WHERE id = ?
    """, (user_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

# ==========================================
# PAINEL DO GERENTE & GESTÃO ADMIN SAAS
# ==========================================

def admin_get_dashboard_metrics(conn=None):
    """Calcula indicadores globais do negócio SaaS para o gerente."""
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    cursor = conn.cursor()

    # 1. Contagens de clientes
    cursor.execute("SELECT COUNT(*) FROM usuarios")
    total_usuarios = int((cursor.fetchone() or [0])[0])

    cursor.execute("""
        SELECT COUNT(*) FROM usuarios 
        WHERE plano_status = 'active' AND plano IN ('starter', 'pro', 'family')
    """)
    total_pagantes = int((cursor.fetchone() or [0])[0])

    cursor.execute("SELECT COUNT(*) FROM usuarios WHERE plano_status = 'trial'")
    total_trial = int((cursor.fetchone() or [0])[0])

    cursor.execute("""
        SELECT COUNT(*) FROM usuarios 
        WHERE plano = 'free' OR plano_status IN ('expired', 'canceled')
    """)
    total_free = int((cursor.fetchone() or [0])[0])

    # 2. MRR (Monthly Recurring Revenue estimado dos clientes ativos)
    cursor.execute("""
        SELECT plano, plano_periodo, COUNT(*) as qtd
        FROM usuarios
        WHERE plano_status = 'active' AND plano IN ('starter', 'pro', 'family')
        GROUP BY plano, plano_periodo
    """)
    rows_mrr = cursor.fetchall()
    
    precos_mensal_equivalente = {
        ('starter', 'mensal'): 14.90,
        ('starter', 'anual'): 8.25,
        ('pro', 'mensal'): 29.90,
        ('pro', 'anual'): 16.58,
        ('family', 'mensal'): 49.90,
        ('family', 'anual'): 29.08,
    }

    mrr_total = 0.0
    for r in rows_mrr:
        p = r['plano'] if isinstance(r, dict) or hasattr(r, 'keys') else r[0]
        periodo = r['plano_periodo'] if isinstance(r, dict) or hasattr(r, 'keys') else r[1]
        qtd = r['qtd'] if isinstance(r, dict) or hasattr(r, 'keys') else r[2]
        
        m_equiv = precos_mensal_equivalente.get((p, periodo), 29.90 if p == 'pro' else 14.90)
        mrr_total += float(m_equiv * qtd)

    # 3. Volume global do sistema
    cursor.execute("SELECT COUNT(*) FROM contas WHERE ativo = 1")
    total_contas_geral = int((cursor.fetchone() or [0])[0])

    cursor.execute("SELECT COUNT(*) FROM transacoes")
    total_transacoes_geral = int((cursor.fetchone() or [0])[0])

    if should_close:
        conn.close()

    return {
        "total_usuarios": total_usuarios,
        "total_pagantes": total_pagantes,
        "total_trial": total_trial,
        "total_free": total_free,
        "mrr_estimado": round(mrr_total, 2),
        "total_contas_geral": total_contas_geral,
        "total_transacoes_geral": total_transacoes_geral
    }

def admin_list_users(busca=None, plano_filter=None, status_filter=None, conn=None):
    """Lista todos os clientes com dados de consumo e assinatura para o gestor."""
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    cursor = conn.cursor()

    query = """
        SELECT 
            u.id, u.nome, u.email, u.avatar_url, u.plano, u.plano_status, u.trial_fim,
            u.gateway, u.customer_id, u.subscription_id, u.plano_periodo, u.plano_expira_em, 
            u.is_admin, u.created_at,
            (SELECT COUNT(*) FROM contas c WHERE c.user_id = u.id AND c.ativo = 1) as total_contas,
            (SELECT COUNT(*) FROM transacoes t WHERE t.user_id = u.id) as total_transacoes,
            (SELECT MAX(t.data) FROM transacoes t WHERE t.user_id = u.id) as ultima_atividade
        FROM usuarios u
        WHERE 1=1
    """
    params = []

    if busca:
        query += " AND (lower(u.nome) LIKE ? OR lower(u.email) LIKE ?)"
        params.extend([f"%{busca.strip().lower()}%", f"%{busca.strip().lower()}%"])

    if plano_filter:
        query += " AND u.plano = ?"
        params.append(plano_filter)

    if status_filter:
        query += " AND u.plano_status = ?"
        params.append(status_filter)

    query += " ORDER BY u.created_at DESC, u.id DESC"

    cursor.execute(query, params)
    rows = cursor.fetchall()

    agora = datetime.now()
    clientes = []

    for r in rows:
        c = dict(r)
        trial_fim = c.get('trial_fim')
        status = c.get('plano_status') or 'active'
        is_trial = False
        dias_trial = 0

        if status == 'trial' and trial_fim:
            try:
                tf = datetime.fromisoformat(str(trial_fim).replace('Z', '')) if isinstance(trial_fim, str) else trial_fim
                if tf > agora:
                    is_trial = True
                    dias_trial = max(1, (tf - agora).days + 1)
            except Exception:
                pass

        c['is_trial'] = is_trial
        c['dias_restantes_trial'] = dias_trial
        c['trial_fim'] = str(trial_fim) if trial_fim else None
        c['plano_expira_em'] = str(c.get('plano_expira_em')) if c.get('plano_expira_em') else None
        c['created_at'] = str(c.get('created_at')) if c.get('created_at') else None
        c['total_contas'] = int(c.get('total_contas') or 0)
        c['total_transacoes'] = int(c.get('total_transacoes') or 0)
        c['is_admin'] = bool(c.get('is_admin'))
        clientes.append(c)

    if should_close:
        conn.close()

    return clientes

def admin_update_user_plan_and_access(user_id, plano, plano_status, plano_periodo='mensal', plano_expira_em=None, dias_trial_add=0, is_admin=None, conn=None):
    """Permite ao gerente liberar planos, alterar status ou prorrogar período de teste."""
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    cursor = conn.cursor()
    user = get_user_by_id(user_id)
    if not user:
        if should_close:
            conn.close()
        return False

    agora = datetime.now()
    trial_fim_novo = user.get('trial_fim')

    # Prorrogação de período de teste se solicitado
    if dias_trial_add > 0:
        base_time = agora
        if user.get('trial_fim'):
            try:
                tf = datetime.fromisoformat(str(user['trial_fim']).replace('Z', '')) if isinstance(user['trial_fim'], str) else user['trial_fim']
                if tf > agora:
                    base_time = tf
            except Exception:
                base_time = agora
        trial_fim_novo = (base_time + timedelta(days=int(dias_trial_add))).strftime('%Y-%m-%d %H:%M:%S')
        plano_status = 'trial'

    # Se for ativo vitalício ou indeterminado, pode estipular expira_em em 10 anos
    if plano_expira_em == 'vitalicio':
        plano_expira_em = (agora + timedelta(days=3650)).strftime('%Y-%m-%d %H:%M:%S')

    is_admin_val = user.get('is_admin', 0) if is_admin is None else (1 if is_admin else 0)

    cursor.execute("""
        UPDATE usuarios
        SET plano = ?,
            plano_status = ?,
            plano_periodo = ?,
            trial_fim = ?,
            plano_expira_em = ?,
            is_admin = ?
        WHERE id = ?
    """, (plano, plano_status, plano_periodo, trial_fim_novo, plano_expira_em, is_admin_val, user_id))

    conn.commit()

    # Log de auditoria da alteração pelo gerente
    log_subscription_event(
        user_id=user_id,
        gateway='admin_manual',
        event_type='admin_plan_override',
        plano=plano,
        valor=0.0,
        status=plano_status,
        payload=f"Alterado manualmente pelo gerente para plano={plano}, status={plano_status}, trial_fim={trial_fim_novo}"
    )

    if should_close:
        conn.close()

    return True

def admin_delete_user(user_id, conn=None):
    """Exclui cliente e dados vinculados do sistema."""
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    cursor = conn.cursor()
    cursor.execute("DELETE FROM usuarios WHERE id = ?", (user_id,))
    conn.commit()

    if should_close:
        conn.close()

    return True

# ==========================================
# GESTÃO DE PLANOS & ASSINATURAS SAAS
# ==========================================

def get_user_plan_details(user_id):
    user = get_user_by_id(user_id)
    if not user:
        return None
    
    plano = user.get('plano') or 'free'
    status = user.get('plano_status') or 'active'
    trial_fim = user.get('trial_fim')
    expira_em = user.get('plano_expira_em')

    agora = datetime.now()
    dias_restantes_trial = 0
    is_trial = False

    if status == 'trial' and trial_fim:
        try:
            if isinstance(trial_fim, str):
                tf = datetime.fromisoformat(trial_fim.replace('Z', ''))
            else:
                tf = trial_fim
            if tf > agora:
                is_trial = True
                dias_restantes_trial = max(1, (tf - agora).days + 1)
            else:
                # Trial expirou: altera para free expirado
                status = 'expired'
                plano = 'free'
                update_user_plan(user_id, plano='free', plano_status='expired')
        except Exception:
            pass
    elif status == 'active' and expira_em:
        try:
            if isinstance(expira_em, str):
                exp = datetime.fromisoformat(expira_em.replace('Z', ''))
            else:
                exp = expira_em
            if exp < agora:
                status = 'expired'
                plano = 'free'
                update_user_plan(user_id, plano='free', plano_status='expired')
        except Exception:
            pass

    return {
        "user_id": user_id,
        "plano": plano,
        "plano_status": status,
        "is_trial": is_trial,
        "dias_restantes_trial": dias_restantes_trial,
        "trial_fim": str(trial_fim) if trial_fim else None,
        "plano_periodo": user.get('plano_periodo') or 'mensal',
        "gateway": user.get('gateway'),
        "customer_id": user.get('customer_id'),
        "subscription_id": user.get('subscription_id'),
        "plano_expira_em": str(expira_em) if expira_em else None
    }

def update_user_plan(user_id, plano, plano_status, plano_periodo='mensal', gateway=None, customer_id=None, subscription_id=None, plano_expira_em=None):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE usuarios
        SET plano = ?,
            plano_status = ?,
            plano_periodo = COALESCE(?, plano_periodo),
            gateway = COALESCE(?, gateway),
            customer_id = COALESCE(?, customer_id),
            subscription_id = COALESCE(?, subscription_id),
            plano_expira_em = ?
        WHERE id = ?
    """, (plano, plano_status, plano_periodo, gateway, customer_id, subscription_id, plano_expira_em, user_id))
    conn.commit()
    conn.close()

def log_subscription_event(user_id, gateway, event_type, plano=None, valor=0.0, status='success', payload=None):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO assinaturas_historico (user_id, gateway, event_type, plano, valor, status, payload)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (user_id, gateway, event_type, plano, float(valor or 0.0), status, str(payload or '')))
    conn.commit()
    conn.close()

def get_user_usage_stats(user_id, mes=None, ano=None):
    if not mes or not ano:
        now = datetime.now()
        mes = now.month
        ano = now.year

    m_str = f"{int(mes):02d}"
    y_str = str(ano)

    conn = get_connection()
    cursor = conn.cursor()

    # Contagem de contas ativas
    cursor.execute("SELECT COUNT(*) FROM contas WHERE user_id = ? AND ativo = 1", (user_id,))
    row_contas = cursor.fetchone()
    total_contas = row_contas[0] if row_contas else 0

    # Contagem de transações no mês atual
    cursor.execute("""
        SELECT COUNT(*) FROM transacoes 
        WHERE user_id = ? AND strftime('%m', data) = ? AND strftime('%Y', data) = ?
    """, (user_id, m_str, y_str))
    row_trans = cursor.fetchone()
    total_transacoes_mes = row_trans[0] if row_trans else 0

    conn.close()

    return {
        "total_contas": int(total_contas),
        "total_transacoes_mes": int(total_transacoes_mes),
        "mes": int(mes),
        "ano": int(ano)
    }

# ==========================================
# MOTOR INTELIGENTE DE AUTO-CATEGORIZAÇÃO
# ==========================================

DICIONARIO_SEMANTICO = {
    'Alimentação & Supermercado': [
        'ifood', 'rappi', 'uber eats', 'aiqfome', 'mercado', 'supermercado', 'hipermercado',
        'carrefour', 'pao de acucar', 'pão de açúcar', 'extra', 'atacadao', 'atacadão',
        'assai', 'assaí', 'hortifruti', 'padaria', 'panificadora', 'acougue', 'açougue',
        'restaurante', 'lanchonete', 'mcdonald', 'burger king', 'starbucks', 'subway',
        'outback', 'pizzaria', 'pizza', 'churrascaria', 'cafe', 'cafeteria', 'bistro', 'bistrô',
        'sorvete', 'doceria', 'confeitaria', 'bar ', 'boteco', 'adega', 'emporio', 'empório'
    ],
    'Transporte & Combustível': [
        'uber', '99app', '99pop', '99 táxi', '99 taxi', 'taxi', 'táxi', 'cabify',
        'posto', 'ipiranga', 'shell', 'petrobras', 'br distribuidora', 'ale combustiveis',
        'gasolina', 'etanol', 'combustivel', 'estacionamento', 'estapar', 'pedagio', 'pedágio',
        'conectcar', 'sem parar', 'veloe', 'taggy', 'auto posto', 'bilhete unico', 'metro', 'metrô'
    ],
    'Moradia (Aluguel, Condomínio, IPTU)': [
        'aluguel', 'condominio', 'condomínio', 'iptu', 'imobiliaria', 'imobiliária',
        'quinto andar', 'quintoandar', 'loft', 'zap imoveis', 'reforma', 'leroy merlin',
        'telhanorte', 'c&c', 'marcenaria', 'eletricista', 'encanador', 'diarista'
    ],
    'Contas Básicas (Luz, Água, Gás, Net)': [
        'enel', 'copel', 'cemig', 'celpe', 'equatorial', 'cpfl', 'eletropaulo', 'energia', 'luz',
        'sabesp', 'sanepar', 'compesa', 'cedae', 'embasa', 'copasa', 'agua', 'água', 'saneamento',
        'comgas', 'comgás', 'ultragaz', 'liquigas', 'nacional gas', 'gas', 'gás',
        'claro', 'vivo', 'tim', 'oi fibra', 'net servicos', 'net serviços', 'internet', 'banda larga'
    ],
    'Saúde & Farmácia': [
        'drogasil', 'droga raia', 'raia drogasil', 'drogarias pacheco', 'drogaria sao paulo',
        'farmacia', 'farmácia', 'drogaria', 'panvel', 'pague menos', 'paguemenos',
        'medico', 'médico', 'dentista', 'odontoprev', 'clinica', 'clínica', 'laboratorio',
        'fleury', 'delboni', 'lavoisier', 'hospital', 'pronto socorro', 'unimed',
        'bradesco saude', 'amil', 'sulamerica', 'notredame', 'intermedica', 'psicologo'
    ],
    'Lazer & Entretenimento': [
        'cinema', 'cinemark', 'cinepolis', 'kinoplex', 'show', 'ingresso', 'sympla',
        'eventim', 'teatro', 'steam', 'playstation', 'xbox', 'nintendo', 'jogos',
        'viagem', 'hotel', 'pousada', 'airbnb', 'booking', 'decolar', 'latam', 'gol', 'azul'
    ],
    'Assinaturas & Serviços': [
        'netflix', 'spotify', 'amazon prime', 'prime video', 'disney', 'hbo', 'max',
        'globoplay', 'apple.com', 'itunes', 'youtube', 'deezer', 'chatgpt', 'openai',
        'canva', 'adobe', 'crunchyroll', 'paramount', 'starz'
    ],
    'Educação & Cursos': [
        'curso', 'faculdade', 'universidade', 'escola', 'colegio', 'colégio',
        'udemy', 'coursera', 'alura', 'rocketseat', 'idiomas', 'ingles', 'inglês',
        'livraria', 'livro', 'saraiva', 'amazon livros'
    ],
    'Compras & Vestuário': [
        'zara', 'renner', 'riachuelo', 'c&a', 'shein', 'shopee', 'mercado livre',
        'mercadolivre', 'aliexpress', 'magalu', 'magazine luiza', 'kabum', 'casas bahia',
        'ponto frio', 'centauro', 'decathlon', 'nike', 'adidas', 'calcados', 'calçados'
    ],
    'Salário / Proventos': [
        'salario', 'salário', 'proventos', 'folha de pagto', 'folha de pagamento',
        'vencimentos', 'remuneracao', 'remuneração', 'ted recebida', 'pix recebido',
        'adiantamento salarial', 'bonificacao', 'bonificação', '13o salario'
    ],
    'Rendimentos & Investimentos': [
        'rendimento', 'dividendo', 'jcp', 'juros s/ capital', 'nu invest', 'tesouro direto',
        'xp investimentos', 'rico', 'btg pactual', 'clear', 'aplicacao', 'resgate'
    ]
}

def sugerir_categoria(user_id, descricao, tipo, conn=None):
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    cursor = conn.cursor()
    desc_lower = descricao.lower().strip()

    cursor.execute("SELECT id, nome, tipo FROM categorias WHERE user_id = ? AND ativo = 1", (user_id,))
    categorias_user = [dict(r) for r in cursor.fetchall()]
    cat_by_id = {c['id']: c for c in categorias_user}

    resultado = None

    # 1. Nível 1: Regras memorizadas do usuário
    cursor.execute("SELECT termo_busca, categoria_id FROM regras_categorizacao WHERE user_id = ?", (user_id,))
    regras = cursor.fetchall()
    for reg in regras:
        termo = reg['termo_busca'].lower().strip()
        if termo and termo in desc_lower:
            if reg['categoria_id'] in cat_by_id:
                resultado = {
                    "categoria_id": reg['categoria_id'],
                    "categoria_nome": cat_by_id[reg['categoria_id']]['nome'],
                    "origem": "regra_aprendida"
                }
                break

    # 2. Nível 2: Histórico de transações semelhantes
    if not resultado:
        palavras = [p for p in re.findall(r'[a-zA-Z\u00C0-\u00FF]{4,}', desc_lower) if p not in ['para', 'pago', 'compra', 'cartao', 'debito', 'credito', 'transferencia']]
        for palavra in palavras:
            cursor.execute("""
                SELECT categoria_id, COUNT(*) as qtd
                FROM transacoes
                WHERE user_id = ? AND categoria_id IS NOT NULL AND lower(descricao) LIKE ?
                GROUP BY categoria_id
                ORDER BY qtd DESC
                LIMIT 1
            """, (user_id, f"%{palavra}%"))
            hist_row = cursor.fetchone()
            if hist_row and hist_row['categoria_id'] in cat_by_id:
                resultado = {
                    "categoria_id": hist_row['categoria_id'],
                    "categoria_nome": cat_by_id[hist_row['categoria_id']]['nome'],
                    "origem": "historico"
                }
                break

    # 3. Nível 3: Dicionário semântico
    if not resultado:
        for cat_nome_padrao, termos in DICIONARIO_SEMANTICO.items():
            if any(t in desc_lower for t in termos):
                for c in categorias_user:
                    if cat_nome_padrao.lower() in c['nome'].lower() or c['nome'].lower() in cat_nome_padrao.lower():
                        resultado = {
                            "categoria_id": c['id'],
                            "categoria_nome": c['nome'],
                            "origem": "semantica"
                        }
                        break
            if resultado:
                break

    if not resultado:
        cat_padrao_nome = 'Outras Despesas' if tipo == 'despesa' else 'Salário / Proventos'
        cat_default = next((c for c in categorias_user if cat_padrao_nome.lower() in c['nome'].lower()), None)
        if not cat_default and categorias_user:
            cat_default = next((c for c in categorias_user if c['tipo'] == tipo), categorias_user[0])

        if cat_default:
            resultado = {
                "categoria_id": cat_default['id'],
                "categoria_nome": cat_default['nome'],
                "origem": "padrao"
            }

    if should_close:
        conn.close()

    return resultado

def salvar_regra_categorizacao(user_id, termo_busca, categoria_id, conn=None):
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    termo_limpo = termo_busca.strip().lower()
    if len(termo_limpo) >= 3 and categoria_id:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO regras_categorizacao (user_id, termo_busca, categoria_id)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, termo_busca) DO UPDATE SET categoria_id = excluded.categoria_id
        """, (user_id, termo_limpo, categoria_id))
        conn.commit()

    if should_close:
        conn.close()

def obter_regras_categorizacao(user_id, conn=None):
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    cursor = conn.cursor()
    cursor.execute("""
        SELECT r.*, c.nome as categoria_nome, c.cor as categoria_cor, c.icone as categoria_icone
        FROM regras_categorizacao r
        JOIN categorias c ON r.categoria_id = c.id
        WHERE r.user_id = ?
        ORDER BY r.termo_busca ASC
    """, (user_id,))
    regras = [dict(row) for row in cursor.fetchall()]

    if should_close:
        conn.close()

    return regras

# ==========================================
# CÁLCULOS E RECORRÊNCIAS
# ==========================================

def calculate_account_balances(user_id, conn=None):
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    cursor = conn.cursor()
    cursor.execute("SELECT * FROM contas WHERE user_id = ? AND ativo = 1 ORDER BY nome ASC", (user_id,))
    contas = [dict(row) for row in cursor.fetchall()]

    for conta in contas:
        cid = conta['id']
        saldo = float(conta['saldo_inicial'])

        cursor.execute("""
            SELECT COALESCE(SUM(valor), 0) FROM transacoes
            WHERE user_id = ? AND conta_id = ? AND tipo = 'receita' AND status = 'pago'
        """, (user_id, cid))
        receitas_pagas = float(cursor.fetchone()[0])

        cursor.execute("""
            SELECT COALESCE(SUM(valor), 0) FROM transacoes
            WHERE user_id = ? AND conta_id = ? AND tipo = 'despesa' AND status = 'pago'
        """, (user_id, cid))
        despesas_pagas = float(cursor.fetchone()[0])

        cursor.execute("""
            SELECT COALESCE(SUM(valor), 0) FROM transacoes
            WHERE user_id = ? AND conta_id = ? AND tipo = 'transferencia' AND status = 'pago'
        """, (user_id, cid))
        transf_enviadas = float(cursor.fetchone()[0])

        cursor.execute("""
            SELECT COALESCE(SUM(valor), 0) FROM transacoes
            WHERE user_id = ? AND conta_destino_id = ? AND tipo = 'transferencia' AND status = 'pago'
        """, (user_id, cid))
        transf_recebidas = float(cursor.fetchone()[0])

        conta['saldo_atual'] = round(saldo + receitas_pagas - despesas_pagas - transf_enviadas + transf_recebidas, 2)
        conta['receitas_pagas'] = round(receitas_pagas, 2)
        conta['despesas_pagas'] = round(despesas_pagas, 2)

    if should_close:
        conn.close()

    return contas

def generate_recurring_for_month(user_id, mes, ano, conn=None):
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    cursor = conn.cursor()
    cursor.execute("SELECT * FROM recorrencias WHERE user_id = ? AND ativo = 1", (user_id,))
    recs = cursor.fetchall()

    criadas = 0
    for rec in recs:
        try:
            prox_mes = date(ano, mes, 1) + relativedelta(months=1)
            ultimo_dia_mes = (prox_mes - relativedelta(days=1)).day
            data_venc = date(ano, mes, min(rec['dia_vencimento'], ultimo_dia_mes))
        except Exception:
            data_venc = date(ano, mes, 28)

        data_str = data_venc.strftime('%Y-%m-%d')

        cursor.execute("""
            SELECT COUNT(*) FROM transacoes 
            WHERE user_id = ?
              AND recorrencia_id = ? 
              AND strftime('%m', data) = ? 
              AND strftime('%Y', data) = ?
        """, (user_id, rec['id'], f"{mes:02d}", str(ano)))
        
        row_c = cursor.fetchone()
        existe = (row_c[0] if row_c else 0) > 0

        if not existe:
            data_inicio_raw = rec['data_inicio']
            data_fim_raw = rec['data_fim']

            if isinstance(data_inicio_raw, (datetime, date)):
                data_inicio = data_inicio_raw if isinstance(data_inicio_raw, date) else data_inicio_raw.date()
            elif data_inicio_raw:
                data_inicio = datetime.strptime(str(data_inicio_raw)[:10], '%Y-%m-%d').date()
            else:
                data_inicio = None

            if isinstance(data_fim_raw, (datetime, date)):
                data_fim = data_fim_raw if isinstance(data_fim_raw, date) else data_fim_raw.date()
            elif data_fim_raw:
                data_fim = datetime.strptime(str(data_fim_raw)[:10], '%Y-%m-%d').date()
            else:
                data_fim = None

            valido_inicio = True
            if data_inicio:
                valido_inicio = (data_venc >= data_inicio) or (data_venc.year == data_inicio.year and data_venc.month == data_inicio.month)

            valido_fim = True
            if data_fim:
                valido_fim = data_venc <= data_fim

            if valido_inicio and valido_fim:
                cursor.execute("""
                    INSERT INTO transacoes 
                    (user_id, tipo, descricao, valor, data, conta_id, categoria_id, status, observacoes, recorrencia_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, 'pendente', 'Lançamento automático de recorrência', ?)
                """, (
                    user_id,
                    rec['tipo'],
                    rec['descricao'],
                    rec['valor'],
                    data_str,
                    rec['conta_id'],
                    rec['categoria_id'],
                    rec['id']
                ))
                criadas += 1

    conn.commit()
    if should_close:
        conn.close()

    return criadas

def delete_recorrencia_com_pendentes(user_id, rec_id, remover_pendentes=True, remover_todos=False):
    conn = get_connection()
    cursor = conn.cursor()

    if remover_todos:
        cursor.execute("DELETE FROM transacoes WHERE user_id = ? AND recorrencia_id = ?", (user_id, rec_id))
    elif remover_pendentes:
        cursor.execute("DELETE FROM transacoes WHERE user_id = ? AND recorrencia_id = ? AND status = 'pendente'", (user_id, rec_id))

    cursor.execute("DELETE FROM recorrencias WHERE id = ? AND user_id = ?", (rec_id, user_id))
    conn.commit()
    conn.close()

def zerar_lancamentos_mes(user_id, mes, ano):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        DELETE FROM transacoes 
        WHERE user_id = ? AND strftime('%m', data) = ? AND strftime('%Y', data) = ?
    """, (user_id, f"{mes:02d}", str(ano)))

    deletadas = cursor.rowcount
    conn.commit()
    conn.close()

    return deletadas

# ==========================================
# OPEN FINANCE & INTEGRAÇÃO BANCÁRIA
# ==========================================

def get_conta_by_id(conta_id, user_id, conn=None):
    """Busca os detalhes de uma conta específica pertencente ao usuário."""
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    cursor = conn.cursor()
    cursor.execute("SELECT * FROM contas WHERE id = ? AND user_id = ? AND ativo = 1", (conta_id, user_id))
    row = cursor.fetchone()

    conta = dict(row) if row else None

    if should_close:
        conn.close()

    return conta

def conectar_conta_banco(conta_id, user_id, banco_id, integracao_tipo='open_finance_sandbox', agencia='', conta='', item_id='', account_id='', conn=None):
    """Conecta ou atualiza a integração Open Finance de uma conta bancária."""
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    cursor = conn.cursor()
    cursor.execute("""
        UPDATE contas 
        SET banco_id = ?, 
            integracao_tipo = ?, 
            integracao_status = 'conectado',
            integracao_agencia = ?,
            integracao_conta = ?,
            integracao_item_id = COALESCE(NULLIF(?, ''), integracao_item_id),
            integracao_account_id = COALESCE(NULLIF(?, ''), integracao_account_id)
        WHERE id = ? AND user_id = ?
    """, (banco_id, integracao_tipo, agencia, conta, item_id, account_id, conta_id, user_id))

    conn.commit()
    if should_close:
        conn.close()

    return True

def desconectar_conta_banco(conta_id, user_id, conn=None):
    """Desvincula a integração Open Finance de uma conta bancária."""
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    cursor = conn.cursor()
    cursor.execute("""
        UPDATE contas 
        SET integracao_status = 'desconectado',
            integracao_tipo = 'manual'
        WHERE id = ? AND user_id = ?
    """, (conta_id, user_id))

    conn.commit()
    if should_close:
        conn.close()

    return True

def atualizar_ultimo_sync(conta_id, user_id, timestamp_str=None, conn=None):
    """Registra a data e hora do último sync bem-sucedido."""
    should_close = False
    if conn is None:
        conn = get_connection()
        should_close = True

    if not timestamp_str:
        timestamp_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    cursor = conn.cursor()
    cursor.execute("""
        UPDATE contas 
        SET ultimo_sync = ?, integracao_status = 'conectado'
        WHERE id = ? AND user_id = ?
    """, (timestamp_str, conta_id, user_id))

    conn.commit()
    if should_close:
        conn.close()

    return timestamp_str

"""
Módulo de Análise e Parsing de Extratos Bancários (OFX, CSV, TXT)
Suporta formatos dos principais bancos brasileiros (Nubank, Itaú, Bradesco, Inter, Santander, BB, Caixa, etc.)
"""

import re
import csv
import io
from datetime import datetime

def clean_text(text):
    if not text:
        return ""
    # Remove tags residuais e espaços extras
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def parse_date_str(raw_date):
    """Normaliza strings de data para o formato YYYY-MM-DD."""
    if not raw_date:
        return datetime.today().strftime('%Y-%m-%d')

    raw_date = raw_date.strip()

    # Formato OFX (YYYYMMDD ou YYYYMMDDHHMMSS ou com timezone [-03:EST])
    ofx_match = re.match(r'^(\d{4})(\d{2})(\d{2})', raw_date)
    if ofx_match:
        year, month, day = ofx_match.groups()
        return f"{year}-{month}-{day}"

    # Formato DD/MM/YYYY ou DD/MM/YY
    br_match = re.match(r'^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})', raw_date)
    if br_match:
        day, month, year = br_match.groups()
        if len(year) == 2:
            year = f"20{year}"
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"

    # Formato YYYY-MM-DD
    iso_match = re.match(r'^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})', raw_date)
    if iso_match:
        year, month, day = iso_match.groups()
        return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"

    return datetime.today().strftime('%Y-%m-%d')

def parse_currency_amount(val_str):
    """Converte valores em string (ex: -1.250,50 ou -1250.50 ou 1,250.50) para float."""
    if isinstance(val_str, (int, float)):
        return float(val_str)
    
    if not val_str:
        return 0.0

    val_clean = str(val_str).strip().replace('R$', '').replace('r$', '').strip()

    # Detectar sinal
    is_negative = '-' in val_clean or '(' in val_clean

    # Limpar caracteres não numéricos exceto vírgula e ponto
    val_clean = re.sub(r'[^\d,\.]', '', val_clean)

    if not val_clean:
        return 0.0

    # Tratar formato brasileiro vs internacional
    if ',' in val_clean and '.' in val_clean:
        if val_clean.rfind(',') > val_clean.rfind('.'):
            # Formato brasileiro: 1.250,50 -> 1250.50
            val_clean = val_clean.replace('.', '').replace(',', '.')
        else:
            # Formato americano: 1,250.50 -> 1250.50
            val_clean = val_clean.replace(',', '')
    elif ',' in val_clean:
        # Apenas vírgula: 1250,50 -> 1250.50
        val_clean = val_clean.replace(',', '.')

    try:
        amount = float(val_clean)
        return -amount if is_negative else amount
    except ValueError:
        return 0.0

def parse_ofx_content(content_str):
    """Parser robusto para extratos bancários em formato OFX (SGML / XML)."""
    transacoes = []

    # Encontrar blocos <STMTTRN>...</STMTTRN> (ou sem fechamento em SGML antigo)
    # Dividir pelo delimitador <STMTTRN>
    blocks = re.split(r'<STMTTRN>', content_str, flags=re.IGNORECASE)

    for block in blocks[1:]:
        # Extrair campos da transação
        tipo_match = re.search(r'<TRNTYPE>([^<\r\n]+)', block, re.IGNORECASE)
        data_match = re.search(r'<DTPOSTED>([^<\r\n]+)', block, re.IGNORECASE)
        valor_match = re.search(r'<TRNAMT>([^<\r\n]+)', block, re.IGNORECASE)
        memo_match = re.search(r'<MEMO>([^<\r\n]+)', block, re.IGNORECASE)
        name_match = re.search(r'<NAME>([^<\r\n]+)', block, re.IGNORECASE)
        fitid_match = re.search(r'<FITID>([^<\r\n]+)', block, re.IGNORECASE)

        raw_tipo = clean_text(tipo_match.group(1)) if tipo_match else ""
        raw_data = clean_text(data_match.group(1)) if data_match else ""
        raw_valor = clean_text(valor_match.group(1)) if valor_match else "0"
        memo = clean_text(memo_match.group(1)) if memo_match else ""
        name = clean_text(name_match.group(1)) if name_match else ""
        fitid = clean_text(fitid_match.group(1)) if fitid_match else ""

        descricao = name or memo or "Transação Bancária"
        if name and memo and name.lower() != memo.lower():
            descricao = f"{name} - {memo}"

        # Limpar prefixos e sufixos bancários comuns
        descricao_limpa = re.sub(r'^(COMPRA\s+(COM\s+)?CARTAO|PAGTO|PAGAMENTO|PIX\s+(ENVIADO|RECEBIDO|TRANSF)|DOC|TED|TRANSF\s+ENTRE\s+CONTAS|DEBITO\s+AUTOMATICO)\s*[:-]?\s*', '', descricao, flags=re.IGNORECASE)
        if not descricao_limpa.strip():
            descricao_limpa = descricao

        valor = parse_currency_amount(raw_valor)
        data_formatada = parse_date_str(raw_data)

        # Se valor < 0 -> despesa, se valor > 0 -> receita
        # Em OFX TRNTYPE=DEBIT sempre é negativo, CREDIT positivo
        if raw_tipo.upper() == 'DEBIT' and valor > 0:
            valor = -valor
        elif raw_tipo.upper() == 'CREDIT' and valor < 0:
            valor = abs(valor)

        tipo_final = 'despesa' if valor < 0 else 'receita'
        valor_positivo = abs(valor)

        if valor_positivo > 0:
            transacoes.append({
                "data": data_formatada,
                "descricao": descricao_limpa.strip() or descricao,
                "descricao_original": descricao,
                "valor": round(valor_positivo, 2),
                "tipo": tipo_final,
                "fitid": fitid,
                "status": "pago"
            })

    return transacoes

def parse_csv_content(content_str):
    """Parser para extratos bancários em formato CSV ou TXT com delimitadores comuns."""
    transacoes = []

    # Detectar delimitador
    sample = content_str[:2048]
    delimiter = ';'
    if ';' in sample:
        delimiter = ';'
    elif ',' in sample:
        delimiter = ','
    elif '\t' in sample:
        delimiter = '\t'

    reader = csv.reader(io.StringIO(content_str), delimiter=delimiter)
    linhas = list(reader)

    if not linhas:
        return transacoes

    # Encontrar linha de cabeçalho
    header_idx = -1
    col_data = -1
    col_desc = -1
    col_valor = -1
    col_tipo = -1

    for idx, row in enumerate(linhas[:15]):
        row_lower = [str(c).strip().lower() for c in row]
        for col_i, col_name in enumerate(row_lower):
            if any(k in col_name for k in ['data', 'date', 'dt']):
                col_data = col_i
            elif any(k in col_name for k in ['descri', 'hist', 'memo', 'detalhe', 'transa', 'lançamento', 'lancamento']):
                col_desc = col_i
            elif any(k in col_name for k in ['valor', 'amount', 'val', 'quantia']):
                col_valor = col_i
            elif any(k in col_name for k in ['tipo', 'type', 'd/c', 'deb/cred']):
                col_tipo = col_i

        if col_data != -1 and col_valor != -1:
            header_idx = idx
            break

    # Se não encontrou cabeçalho explícito, tenta adivinhar por padrão de colunas
    start_row = header_idx + 1 if header_idx != -1 else 0
    if col_data == -1: col_data = 0
    if col_desc == -1: col_desc = 1 if len(linhas[0]) > 1 else 0
    if col_valor == -1: col_valor = 2 if len(linhas[0]) > 2 else (1 if len(linhas[0]) > 1 else 0)

    for row in linhas[start_row:]:
        if not row or len(row) <= max(col_data, col_valor):
            continue

        raw_data = row[col_data] if col_data < len(row) else ""
        raw_desc = row[col_desc] if col_desc < len(row) else "Lançamento"
        raw_val = row[col_valor] if col_valor < len(row) else "0"
        raw_tipo = row[col_tipo] if (col_tipo != -1 and col_tipo < len(row)) else ""

        # Pular linhas de totais ou vazias
        if not raw_data or 'saldo' in str(raw_desc).lower() or 'total' in str(raw_desc).lower():
            continue

        data_formatada = parse_date_str(raw_data)
        valor_num = parse_currency_amount(raw_val)

        # Checar coluna de tipo D/C se existir
        if raw_tipo:
            tipo_txt = str(raw_tipo).strip().lower()
            if tipo_txt in ['d', 'debito', 'débito', 'debit', 'saida', 'saída']:
                valor_num = -abs(valor_num)
            elif tipo_txt in ['c', 'credito', 'crédito', 'credit', 'entrada']:
                valor_num = abs(valor_num)

        tipo_final = 'despesa' if valor_num < 0 else 'receita'
        valor_positivo = abs(valor_num)

        if valor_positivo > 0:
            descricao_limpa = clean_text(raw_desc)
            transacoes.append({
                "data": data_formatada,
                "descricao": descricao_limpa or "Transação Bancária",
                "descricao_original": raw_desc,
                "valor": round(valor_positivo, 2),
                "tipo": tipo_final,
                "status": "pago"
            })

    return transacoes

def parse_bank_file(file_bytes, filename):
    """Ponto de entrada unificado: detecta formato (.ofx, .csv, .txt) e retorna transações padronizadas."""
    # Tentar decodificar em UTF-8 ou Latin-1 / CP1252
    content = ""
    for encoding in ['utf-8-sig', 'utf-8', 'latin-1', 'cp1252', 'iso-8859-1']:
        try:
            content = file_bytes.decode(encoding)
            break
        except (UnicodeDecodeError, AttributeError):
            continue

    if not content and isinstance(file_bytes, str):
        content = file_bytes

    if not content:
        return []

    ext = filename.lower().split('.')[-1] if '.' in filename else ''

    # Se for OFX ou contiver tags OFX
    if ext == 'ofx' or '<OFX>' in content.upper() or '<STMTTRN>' in content.upper():
        return parse_ofx_content(content)

    # Caso contrário, trata como CSV / TXT tabular
    return parse_csv_content(content)

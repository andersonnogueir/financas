import os
import sys

# Adiciona o diretório raiz ao path para importação dos módulos
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app

# Vercel WSGI Handler
app = app

import os
import sys

# Adiciona o diretório raiz ao path para importação dos módulos
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from app import app

# Preservar o objeto Flask original e envelopar o wsgi_app para restaurar PATH_INFO na Vercel
_original_wsgi = app.wsgi_app

def vercel_wsgi(environ, start_response):
    path = environ.get('PATH_INFO', '')
    raw_uri = environ.get('RAW_URI') or environ.get('REQUEST_URI')
    matched_path = environ.get('HTTP_X_MATCHED_PATH')
    
    if raw_uri and not raw_uri.startswith('/api/index'):
        clean_uri = raw_uri.split('?')[0]
        environ['PATH_INFO'] = clean_uri
    elif matched_path and not matched_path.startswith('/api/index'):
        environ['PATH_INFO'] = matched_path
    elif path.startswith('/api/index'):
        remainder = path[len('/api/index'):]
        environ['PATH_INFO'] = remainder if remainder else '/'
        
    return _original_wsgi(environ, start_response)

app.wsgi_app = vercel_wsgi

import webbrowser
import threading
import time
from app import app

def open_browser():
    time.sleep(1.2)
    webbrowser.open('http://127.0.0.1:5000')

if __name__ == '__main__':
    print("=" * 60)
    print(" FinFlow - Sistema de Gestao Financeira Pessoal")
    print(" Acesse no seu navegador: http://127.0.0.1:5000")
    print(" Pressione CTRL + C no terminal para parar o servidor.")
    print("=" * 60)
    
    # Inicia o navegador automaticamente
    threading.Thread(target=open_browser, daemon=True).start()
    
    # Inicia o servidor Flask
    app.run(host='127.0.0.1', port=5000, debug=False)

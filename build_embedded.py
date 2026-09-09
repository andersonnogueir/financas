import os

def build():
    with open('templates/index.html', 'r', encoding='utf-8') as f:
        html = f.read()
    with open('templates/login.html', 'r', encoding='utf-8') as f:
        login = f.read()
    with open('static/css/styles.css', 'r', encoding='utf-8') as f:
        css = f.read()
    with open('static/js/app.js', 'r', encoding='utf-8') as f:
        js = f.read()

    with open('templates_embedded.py', 'w', encoding='utf-8') as f:
        f.write('# -*- coding: utf-8 -*-\n')
        f.write('"""Templates e estáticos embutidos para Vercel Serverless."""\n\n')
        f.write(f'INDEX_HTML = {repr(html)}\n\n')
        f.write(f'LOGIN_HTML = {repr(login)}\n\n')
        f.write(f'STYLES_CSS = {repr(css)}\n\n')
        f.write(f'APP_JS = {repr(js)}\n')

    print('Successfully built templates_embedded.py!')

if __name__ == '__main__':
    build()

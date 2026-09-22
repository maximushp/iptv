# XStream Web

Site simples e completo para painéis **Xtream Codes**: entre com **endereço, usuário e senha** e assista **Ao Vivo**, **Filmes** e **Séries**.

Funciona:

- **Local** (qualquer servidor estático)
- **GitHub Pages**
- **Vercel** (com proxy embutido que evita erro de CORS)

---

## Recursos

- Login com usuário, senha e endereço do painel
- Salvar credenciais no navegador (localStorage)
- Informações da conta (expiração, conexões, status)
- Categorias + busca para Ao Vivo, Filmes e Séries
- Player com HLS (hls.js) para canais e vídeos
- EPG (programação) dos canais ao vivo
- Sinopse de filmes/séries e seletor de temporadas/episódios
- Modo de conexão: automático, direto, proxy embutido ou proxy personalizado

---

## Rodar local

Opção 1 — Node:

```bash
npx serve .
```

Opção 2 — Python:

```bash
python -m http.server 8080
```

Abra `http://localhost:3000` (ou `8080`).

> No local não existe `/api/proxy`. Se o painel bloquear por **CORS**, use o modo *Direto* se o painel permitir, ou rode com o Vercel (`npx vercel dev`) para ter o proxy.

---

## Publicar na Vercel (recomendado — resolve CORS)

1. Crie um repositório no GitHub e envie os arquivos:

```bash
git init
git add .
git commit -m "XStream Web"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git push -u origin main
```

2. Em [vercel.com](https://vercel.com), importe o repositório e clique em **Deploy**.
3. Ou pela CLI:

```bash
npx vercel
```

No Vercel o site usa automaticamente `api/proxy.js` para buscar dados do painel sem erro de CORS.

---

## Publicar no GitHub Pages

1. Envie o código para o GitHub (comandos acima).
2. Em **Settings → Pages**, escolha **Source: GitHub Actions**.
3. O workflow `.github/workflows/deploy.yml` publica sozinho a cada push.

No GitHub Pages **não há backend**. Se aparecer erro de CORS:

- Abra **Opções avançadas → Modo de conexão**
- Use um **Proxy personalizado** (prefixo com `?url=`, ex.: `https://seu-proxy/?url=`)
- Ou publique na **Vercel** (mais simples)

---

## Como conectar

1. **Endereço**: `http://seu-painel.com:8080` (sem `/player_api.php`)
2. **Usuário** e **Senha** do painel
3. Clique em **Entrar**

---

## Estrutura

```
index.html          Interface (login + app + player)
css/styles.css      Estilos (tema escuro, responsivo)
js/app.js           Lógica (API Xtream, listas, player)
api/proxy.js        Proxy da Vercel (evita CORS)
vercel.json         Configuração Vercel
.github/workflows/  Deploy automático no GitHub Pages
```

---

## Notas

- O proxy da Vercel é para uso pessoal/privado; não exponha em público sem restrições.
- Credenciais ficam apenas no seu navegador (localStorage), nunca no repositório.

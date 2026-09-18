# 📺 Meu IPTV Player — Xtream Codes

Player próprio, estilo Netflix, que usa **seu usuário/senha do seu servidor Xtream**.

## 🚀 Como usar (agora)

1. Entre na pasta:
```
cd iptv-player
python -m http.server 8000
```
2. Abra: http://localhost:8000
3. Digite:
   - **Servidor:** `http://SEU-SERVIDOR:PORTA` (ex: `http://xyz.tv:8080`)
   - **Usuário** e **Senha** do seu Xtream
4. Pronto: Ao Vivo, Filmes, Séries, EPG, Favoritos, Busca.

> ⚠️ **Erro "Failed to fetch" / CORS?**
> Navegadores bloqueiam requisição direta para outro domínio.
> Soluções:
> - Hospede este player **no mesmo domínio** do servidor (pasta do painel), OU
> - Use extensão "CORS Unblock" só pra testar, OU
> - Rode com um proxy simples. Ex com Node:
>   `npx cors-anywhere` e prefixe a URL, OU me peça que eu já deixo um `proxy.js` pronto.

## 📁 Arquivos
- `index.html` — layout
- `app.js` — toda lógica Xtream API:
  - `player_api.php?action=get_user_info` → valida login e expiração
  - `get_live_categories / get_vod_categories / get_series_categories`
  - `get_live_streams / get_vod_streams / get_series`
  - `get_short_epg&stream_id=` → programação
  - `get_vod_info&vod_id=` → detalhes filme
  - `get_series_info&series_id=` → temporadas/episódios
  - URLs de play:
    - Live: `/live/USER/PASS/ID.m3u8`
    - Filme: `/movie/USER/PASS/ID.mp4`
    - Série: `/series/USER/PASS/ID.mp4`

## 🖥️ Virar .EXE (Windows)
1. Instale Node LTS
2. `npm i -g electron-packager` ou use Tauri
3. Mais fácil: use **Nativefier**:
```
npm i -g nativefier
nativefier --name "MeuIPTV" http://localhost:8000
```

## 📱 Virar APK (Android / TV Box / Firestick)
1. Instale Android Studio + Capacitor:
```
npm init -y
npm i @capacitor/core @capacitor/cli
npx cap init MeuIPTV com.voce.meuiptv
npx cap add android
# copie index.html + app.js para pasta do Capacitor e:
npx cap open android
```
2. Ou use **Website2APK / Median.co** apontando para seu player hospedado.

## ✅ Recursos prontos
- [x] Login Xtream (host+user+pass)
- [x] Ao vivo com categorias + EPG
- [x] Filmes com capa, sinopse, nota
- [x] Séries com temporadas/episódios
- [x] Favoritos (localStorage), busca, expiração da conta
- [ ] Continuar assistindo (posso adicionar)
- [ ] Controle parental / perfis (posso adicionar)

Me diga seu servidor (só o formato, nunca a senha) se der erro que eu te ajudo a debugar.

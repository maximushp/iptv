// Meu IPTV Player - Xtream Codes API
// Docs API: {host}/player_api.php?username=X&password=Y&action=ACTION

let CFG = { host:'', user:'', pass:'' };
let DATA = { live:[], movies:[], series:[], liveCats:[], vodCats:[], seriesCats:[], userInfo:null, serverInfo:null };
let STATE = { tab:'live', catId:'all', search:'' };
let hls = null;

const $ = id => document.getElementById(id);
const cleanHost = h => (h||'').trim().replace(/\/+$/,'');
const esc = s => String(s??'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function apiUrl(action, extra='') {
  return `${CFG.host}/player_api.php?username=${encodeURIComponent(CFG.user)}&password=${encodeURIComponent(CFG.pass)}&action=${action}${extra}`;
}
async function apiGet(action, extra='') {
  const r = await fetch(apiUrl(action, extra));
  if (!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

// ---------- LOGIN ----------
window.addEventListener('DOMContentLoaded', () => {
  const saved = JSON.parse(localStorage.getItem('xtream_cfg')||'null');
  if (saved) { $('inpHost').value=saved.host||''; $('inpUser').value=saved.user||''; $('inpPass').value=saved.pass||''; }
});

async function doLogin() {
  const err = $('loginError'); err.classList.add('hidden');
  CFG.host = cleanHost($('inpHost').value);
  CFG.user = $('inpUser').value.trim();
  CFG.pass = $('inpPass').value.trim();
  if (!CFG.host || !CFG.user || !CFG.pass) return showErr('Preencha servidor, usuário e senha.');
  if (!/^https?:\/\//i.test(CFG.host)) CFG.host = 'http://'+CFG.host;
  $('btnLogin').innerHTML = '<i class="fa fa-spinner fa-spin"></i> Conectando...';
  try {
    const j = await apiGet('get_user_info');
    if (!j.user_info || j.user_info.auth == 0) throw new Error('Usuário ou senha inválidos.');
    if (j.user_info.status !== 'Active') throw new Error('Conta '+j.user_info.status+'. Fale com seu provedor.');
    DATA.userInfo = j.user_info; DATA.serverInfo = j.server_info;
    if ($('chkRemember').checked) localStorage.setItem('xtream_cfg', JSON.stringify(CFG));
    else localStorage.removeItem('xtream_cfg');
    $('loginScreen').classList.add('hidden');
    $('appScreen').classList.remove('hidden');
    $('appScreen').classList.add('flex');
    showUserInfo();
    await loadAll();
  } catch(e) {
    console.error(e);
    let msg = 'Falha ao conectar: '+e.message;
    if (String(e.message).includes('Failed to fetch')) msg = 'Não foi possível alcançar o servidor. Possíveis causas:<br>• URL/porta errada<br>• Servidor bloqueia navegador (CORS) — veja README<br>• http vs https errado';
    showErr(msg);
  } finally {
    $('btnLogin').innerHTML = 'ENTRAR <i class="fa fa-arrow-right ml-1"></i>';
  }
}
function showErr(m){ const e=$('loginError'); e.innerHTML=m; e.classList.remove('hidden'); }
function doLogout(){ localStorage.removeItem('xtream_cfg'); location.reload(); }
function showUserInfo(){
  const u = DATA.userInfo;
  let exp = '—';
  if (u.exp_date) { const d = new Date(u.exp_date*1000); exp = d.toLocaleDateString('pt-BR'); }
  $('userInfo').innerHTML = `👤 ${esc(u.username)}<br/>📅 Expira: <b class="text-zinc-200">${exp}</b><br/>✅ ${esc(u.status)}`;
}

// ---------- LOAD ----------
async function loadAll(){
  setLoading(true);
  try {
    const [liveCats, vodCats, seriesCats] = await Promise.all([
      apiGet('get_live_categories').catch(()=>apiGet('get_live_stream_categories').catch(()=>[])),
      apiGet('get_vod_categories').catch(()=>apiGet('get_vod_stream_categories').catch(()=>[])),
      apiGet('get_series_categories').catch(()=>[]),
    ]);
    DATA.liveCats = Array.isArray(liveCats)?liveCats:[];
    DATA.vodCats = Array.isArray(vodCats)?vodCats:[];
    DATA.seriesCats = Array.isArray(seriesCats)?seriesCats:[];
    const [live, movies, series] = await Promise.all([
      apiGet('get_live_streams').catch(()=>apiGet('get_live_streams_all').catch(()=>[])),
      apiGet('get_vod_streams').catch(()=>[]),
      apiGet('get_series').catch(()=>[]),
    ]);
    DATA.live = Array.isArray(live)?live:[];
    DATA.movies = Array.isArray(movies)?movies:[];
    DATA.series = Array.isArray(series)?series:[];
    switchTab('live');
  } catch(e){ alert('Erro ao carregar listas: '+e.message); }
  finally { setLoading(false); }
}
function setLoading(v){ $('loading').classList.toggle('hidden', !v); }

// ---------- TABS / FILTER ----------
function switchTab(tab){
  STATE.tab = tab; STATE.catId='all'; STATE.search=''; $('inpSearch').value='';
  ['live','movies','series','favs'].forEach(t=>$('tab-'+t).classList.toggle('active', t===tab));
  buildCategories(); render();
}
function buildCategories(){
  let cats = [];
  if (STATE.tab==='live') cats = DATA.liveCats;
  if (STATE.tab==='movies') cats = DATA.vodCats;
  if (STATE.tab==='series') cats = DATA.seriesCats;
  const sel = $('selCategory');
  sel.innerHTML = `<option value="all">📂 Todas (${currentList().length})</option>` +
    cats.map(c=>`<option value="${esc(c.category_id)}">${esc(c.category_name)}</option>`).join('');
}
function onCategoryChange(){ STATE.catId = $('selCategory').value; render(); }
function onSearch(){ STATE.search = $('inpSearch').value.toLowerCase(); render(); }

function currentList(){
  if (STATE.tab==='live') return DATA.live;
  if (STATE.tab==='movies') return DATA.movies;
  if (STATE.tab==='series') return DATA.series;
  if (STATE.tab==='favs') {
    const favs = getFavs();
    const all = [
      ...DATA.live.map(o=>({...o,_type:'live',_id:o.stream_id,_name:o.name,_img:o.stream_icon})),
      ...DATA.movies.map(o=>({...o,_type:'movie',_id:o.stream_id,_name:o.name,_img:o.stream_icon})),
      ...DATA.series.map(o=>({...o,_type:'series',_id:o.series_id,_name:o.name,_img:o.cover})),
    ];
    return all.filter(o=>favs.includes(o._type+':'+o._id));
  }
  return [];
}
function filteredList(){
  let list = currentList();
  if (STATE.tab!=='favs') {
    if (STATE.catId!=='all') list = list.filter(o=>String(o.category_id)===String(STATE.catId));
    list = list.map(o=>{
      if (STATE.tab==='live') return {...o,_type:'live',_id:o.stream_id,_name:o.name,_img:o.stream_icon};
      if (STATE.tab==='movies') return {...o,_type:'movie',_id:o.stream_id,_name:o.name,_img:o.stream_icon};
      return {...o,_type:'series',_id:o.series_id,_name:o.name,_img:o.cover};
    });
  }
  if (STATE.search) list = list.filter(o=>(o._name||'').toLowerCase().includes(STATE.search));
  return list;
}

// ---------- RENDER ----------
function render(){
  const list = filteredList().slice(0, 2000);
  $('countLabel').textContent = list.length+' itens';
  const favs = getFavs();
  $('grid').innerHTML = list.map(o=>{
    const fav = favs.includes(o._type+':'+o._id);
    const img = o._img ? `<img loading="lazy" src="${esc(o._img)}" onerror="this.src=''" class="w-full ${o._type==='live'?'aspect-video object-contain bg-zinc-800':'aspect-[2/3] object-cover'} rounded-xl" />`
      : `<div class="w-full ${o._type==='live'?'aspect-video':'aspect-[2/3]'} bg-zinc-800 rounded-xl flex items-center justify-center text-4xl">${o._type==='live'?'📡':o._type==='movie'?'🎬':'📺'}</div>`;
    return `<div class="card bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden cursor-pointer" onclick="onCardClick('${o._type}',${o._id})">
      ${img}
      <div class="p-2">
        <p class="text-xs font-semibold line-clamp-2 min-h-[2rem]">${esc(o._name||'Sem nome')}</p>
        <div class="flex justify-between items-center mt-1">
          <span class="text-[10px] text-zinc-500 uppercase">${o._type==='live'?'ao vivo':o._type==='movie'?'filme':'série'}</span>
          <button onclick="event.stopPropagation();toggleFav('${o._type}',${o._id})" class="${fav?'text-yellow-400':'text-zinc-600'} hover:text-yellow-300 text-sm"><i class="fa${fav?'s':'r'} fa-star"></i></button>
        </div>
      </div>
    </div>`;
  }).join('') || `<p class="col-span-full text-center text-zinc-500 py-16">Nenhum item encontrado.</p>`;
}

function onCardClick(type, id){
  if (type==='live') openLive(id);
  if (type==='movie') openMovie(id);
  if (type==='series') openSeries(id);
}

// ---------- STREAM URLS ----------
function streamUrl(o){
  const u = encodeURIComponent(CFG.user), p = encodeURIComponent(CFG.pass);
  if (o._type==='live') return `${CFG.host}/live/${u}/${p}/${o._id}.m3u8`;
  if (o._type==='movie') { const ext = o.container_extension||'mp4'; return `${CFG.host}/movie/${u}/${p}/${o._id}.${ext}`; }
  if (o._type==='episode') { const ext = o.container_extension||'mp4'; return `${CFG.host}/series/${u}/${p}/${o._id}.${ext}`; }
  return '';
}

// ---------- PLAYER ----------
function playUrl(url, title, extraHtml=''){
  $('playerTitle').textContent = title;
  $('playerExtra').innerHTML = extraHtml;
  $('videoModal').classList.remove('hidden');
  const v = $('videoEl');
  if (hls) { try{hls.destroy();}catch(e){} hls=null; }
  v.pause(); v.removeAttribute('src'); v.load();
  if (url.includes('.m3u8') && window.Hls && Hls.isSupported()) {
    hls = new Hls({maxBufferLength:30});
    hls.loadSource(url); hls.attachMedia(v);
    hls.on(Hls.Events.ERROR, (ev,data)=>{ if(data.fatal) $('playerExtra').innerHTML = '⚠️ Erro ao carregar stream. O servidor pode bloquear hotlink/CORS ou o canal está offline.<br>'+extraHtml; });
  } else { v.src = url; }
  v.play().catch(()=>{});
}
function closePlayer(){
  const v=$('videoEl'); v.pause();
  if (hls){try{hls.destroy();}catch(e){} hls=null;}
  $('videoModal').classList.add('hidden');
}
$('videoModal')?.addEventListener('click', e=>{ if(e.target.id==='videoModal') closePlayer(); });

// ---------- LIVE + EPG ----------
async function openLive(id){
  const o = DATA.live.find(x=>String(x.stream_id)===String(id));
  if(!o) return;
  const item = {...o,_type:'live',_id:o.stream_id};
  let epgHtml = '<p class="text-zinc-500">Carregando programação...</p>';
  playUrl(streamUrl(item), o.name, epgHtml);
  try {
    const epg = await apiGet('get_short_epg', `&stream_id=${id}&limit=4`);
    const list = epg?.epg_listings||[];
    epgHtml = list.length ? '<b>📅 Programação:</b><br>'+list.map(e=>`• <b>${esc(e.title)}</b> (${esc(e.start||'')} - ${esc(e.end||'')})<br><span class="text-zinc-400">${esc((e.description||'').slice(0,200))}</span>`).join('<br><br>') : 'Sem programação (EPG) para este canal.';
  } catch(e){ epgHtml = 'EPG indisponível.'; }
  $('playerExtra').innerHTML = epgHtml + `<br><br><button class="px-3 py-1 bg-zinc-800 rounded-lg text-xs" onclick="toggleFav('live',${id})">⭐ Favoritar</button>`;
}

// ---------- MOVIE ----------
async function openMovie(id){
  const o = DATA.movies.find(x=>String(x.stream_id)===String(id));
  $('detailBody').innerHTML = 'Carregando...'; $('detailModal').classList.remove('hidden');
  try {
    const j = await apiGet('get_vod_info', `&vod_id=${id}`);
    const info = j.movie_data||o, mi = j.info||{};
    $('detailBody').innerHTML = `
      <div class="flex gap-4 flex-col sm:flex-row">
        <img src="${esc(mi.movie_image||o.stream_icon||'')}" class="w-40 rounded-xl" onerror="this.style.display='none'" />
        <div>
          <h2 class="text-xl font-bold">${esc(mi.name||o.name)}</h2>
          <p class="text-sm text-zinc-400 mt-1">⭐ ${esc(mi.rating||'—')} • 📅 ${esc(mi.releasedate||mi.year||'')} • ⏱ ${esc(mi.duration||'')}</p>
          <p class="text-sm text-zinc-500 mt-1">🎭 ${esc(mi.genre||'')}</p>
          <p class="text-sm mt-3">${esc(mi.plot||mi.description||'Sem sinopse.')}</p>
          <div class="flex gap-2 mt-4">
            <button onclick="closeDetail();playUrl('${streamUrl({...o,_type:'movie'})}','${esc((mi.name||o.name)).replace(/'/g,'')}')" class="px-5 py-2 bg-violet-600 hover:bg-violet-500 rounded-xl font-bold">▶ Assistir</button>
            <button onclick="toggleFav('movie',${id})" class="px-4 py-2 bg-zinc-800 rounded-xl">⭐</button>
          </div>
        </div>
      </div>`;
  } catch(e){ $('detailBody').innerHTML = 'Erro ao carregar detalhes. <button class="underline" onclick="closeDetail()">Fechar</button>'; }
}

// ---------- SERIES ----------
async function openSeries(id){
  const o = DATA.series.find(x=>String(x.series_id)===String(id));
  $('detailBody').innerHTML = 'Carregando série...'; $('detailModal').classList.remove('hidden');
  try {
    const j = await apiGet('get_series_info', `&series_id=${id}`);
    const info = j.info||{}, eps = j.episodes||{};
    let seasons = Object.keys(eps).sort();
    $('detailBody').innerHTML = `
      <div class="flex gap-4 flex-col sm:flex-row mb-4">
        <img src="${esc(info.cover||o.cover||'')}" class="w-40 rounded-xl" onerror="this.style.display='none'" />
        <div>
          <h2 class="text-xl font-bold">${esc(info.name||o.name)}</h2>
          <p class="text-sm text-zinc-400 mt-1">⭐ ${esc(info.rating||'—')} • 🎭 ${esc(info.genre||'')}</p>
          <p class="text-sm mt-2">${esc(info.plot||'')}</p>
          <button onclick="toggleFav('series',${id})" class="mt-3 px-4 py-2 bg-zinc-800 rounded-xl text-sm">⭐ Favoritar série</button>
        </div>
      </div>
      ${seasons.map(s=>`<h3 class="font-bold mt-4 mb-2">Temporada ${esc(s)}</h3>
        <div class="space-y-1">${eps[s].map(ep=>`<button onclick="playEpisode(${ep.id},'${esc((ep.title||('E'+ep.episode_num)) ).replace(/'/g,'')}','${esc(ep.container_extension||'mp4')}')" class="w-full text-left px-3 py-2 bg-zinc-800 hover:bg-violet-700 rounded-xl text-sm">▶ E${esc(ep.episode_num)} - ${esc(ep.title||'Episódio '+ep.episode_num)}</button>`).join('')}</div>`).join('')}`;
  } catch(e){ $('detailBody').innerHTML = 'Erro ao carregar série.'; }
}
function playEpisode(id, title, ext){
  closeDetail();
  playUrl(`${CFG.host}/series/${encodeURIComponent(CFG.user)}/${encodeURIComponent(CFG.pass)}/${id}.${ext||'mp4'}`, title);
}
function closeDetail(){ $('detailModal').classList.add('hidden'); }

// ---------- FAVS ----------
function getFavs(){ return JSON.parse(localStorage.getItem('xtream_favs')||'[]'); }
function toggleFav(t,id){
  let f = getFavs(); const k = t+':'+id;
  f = f.includes(k) ? f.filter(x=>x!==k) : [...f,k];
  localStorage.setItem('xtream_favs', JSON.stringify(f));
  render();
}

// Enter = login
document.addEventListener('keydown', e=>{
  if(e.key==='Enter' && !$('loginScreen').classList.contains('hidden')) doLogin();
  if(e.key==='Escape'){ closePlayer(); closeDetail(); }
});

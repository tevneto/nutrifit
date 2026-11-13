/* NutriFit: aplicativo local-first. Os dados ficam no armazenamento do navegador. */
(() => {
  const KEY = 'nutrifit.v1';
  // Data no fuso do aparelho (toISOString usaria UTC e viraria o dia às 21h no Brasil).
  const localISO = d => {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  };
  const today = () => localISO(new Date());
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const blank = () => ({
    profile: {
      name: '', age: '', sex: '', height: '', weight: '', targetWeight: '', bodyFat: '', activity: '1.2',
      training: '', goal: 'Manutenção', waterGoal: 0
    },
    goal: {
      kcal: 0, protein: 0, carbs: 0, fat: 0, macroMode: 'percent', proteinPct: 30, carbsPct: 40,
      fatPct: 30, lowcarb: false, polyols: false, exerciseCalories: false
    },
    foods: [],
    meals: [],
    water: [],
    workouts: [],
    body: [],
    recipes: [],
    plans: [],
    shopping: [],
    prefs: {
      allergies: '', likes: '', dislikes: '', prep: '', mealsPerDay: 4, budget: ''
    },
    chats: [],
    checks: {
    },
    activeDate: today()
  });
  let state;
  try {
    state = {
      ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}')
    };
  }
  catch {
    state = blank();
  }
  // Ao abrir, o app sempre mostra o dia atual (a data escolhida não fica presa).
  state.activeDate = today();
  let lastToday = today();
  // Repara registros sem id (criados pelo antigo botão "Repetir").
  for (const k of ['meals', 'water', 'workouts', 'body', 'recipes', 'plans', 'shopping']) {
    if (!Array.isArray(state[k])) state[k] = [];
    state[k].forEach(r => { if (r && !r.id) r.id = uid(); });
  }
  state.goal = { ...blank().goal, ...state.goal };
  state.profile = { ...blank().profile, ...state.profile };
  state.prefs = { ...blank().prefs, ...state.prefs };
  const $ = s => document.querySelector(s), app = $('#app'), esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }
  [c]));
  const nav = [['inicio', '⌂', 'Início'],
  ['alimentacao', '◉', 'Alimentação'],
  ['planejamento', '▦', 'Planejamento'],
  ['atividades', '⌁', 'Atividades'],
  ['evolucao', '↗', 'Evolução'],
  ['hidratacao', '♧', 'Hidratação'],
  ['assistente', '✳', 'Assistente IA'],
  ['relatorios', '▤', 'Relatórios'],
  ['configuracoes', '⚙', 'Configurações']];
  let route = location.hash.slice(1) || 'inicio';
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      // Armazenamento cheio: desfaz a última alteração para a tela não mostrar algo que não foi salvo.
      try {
        state = { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || '{}'), activeDate: state.activeDate };
      } catch { /* mantém o estado atual */ }
      setTimeout(() => notify('Armazenamento do navegador cheio: o último registro NÃO foi salvo. Exporte os dados e apague fotos antigas.'), 50);
      return false;
    }
  }
  // Reduz fotos (máx. 800 px, JPEG) para caberem no armazenamento local.
  function compressImage(file, maxSide = 800, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem inválida')); };
      img.src = url;
    });
  }
  function thumb(src) {
    return src && String(src).startsWith('data:image/')
      ? `<img src="${src}" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:8px;flex:none">`
      : '';
  }
  function num(v) {
    return parseFloat(String(v ?? '').replace(',', '.'));
  }
  const MEAL_SHARE = [['Café da manhã', 0.25], ['Almoço', 0.30], ['Jantar', 0.25], ['Lanches', 0.10], ['Ceia', 0.10]];
  function notify(s) {
    const el = $('#toast');
    el.textContent = s;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2400)
  }
  function go(where) {
    route = where;
    location.hash = where;
    render()
  }
  function baseKcalGoal() {
    return Number(state.goal.kcal) || calcKcal()
  }
  function exerciseKcal() {
    return state.workouts.filter(x => x.date === (state.activeDate || today())).reduce((a, x) => a + (+x.calories || 0), 0)
  }
  // Meta do dia: base + calorias de exercício, se a opção estiver ligada.
  function kcalGoal() {
    const base = baseKcalGoal();
    return base && state.goal.exerciseCalories ? base + exerciseKcal() : base
  }
  function calcKcal() {
    const p = state.profile;
    if (!p.weight || !p.height || !p.age || !p.sex) return 0;
    let bmr = 10 * +p.weight + 6.25 * +p.height - 5 * +p.age + (p.sex === 'masculino' ? 5 : -161);
    let tdee = bmr * (+p.activity || 1.2);
    const adj = p.goal === 'Emagrecimento' || p.goal === 'Perda de gordura com preservação muscular' ? -400 : p.goal === 'Hipertrofia' || p.goal === 'Ganho de peso' ? 250 : 0;
    return Math.max(0, Math.round(tdee + adj))
  }
  function waterTarget() {
    return + state.profile.waterGoal > 0 ? +state.profile.waterGoal: state.profile.weight ? Math.round((+state.profile.weight * 35) / 50) * 50: 0
  }
  function macroTarget() {
    const kcal = baseKcalGoal();
    if (!kcal) return {
      p: 0, c: 0, f: 0
    };
    const g = state.goal;
    if (g.macroMode === 'grams') return {
      p: +g.protein || 0, c: +g.carbs || 0, f: +g.fat || 0
    };
    const sum = (+g.proteinPct || 0) + (+g.carbsPct || 0) + (+g.fatPct || 0) || 100;
    return {
      p: Math.round(kcal * ((+g.proteinPct || 0) / sum) / 4), c: Math.round(kcal * ((+g.carbsPct || 0) / sum) / 4),
      f: Math.round(kcal * ((+g.fatPct || 0) / sum) / 9)
    }
  }
  function dayMeals() {
    return state.meals.filter(x => x.date === (state.activeDate || today()))
  }
  function sum(field, rows = dayMeals()) {
    return rows.reduce((a, x) => a + (+x[field] || 0), 0)
  }
  function dayWater() {
    return state.water.filter(x => x.date === (state.activeDate || today())).reduce((a, x) => a + (+x.ml || 0),
    0)
  }
  function fmt(n) {
    return Math.round(+n || 0).toLocaleString('pt-BR')
  }
  function progress(value, target) {
    return Math.min(100, target ? Math.max(0, value / target * 100): 0)
  }
  function pctBar(value, target, color = '') {
    return `<div class="progress"><span style="width:${progress(value, target)}%;${color ? `background:${color}`: ''}"></span></div>`
  }
  function field(label, name, value = '', type = 'text', opts = null, extra = '') {
    let input = opts ? `<select name="${name}" ${extra}>${opts.map(o => `<option ${String(value) === String(o[0]) ? 'selected': ''} 
    value="${esc(o[0])}">${esc(o[1])}</option>`).join('')}</select>`: `<input name="${name}" type="${type}" 
    value="${esc(value)}" ${type === 'number' ? 'step="any"': ''} ${extra}>`;
    return `<div class="field"><label>${label}</label>${input}</div>`
  }
  function empty(title, desc, button = '', dest = '') {
    return `<div class="empty-state"><strong>${title}</strong>${desc}${button ? `<div style="margin-top:13px"><button 
    class="button button-soft button-small" data-go="${dest}">${button}</button></div>`: ''}</div>`
  }
  function shell(title, content) {
    $('#pageTitle').textContent = title;
    $('#navigation').innerHTML = nav.map(([id, icon, label]) => `<button class="nav-item ${route === id ? 'active': ''}" 
    data-go="${id}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`).join('');
    $('#todayLabel').textContent = new Date().toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long'
    }).toUpperCase();
    $('#userName').textContent = state.profile.name || 'Seu perfil';
    $('#avatar').textContent = (state.profile.name || 'N').slice(0, 1).toUpperCase();
    app.innerHTML = content;
    if (route === 'alimentacao') {
      const h = app.querySelector('.card-head');
      if (h) {
        const tools = document.createElement('div');
        tools.className = 'toolbar-actions';
        tools.innerHTML = '<button class="button button-light button-small" data-action="voice">🎙 ' +
        'Voz</button><button class="button button-light button-small" data-action="photo">📷 ' +
        'Foto</button><button class="button button-light button-small" data-action="barcode">▦ ' +
        'Código</button>';
        h.append(tools)
      }
      const ff = $('#foodForm');
      if (ff) {
        const micro = document.createElement('div');
        micro.className = 'field full';
        micro.innerHTML = '<label>Micronutrientes da porção (opcional)</label><input name="micros" ' +
        'placeholder="Ex.: cálcio 120 mg; ferro 2 mg; potássio 250 mg"><small>Informe apenas ' +
        'dados do rótulo ou de uma fonte consultada.</small>';
        ff.insertBefore(micro, ff.lastElementChild);
        const src = document.createElement('input');
        src.type = 'hidden';
        src.name = 'source';
        src.value = 'manual';
        ff.append(src)
      }
    }
    if (route === 'planejamento') {
      const card = app.querySelector('.content > .grid > section.card');
      if (card) {
        const importBox = document.createElement('div');
        importBox.className = 'notice blue';
        importBox.style.marginTop = '14px';
        importBox.innerHTML = '<span>↗</span><div><b>Importar receita de um site</b><form id="recipeImport" ' +
        'class="inline-form" style="margin-top:8px"><div class="field"><label>URL pública da ' +
        'receita</label><input name="url" type="url" placeholder="https://…" ' +
        'required></div><button class="button button-light button-small">Buscar ' +
        'receita</button></form><small>Sites podem bloquear leitura automática. Será importada ' +
        'apenas estrutura Schema.org Recipe acessível e você deverá revisar os ' +
        'dados.</small></div>';
        card.append(importBox)
      }
    }
  }
  function mealsSummary() {
    const names = ['Café da manhã', 'Almoço', 'Jantar', 'Lanches', 'Ceia'];
    return names.map((name, i) => {
      const rows = dayMeals().filter(x => x.meal === name);
      const icons = ['☀️', '🍽️', '🌙', '🍎', '🥛'];
      return `<div class="meal-row"><div class="meal-icon">${icons[i]}</div><div class="meal-info"><b>${name}</b><small>${rows.length ? rows.map(x => esc(x.name)).join(', '): 'Nenhum alimento registrado'}</small></div><div 
      class="meal-kcal">${fmt(rows.reduce((a, x) => a + (+x.kcal || 0), 0))} <span class="muted">kcal</span></div></div>`
    }).join('')
  }
  function dashboard() {
    let m = macroTarget(), k = sum('kcal'), p = sum('protein'), c = sum('carbs'), f = sum('fat'),
    water = dayWater(), ex = state.workouts.filter(x => x.date === (state.activeDate || today()));
    let steps = ex.reduce((a, x) => a + (+x.steps || 0), 0), goal = kcalGoal();
    const lastWeight = state.body.filter(x => x.weight).sort((a, b) => b.date.localeCompare(a.date))[0];
    return `<div class="content"><section class="hero"><div><span class="eyebrow">UM DIA DE CADA 
    VEZ</span><h2>${state.profile.name ? `Olá, ${esc(state.profile.name)} 👋`: 'Seu bem-estar começa com um registro'}</h2><p>Registre 
    seus hábitos e acompanhe seu progresso no seu ritmo.</p></div><div style="text-align:right"><div 
    class="hero-number">${fmt(Math.max(goal - k, 0))}<small> kcal restantes</small></div><button 
    class="button" data-go="alimentacao">＋ Registrar alimento</button></div></section>
      ${!state.profile.name ? `<div class="notice"><span>✦</span><div><b>Personalize suas metas</b><br>Preencha 
    seu perfil para estimar o gasto energético diário e sugerir metas de macros. Os cálculos são 
    aproximados.<br><button class="button button-soft button-small" data-go="configuracoes" style="margin-top:8px">Configurar 
    perfil</button></div></div>`: ''}
      <div class="grid grid-4"><div class="card stat-card"><span class="stat-icon">◉</span><div class="stat-label">CALORIAS 
    CONSUMIDAS</div><strong>${fmt(k)} <small>/ ${fmt(goal)} kcal</small></strong><div class="stat-note">${fmt(Math.max(0,
    goal - k))} kcal restantes</div>${pctBar(k, goal)}</div><div class="card stat-card"><span class="stat-icon">♧</span><div 
    class="stat-label">ÁGUA</div><strong>${(water / 1000).toFixed(1).replace('.', ',')} <small>/ 
    ${(+(waterTarget()) / 1000).toFixed(1).replace('.', ',')} L</small></strong><div class="stat-note">Meta 
    estimada pelo peso ou configurada</div>${pctBar(water, +waterTarget(), '#79b9cf')}</div><div 
    class="card stat-card"><span class="stat-icon">⌁</span><div class="stat-label">ATIVIDADES HOJE</div><strong>${ex.length} 
    <small>registros</small></strong><div class="stat-note">${fmt(steps)} passos registrados</div>${pctBar(steps,
    8000, '#c49a5a')}</div><div class="card stat-card"><span class="stat-icon">↗</span><div class="stat-label">PESO 
    MAIS RECENTE</div><strong>${lastWeight ? `${esc(lastWeight.weight)} 
    <small>kg</small>`: '—'}</strong><div class="stat-note">Registre medidas na área Evolução</div>${pctBar(lastWeight ? 1: 0,
    1, '#9b84c8')}</div></div>
      <div class="grid grid-2"><section class="card"><div class="card-head"><div><h2>Macros do dia</h2><p>Consumo 
    comparado às suas metas</p></div><button class="button button-light button-small" data-go="configuracoes">Editar 
    metas</button></div><div class="macro-row">${[['Proteínas', p, m.p, '#498b67'],
    ['Carboidratos', c, m.c, '#d5a652'],
    ['Gorduras', f, m.f, '#719caf']].map(([n, v, t, col]) => `<div class="macro-box"><span>${n}</span><b>${fmt(v)} 
    <small>/ ${fmt(t)} g</small></b>${pctBar(v, t, col)}</div>`).join('')}</div><p class="small muted" 
    style="margin-top:13px">Fibras ${fmt(sum('fiber'))} g · Sódio ${fmt(sum('sodium'))} mg${state.goal.lowcarb ? ` · Carboidratos 
    líquidos ${fmt(Math.max(0, c - sum('fiber')))} g`: ''}${state.goal.exerciseCalories && exerciseKcal() ? ` · Meta inclui ${fmt(exerciseKcal())} kcal de exercício`: ''}</p></section><section class="card"><div class="card-head"><div><h2>Suas 
    refeições</h2><p>Resumo do diário alimentar de hoje</p></div><button class="button button-soft 
    button-small" data-go="alimentacao">Abrir diário</button></div>${mealsSummary()}</section></div>
      <div class="grid grid-2"><section class="card"><div class="card-head"><div><h2>Hidratação</h2><p>Meta 
    diária: ${fmt(waterTarget())} ml</p></div><button class="button button-soft button-small" data-go="hidratacao">Registrar 
    água</button></div><div class="split"><strong style="font:700 27px Manrope">${fmt(water)} <span 
    class="muted" style="font:500 13px 'DM Sans'">ml</span></strong><span class="tag">${Math.round(progress(water,
    +waterTarget()))}% da meta</span></div>${pctBar(water, +waterTarget(), '#79b9cf')}</section><section 
    class="card"><div class="card-head"><div><h2>Movimento</h2><p>Seus registros de atividade</p></div><button 
    class="button button-soft button-small" data-go="atividades">Adicionar atividade</button></div>${ex.length ? ex.slice(-2).reverse().map(x => `<div 
    class="meal-row"><div class="meal-icon">🏃</div><div class="meal-info"><b>${esc(x.name)}</b><small>${fmt(x.duration)} 
    min · ${fmt(x.calories)} kcal estimadas</small></div><div class="meal-kcal">${fmt(x.steps)} <span 
    class="muted">passos</span></div></div>`).join(''): empty('Ainda sem atividades registradas',
    'Adicione um treino ou atividade cotidiana.', 'Registrar atividade', 'atividades')}</section></div></div>`
  }
  function foodPage() {
    const rows = dayMeals();
    return `<div class="content"><div class="toolbar"><div><h2>Diário alimentar</h2><p class="muted 
    small">Alimentos, refeições e nutrientes em um só lugar</p></div><div class="toolbar-actions"><input 
    class="search-input" type="date" id="activeDate" value="${state.activeDate || today()}" style="width:auto"><button 
    class="button button-primary" data-action="open-food">＋ Alimento</button></div></div><div class="grid 
    grid-4"><div class="card stat-card"><div class="stat-label">CALORIAS</div><strong>${fmt(sum('kcal',
    rows))} <small>/ ${fmt(kcalGoal())}</small></strong>${pctBar(sum('kcal', rows), kcalGoal())}</div>${[['Proteínas',
    'protein'],
    ['Carboidratos', 'carbs'],
    ['Gorduras', 'fat']].map(([n, f]) => `<div class="card stat-card"><div class="stat-label">${n.toUpperCase()}</div><strong>${fmt(sum(f,
    rows))} <small>g</small></strong><div class="stat-note">Meta ${fmt(macroTarget()[f === 'protein' ? 'p': f === 'carbs' ? 'c': 'f'])} 
    g</div></div>`).join('')}</div><div class="grid grid-2"><section class="card"><div class="card-head"><div><h2>Adicionar 
    alimento</h2><p>Busque no Open Food Facts ou registre seus dados</p></div><button class="button 
    button-light button-small" data-action="barcode">▦ Código de barras</button></div><form id="foodSearch" 
    class="inline-form"><div class="field"><label>Nome ou produto</label><input name="query" placeholder="Ex.: 
    aveia em flocos" required></div><button class="button button-primary">Pesquisar</button></form><div 
    id="foodResults" class="small muted" style="margin-top:12px">Pesquisa online disponível quando 
    houver conexão. Você também pode informar diretamente os valores do rótulo.</div><hr style="border:0;border-top:1px 
    solid var(--line);margin:18px 0"><form id="foodForm" class="form-grid cols-3"><div class="field"><label>Alimento</label><input 
    name="name" required placeholder="Nome do alimento"></div><div class="field"><label>Refeição</label><select 
    name="meal">${['Café da manhã', 'Almoço', 'Jantar', 'Lanches', 'Ceia'].map(x => `<option>${x}</option>`).join('')}</select></div><div 
    class="field"><label>Quantidade</label><input name="amount" type="number" min="0" step="any" 
    value="100" required></div><div class="field"><label>Unidade</label><select name="unit"><option 
    value="g">g</option><option value="ml">ml</option><option value="un">unidade</option></select></div>${[['kcal',
    'Calorias (kcal)'],
    ['protein', 'Proteínas (g)'],
    ['carbs', 'Carboidratos (g)'],
    ['fat', 'Gorduras (g)'],
    ['fiber', 'Fibras (g)'],
    ['sodium', 'Sódio (mg)']].map(([n, l]) => `<div class="field"><label>${l} <span class="per-label">por 100 g/ml</span></label><input 
    name="${n}" type="number" min="0" step="any" value="0"></div>`).join('')}<div class="field full"><button 
    class="button button-primary">Adicionar ao diário</button></div></form><div class="notice blue" 
    style="margin-top:14px"><span>ⓘ</span><div>Os valores vêm da fonte pesquisada ou do rótulo/dados 
    que você informar. Produtos sem dados disponíveis não recebem valores presumidos. Porções em 
    ml dependem da densidade do alimento.</div></div></section><section class="card"><div class="card-head"><div><h2>Refeições 
    registradas</h2><p>${new Date((state.activeDate || today())+'T12:00:00').toLocaleDateString('pt-BR',
    {
      day: 'numeric', month: 'long'
    })}</p></div><button class="button button-light button-small" data-action="copy-day">Copiar dia 
    anterior</button></div>${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Alimento</th><th>Refeição</th><th>Qtd.</th><th>kcal</th><th></th></tr></thead><tbody>${rows.map(x => `<tr><td>${thumb(x.photo)}<b>${esc(x.name)}</b><small>${fmt(x.protein)}P 
    · ${fmt(x.carbs)}C · ${fmt(x.fat)}G · ${esc(x.source || "manual")}${x.micros ? " · "+esc(x.micros): ""}</small></td><td>${esc(x.meal)}</td><td>${esc(x.amount)} 
    ${esc(x.unit)}</td><td><b>${fmt(x.kcal)}</b></td><td class="table-actions"><button class="icon-button" 
    data-edit-food="${x.id}" aria-label="Editar">✎</button><button class="icon-button" data-delete-food="${x.id}" 
    aria-label="Remover">×</button></td></tr>`).join('')}</tbody></table></div>`: empty('Seu diário está vazio',
    'Use o formulário para adicionar o primeiro alimento.')}</section></div><div class="grid grid-2"><section 
    class="card"><div class="card-head"><div><h2>Receitas pessoais</h2><p>Calcule a porção usando 
    os ingredientes cadastrados</p></div></div><form id="recipeForm" class="form-grid"><div class="field"><label>Nome</label><input 
    name="name" required></div><div class="field"><label>Porções</label><input name="servings" type="number" 
    value="1" min="1"></div><div class="field full"><label>Ingredientes — um por linha: nome; kcal; proteína; carboidrato; gordura (por 100 g); 
    quantidade usada (g)</label><textarea name="ingredients" placeholder="Exemplo: arroz cozido; 128; 2,5; 28; 0,2; 300&#10;frango grelhado; 159; 32; 0; 2,5; 250"></textarea></div><div class="field"><label>Modo 
    de preparo</label><textarea name="method"></textarea></div><div class="field"><label>Peso final 
    preparado (g, opcional)</label><input name="finalWeight" type="number"></div><div class="field 
    full"><button class="button button-primary">Salvar receita</button></div></form>${state.recipes.length ? state.recipes.map(r => `<div 
    class="list-row"><div class="meal-info"><b>${esc(r.name)}</b><small>${fmt(r.kcal)} kcal · ${fmt(r.protein)}P · ${fmt(r.carbs)}C · ${fmt(r.fat)}G por porção 
    · ${r.servings} porções${r.finalWeight ? ` · ≈ ${fmt(r.finalWeight / r.servings)} g por porção pronta`: ''}</small></div><button class="button button-soft button-small" data-add-recipe="${r.id}">Registrar</button><button 
    class="icon-button" data-del-recipe="${r.id}">×</button></div>`).join(''): ''}</section><section 
    class="card"><div class="card-head"><div><h2>Favoritos e histórico</h2><p>Itens registrados recentemente</p></div></div>${rows.length ? rows.slice(-5).reverse().map(x => `<div 
    class="food-result"><div><b>${esc(x.name)}</b><small>${fmt(x.kcal)} kcal · ${esc(x.meal)}</small></div><button 
    class="button button-soft button-small" data-repeat-food="${x.id}">Repetir</button></div>`).join(''): empty('Seus itens frequentes aparecem aqui',
    'Registre alimentos para criar seu histórico.')}</section></div></div>`
  }
  function planningPage() {
    return `<div class="content"><div class="notice blue"><span>▦</span><div>Monte um planejamento 
    simples e gere a lista de compras a partir dos alimentos/ingredientes que você cadastrar. O registro 
    de refeições planejadas pode ser enviado ao diário quando desejar.</div></div><div class="grid 
    grid-2"><section class="card"><div class="card-head"><div><h2>Plano alimentar</h2><p>Organize 
    refeições para um dia ou semana</p></div><span class="tag">${state.plans.length} planos</span></div><form 
    id="planForm" class="form-grid"><div class="field"><label>Nome do plano</label><input name="name" 
    required placeholder="Ex.: Semana equilibrada"></div><div class="field"><label>Objetivo</label><select 
    name="goal"><option>Organização</option><option>Emagrecimento</option><option>Manutenção</option><option>Hipertrofia</option></select></div><div 
    class="field"><label>Data de início</label><input name="date" type="date" value="${today()}"></div><div 
    class="field"><label>Período</label><select name="period"><option>Diário</option><option>Semanal</option></select></div><div 
    class="field"><label>Refeição</label><select name="meal">${['Café da manhã', 'Almoço', 'Jantar',
    'Lanches', 'Ceia'].map(x => `<option>${x}</option>`).join('')}</select></div><div class="field"><label>Dia</label><select 
    name="day"><option>Todos os dias</option>${['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta',
    'Sábado', 'Domingo'].map(x => `<option>${x}</option>`).join('')}</select></div><div class="field"><label>Alimento/refeição</label><input 
    name="food" required></div><div class="field"><label>Quantidade (g)</label><input name="amount" 
    type="number" value="100"></div><div class="field"><label>Calorias (kcal)</label><input name="kcal" 
    type="number" value="0"></div><div class="field"><label>Proteína (g)</label><input name="protein" 
    type="number" step="any" value="0"></div><div class="field"><label>Carboidratos (g)</label><input name="carbs" 
    type="number" step="any" value="0"></div><div class="field"><label>Gorduras (g)</label><input name="fat" 
    type="number" step="any" value="0"></div><div class="field full"><button class="button button-primary">Adicionar 
    ao plano</button></div></form>${state.plans.length ? state.plans.map(x => `<div class="list-row"><div 
    class="meal-info"><b>${esc(x.name)} · ${esc(x.day)}</b><small>${esc(x.meal)} · ${esc(x.food)} 
    (${fmt(x.amount)} g · ${fmt(x.kcal)} kcal)</small></div><button class="button button-soft button-small" 
    data-log-plan="${x.id}">Registrar</button><button class="button button-light button-small" data-plan-shop="${x.id}">+ 
    Compras</button><button class="icon-button" data-del-plan="${x.id}">×</button></div>`).join(''): empty('Seu planejamento começa aqui',
    'Adicione uma refeição para organizar a semana.')}</section><div class="content"><section class="card"><div 
    class="card-head"><div><h2>Preferências e restrições</h2><p>Use estas informações para orientar 
    suas escolhas</p></div></div><form id="prefsForm" class="form-grid"><div class="field"><label>Alergias</label><input 
    name="allergies" value="${esc(state.prefs.allergies)}" placeholder="Ex.: amendoim"></div><div 
    class="field"><label>Alimentos preferidos</label><input name="likes" value="${esc(state.prefs.likes)}"></div><div 
    class="field"><label>Alimentos rejeitados/restrições</label><input name="dislikes" value="${esc(state.prefs.dislikes)}"></div><div 
    class="field"><label>Preferência de preparo</label><input name="prep" value="${esc(state.prefs.prep)}"></div><div 
    class="field"><label>Refeições por dia</label><input name="mealsPerDay" type="number" min="1" 
    max="12" value="${state.prefs.mealsPerDay}"></div><div class="field"><label>Orçamento opcional</label><input 
    name="budget" value="${esc(state.prefs.budget)}"></div><div class="field full"><button class="button 
    button-primary">Salvar preferências</button></div></form></section><section class="card"><div 
    class="card-head"><div><h2>Lista de compras</h2><p>Itens adicionados manualmente ou pelo plano</p></div><button 
    class="button button-light button-small" data-action="clear-checked">Limpar comprados</button></div><form 
    id="shopForm" class="inline-form"><div class="field"><label>Item</label><input name="name" required 
    placeholder="Ex.: arroz integral"></div><div class="field"><label>Quantidade (opcional)</label><input 
    name="amount" placeholder="1 pacote"></div><button class="button button-primary">Adicionar</button></form>${state.shopping.length ? state.shopping.map(x => `<div 
    class="list-row"><input class="checkbox" type="checkbox" data-check-shop="${x.id}" ${x.checked ? 'checked': ''}><div 
    class="meal-info" style="${x.checked ? 'text-decoration:line-through;opacity:.55': ''}"><b>${esc(x.name)}</b><small>${esc(x.amount || '')} 
    · ${esc(x.category || 'Outros')}</small></div><button class="icon-button" data-del-shop="${x.id}">×</button></div>`).join(''): empty('Sua lista está vazia',
    'Inclua itens manualmente ou a partir do plano.')}</section></div></div></div>`
  }
  function activityPage() {
    let list = state.workouts.filter(x => x.date === (state.activeDate || today()));
    return `<div class="content"><div class="toolbar"><div><h2>Exercícios e atividades</h2><p class="muted 
    small">Registre treinos e movimento cotidiano</p></div><input class="search-input" id="activeDate" 
    type="date" value="${state.activeDate || today()}" style="width:auto"></div><div class="grid 
    grid-3"><div class="card stat-card"><div class="stat-label">ATIVIDADES</div><strong>${list.length} 
    <small>hoje</small></strong><div class="stat-note">${list.map(x => esc(x.name)).join(', ') || 'Sem registros'}</div></div><div 
    class="card stat-card"><div class="stat-label">TEMPO ATIVO</div><strong>${fmt(list.reduce((a,
    x) => a + (+x.duration || 0), 0))} <small>min</small></strong><div class="stat-note">Soma dos 
    tempos informados</div></div><div class="card stat-card"><div class="stat-label">PASSOS</div><strong>${fmt(list.reduce((a,
    x) => a + (+x.steps || 0), 0))}</strong><div class="stat-note">Estimativa manual ou dispositivo</div></div></div><div 
    class="grid grid-2"><section class="card"><div class="card-head"><div><h2>Novo registro</h2><p>Calorias 
    são estimativas informadas pelo usuário</p></div></div><form id="workoutForm" class="form-grid"><div 
    class="field"><label>Atividade</label><input name="name" required placeholder="Caminhada, musculação…"></div><div 
    class="field"><label>Tipo</label><select name="type"><option>Musculação</option><option>Caminhada</option><option>Corrida</option><option>Bicicleta</option><option>Natação</option><option>Cardio</option><option>Esporte</option><option>Outra</option></select></div><div 
    class="field"><label>Duração (min)</label><input name="duration" type="number" min="0" value="30"></div><div 
    class="field"><label>Calorias estimadas (kcal)</label><input name="calories" type="number" min="0" 
    value="0"></div><div class="field"><label>Passos</label><input name="steps" type="number" min="0" 
    value="0"></div><div class="field"><label>Distância (km)</label><input name="distance" type="number" 
    step="any" min="0"></div><div class="field"><label>Exercício (musculação)</label><input name="exercise" 
    placeholder="Ex.: agachamento"></div><div class="field"><label>Séries × repetições × carga</label><input 
    name="sets" placeholder="3 × 10 × 40 kg"></div><div class="field full"><label>Observações</label><textarea 
    name="notes"></textarea></div><div class="field full"><label>Data</label><input name="date" type="date" 
    value="${state.activeDate || today()}"></div><div class="field full"><button class="button button-primary">Salvar 
    atividade</button></div></form></section><section class="card"><div class="card-head"><div><h2>Atividades 
    registradas</h2><p>Registros do dia selecionado</p></div></div>${list.length ? list.map(x => `<div 
    class="list-row"><div class="meal-icon">⌁</div><div class="meal-info"><b>${esc(x.name)} · ${esc(x.type)}</b><small>${fmt(x.duration)} 
    min · ${fmt(x.calories)} kcal estimadas · ${fmt(x.steps)} passos ${x.exercise ? '· '+esc(x.exercise): ''} 
    ${x.sets ? '· '+esc(x.sets): ''}</small></div><button class="icon-button" data-del-workout="${x.id}">×</button></div>`).join(''): empty('Nenhuma atividade neste dia',
    'Use o formulário para guardar um treino, caminhada ou passos.')}</section></div><div class="notice 
    orange"><span>ⓘ</span><div>Gasto calórico varia por pessoa e método. ${state.goal.exerciseCalories ? 'As calorias informadas aqui são somadas à meta do dia (opção ativa em Configurações).': 'As calorias de exercício só entram na meta se você ativar a opção em Configurações.'} As integrações Fitbit, Garmin, Apple Health e Health Connect 
    precisam de autenticação e APIs de cada serviço.</div></div></div>`
  }
  function bodyPage() {
    let rows = state.body.slice().sort((a, b) => b.date.localeCompare(a.date));
    let recent = rows.slice(0, 8).reverse();
    return `<div class="content"><div class="grid grid-2"><section class="card"><div class="card-head"><div><h2>Registrar 
    evolução</h2><p>Medidas corporais são privadas neste dispositivo</p></div></div><form id="bodyForm" 
    class="form-grid cols-3"><div class="field"><label>Data</label><input name="date" type="date" 
    value="${today()}"></div>${[['weight', 'Peso (kg)'],
    ['bodyFat', 'Gordura corporal (%)'],
    ['muscle', 'Massa muscular estimada (kg)'],
    ['neck', 'Pescoço (cm)'],
    ['chest', 'Peito (cm)'],
    ['waist', 'Cintura (cm)'],
    ['abdomen', 'Abdômen (cm)'],
    ['hip', 'Quadril (cm)'],
    ['arm', 'Braço (cm)'],
    ['thigh', 'Coxa (cm)'],
    ['calf', 'Panturrilha (cm)']].map(([n, l]) => `<div class="field"><label>${l}</label><input name="${n}" 
    type="number" step="any" min="0"></div>`).join('')}<div class="field full"><label>Foto de progresso 
    (opcional)</label><input name="photo" type="file" accept="image/*" capture="environment"><small>A 
    foto é reduzida automaticamente e fica salva apenas neste navegador.</small></div><div class="field 
    full"><button class="button button-primary">Salvar medidas</button></div></form></section><section 
    class="card"><div class="card-head"><div><h2>Seu histórico</h2><p>Últimas medições registradas</p></div></div>${recent.length ? `<div 
    class="chart">${recent.map((x, i) => {
      let max = Math.max(...recent.map(y => +y.weight || 0), 1);
      let h = (+x.weight || 0) / max * 100;
      return `<div class="chart-col"><em>${x.weight ? esc(x.weight)+' kg': ''}</em><div class="chart-bar 
      ${i === recent.length - 1 ? 'current': ''}" style="height:${h}%"></div><small>${new Date(x.date+'T12:00:00').toLocaleDateString('pt-BR',
      {
        day: '2-digit', month: '2-digit'
      })}</small></div>`
    }).join('')}</div><div style="margin-top:25px">${rows.slice(0, 5).map(x => `<div class="list-row">${thumb(x.photo)}<div 
    class="meal-info"><b>${new Date(x.date+'T12:00:00').toLocaleDateString('pt-BR', {
      day: 'numeric', month: 'long', year: 'numeric'
    })}</b><small>${x.weight ? esc(x.weight)+' kg · ': ''}${x.bodyFat ? esc(x.bodyFat)+'% gordura · ': ''}${Object.keys(x).filter(k => ['neck',
    'chest', 'waist', 'abdomen', 'hip', 'arm', 'thigh', 'calf'].includes(k) && x[k]).length} medidas</small></div><button 
    class="icon-button" data-del-body="${x.id}">×</button></div>`).join('')}</div>`: empty('Ainda sem medições',
    'Registre seu peso ou uma circunferência para acompanhar as mudanças.')}</section></div><div 
    class="notice blue"><span>ⓘ</span><div>O gráfico mostra pesos registrados manualmente, sem estimar 
    tendência futura. Fotos de evolução não são analisadas automaticamente; o reconhecimento visual 
    exigiria um serviço de IA com visão e autorização para enviar as imagens.</div></div></div>`
  }
  function waterPage() {
    let records = state.water.filter(x => x.date === (state.activeDate || today()));
    let ml = dayWater(), goal = +waterTarget();
    return `<div class="content"><div class="grid grid-2"><section class="card"><div class="card-head"><div><h2>Hidratação 
    de hoje</h2><p>Meta estimada pelo peso ou definida por você: ${fmt(goal)} ml</p></div><span class="tag">${Math.round(progress(ml,
    goal))}%</span></div><div class="split"><strong style="font:700 36px Manrope">${fmt(ml)} <span 
    class="muted" style="font:500 15px 'DM Sans'">ml</span></strong><span class="muted">${fmt(Math.max(0,
    goal - ml))} ml restantes</span></div>${pctBar(ml, goal, '#69adc7')}<div class="water-glasses">${Array.from({
      length: 8
    },
    (_, i) => `<div class="water-glass" style="--fill:${ml >= ((i + 1) * 250) ? 100: ml > i * 250 ? Math.round((ml - i * 250) / 250 * 100): 0}%">${i + 1}</div>`).join('')}</div><form 
    id="waterForm" class="inline-form"><div class="field"><label>Quantidade</label><input name="ml" 
    type="number" min="1" value="250" required></div><div class="field"><label>Recipiente</label><select 
    name="container"><option>Copo</option><option>Garrafa</option><option>Caneca</option><option>Outro</option></select></div><button 
    class="button button-primary">＋ Registrar</button></form></section><section class="card"><div 
    class="card-head"><div><h2>Meta e lembretes</h2><p>A meta é pessoal e ajustável</p></div></div><form 
    id="waterSettings" class="form-grid"><div class="field"><label>Meta diária (ml)</label><input 
    name="waterGoal" type="number" min="0" value="${goal}"></div><div class="field"><label>Lembrete</label><select 
    name="reminders"><option value="off">Desativado</option><option value="day" ${state.profile.reminders === 'day' ? 'selected': ''}>A cada 2 horas (8h–22h)</option></select></div><div 
    class="field full"><small>Funciona enquanto o NutriFit estiver aberto (aba ou app instalado) e o navegador 
    permitir notificações.</small></div><div class="field full"><button class="button button-soft">Salvar 
    meta</button></div></form><div class="notice blue" style="margin-top:16px">A necessidade de líquidos 
    varia com corpo, clima, atividade e condições de saúde. Use orientação profissional quando necessário; 
    não há quantidade universal obrigatória.</div></section></div><section class="card"><div class="card-head"><div><h2>Registros 
    do dia</h2><p>${records.length} registros · ${(ml / 1000).toFixed(2).replace('.', ',')} L</p></div><input 
    class="search-input" type="date" id="activeDate" value="${state.activeDate || today()}" style="width:auto"></div>${records.length ? records.map(x => `<div 
    class="list-row"><div class="meal-icon">💧</div><div class="meal-info"><b>${fmt(x.ml)} ml · ${esc(x.container || 'Água')}</b><small>${new Date(x.created).toLocaleTimeString('pt-BR',
    {
      hour: '2-digit', minute: '2-digit'
    })}</small></div><button class="icon-button" data-del-water="${x.id}">×</button></div>`).join(''): empty('Nenhum registro neste dia',
    'Adicione água pelo formulário acima.')}</section></div>`
  }
  function assistantPage() {
    let msgs = state.chats.length ? state.chats: [{
      who: 'bot', text: 'Olá! Posso resumir os registros salvos no aplicativo e calcular o que falta para as ' +
      'metas de hoje. Minhas respostas usam apenas os seus dados registrados; não substituo ' +
      'orientação profissional.'
    }];
    return `<div class="content"><div class="notice orange"><span>✳</span><div><b>Assistente local</b><br>Este 
    protótipo consulta os dados registrados e responde regras simples. Sugestões generativas, análise 
    de fotografia e reconhecimento por voz exigem integração com serviços externos de IA e processamento 
    de dados.</div></div><div class="grid grid-2"><section class="card assistant-box"><div class="card-head"><div><h2>Assistente 
    NutriFit</h2><p>Respostas com base nos seus registros</p></div><span class="tag">Dados autorizados: 
    neste dispositivo</span></div><div class="chat-log" id="chatLog">${msgs.map(x => `<div class="bubble 
    ${x.who === 'user' ? 'user': ''}">${esc(x.text)}</div>`).join('')}</div><form id="chatForm" class="chat-form"><input 
    name="message" placeholder="Ex.: quantas proteínas faltam hoje?" required><button class="button 
    button-primary">Enviar</button></form><div class="toolbar-actions" style="margin-top:12px"><button 
    class="button button-light button-small" data-prompt="Quanto ainda preciso comer hoje?">Calorias 
    restantes</button><button class="button button-light button-small" data-prompt="Quantas proteínas 
    faltam?">Proteína restante</button><button class="button button-light button-small" data-prompt="Como 
    foi minha alimentação nesta semana?">Resumo semanal</button></div></section><section class="card"><div 
    class="card-head"><div><h2>Análise de hoje</h2><p>Síntese calculada do diário</p></div></div><div 
    class="list-row"><div class="meal-icon">◉</div><div class="meal-info"><b>${fmt(sum('kcal'))} 
    de ${fmt(kcalGoal())} kcal</b><small>${fmt(Math.max(kcalGoal() - sum('kcal'), 0))} kcal restantes</small></div></div><div 
    class="list-row"><div class="meal-icon">♧</div><div class="meal-info"><b>${fmt(sum('protein'))} 
    de ${fmt(macroTarget().p)} g proteína</b><small>${fmt(Math.max(macroTarget().p - sum('protein'),
    0))} g para a meta</small></div></div><div class="list-row"><div class="meal-icon">♧</div><div 
    class="meal-info"><b>${fmt(dayWater())} ml de água</b><small>Meta configurada ${fmt(waterTarget())} 
    ml</small></div></div><p class="small muted" style="margin-top:16px">Não utilizamos seus dados 
    para diagnosticar doenças. Confirme as informações nutricionais das fontes e procure profissional 
    de saúde para orientação individual.</p></section></div></div>`
  }
  function settingsPage() {
    const p = state.profile, g = state.goal, kcal = baseKcalGoal();
    let m = macroTarget(), gramsKcal = 4 * m.p + 4 * m.c + 9 * m.f, pctSum = (+g.proteinPct || 0) + (+g.carbsPct || 0) + (+g.fatPct || 0);
    return `<div class="content"><div class="grid grid-2"><section class="card"><div class="card-head"><div><h2>Perfil 
    pessoal</h2><p>Informações usadas em estimativas. Preencha apenas o que desejar.</p></div></div><form 
    id="profileForm" class="form-grid">${field('Nome', 'name', p.name)}${field('Idade', 'age', p.age,
    'number')}${field('Sexo usado no cálculo metabólico', 'sex', p.sex, '', [['', 'Selecione'],
    ['feminino', 'Feminino'],
    ['masculino', 'Masculino']])}${field('Altura (cm)', 'height', p.height, 'number')}${field('Peso atual (kg)',
    'weight', p.weight, 'number')}${field('Peso desejado (kg)', 'targetWeight', p.targetWeight, 'number')}${field('Gordura corporal (%)',
    'bodyFat', p.bodyFat, 'number')}${field('Frequência de treino', 'training', p.training, '', [['',
    'Selecione'],
    ['1-2x', '1 a 2 vezes/semana'],
    ['3-4x', '3 a 4 vezes/semana'],
    ['5+', '5 ou mais vezes/semana']])}${field('Nível de atividade', 'activity', p.activity, '',
    [['1.2', 'Sedentário'],
    ['1.375', 'Leve'],
    ['1.55', 'Moderado'],
    ['1.725', 'Alto'],
    ['1.9', 'Muito alto']])}${field('Objetivo físico', 'goal', p.goal, '', [['Emagrecimento', 'Emagrecimento'],
    ['Perda de gordura com preservação muscular', 'Perda de gordura com preservação muscular'],
    ['Manutenção', 'Manutenção de peso'],
    ['Hipertrofia', 'Hipertrofia'],
    ['Ganho de peso', 'Ganho de peso']])}<div class="field full"><button class="button button-primary">Salvar 
    perfil</button></div></form><div class="notice orange" style="margin-top:16px"><span>ⓘ</span><div>Mifflin–St 
    Jeor e nível de atividade fornecem estimativas, não medições clínicas. O sistema não muda suas 
    metas automaticamente sem sua ação.</div></div></section><section class="card"><div class="card-head"><div><h2>Metas 
    nutricionais</h2><p>Estimativa atual: <b>${fmt(calcKcal())} kcal/dia</b></p></div><button class="button 
    button-light button-small" data-action="use-estimate">Usar estimativa</button></div><form id="goalForm" 
    class="content" style="gap:14px"><div class="form-grid"><div class="field"><label>Meta diária 
    manual (kcal)</label><input name="kcal" type="number" min="0" value="${g.kcal || ''}" placeholder="Usar 
    estimativa se vazio"></div><div class="field"><label>Modo dos macros</label><select name="macroMode"><option 
    value="percent" ${g.macroMode === 'percent' ? 'selected': ''}>Porcentagens</option><option value="grams" 
    ${g.macroMode === 'grams' ? 'selected': ''}>Gramas</option></select></div></div><div class="grid 
    grid-3"><div class="field"><label>Proteína (${g.macroMode === 'grams' ? 'g': '%'})</label><input 
    name="protein${g.macroMode === 'grams' ? '': 'Pct'}" type="number" min="0" value="${g.macroMode === 'grams' ? g.protein: g.proteinPct}"></div><div 
    class="field"><label>Carboidratos (${g.macroMode === 'grams' ? 'g': '%'})</label><input name="carbs${g.macroMode === 'grams' ? '': 'Pct'}" 
    type="number" min="0" value="${g.macroMode === 'grams' ? g.carbs: g.carbsPct}"></div><div class="field"><label>Gorduras 
    (${g.macroMode === 'grams' ? 'g': '%'})</label><input name="fat${g.macroMode === 'grams' ? '': 'Pct'}" 
    type="number" min="0" value="${g.macroMode === 'grams' ? g.fat: g.fatPct}"></div></div><div class="notice 
    ${g.macroMode === 'percent' && pctSum !== 100 ? 'orange': ''}"><span>◉</span><div>Metas calculadas: 
    ${fmt(m.p)} g proteína · ${fmt(m.c)} g carboidratos · ${fmt(m.f)} g gorduras. Energia estimada 
    dos macros: ${fmt(gramsKcal)} kcal (meta ${fmt(kcal)} kcal). Soma das porcentagens atual: ${pctSum}% 
    ${g.macroMode === 'percent' && pctSum !== 100 ? '— ajuste para exatamente 100% antes de salvar.': ''}</div></div><div 
    class="form-grid"><label class="two-line"><input name="lowcarb" type="checkbox" class="checkbox" 
    ${g.lowcarb ? 'checked': ''}> Mostrar carboidratos líquidos (carboidratos − fibras)</label><label class="two-line"><input name="exerciseCalories" 
    type="checkbox" class="checkbox" ${g.exerciseCalories ? 'checked': ''}> Considerar calorias de 
    exercícios do dia na meta</label></div><button class="button button-primary">Salvar metas</button></form></section></div><div 
    class="grid grid-2"><section class="card"><div class="card-head"><div><h2>Metas por refeição</h2><p>Valores 
    diários estimados divididos entre refeições</p></div></div><div class="grid grid-3">${MEAL_SHARE.map(([x, share]) => `<div class="macro-box"><span>${x} · ${Math.round(share * 100)}%</span><b>${fmt(kcal * share)} 
    <small>kcal sugeridas</small></b></div>`).join('')}</div><p class="small muted">Personalização 
    detalhada por refeição e por tipo de dia pode ser salva como plano alimentar. Meta de calorias 
    não varia automaticamente por dia.</p></section><section class="card"><div class="card-head"><div><h2>Exportar 
    seus dados</h2><p>Baixe uma cópia dos seus registros a qualquer momento</p></div></div><div class="toolbar-actions"><button 
    class="button button-soft" data-action="export-json">⇩ Exportar tudo (JSON)</button><button class="button 
    button-light" data-action="export-csv">⇩ Relatório CSV</button><button class="button button-light" 
    data-action="print">Imprimir / salvar PDF</button></div><p class="small muted" style="margin-top:13px">Para 
    PDF: use a opção “Salvar como PDF” da janela de impressão. Dados exportados podem incluir informações 
    sensíveis; guarde-os com segurança.</p></section></div><section class="card danger-zone"><div 
    class="card-head"><div><h2>Privacidade neste dispositivo</h2><p>Os dados ficam no armazenamento 
    local deste navegador, sem conta ou sincronização entre dispositivos.</p></div></div><button 
    class="button button-danger" data-action="reset">Apagar todos os dados locais</button><div class="notice 
    orange" style="margin-top:15px"><span>ⓘ</span><div>Para uso com múltiplos usuários, autenticação, 
    cópia de segurança, acesso por dispositivo e proteção centralizada, é necessário configurar backend, 
    banco de dados, hospedagem e políticas de segurança. Esta versão local não substitui uma implantação 
    com proteção de dados sensíveis.</div></div></section></div>`
  }
  function reportsPage() {
    let dates = [...new Set(state.meals.map(x => x.date))].sort().slice(-7);
    return `<div class="content"><div class="toolbar"><div><h2>Relatórios e exportação</h2><p class="muted 
    small">Resumo calculado a partir dos seus registros</p></div><div class="toolbar-actions"><button 
    class="button button-soft" data-action="export-csv">Exportar CSV</button><button class="button 
    button-light" data-action="print">Salvar PDF</button></div></div><div class="grid grid-4">${[['Alimentos registrados',
    state.meals.length],
    ['Água registrada', fmt(state.water.reduce((a, x) => a + (+x.ml || 0), 0))+' ml'],
    ['Atividades', state.workouts.length],
    ['Pesagens', state.body.filter(x => x.weight).length]].map(([n, v]) => `<div class="card stat-card"><div 
    class="stat-label">${n.toUpperCase()}</div><strong>${v}</strong><div class="stat-note">No período 
    armazenado</div></div>`).join('')}</div><div class="grid grid-2"><section class="card"><div class="card-head"><div><h2>Consumo 
    por dia</h2><p>Calorias registradas (até 7 dias recentes)</p></div></div>${dates.length ? `<div 
    class="chart">${dates.map((d, i) => {
      let value = sum('kcal', state.meals.filter(x => x.date === d)), max = Math.max(1, ...dates.map(q => sum('kcal',
      state.meals.filter(x => x.date === q))));
      return `<div class="chart-col"><em>${fmt(value)}</em><div class="chart-bar ${i === dates.length - 1 ? 'current': ''}" 
      style="height:${value / max * 100}%"></div><small>${new Date(d+'T12:00:00').toLocaleDateString('pt-BR',
      {
        day: '2-digit', month: '2-digit'
      })}</small></div>`
    }).join('')}</div>`: empty('Sem dados suficientes', 'Seus registros diários aparecerão neste gráfico.')}</section><section 
    class="card"><div class="card-head"><div><h2>Dados incluídos no relatório</h2><p>Exportação local 
    disponível</p></div></div>${['Calorias, macros, fibras e sódio', 'Água e horários registrados',
    'Exercícios, passos e estimativas', 'Peso e circunferências', 'Perfil, metas, planos e preferências'].map(x => `<div 
    class="list-row"><div class="meal-icon">✓</div><div class="meal-info"><b>${x}</b></div></div>`).join('')}<p 
    class="small muted">Para PDF use imprimir e escolha “Salvar como PDF”. A exportação XLSX e relatórios 
    de micronutrientes dependem de esquema de dados e biblioteca/serviço adicional.</p></section></div></div>`
  }
  function render() {
    if (!nav.some(x => x[0] === route) && route !== 'relatorios')route = 'inicio';
    const map = {
      inicio: ['Início', dashboard],
      alimentacao: ['Alimentação', foodPage],
      planejamento: ['Planejamento', planningPage],
      atividades: ['Atividades', activityPage],
      evolucao: ['Evolução', bodyPage],
      hidratacao: ['Hidratação', waterPage],
      assistente: ['Assistente IA', assistantPage],
      configuracoes: ['Configurações', settingsPage],
      relatorios: ['Relatórios', reportsPage]
    };
    shell(map[route][0],
    map[route][1]());
  }
  function download(name, data, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data],
    {
      type: mime
    }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  // Valores nutricionais são por 100 g/ml; na unidade "un" são por unidade.
  function macroData(food, amount, unit = 'g') {
    const factor = unit === 'un' ? (+amount || 0): (+amount || 0) / 100;
    return Object.fromEntries(['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sodium'].map(k => [k,
    Math.round((+food[k] || 0) * factor * 10) / 10]));
  }
  function addFood(food) {
    state.meals.push({
      ...food, meal: food.meal || 'Lanches',
      id: uid(), date: state.activeDate || today(), created: new Date().toISOString()
    });
    const ok = save();
    render();
    if (ok) notify('Alimento registrado no diário')
  }
  function chatbotAnswer(q) {
    const t = q.toLowerCase(), m = macroTarget(), k = sum('kcal'), p = sum('protein'), c = sum('carbs'),
    f = sum('fat');
    if (t.includes('semana')) {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      const range = state.meals.filter(x => x.date >= localISO(d));
      const total = range.reduce((a, x) => a + (+x.kcal || 0), 0);
      const days = new Set(range.map(x => x.date)).size;
      return `Nos últimos 7 dias há ${range.length} itens de refeição em ${days} dias registrados, 
      somando ${fmt(total)} kcal. A média dos dias com registro é ${days ? fmt(total / days): 0} 
      kcal/dia.`
    }
    if (t.includes('prote')) return `Hoje você registrou ${fmt(p)} g de proteína. Sua meta é ${fmt(m.p)} 
    g; faltam ${fmt(Math.max(m.p - p, 0))} g.`;
    if (t.includes('carbo')) return `Hoje você registrou ${fmt(c)} g de carboidratos. Sua meta estimada 
    é ${fmt(m.c)} g; faltam ${fmt(Math.max(m.c - c, 0))} g.`;
    if (t.includes('gordur')) return `Hoje você registrou ${fmt(f)} g de gorduras. Sua meta é ${fmt(m.f)} 
    g; faltam ${fmt(Math.max(m.f - f, 0))} g.`;
    if (t.includes('água') || t.includes('hidrat')) return `Você registrou ${fmt(dayWater())} ml 
    de água. Sua meta configurada é ${fmt(waterTarget())} ml.`;
    if (t.includes('caloria') || t.includes('comer') || t.includes('falta')) return `Você registrou 
    ${fmt(k)} kcal de ${fmt(kcalGoal())} kcal. Restam ${fmt(Math.max(kcalGoal() - k, 0))} kcal pela 
    sua meta atual.`;
    if (t.includes('alimento') || t.includes('proteína')) return 'Posso comparar apenas alimentos com valores nutricionais cadastrados. Abra Alimentação e ' +
    'pesquise no Open Food Facts ou informe os dados do rótulo.';
    return `Resumo de hoje: ${fmt(k)} kcal, ${fmt(p)} g de proteína, ${fmt(c)} g de carboidratos, 
    ${fmt(f)} g de gorduras e ${fmt(dayWater())} ml de água. Para recomendações personalizadas, registre 
    dados e consulte um nutricionista.`
  }
  document.addEventListener('click', async e => {
    const g = e.target.closest('[data-go]');
    if (g) {
      e.preventDefault();
      go(g.dataset.go);
      return
    }
    const b = e.target.closest('[data-action]');
    if (b) {
      const a = b.dataset.action;
      if (a === 'quick-add')$('#quickDialog').showModal();
      if (a === 'open-food') {
        document.querySelector('#foodForm')?.scrollIntoView({
          behavior: 'smooth', block: 'center'
        });
        document.querySelector('#foodForm [name=name]')?.focus()
      }
      if (a === 'use-estimate') {
        state.goal.kcal = calcKcal();
        save();
        render();
        notify('Estimativa aplicada; revise os macros')
      }
      if (a === 'copy-day') {
        const prior = new Date((state.activeDate || today())+'T12:00:00');
        prior.setDate(prior.getDate() - 1);
        let rows = state.meals.filter(x => x.date === localISO(prior));
        rows.forEach(x => state.meals.push({
          ...x, id: uid(), date: state.activeDate || today(), created: new Date().toISOString()
        }));
        save();
        render();
        notify(rows.length ? `${rows.length} itens copiados`: 'Não há registros no dia anterior')
      }
      if (a === 'clear-checked') {
        state.shopping = state.shopping.filter(x => !x.checked);
        save();
        render()
      }
      if (a === 'export-json')download('nutrifit-dados.json', JSON.stringify(state, null, 2), 'application/json');
      if (a === 'export-csv') {
        const rows = [['data', 'refeição', 'alimento', 'quantidade', 'unidade', 'kcal', 'proteína_g',
        'carboidratos_g', 'gordura_g', 'fibras_g', 'sódio_mg', 'micronutrientes', 'fonte'],
        ...state.meals.map(x => [x.date, x.meal, x.name, x.amount, x.unit, x.kcal, x.protein, x.carbs,
        x.fat, x.fiber, x.sodium, x.micros, x.source])];
        download('nutrifit-alimentacao.csv', '\ufeff'+rows.map(r => r.map(v => `"${String(v ?? '').replaceAll('"',
        '""')}"`).join(';')).join('\r\n'), 'text/csv;charset=utf-8')
      }
      if (a === 'print') {
        go('relatorios');
        setTimeout(() => window.print(), 250)
      }
      if (a === 'reset' && confirm('Apagar permanentemente os dados NutriFit salvos neste navegador?')) {
        localStorage.removeItem(KEY);
        state = blank();
        render();
        notify('Dados locais apagados')
      }
      if (a === 'barcode')startBarcode();
      if (a === 'voice') {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
          notify('Reconhecimento de voz indisponível neste navegador');
          return
        }
        const rec = new SR();
        rec.lang = 'pt-BR';
        rec.onresult = ev => {
          const phrase = ev.results[0][0].transcript;
          const form = $('#foodForm');
          const words = phrase.match(/(?:comi|consumi|tomei)\s+(.+?)(?:\s+no\s+(café da manhã|almoço|jantar|lanche|ceia))?\.?$/i);
          form.name.value = words ? words[1]: phrase;
          const q = phrase.match(/(café da manhã|almoço|jantar|lanche|ceia)/i);
          if (q) {
            const m = q[1].toLowerCase();
            form.meal.value = m.includes('café') ? 'Café da manhã': m === 'lanche' ? 'Lanches': m[0].toUpperCase() + m.slice(1);
          }
          const amount = phrase.match(/(\d+(?:[,.]\d+)?)\s*(g|gramas|ml|mililitros)/i);
          if (amount) {
            form.amount.value = amount[1].replace(',', '.');
            form.unit.value = /ml/i.test(amount[2]) ? 'ml': 'g'
          }
          notify('Transcrição preenchida. Revise alimento, quantidade e nutrição antes de registrar.');
          form.scrollIntoView({
            behavior: 'smooth'
          })
        };
        rec.onerror = () => notify('Não foi possível reconhecer a fala');
        rec.start();
        notify('Ouvindo… fale o alimento e a quantidade');
        return
      }
      if (a === 'photo') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.onchange = async() => {
          const file = input.files[0];
          if (!file) return;
          const name = prompt('Que alimento aparece na foto?');
          if (!name) return;
          const amount = num(prompt('Qual quantidade você estima em gramas?', '100'));
          if (!(amount > 0)) return;
          const ask = (q) => num(prompt(q, '0')) || 0;
          const kcal = ask('Calorias por 100 g (consulte rótulo ou banco; use 0 se desconhecido)'),
          protein = ask('Proteínas por 100 g (g)'), carbs = ask('Carboidratos por 100 g (g)'), fat = ask('Gorduras por 100 g (g)');
          if (!confirm(`A estimativa visual da porção é ${amount} g. Confirmar registro? Os valores 
          nutricionais foram informados por você.`)) return;
          let photo;
          try {
            photo = await compressImage(file);
          } catch {
            notify('Não foi possível ler a imagem');
            return
          }
          const vals = macroData({
            kcal, protein, carbs, fat
          },
          amount);
          addFood({
            name, meal: 'Lanches', amount, unit: 'g', ...vals, photo, source: 'foto · estimativa manual do usuário',
            confidence: 'não estimada pela IA'
          });
        };
        input.click();
        return
      }
      return;
    }
    const prompt = e.target.closest('[data-prompt]');
    if (prompt) {
      const form = $('#chatForm');
      form.message.value = prompt.dataset.prompt;
      form.requestSubmit();
      return
    }
    const del = (sel, arr, msg) => {
      const x = e.target.closest(sel);
      if (x) {
        state[arr] = state[arr].filter(r => r.id !== x.dataset[Object.keys(x.dataset)[0]]);
        save();
        render();
        notify(msg);
        return true
      }
      return false
    };
    if (del('[data-delete-food]', 'meals', 'Alimento removido')) return;
    if (del('[data-del-water]', 'water', 'Registro removido')) return;
    if (del('[data-del-workout]', 'workouts', 'Atividade removida')) return;
    if (del('[data-del-body]', 'body', 'Medição removida')) return;
    if (del('[data-del-plan]', 'plans', 'Item removido')) return;
    if (del('[data-del-shop]', 'shopping', 'Item removido')) return;
    if (del('[data-del-recipe]', 'recipes', 'Receita removida')) return;
    const repeat = e.target.closest('[data-repeat-food]');
    if (repeat) {
      const x = state.meals.find(r => r.id === repeat.dataset.repeatFood);
      if (x) {
        const { id, date, created, ...copy } = x;
        addFood(copy)
      }
      return
    }
    const addPlan = e.target.closest('[data-log-plan]');
    if (addPlan) {
      const x = state.plans.find(r => r.id === addPlan.dataset.logPlan);
      if (x)addFood({
        name: x.food, meal: x.meal, amount: x.amount, unit: 'g', ... {
          kcal: +x.kcal || 0, protein: +x.protein || 0, carbs: +x.carbs || 0, fat: +x.fat || 0, fiber: 0, sodium: 0
        },
        source: 'planejado'
      });
      return
    }
    const shopPlan = e.target.closest('[data-plan-shop]');
    if (shopPlan) {
      const x = state.plans.find(r => r.id === shopPlan.dataset.planShop);
      if (x) {
        state.shopping.push({
          id: uid(), name: x.food, amount: `${x.amount} g`, category: 'Plano', checked: false
        });
        save();
        render();
        notify('Adicionado à lista de compras')
      }
      return
    }
    const addRecipe = e.target.closest('[data-add-recipe]');
    if (addRecipe) {
      const x = state.recipes.find(r => r.id === addRecipe.dataset.addRecipe);
      if (x)addFood({
        name: x.name, meal: 'Lanches', amount: 1, unit: 'porção', kcal: x.kcal, protein: x.protein,
        carbs: x.carbs, fat: x.fat, fiber: 0, sodium: 0
      });
      return
    }
    const check = e.target.closest('[data-check-shop]');
    if (check) {
      const x = state.shopping.find(r => r.id === check.dataset.checkShop);
      if (x) {
        x.checked = check.checked;
        save();
        render()
      }
      return
    }
    const edit = e.target.closest('[data-edit-food]');
    if (edit) {
      const x = state.meals.find(r => r.id === edit.dataset.editFood);
      if (x) {
        const amount = prompt('Nova quantidade (atual '+x.amount+' '+x.unit+')', x.amount);
        if (amount && Number.isFinite(+amount)) {
          const ratio = +amount / (+x.amount || 1);
          x.amount = +amount;
          ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sodium'].forEach(k => x[k] = Math.round((+x[k] || 0) * ratio * 10) / 10);
          save();
          render()
        }
      }
    }
  });
  document.addEventListener('change', e => {
    if (e.target.name === 'unit' && e.target.form?.id === 'foodForm') {
      const txt = e.target.value === 'un' ? 'por unidade': 'por 100 g/ml';
      e.target.form.querySelectorAll('.per-label').forEach(el => el.textContent = txt);
      return
    }
    if (e.target.name === 'macroMode' && e.target.form?.id === 'goalForm') {
      e.target.form.requestSubmit();
      return
    }
    if (e.target.id === 'activeDate') {
      state.activeDate = e.target.value || today();
      save();
      render()
    }
  });
  document.addEventListener('submit', async e => {
    const f = e.target;
    if (!f.id) return;
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f).entries());
    if (f.id === 'foodForm') {
      const amount = +d.amount;
      const vals = macroData(d, amount, d.unit);
      addFood({
        name: d.name, meal: d.meal, amount, unit: d.unit, ...vals, micros: d.micros || '', source: d.source || 'manual'
      });
      return
    }
    if (f.id === 'foodSearch') {
      const out = $('#foodResults');
      out.textContent = 'Pesquisando Open Food Facts…';
      try {
        const query = d.query.trim();
        let items;
        if (/^\d{8,14}$/.test(query)) {
          // Código de barras: consulta direta do produto.
          const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${query}.json`);
          const j = r.ok ? await r.json(): {};
          items = j.product ? [j.product]: [];
        } else {
          const r = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=8`);
          if (!r.ok) throw Error();
          const j = await r.json();
          items = j.products || [];
        }
        items = items.filter(x => x.product_name && x.nutriments);
        const kcalOf = n => n['energy-kcal_100g'] ?? (n.energy_100g != null ? Math.round(n.energy_100g / 4.184): null);
        if (!items.length) {
          out.innerHTML = '<span>Nenhum produto com valores nutricionais encontrados. Tente outro termo ou informe ' +
          'os dados do rótulo.</span>';
          return
        }
        out.innerHTML = items.map((x, i) => `<div class="food-result"><div><b>${esc(x.product_name)} 
        ${x.brands ? '· '+esc(x.brands): ''}</b><small>Open Food Facts · ${kcalOf(x.nutriments) != null ? esc(kcalOf(x.nutriments)) + ' kcal / 100 g': 'calorias não informadas'} 
         · dados podem estar incompletos</small></div><button class="button button-soft 
        button-small" data-select-off="${i}">Usar</button></div>`).join('');
        out.dataset.items = JSON.stringify(items.map(x => ({
          name: x.product_name + (x.brands ? ' · '+x.brands: ''), kcal: kcalOf(x.nutriments),
          protein: x.nutriments.proteins_100g || 0, carbs: x.nutriments.carbohydrates_100g || 0,
          fat: x.nutriments.fat_100g || 0, fiber: x.nutriments.fiber_100g || 0, sodium: (x.nutriments.sodium_100g || 0) * 1000,
          source: 'Open Food Facts'
        })))
      }
      catch {
        out.innerHTML = '<span>Não foi possível acessar o banco. Verifique sua conexão ou informe os valores ' +
        'nutricionais manualmente.</span>'
      }
      return
    }
    if (f.id === 'recipeForm') {
      const raw = d.ingredients.split('\n').map(x => x.trim()).filter(Boolean);
      const lines = raw.map(x => x.split(';').map(t => t.trim()));
      const bad = lines.filter(l => l.length < 6 || !(num(l[5]) > 0) || [1, 2, 3, 4].some(i => !Number.isFinite(num(l[i]))));
      if (!lines.length || bad.length) {
        notify(lines.length ? `Revise: ${bad.map(l => l[0] || '?').join(', ')} — cada linha precisa de 6 campos e da quantidade em g`: 'Informe ao menos um ingrediente');
        return
      }
      let sums = [0, 0, 0, 0];
      let totalWeight = 0;
      for (const line of lines) {
        const weight = num(line[5]);
        totalWeight += weight;
        [1, 2, 3, 4].forEach((idx, i) => sums[i] += num(line[idx]) * weight / 100)
      }
      const servings = Math.max(1, +d.servings || 1);
      state.recipes.push({
        id: uid(), name: d.name, servings, method: d.method, ingredients: d.ingredients, finalWeight: +d.finalWeight || 0,
        rawWeight: totalWeight, kcal: Math.round(sums[0] / servings),
        protein: Math.round(sums[1] / servings), carbs: Math.round(sums[2] / servings), fat: Math.round(sums[3] / servings)
      });
      save();
      render();
      notify('Receita salva');
      return
    }
    if (f.id === 'waterForm') {
      state.water.push({
        id: uid(), date: state.activeDate || today(), created: new Date().toISOString(), ml: +d.ml,
        container: d.container
      });
      save();
      render();
      return
    }
    if (f.id === 'waterSettings') {
      state.profile.waterGoal = +d.waterGoal || 0;
      state.profile.reminders = d.reminders === 'day' ? 'day': 'off';
      if (state.profile.reminders === 'day' && 'Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      if (state.profile.reminders === 'day' && (!('Notification' in window) || Notification.permission !== 'granted')) {
        setTimeout(() => notify('Notificações bloqueadas neste navegador; o lembrete aparecerá só dentro do app'), 2500);
      }
      save();
      render();
      notify('Meta de hidratação salva');
      return
    }
    if (f.id === 'workoutForm') {
      state.workouts.push({
        ...d, id: uid(), date: d.date || today()
      });
      save();
      render();
      notify('Atividade salva');
      return
    }
    if (f.id === 'bodyForm') {
      const file = f.photo.files[0];
      const row = {
        ...d, id: uid()
      };
      delete row.photo;
      for (const k of Object.keys(row)) if (k !== 'date' && row[k] === '') delete row[k];
      if (Object.keys(row).filter(k => k !== 'date' && k !== 'id').length === 0 && !file) {
        notify('Preencha ao menos uma medida ou escolha uma foto');
        return
      }
      if (file) {
        try {
          row.photo = await compressImage(file, 1000, 0.72);
        } catch {
          notify('Não foi possível ler a imagem');
          return
        }
      }
      state.body.push(row);
      const ok = save();
      render();
      if (ok) notify('Medição salva');
      return
    }
    if (f.id === 'planForm') {
      state.plans.push({
        ...d, id: uid(), amount: +d.amount || 100, kcal: +d.kcal || 0, protein: +d.protein || 0, carbs: +d.carbs || 0, fat: +d.fat || 0
      });
      save();
      render();
      notify('Refeição adicionada ao plano');
      return
    }
    if (f.id === 'prefsForm') {
      state.prefs = {
        ...state.prefs, ...d, mealsPerDay: +d.mealsPerDay || 4
      };
      save();
      render();
      notify('Preferências salvas');
      return
    }
    if (f.id === 'shopForm') {
      state.shopping.push({
        ...d, id: uid(), checked: false, category: 'Outros'
      });
      save();
      render();
      return
    }
    if (f.id === 'profileForm') {
      state.profile = {
        ...state.profile, ...d
      };
      save();
      render();
      notify('Perfil salvo; metas não foram alteradas automaticamente');
      return
    }
    if (f.id === 'goalForm') {
      const mode = d.macroMode;
      // Os campos exibidos podem estar no outro modo (o usuário acabou de trocar): converte os valores.
      const shown = 'proteinPct' in d ? 'percent': 'grams';
      let pg = num(shown === 'percent' ? d.proteinPct: d.protein) || 0,
      cg = num(shown === 'percent' ? d.carbsPct: d.carbs) || 0,
      fg = num(shown === 'percent' ? d.fatPct: d.fat) || 0;
      let converted = false;
      if (shown !== mode) {
        const kcalRef = +d.kcal || calcKcal();
        if (mode === 'grams') {
          const tot = pg + cg + fg || 100;
          [pg, cg, fg] = kcalRef ? [Math.round(kcalRef * pg / tot / 4), Math.round(kcalRef * cg / tot / 4), Math.round(kcalRef * fg / tot / 9)]: [0, 0, 0];
        } else {
          const tot = 4 * pg + 4 * cg + 9 * fg;
          if (tot) {
            pg = Math.round(400 * pg / tot);
            cg = Math.round(400 * cg / tot);
            fg = 100 - pg - cg;
          } else [pg, cg, fg] = [30, 40, 30];
        }
        converted = true;
      }
      if (mode === 'percent' && pg + cg + fg !== 100) {
        notify('As porcentagens precisam somar exatamente 100%');
        return
      }
      state.goal = {
        ...state.goal, kcal: +d.kcal || 0, macroMode: mode, proteinPct: mode === 'percent' ? pg: state.goal.proteinPct,
        carbsPct: mode === 'percent' ? cg: state.goal.carbsPct, fatPct: mode === 'percent' ? fg: state.goal.fatPct,
        protein: mode === 'grams' ? pg: state.goal.protein, carbs: mode === 'grams' ? cg: state.goal.carbs,
        fat: mode === 'grams' ? fg: state.goal.fat, lowcarb: f.lowcarb.checked,
        exerciseCalories: f.exerciseCalories.checked
      };
      save();
      render();
      notify(converted ? 'Modo alterado e valores convertidos; revise e salve se quiser ajustar': 'Metas salvas');
      return
    }
    if (f.id === 'chatForm') {
      const q = d.message.trim();
      if (!q) return;
      state.chats.push({
        who: 'user', text: q
      },
      {
        who: 'bot', text: chatbotAnswer(q)
      });
      save();
      render();
      $('#chatLog').scrollTop = $('#chatLog').scrollHeight;
      return
    }
    if (f.id === 'recipeImport') {
      const out = f.querySelector('button');
      out.disabled = true;
      out.textContent = 'Buscando…';
      try {
        const response = await fetch(d.url);
        if (!response.ok) throw Error('');
        const html = await response.text(), doc = new DOMParser().parseFromString(html, 'text/html');
        let recipe = null;
        for (const node of doc.querySelectorAll('script[type="application/ld+json"]')) {
          try {
            const parsed = JSON.parse(node.textContent);
            const items = Array.isArray(parsed) ? parsed: [parsed, ...(parsed['@graph'] || [])];
            recipe = items.find(x => String(x['@type']).includes('Recipe'));
            if (recipe) break
          }
          catch {
          }
        }
        if (!recipe) throw Error('');
        const rf = $('#recipeForm');
        rf.name.value = recipe.name || '';
        rf.method.value = Array.isArray(recipe.recipeInstructions)
          ? recipe.recipeInstructions.map(x => typeof x === 'string' ? x: x.text || '').join('\n')
          : typeof recipe.recipeInstructions === 'string'
            ? recipe.recipeInstructions
            : '';
        rf.ingredients.value = (recipe.recipeIngredient || []).map(x => `${String(x).replace(/;/g, ',')}; ; ; ; ; `).join('\n');
        notify('Receita extraída. Preencha a nutrição e a quantidade (g) de cada ingrediente antes de salvar.')
      }
      catch {
        notify('O site bloqueou a leitura ou não expôs Schema.org Recipe. Cadastre a receita manualmente.')
      }
      finally {
        out.disabled = false;
        out.textContent = 'Buscar receita'
      }
      return
    }
  });
  document.addEventListener('click', e => {
    const pick = e.target.closest('[data-select-off]');
    if (pick) {
      const out = $('#foodResults'), item = JSON.parse(out.dataset.items || '[]')[+pick.dataset.selectOff];
      if (item) {
        const form = $('#foodForm');
        form.name.value = item.name;
        ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sodium'].forEach(k => form[k].value = item[k] ?? '');
        form.source.value = 'Open Food Facts';
        form.unit.value = 'g';
        form.unit.dispatchEvent(new Event('change', { bubbles: true }));
        notify(item.kcal == null ? 'Este produto não informa calorias: preencha pelo rótulo antes de registrar': 'Valores por 100 g carregados; confira a fonte')
      }
      return
    }
  });
  function startBarcode() {
    if (!('BarcodeDetector'in window)) {
      notify('Leitura pela câmera indisponível neste navegador. Pesquise o código do produto.');
      const q = prompt('Digite o código de barras para pesquisar');
      if (q) {
        document.querySelector('#foodSearch [name=query]').value = q;
        document.querySelector('#foodSearch').requestSubmit()
      }
      return
    }
    const dialog = document.createElement('dialog');
    dialog.innerHTML = '<div class="dialog-card"><div class="dialog-head"><h2>Escanear código de ' +
    'barras</h2><button class="icon-button" data-close>×</button></div><video autoplay ' +
    'playsinline style="width:100%;border-radius:12px;background:#111"></video><p ' +
    'class="small muted">Aponte a câmera para o código. Permita o acesso quando ' +
    'solicitado.</p></div>';
    document.body.append(dialog);
    dialog.showModal();
    let stream;
    const close = () => {
      stream?.getTracks().forEach(t => t.stop());
      dialog.close();
      dialog.remove()
    };
    dialog.querySelector('[data-close]').onclick = close;
    try {
      const detector = new BarcodeDetector({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e']
      });
      navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment'
        }
      }).then(s => {
        stream = s;
        dialog.querySelector('video').srcObject = s;
        const scan = async() => {
          if (!dialog.open) return;
          try {
            const codes = await detector.detect(dialog.querySelector('video'));
            if (codes.length) {
              const code = codes[0].rawValue;
              close();
              document.querySelector('#foodSearch [name=query]').value = code;
              document.querySelector('#foodSearch').requestSubmit();
              return
            }
          }
          catch {
          }
          requestAnimationFrame(scan)
        };
        scan()
      }).catch(() => {
        close();
        notify('A câmera não foi autorizada')
      })
    }
    catch {
      close();
      notify('Não foi possível iniciar a câmera')
    }
  }
  // Se o app ficou aberto e o dia virou, acompanha a nova data.
  function checkDayChange() {
    const now = today();
    if (now !== lastToday) {
      if (state.activeDate === lastToday) state.activeDate = now;
      lastToday = now;
      render();
    }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkDayChange(); });
  let lastReminder = Date.now();
  setInterval(() => {
    checkDayChange();
    if (state.profile.reminders !== 'day') return;
    const h = new Date().getHours();
    if (h < 8 || h >= 22 || Date.now() - lastReminder < 2 * 3600 * 1000) return;
    lastReminder = Date.now();
    const msg = `Hora de beber água 💧 Hoje: ${fmt(state.water.filter(x => x.date === today()).reduce((a, x) => a + (+x.ml || 0), 0))} ml de ${fmt(waterTarget())} ml`;
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification('NutriFit', { body: msg, icon: 'icons/nutrifit-192.svg' }); } catch { notify(msg); }
    } else notify(msg);
  }, 60 * 1000);
  window.addEventListener('hashchange', () => {
    route = location.hash.slice(1) || 'inicio';
    render()
  });
  // Primeira renderização ao abrir o app.
  render();
})();

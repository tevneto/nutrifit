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
    diets: [],
    defaultDietId: null,
    dietWeek: {},
    dietApplied: {},
    health: {},
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
    const d = state.activeDate || today();
    const h = state.health && state.health[d];
    if (h && h.activeKcal != null) return +h.activeKcal;
    return state.workouts.filter(x => x.date === d).reduce((a, x) => a + (+x.calories || 0), 0)
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
    let steps = stepsOf(state.activeDate || today()), goal = kcalGoal();
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
    sensíveis; guarde-os com segurança.</p></section></div>${aiSettingsCard()}<section class="card danger-zone"><div 
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
  /* ===================== NutriFit 1.2: base de alimentos, itens e dietas ===================== */
  const MEALS = ['Café da manhã', 'Almoço', 'Jantar', 'Lanches', 'Ceia'];
  const NUTR = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sodium'];
  const NUTR_LABEL = { kcal: 'Calorias (kcal)', protein: 'Proteínas (g)', carbs: 'Carboidratos (g)', fat: 'Gorduras (g)', fiber: 'Fibras (g)', sodium: 'Sódio (mg)' };
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const STOP = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'com', 'em', 'no', 'na', 'um', 'uma']);
  const words = s => norm(s).split(/[^a-z0-9]+/).filter(Boolean);
  // Raiz simples: ignora plural e masculino/feminino (moída = moído, ovos = ovo).
  const stemOf = w => {
    if (w.length > 3 && w.endsWith('s')) w = w.slice(0, -1);
    return w.length > 4 ? w.replace(/[ao]$/, '') : w;
  };
  const PART_WORDS = ['clara', 'gema', 'po', 'cru', 'crua', 'desidratado', 'desidratada'];
  const r1 = n => Math.round((+n || 0) * 10) / 10;
  const ui = { dietId: null, bulk: [], pendingPhoto: null };
  const formSel = {};
  const pickerResults = {};

  for (const k of ['diets', 'dietWeekList']) if (!Array.isArray(state[k])) state[k] = [];
  if (!state.dietWeek || typeof state.dietWeek !== 'object') state.dietWeek = {};
  if (!state.dietApplied || typeof state.dietApplied !== 'object') state.dietApplied = {};
  if (!state.health || typeof state.health !== 'object') state.health = {};

  let tacoCache = null;
  function tacoFoods() {
    if (tacoCache) return tacoCache;
    const T = window.TACO || { foods: [], cats: [] };
    tacoCache = T.foods.map(r => ({
      key: 't' + r[0], tacoId: r[0], name: r[1], cat: T.cats[r[2]], source: 'TACO', basis: '100g',
      per: { kcal: r[3], protein: r[4] ?? 0, carbs: r[5] ?? 0, fat: r[6] ?? 0, fiber: r[7] ?? 0, sodium: r[8] ?? 0 },
      noData: r[3] == null,
      extra: { calcium: r[9], iron: r[10], potassium: r[11] },
      measures: r[12] || [], w: words(r[1])
    }));
    return tacoCache;
  }
  const tacoById = id => tacoFoods().find(f => f.tacoId === id);

  // Alimentos já usados pela pessoa (diário, dietas e receitas), para aparecerem primeiro na busca.
  function personalFoods() {
    const seen = new Map();
    const take = (it, source) => {
      const k = norm(it.name);
      if (!k || seen.has(k)) return;
      let per = it.per, basis = it.basis;
      if (!per) {
        const amt = +it.amount || 0;
        if (!amt) return;
        const unitBased = it.unit === 'un' || it.unit === 'porção' || it.unit === 'unidade';
        basis = unitBased ? 'unit' : '100g';
        const f = unitBased ? 1 / amt : 100 / amt;
        per = Object.fromEntries(NUTR.map(n => [n, r1((+it[n] || 0) * f)]));
      }
      seen.set(k, { key: 'p' + k, name: it.name, source, basis, per, measures: it.measures || (it.tacoId ? tacoById(it.tacoId)?.measures : []) || [], tacoId: it.tacoId || null, unitLabel: basis === 'unit' ? (it.unit === 'un' ? 'unidade' : it.unit) : null, w: words(it.name) });
    };
    state.recipes.forEach(r => take({ name: r.name, amount: 1, unit: 'porção', kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat }, 'Receita'));
    state.meals.slice().reverse().forEach(it => take(it, 'Seus alimentos'));
    state.diets.forEach(d => d.items.forEach(it => take(it, 'Seus alimentos')));
    return [...seen.values()];
  }

  // Sinônimos do dia a dia para os nomes técnicos da TACO.
  const SYN = { branco: ['tipo', 'polido'], frances: ['frances', 'trigo'], file: ['file'], patinho: ['patinho'], batata: ['batata'], suco: ['suco'], cafe: ['cafe'], requeijao: ['requeijao'], mussarela: ['mussarela'], muçarela: ['mussarela'], presunto: ['presunto'], aipim: ['mandioca'], macaxeira: ['mandioca'], abobrinha: ['abobrinha'], tapioca: ['tapioca'], cuscuz: ['cuscuz'] };
  function scoreFood(f, qw) {
    let score = 0, hits = 0;
    qw.forEach((t, i) => {
      const alts = [t, ...(SYN[t] || [])];
      let best = 0;
      for (const a of alts) {
        const stem = stemOf(a);
        for (const w of f.w) {
          if (w === a || stemOf(w) === stem) { best = 3; break; }
          if (w.startsWith(stem)) best = Math.max(best, 2);
          else if (stem.startsWith(w) && w.length >= 4) best = Math.max(best, 1);
        }
        if (best === 3) break;
      }
      if (best) { hits++; score += best; } else score -= i === 0 ? 6 : 1.5;
    });
    if (!hits || hits < Math.ceil(qw.length / 2)) return 0;
    if (f.w[0] && f.w[0].startsWith(qw[0])) score += 3;
    if (f.source !== 'TACO') score += 4;
    if (f.source === 'TACO') PART_WORDS.forEach(pw => { if (f.w.includes(pw) && !qw.includes(pw)) score -= 1.5; });
    return Math.max(0.01, score - f.w.length * 0.08);
  }
  function searchFoods(q, limit = 12) {
    const qw = words(q).filter(t => !STOP.has(t));
    if (!qw.length) return [];
    const out = [];
    const seen = new Set();
    for (const f of [...personalFoods(), ...tacoFoods()]) {
      const s = scoreFood(f, qw);
      if (s > 0 && !seen.has(norm(f.name))) { seen.add(norm(f.name)); out.push([s, f]); }
    }
    return out.sort((a, b) => b[0] - a[0]).slice(0, limit).map(x => x[1]);
  }

  // ---------- Open Food Facts (produtos industrializados) ----------
  async function fetchJSON(url, ms = 10000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }
  function offToFood(p) {
    const n = p.nutriments || {};
    const kcal = n['energy-kcal_100g'] ?? (n.energy_100g != null ? Math.round(n.energy_100g / 4.184) : null);
    const name = (p.product_name_pt || p.product_name || '').trim();
    if (!name || kcal == null) return null;
    const label = name + (p.brands ? ' · ' + String(p.brands).split(',')[0].trim() : '');
    return {
      key: 'o' + (p.code || label), name: label, source: 'Open Food Facts', basis: '100g', code: p.code || null,
      per: { kcal: r1(kcal), protein: r1(n.proteins_100g), carbs: r1(n.carbohydrates_100g), fat: r1(n.fat_100g), fiber: r1(n.fiber_100g), sodium: Math.round((+n.sodium_100g || 0) * 1000) },
      measures: p.serving_quantity ? [['porção do rótulo', +p.serving_quantity]] : [], w: words(label)
    };
  }
  async function offSearch(q) {
    const fields = 'code,product_name,product_name_pt,brands,nutriments,serving_quantity';
    const attempts = [
      async () => (await fetchJSON(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=15&langs=pt,en&fields=${fields}`)).hits || [],
      async () => (await fetchJSON(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=15&fields=${fields}`, 15000)).products || []
    ];
    let lastErr;
    for (const run of attempts) {
      try {
        return (await run()).map(offToFood).filter(Boolean);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('falha');
  }
  async function offBarcode(code) {
    const j = await fetchJSON(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,product_name_pt,brands,nutriments,serving_quantity`);
    return j.product ? offToFood({ code, ...j.product }) : null;
  }

  // ---------- Itens (diário e dieta) ----------
  function recalc(it) {
    if (!it.per) return it;
    const f = it.basis === 'unit' ? (+it.amount || 0) : (+it.amount || 0) * (+it.unitGrams || 1) / 100;
    NUTR.forEach(k => it[k] = r1((+it.per[k] || 0) * f));
    it.grams = it.basis === 'unit' ? null : Math.round((+it.amount || 0) * (+it.unitGrams || 1));
    return it;
  }
  function setItemAmount(it, amount) {
    amount = +amount;
    if (!(amount >= 0)) return;
    if (it.per) {
      it.amount = amount;
      recalc(it);
    } else {
      const ratio = amount / (+it.amount || 1);
      it.amount = amount;
      NUTR.forEach(k => it[k] = r1((+it[k] || 0) * ratio));
    }
  }
  function amountLabel(it) {
    if (it.basis === 'unit') return `${fmtNum(it.amount)} ${it.unit === 'un' ? 'un.' : esc(it.unit || 'un.')}`;
    if (it.unitGrams && it.unitGrams !== 1) return `${fmtNum(it.amount)} ${esc(it.unit)} <span class="muted">(${fmt(it.grams)} g)</span>`;
    return `${fmtNum(it.amount)} ${esc(it.unit || 'g')}`;
  }
  const fmtNum = n => (+n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const totals = items => Object.fromEntries(NUTR.map(k => [k, items.reduce((a, x) => a + (+x[k] || 0), 0)]));
  const macroLine = t => `${fmt(t.kcal)} kcal · ${fmt(t.protein)} g P · ${fmt(t.carbs)} g C · ${fmt(t.fat)} g G`;
  const cloneItem = it => JSON.parse(JSON.stringify(it));

  // ---------- Formulário de alimento reutilizável (diário e dieta) ----------
  function foodFormHTML(id, defaultMeal = 'Almoço') {
    return `<form class="food-add" data-food-form="${id}" autocomplete="off">
      <div class="field picker"><label>Alimento</label>
        <input name="q" class="picker-input" data-picker="${id}" placeholder="Digite: arroz, frango grelhado, banana, whey…" required>
        <div class="picker-list" hidden></div>
      </div>
      <div class="food-add-row">
        <div class="field"><label>Refeição</label><select name="meal">${MEALS.map(m => `<option ${m === defaultMeal ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
        <div class="field"><label>Quantidade</label><input name="amount" type="number" step="any" min="0" value="100" required></div>
        <div class="field"><label>Medida</label><select name="unit">${unitOptions(null)}</select></div>
        <div class="field"><label>&nbsp;</label><button class="button button-primary">Adicionar</button></div>
      </div>
      <div class="food-preview small" data-preview>Escolha um alimento da lista para preencher os valores automaticamente.</div>
      <details class="manual"><summary>Ver ou ajustar valores nutricionais</summary>
        <div class="form-grid cols-3">${NUTR.map(k => `<div class="field"><label>${NUTR_LABEL[k]} <span class="per-label">por 100 g/ml</span></label><input name="${k}" type="number" min="0" step="any" value="0"></div>`).join('')}</div>
        <small class="muted">Valores da TACO, do Open Food Facts, do seu histórico ou do rótulo. Alimentos sem dados não recebem valores presumidos.</small>
      </details>
    </form>`;
  }
  function unitOptions(food) {
    if (food && food.basis === 'unit') return `<option value="un">${esc(food.unitLabel || 'porção')}</option>`;
    const ms = (food?.measures || []).map(([l, g]) => `<option value="m:${g}" data-label="${esc(l)}">${esc(l)} (${fmtNum(g)} g)</option>`).join('');
    return `<option value="g">gramas (g)</option><option value="ml">mililitros (ml)</option>${ms}<option value="un">unidade (valores por unidade)</option>`;
  }
  function formPer(form) {
    return Object.fromEntries(NUTR.map(k => [k, num(form[k].value) || 0]));
  }
  function itemFromForm(form, id) {
    const sel = formSel[id];
    const name = form.q.value.trim();
    const amount = num(form.amount.value);
    const uv = form.unit.value;
    const it = { meal: form.meal.value, name, amount, per: formPer(form), source: sel && norm(sel.name) === norm(name) ? sel.source : 'manual', tacoId: sel?.tacoId || null, measures: sel?.measures?.length ? sel.measures : null, code: sel?.code || null };
    if (uv === 'un') { it.basis = 'unit'; it.unit = sel?.basis === 'unit' ? (sel.unitLabel || 'porção') : 'un'; it.unitGrams = null; }
    else if (uv.startsWith('m:')) { it.basis = '100g'; it.unitGrams = +uv.slice(2); it.unit = form.unit.selectedOptions[0].dataset.label || 'medida'; }
    else { it.basis = '100g'; it.unitGrams = 1; it.unit = uv; }
    return recalc(it);
  }
  function updatePreview(form) {
    const id = form.dataset.foodForm;
    const out = form.querySelector('[data-preview]');
    if (!form.q.value.trim()) return;
    const it = itemFromForm(form, id);
    const tag = formSel[id] && norm(formSel[id].name) === norm(it.name) ? `<span class="src-tag">${esc(formSel[id].source)}</span> ` : '<span class="src-tag manual">manual</span> ';
    out.innerHTML = tag + `≈ <b>${macroLine(it)}</b>${it.grams && it.unitGrams !== 1 ? ` · ${fmt(it.grams)} g` : ''}`;
    form.querySelectorAll('.per-label').forEach(el => el.textContent = it.basis === 'unit' ? 'por unidade/porção' : 'por 100 g/ml');
  }
  function selectFood(form, food) {
    const id = form.dataset.foodForm;
    formSel[id] = food;
    form.q.value = food.name;
    NUTR.forEach(k => form[k].value = food.noData ? '' : food.per[k] ?? 0);
    if (food.noData) form.querySelector('details.manual').open = true;
    form.unit.innerHTML = unitOptions(food);
    if (food.basis === 'unit') form.amount.value = 1;
    else if (food.measures?.some(m => m[0] === 'unidade')) {
      const opt = [...form.unit.options].find(o => o.dataset.label === 'unidade');
      if (opt) { form.unit.value = opt.value; form.amount.value = 1; }
    } else if (form.unit.value === 'g' && !(num(form.amount.value) > 0)) form.amount.value = 100;
    const list = form.querySelector('.picker-list');
    list.hidden = true;
    updatePreview(form);
    if (food.noData) notify('A TACO não analisou este alimento. Preencha os valores do rótulo (por 100 ml/g).');
    else if (food.source === 'Open Food Facts' && !food.per.kcal) notify('Este produto não informa calorias: confira o rótulo');
  }
  function renderPicker(input, extra = null, status = '') {
    const id = input.dataset.picker;
    const list = input.parentElement.querySelector('.picker-list');
    const q = input.value.trim();
    if (q.length < 2) { list.hidden = true; return; }
    const local = searchFoods(q);
    const res = extra ? [...local, ...extra.filter(e => !local.some(l => norm(l.name) === norm(e.name)))] : local;
    pickerResults[id] = res;
    list.innerHTML = res.map((f, i) => `<button type="button" class="picker-item" data-pick="${id}" data-idx="${i}"><span>${esc(f.name)}</span><small><span class="src-tag ${f.source === 'TACO' ? '' : f.source === 'Open Food Facts' ? 'off' : 'mine'}">${esc(f.source)}</span> ${f.noData ? 'sem valores na TACO — use o rótulo' : `${fmt(f.per.kcal)} kcal/${f.basis === 'unit' ? esc(f.unitLabel || 'porção') : '100 g'}`}</small></button>`).join('') +
      (status ? `<div class="picker-status">${status}</div>` : '') +
      (extra ? '' : `<button type="button" class="picker-item picker-off" data-off-search="${id}">🔎 Buscar “${esc(q)}” em produtos industrializados (marcas)</button>`) +
      (!res.length && !status ? '<div class="picker-status">Nada na base local. Busque nas marcas acima ou informe os valores do rótulo em “Ver ou ajustar valores”.</div>' : '');
    list.hidden = false;
  }
  function closePickers(except) {
    document.querySelectorAll('.picker-list').forEach(l => { if (l !== except) l.hidden = true; });
  }

  // ---------- Dietas ----------
  const dietById = id => state.diets.find(d => d.id === id);
  function dietForDate(date) {
    const wd = new Date(date + 'T12:00:00').getDay();
    const id = state.dietWeek[wd] || state.defaultDietId;
    return id === 'none' ? null : dietById(id) || null;
  }
  function applyDiet(diet, date, onlyMissing = false) {
    if (!diet) return 0;
    let n = 0;
    for (const src of diet.items) {
      if (onlyMissing && state.meals.some(m => m.date === date && m.meal === src.meal && norm(m.name) === norm(src.name))) continue;
      state.meals.push({ ...cloneItem(src), id: uid(), date, created: new Date().toISOString(), fromDiet: diet.id });
      n++;
    }
    state.dietApplied[date] = diet.id;
    return n;
  }
  // Preenche o dia de hoje com a dieta padrão (uma única vez por dia, se a opção estiver ativa).
  function maybeAutoDiet() {
    const d = today();
    if (!state.prefs.autoDiet || state.dietApplied[d]) return;
    const diet = dietForDate(d);
    if (!diet || !diet.items.length) return;
    if (state.meals.some(m => m.date === d)) { state.dietApplied[d] = 'skip'; save(); return; }
    applyDiet(diet, d);
    save();
    setTimeout(() => notify(`Dieta “${diet.name}” aplicada ao dia de hoje. Ajuste o que mudar.`), 300);
  }

  // Interpreta várias linhas: "150 g arroz cozido", "2 ovos cozidos", "1 colher de sopa de azeite".
  function parseBulk(text) {
    const rows = [];
    for (const raw of text.split('\n').map(s => s.trim()).filter(Boolean)) {
      const m = raw.match(/^(\d+(?:[.,]\d+)?)\s*(g|gr|gramas?|ml|mililitros?|un|unid(?:ade)?s?|x)?\b\s*(.*)$/i);
      let amount = m ? num(m[1]) : 1, unit = m && m[2] ? norm(m[2]) : '', rest = m ? m[3] : raw;
      let measure = null;
      const mm = rest.match(/^(colher(?:es)? de (?:sopa|cha|chá|sobremesa|cafe|café|arroz|servir)|conchas?|escumadeiras?|fatias?|pedaços?|copos?|xícaras?|xicaras?|pratos? (?:fundo|raso)|porç(?:ão|oes|ões)|unidades?)\s+(?:de\s+)?(.*)$/i);
      if (mm) { measure = norm(mm[1]).replace(/es$|s$/, ''); rest = mm[2]; }
      const cands = searchFoods(rest.replace(/^de\s+/i, ''), 6);
      const food = cands[0] || null;
      let unitVal = 'g';
      if (unit.startsWith('ml') || unit.startsWith('mili')) unitVal = 'ml';
      else if (measure && food) {
        const hit = (food.measures || []).find(([l]) => norm(l).startsWith(measure.slice(0, 8)));
        if (hit) unitVal = 'm:' + hit[1];
      } else if (!unit && food) {
        if (food.basis === 'unit') unitVal = 'un';
        else {
          const un = (food.measures || []).find(([l]) => l === 'unidade' || l === 'fatia');
          if (un && amount < 20) unitVal = 'm:' + un[1];
        }
      }
      const measureMissing = !!measure && !unitVal.startsWith('m:');
      rows.push({ raw, amount, unitVal, cands, pick: 0, measureMissing, on: measureMissing || food?.noData ? false : undefined });
    }
    return rows;
  }
  function bulkItem(row, meal) {
    const food = row.cands[row.pick];
    if (!food) return null;
    const it = { meal, name: food.name, amount: row.amount, per: { ...food.per }, source: food.source, tacoId: food.tacoId || null, measures: food.measures?.length ? food.measures : null };
    if (food.basis === 'unit') { it.basis = 'unit'; it.unit = food.unitLabel || 'porção'; it.unitGrams = null; }
    else if (row.unitVal.startsWith('m:')) { it.basis = '100g'; it.unitGrams = +row.unitVal.slice(2); it.unit = (food.measures.find(m => String(m[1]) === row.unitVal.slice(2)) || ['medida'])[0]; }
    else { it.basis = '100g'; it.unitGrams = 1; it.unit = row.unitVal === 'ml' ? 'ml' : 'g'; }
    return recalc(it);
  }

  // ---------- Apple Saúde (via Atalhos do iPhone) ----------
  function parseLocaleNum(s) {
    s = String(s ?? '').trim().replace(/\s/g, '');
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  function parseHealthText(text) {
    const out = [];
    for (const line of String(text).split(/\n|(?=NUTRIFIT)/i)) {
      if (!/NUTRIFIT/i.test(line)) continue;
      const rec = {};
      for (const part of line.split('|').slice(1)) {
        const [k, ...v] = part.split('=');
        const key = norm(k).trim(), val = v.join('=').trim();
        if (key === 'data') {
          const iso = val.match(/(\d{4})-(\d{2})-(\d{2})/), br = val.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          rec.date = iso ? iso[0] : br ? `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}` : null;
        } else if (key.startsWith('passo')) rec.steps = Math.round(parseLocaleNum(val) ?? 0);
        else if (key.startsWith('ativa') || key === 'kcal') rec.activeKcal = Math.round(parseLocaleNum(val) ?? 0);
        else if (key.startsWith('exerc')) rec.exerciseMin = Math.round(parseLocaleNum(val) ?? 0);
        else if (key.startsWith('dist')) rec.distanceKm = r1(parseLocaleNum(val) ?? 0);
        else if (key.startsWith('repouso')) rec.restingKcal = Math.round(parseLocaleNum(val) ?? 0);
      }
      if (Object.keys(rec).some(k => k !== 'date')) out.push({ date: rec.date || today(), ...rec });
    }
    return out;
  }
  function importHealth(text) {
    const recs = parseHealthText(text);
    recs.forEach(r => { state.health[r.date] = { ...(state.health[r.date] || {}), ...r, source: 'Apple Saúde', updated: new Date().toISOString() }; });
    return recs;
  }
  const dayHealth = (date = state.activeDate || today()) => state.health[date] || null;
  function stepsOf(date) {
    const h = state.health[date];
    if (h && h.steps != null) return +h.steps;
    return state.workouts.filter(x => x.date === date).reduce((a, x) => a + (+x.steps || 0), 0);
  }
  function stepsAverage(days) {
    const vals = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const v = stepsOf(localISO(d));
      if (v > 0) vals.push(v);
    }
    return vals.length ? { avg: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length } : null;
  }

  /* ===================== NutriFit 1.2: páginas ===================== */
  function itemRow(it, kind, ownerId = '') {
    const attr = kind === 'diet' ? `data-diet-qty="${ownerId}:${it.id}"` : `data-qty="${it.id}"`;
    const del = kind === 'diet' ? `data-diet-del="${ownerId}:${it.id}"` : `data-delete-food="${it.id}"`;
    const unitTxt = it.basis === 'unit' ? (it.unit === 'un' ? 'un.' : esc(it.unit || 'un.')) : it.unitGrams && it.unitGrams !== 1 ? esc(it.unit) : esc(it.unit || 'g');
    return `<div class="item-row">${thumb(it.photo)}<div class="meal-info"><b>${esc(it.name)}</b><small>${fmt(it.kcal)} kcal · ${fmtNum(it.protein)} P · ${fmtNum(it.carbs)} C · ${fmtNum(it.fat)} G${it.grams && it.unitGrams !== 1 ? ` · ${fmt(it.grams)} g` : ''}${it.source ? ` · <span class="muted">${esc(it.source)}</span>` : ''}</small></div>
      <label class="qty-wrap"><input class="qty" type="number" step="any" min="0" value="${esc(it.amount)}" ${attr} aria-label="Quantidade de ${esc(it.name)}"><span>${unitTxt}</span></label>
      <button class="icon-button" ${del} aria-label="Remover ${esc(it.name)}">×</button></div>`;
  }
  function mealBlocks(items, kind, ownerId = '') {
    return MEALS.map(meal => {
      const rows = items.filter(x => (x.meal || 'Lanches') === meal);
      const t = totals(rows);
      return `<div class="meal-block"><div class="meal-block-head"><b>${meal}</b><span class="muted small">${rows.length ? macroLine(t) : 'vazio'}</span></div>${rows.map(it => itemRow(it, kind, ownerId)).join('')}</div>`;
    }).join('');
  }
  function goalBars(t) {
    const m = macroTarget(), g = kcalGoal();
    return `<div class="macro-row four">${[['Calorias', t.kcal, g, 'kcal', ''], ['Proteínas', t.protein, m.p, 'g', '#498b67'], ['Carboidratos', t.carbs, m.c, 'g', '#d5a652'], ['Gorduras', t.fat, m.f, 'g', '#719caf']].map(([n, v, tg, u, c]) => `<div class="macro-box"><span>${n}</span><b>${fmt(v)} <small>/ ${fmt(tg)} ${u}</small></b>${pctBar(v, tg, c)}</div>`).join('')}</div>`;
  }

  function foodPage() {
    const date = state.activeDate || today();
    const rows = dayMeals();
    const t = totals(rows);
    const suggested = dietForDate(date);
    const freq = Object.values(state.meals.reduce((a, x) => { const k = norm(x.name); (a[k] = a[k] || { name: x.name, n: 0 }).n++; return a; }, {})).sort((a, b) => b.n - a.n).slice(0, 10);
    return `<div class="content">
      <div class="toolbar"><div><h2>Diário alimentar</h2><p class="muted small">${new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
        <div class="toolbar-actions"><input class="search-input" type="date" id="activeDate" value="${date}" style="width:auto"><button class="button button-light button-small" data-action="copy-day">Copiar dia anterior</button></div></div>
      <section class="card">${goalBars(t)}<p class="small muted" style="margin:10px 0 0">Fibras ${fmt(t.fiber)} g · Sódio ${fmt(t.sodium)} mg${state.goal.lowcarb ? ` · Carboidratos líquidos ${fmt(Math.max(0, t.carbs - t.fiber))} g` : ''}</p></section>
      ${state.diets.length ? `<div class="notice blue"><span>▦</span><div style="flex:1"><b>Dieta pré-definida</b><br>
        <div class="inline-form" style="margin-top:8px"><div class="field"><label>Dieta</label><select id="applyDietSel">${state.diets.map(d => `<option value="${d.id}" ${suggested?.id === d.id ? 'selected' : ''}>${esc(d.name)} (${fmt(totals(d.items).kcal)} kcal)</option>`).join('')}</select></div>
        <button class="button button-soft button-small" data-x="apply-diet">${rows.length ? 'Adicionar o que falta' : 'Aplicar a este dia'}</button></div>
        <small>Depois, altere só o que mudou: edite a quantidade direto na lista ou toque em × no que não comeu.</small></div></div>` : `<div class="notice"><span>✦</span><div><b>Tem uma dieta fixa?</b> Cadastre em <a href="#planejamento" data-go="planejamento">Planejamento</a> e aplique ao dia com um toque.</div></div>`}
      <div class="grid grid-2">
        <section class="card"><div class="card-head"><div><h2>Adicionar alimento</h2><p>Base TACO (597 alimentos brasileiros), seus alimentos e marcas</p></div></div>
          <div class="toolbar-actions" style="margin-bottom:12px"><button class="button button-soft button-small" data-x="photo">📷 Foto do prato</button><button class="button button-light button-small" data-action="voice">🎙 Voz</button><button class="button button-light button-small" data-action="barcode">▦ Código de barras</button></div>
          ${ui.pendingPhoto ? `<div class="notice orange" style="margin-bottom:10px">${thumb(ui.pendingPhoto)}<div>Foto anexada ao próximo alimento que você adicionar. <button class="button button-light button-small" data-x="drop-photo">Remover foto</button></div></div>` : ''}
          ${foodFormHTML('diary')}
          ${freq.length ? `<div class="chips"><span class="small muted">Mais usados:</span>${freq.map(f => `<button type="button" class="chip" data-quick-food="${esc(f.name)}">${esc(f.name)}</button>`).join('')}</div>` : ''}
        </section>
        <section class="card"><div class="card-head"><div><h2>Refeições do dia</h2><p>Toque na quantidade para alterar</p></div></div>
          ${rows.length ? mealBlocks(rows, 'diary') : empty('Nada registrado neste dia', state.diets.length ? 'Aplique sua dieta acima ou adicione alimentos.' : 'Adicione o primeiro alimento ao lado.')}
        </section>
      </div>
      <section class="card"><div class="card-head"><div><h2>Receitas pessoais</h2><p>Calcule a porção a partir dos ingredientes</p></div></div>
        <div class="grid grid-2" style="gap:18px"><form id="recipeForm" class="form-grid"><div class="field"><label>Nome</label><input name="name" required></div><div class="field"><label>Porções</label><input name="servings" type="number" value="1" min="1"></div>
          <div class="field full"><label>Ingredientes — um por linha: nome; kcal; proteína; carboidrato; gordura (por 100 g); quantidade usada (g)</label><textarea name="ingredients" rows="4" placeholder="arroz cozido; 128; 2,5; 28; 0,2; 300&#10;frango grelhado; 159; 32; 0; 2,5; 250"></textarea></div>
          <div class="field"><label>Modo de preparo</label><textarea name="method"></textarea></div><div class="field"><label>Peso final pronto (g, opcional)</label><input name="finalWeight" type="number"></div>
          <div class="field full"><button class="button button-primary">Salvar receita</button></div></form>
          <div>${state.recipes.length ? state.recipes.map(r => `<div class="list-row"><div class="meal-info"><b>${esc(r.name)}</b><small>${fmt(r.kcal)} kcal · ${fmt(r.protein)}P · ${fmt(r.carbs)}C · ${fmt(r.fat)}G por porção · ${r.servings} porções</small></div><button class="button button-soft button-small" data-add-recipe="${r.id}">Registrar</button><button class="icon-button" data-del-recipe="${r.id}" aria-label="Excluir receita">×</button></div>`).join('') : '<p class="small muted">Receitas salvas aparecem também na busca de alimentos.</p>'}
          <form id="recipeImport" class="inline-form" style="margin-top:12px"><div class="field"><label>Importar de um site (URL)</label><input name="url" type="url" placeholder="https://…" required></div><button class="button button-light button-small">Buscar</button></form>
          <small class="muted">Muitos sites bloqueiam a leitura automática; nesse caso, cadastre manualmente.</small></div></div>
      </section></div>`;
  }

  function planningPage() {
    if (!ui.dietId || !dietById(ui.dietId)) ui.dietId = state.defaultDietId && dietById(state.defaultDietId) ? state.defaultDietId : state.diets[0]?.id || null;
    const d = dietById(ui.dietId);
    const dt = d ? totals(d.items) : null;
    const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    return `<div class="content">
      <div class="notice blue"><span>▦</span><div><b>Monte sua dieta uma vez e use todo dia.</b> Ela pode preencher o diário automaticamente; no dia, você só ajusta quantidades ou remove o que não comeu.</div></div>
      <div class="grid grid-2">
        <section class="card"><div class="card-head"><div><h2>Minhas dietas</h2><p>Ex.: “Dia de treino” e “Dia de descanso”</p></div></div>
          ${state.diets.map(x => `<div class="list-row ${x.id === ui.dietId ? 'selected' : ''}"><div class="meal-info"><b>${esc(x.name)} ${x.id === state.defaultDietId ? '<span class="tag">padrão</span>' : ''}</b><small>${x.items.length} itens · ${macroLine(totals(x.items))}</small></div><button class="button button-light button-small" data-x="open-diet" data-id="${x.id}">${x.id === ui.dietId ? 'Aberta' : 'Abrir'}</button></div>`).join('') || '<p class="small muted">Nenhuma dieta ainda.</p>'}
          <form data-x-form="new-diet" class="inline-form" style="margin-top:12px"><div class="field"><label>Nova dieta</label><input name="name" placeholder="Ex.: Dia de treino" required></div><button class="button button-primary button-small">Criar vazia</button></form>
          <form data-x-form="diet-from-day" class="inline-form" style="margin-top:8px"><div class="field"><label>Ou copiar de um dia do diário</label><input name="date" type="date" value="${state.activeDate || today()}"></div><div class="field"><label>Nome</label><input name="name" placeholder="Minha dieta" required></div><button class="button button-soft button-small">Criar a partir do dia</button></form>
        </section>
        <section class="card"><div class="card-head"><div><h2>Dieta de cada dia da semana</h2><p>Usada para preencher o diário</p></div></div>
          <label class="two-line" style="margin-bottom:12px"><input type="checkbox" class="checkbox" data-x="auto-diet" ${state.prefs.autoDiet ? 'checked' : ''}> Preencher o diário de hoje automaticamente ao abrir o app</label>
          <div class="form-grid">${days.map((n, i) => `<div class="field"><label>${n}</label><select data-week-day="${i}"><option value="">Dieta padrão</option><option value="none" ${state.dietWeek[i] === 'none' ? 'selected' : ''}>Nenhuma</option>${state.diets.map(x => `<option value="${x.id}" ${state.dietWeek[i] === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>`).join('')}</div>
        </section>
      </div>
      ${d ? `<section class="card"><div class="card-head"><div style="flex:1"><input class="title-input" data-x="rename-diet" value="${esc(d.name)}" aria-label="Nome da dieta"><p>${macroLine(dt)} · meta ${fmt(kcalGoal())} kcal</p></div>
          <div class="toolbar-actions">${d.id !== state.defaultDietId ? '<button class="button button-soft button-small" data-x="default-diet">Definir como padrão</button>' : ''}<button class="button button-light button-small" data-x="apply-diet-today">Aplicar hoje</button><button class="button button-light button-small" data-x="dup-diet">Duplicar</button><button class="button button-light button-small" data-x="del-diet">Excluir</button></div></div>
        ${goalBars(dt)}
        <div class="grid grid-2" style="margin-top:16px">
          <div>${foodFormHTML('diet')}
            <details class="bulk" ${ui.bulk.length ? 'open' : ''}><summary>Adicionar vários de uma vez</summary>
              <form data-x-form="bulk-parse"><div class="field"><label>Um alimento por linha (quantidade + alimento)</label><textarea name="text" rows="6" placeholder="150 g arroz cozido&#10;100 g feijão carioca cozido&#10;120 g peito de frango grelhado&#10;2 ovos cozidos&#10;1 colher de sopa de azeite&#10;1 banana prata">${esc(ui.bulkText || '')}</textarea></div>
                <div class="inline-form"><div class="field"><label>Refeição</label><select name="meal">${MEALS.map(m => `<option ${m === (ui.bulkMeal || 'Almoço') ? 'selected' : ''}>${m}</option>`).join('')}</select></div><button class="button button-soft button-small">Interpretar</button></div></form>
              ${ui.bulk.length ? `<div class="bulk-preview">${ui.bulk.map((r, i) => `<div class="bulk-row"><input type="checkbox" class="checkbox" data-bulk-on="${i}" ${r.cands.length && r.on !== false ? 'checked' : ''} ${r.cands.length ? '' : 'disabled'}><div><small class="muted">${esc(r.raw)}</small>${r.cands.length ? `<select data-bulk-pick="${i}">${r.cands.map((c, j) => `<option value="${j}" ${j === r.pick ? 'selected' : ''}>${esc(c.name)} (${esc(c.source)})</option>`).join('')}</select><small>${(() => { const it = bulkItem(r, ui.bulkMeal); return it ? `${amountLabel(it)} → ${macroLine(it)}` : ''; })()}${r.cands[r.pick]?.noData ? ' · <b>a TACO não tem valores deste alimento: adicione pelo formulário com os dados do rótulo</b>' : ''}${r.measureMissing ? ' · <b>a tabela não tem o peso dessa medida para este alimento: escreva a linha em gramas (ex.: 8 g azeite)</b>' : ''}</small>` : '<b class="small">Não encontrado — adicione pelo formulário acima.</b>'}</div></div>`).join('')}
                <div class="toolbar-actions" style="margin-top:10px"><button class="button button-primary button-small" data-x="bulk-add">Adicionar selecionados</button><button class="button button-light button-small" data-x="bulk-clear">Cancelar</button></div></div>` : ''}
            </details></div>
          <div>${d.items.length ? mealBlocks(d.items, 'diet', d.id) : empty('Dieta vazia', 'Adicione alimentos pelo formulário ou cole vários de uma vez.')}</div>
        </div></section>` : ''}
      <div class="grid grid-2">
        <section class="card"><div class="card-head"><div><h2>Lista de compras</h2><p>Gere a partir da dieta ou adicione itens</p></div><button class="button button-light button-small" data-action="clear-checked">Limpar comprados</button></div>
          ${state.diets.length ? `<form data-x-form="shop-from-diet" class="inline-form"><div class="field"><label>Dieta</label><select name="diet">${state.diets.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div><div class="field"><label>Dias</label><input name="days" type="number" min="1" max="31" value="7"></div><button class="button button-soft button-small">Gerar lista</button></form><small class="muted">Quantidades da dieta (alimento pronto). Arroz, feijão e massas rendem mais que o peso cru.</small>` : ''}
          <form id="shopForm" class="inline-form" style="margin-top:10px"><div class="field"><label>Item</label><input name="name" required placeholder="Ex.: arroz integral"></div><div class="field"><label>Quantidade</label><input name="amount" placeholder="1 pacote"></div><button class="button button-primary button-small">Adicionar</button></form>
          ${state.shopping.length ? state.shopping.map(x => `<div class="list-row"><input class="checkbox" type="checkbox" data-check-shop="${x.id}" ${x.checked ? 'checked' : ''}><div class="meal-info" style="${x.checked ? 'text-decoration:line-through;opacity:.55' : ''}"><b>${esc(x.name)}</b><small>${esc(x.amount || '')} · ${esc(x.category || 'Outros')}</small></div><button class="icon-button" data-del-shop="${x.id}" aria-label="Remover">×</button></div>`).join('') : empty('Sua lista está vazia', 'Gere pela dieta ou inclua itens.')}
        </section>
        <section class="card"><div class="card-head"><div><h2>Preferências e restrições</h2><p>Também usadas pela assistente</p></div></div>
          <form id="prefsForm" class="form-grid"><div class="field"><label>Alergias</label><input name="allergies" value="${esc(state.prefs.allergies)}" placeholder="Ex.: amendoim"></div><div class="field"><label>Alimentos preferidos</label><input name="likes" value="${esc(state.prefs.likes)}"></div><div class="field"><label>Não come / restrições</label><input name="dislikes" value="${esc(state.prefs.dislikes)}"></div><div class="field"><label>Preferência de preparo</label><input name="prep" value="${esc(state.prefs.prep)}"></div><div class="field"><label>Refeições por dia</label><input name="mealsPerDay" type="number" min="1" max="12" value="${state.prefs.mealsPerDay}"></div><div class="field"><label>Orçamento</label><input name="budget" value="${esc(state.prefs.budget)}"></div><div class="field full"><button class="button button-primary">Salvar preferências</button></div></form>
        </section>
      </div></div>`;
  }

  const SHORTCUT_GUIDE = `<details class="guide"><summary>Como criar o atalho do Apple Saúde (uma vez só, ~5 min)</summary>
    <p class="small">Apps da web não podem ler o Saúde diretamente; o app <b>Atalhos</b> do iPhone faz a ponte. Os nomes podem variar um pouco conforme a versão do iOS.</p>
    <ol class="small">
      <li>Abra o app <b>Atalhos</b> → toque em <b>+</b> e dê o nome <b>NutriFit Saúde</b>.</li>
      <li>Adicione a ação <b>Encontrar Amostras de Saúde</b>: Tipo = <b>Passos</b>; filtro <b>Data de Início</b> = <b>hoje</b>.</li>
      <li>Adicione <b>Calcular Estatísticas</b> → <b>Soma</b> das amostras de saúde.</li>
      <li>Repita os passos 2 e 3 para <b>Energia Ativa</b> e para <b>Minutos de Exercício</b> (se quiser, também <b>Distância de Caminhada + Corrida</b>).</li>
      <li>Adicione <b>Data Atual</b> e depois <b>Formatar Data</b> → Formato <b>Personalizado</b>: <code>yyyy-MM-dd</code>.</li>
      <li>Adicione <b>Texto</b> e monte exatamente assim, inserindo as variáveis (toque no campo e escolha cada resultado):<br><code>NUTRIFIT|data=[Data Formatada]|passos=[Soma 1]|ativas=[Soma 2]|exercicio=[Soma 3]|distancia=[Soma 4]</code></li>
      <li>Adicione <b>Copiar para Área de Transferência</b>.</li>
      <li>Na primeira vez, autorize o acesso ao Saúde. Depois é só rodar o atalho (pela tela de início, widget ou “E aí Siri, NutriFit Saúde”), abrir o NutriFit e tocar em <b>Colar dados do Saúde</b>.</li>
    </ol>
    <p class="small muted">Dica: rode à noite para ter o dia completo. Os treinos e as calorias de cada treino você registra no formulário ao lado.</p></details>`;

  function activityPage() {
    const date = state.activeDate || today();
    const list = state.workouts.filter(x => x.date === date);
    const h = dayHealth(date) || {};
    const a7 = stepsAverage(7), a30 = stepsAverage(30);
    const names = [...new Set(state.workouts.map(w => w.name).filter(Boolean))];
    const exNames = [...new Set(state.workouts.flatMap(w => (w.exercises || []).map(e => e.name)).filter(Boolean))];
    const prev = state.workouts.filter(x => x.date !== date).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    const wkcal = list.reduce((a, x) => a + (+x.calories || 0), 0);
    return `<div class="content">
      <div class="toolbar"><div><h2>Atividades</h2><p class="muted small">Passos e gasto do Apple Watch + seus treinos</p></div><input class="search-input" id="activeDate" type="date" value="${date}" style="width:auto"></div>
      <div class="grid grid-4">
        <div class="card stat-card"><div class="stat-label">PASSOS</div><strong>${fmt(stepsOf(date))}</strong><div class="stat-note">${a7 ? `Média 7 dias: ${fmt(a7.avg)}` : 'Sem histórico'}${a30 ? ` · 30 dias: ${fmt(a30.avg)}` : ''}</div></div>
        <div class="card stat-card"><div class="stat-label">CALORIAS ATIVAS</div><strong>${h.activeKcal != null ? fmt(h.activeKcal) : fmt(wkcal)} <small>kcal</small></strong><div class="stat-note">${h.activeKcal != null ? 'Do Apple Saúde' : 'Soma dos treinos'}</div></div>
        <div class="card stat-card"><div class="stat-label">MINUTOS DE EXERCÍCIO</div><strong>${fmt(h.exerciseMin != null ? h.exerciseMin : list.reduce((a, x) => a + (+x.duration || 0), 0))} <small>min</small></strong><div class="stat-note">${h.exerciseMin != null ? 'Do Apple Saúde' : 'Soma dos treinos'}</div></div>
        <div class="card stat-card"><div class="stat-label">TREINOS</div><strong>${list.length}</strong><div class="stat-note">${list.map(x => esc(x.name)).join(', ') || 'Nenhum neste dia'}</div></div>
      </div>
      <div class="grid grid-2">
        <section class="card"><div class="card-head"><div><h2>Apple Saúde / Apple Watch</h2><p>${h.updated ? `Atualizado ${new Date(h.updated).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'Importe pelo atalho do iPhone'}</p></div></div>
          <div class="toolbar-actions"><button class="button button-primary button-small" data-x="paste-health">📋 Colar dados do Saúde</button></div>
          <form data-x-form="health-text" style="margin-top:10px"><div class="field"><label>Ou cole aqui o texto copiado pelo atalho</label><textarea name="text" rows="2" placeholder="NUTRIFIT|data=2026-11-13|passos=8432|ativas=512|exercicio=45"></textarea></div><button class="button button-light button-small">Importar texto</button></form>
          <form data-x-form="health-manual" class="form-grid cols-3" style="margin-top:12px"><div class="field"><label>Passos</label><input name="steps" type="number" min="0" value="${h.steps ?? ''}"></div><div class="field"><label>Calorias ativas</label><input name="activeKcal" type="number" min="0" value="${h.activeKcal ?? ''}"></div><div class="field"><label>Min. exercício</label><input name="exerciseMin" type="number" min="0" value="${h.exerciseMin ?? ''}"></div><div class="field full"><button class="button button-light button-small">Salvar manualmente para ${new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</button></div></form>
          ${SHORTCUT_GUIDE}
        </section>
        <section class="card"><div class="card-head"><div><h2>Registrar treino</h2><p>Como no seu app de treinos: exercício, séries, repetições e carga</p></div></div>
          <form id="trainingForm" class="form-grid" autocomplete="off">
            <div class="field"><label>Treino</label><input name="name" list="workoutNames" required placeholder="Ex.: Treino A — Peito e tríceps"><datalist id="workoutNames">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist></div>
            <div class="field"><label>Tipo</label><select name="type">${['Musculação', 'Caminhada', 'Corrida', 'Bicicleta', 'Natação', 'Funcional', 'Esporte', 'Outra'].map(x => `<option>${x}</option>`).join('')}</select></div>
            <div class="field"><label>Duração (min)</label><input name="duration" type="number" min="0" value="60"></div>
            <div class="field"><label>Calorias (do relógio)</label><input name="calories" type="number" min="0" placeholder="Ex.: 320"></div>
            <div class="field full"><label>Exercícios</label><datalist id="exNames">${exNames.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
              <div class="ex-head small muted"><span>Exercício</span><span>Séries</span><span>Reps</span><span>Carga (kg)</span><span></span></div>
              <div id="exRows">${exRow()}${exRow()}${exRow()}</div>
              <div class="toolbar-actions" style="margin-top:8px"><button type="button" class="button button-light button-small" data-x="add-ex">＋ Exercício</button>${names.length ? '<button type="button" class="button button-soft button-small" data-x="load-last">Repetir último treino com este nome</button>' : ''}</div></div>
            <div class="field"><label>Data</label><input name="date" type="date" value="${date}"></div>
            <div class="field"><label>Observações</label><input name="notes" placeholder="Opcional"></div>
            <div class="field full"><button class="button button-primary">Salvar treino</button></div>
          </form>
        </section>
      </div>
      <section class="card"><div class="card-head"><div><h2>Treinos de ${new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}</h2><p>${prev.length ? 'Abaixo, os anteriores para comparar cargas' : ''}</p></div></div>
        ${list.length ? list.map(workoutCard).join('') : empty('Nenhum treino neste dia', 'Registre pelo formulário acima.')}
        ${prev.length ? `<h3 class="section-title" style="margin-top:18px">Treinos anteriores</h3>${prev.map(workoutCard).join('')}` : ''}
      </section>
      <div class="notice orange"><span>ⓘ</span><div>${state.goal.exerciseCalories ? 'As calorias ativas (do Saúde ou, se não houver, dos treinos) são somadas à meta de calorias do dia.' : 'As calorias de exercício só entram na meta de calorias se você ativar a opção em Configurações.'}</div></div>
    </div>`;
  }
  function exRow(e = {}) {
    return `<div class="ex-row"><input name="ex_name" list="exNames" placeholder="Ex.: Supino reto" value="${esc(e.name || '')}" data-ex-name><input name="ex_sets" type="number" min="0" placeholder="4" value="${esc(e.sets ?? '')}"><input name="ex_reps" placeholder="10" value="${esc(e.reps ?? '')}"><input name="ex_weight" type="number" step="any" min="0" placeholder="40" value="${esc(e.weight ?? '')}"><button type="button" class="icon-button" data-x="del-ex" aria-label="Remover exercício">×</button><small class="ex-hint"></small></div>`;
  }
  function workoutCard(w) {
    const vol = (w.exercises || []).reduce((a, e) => a + (+e.sets || 0) * (parseInt(e.reps) || 0) * (+e.weight || 0), 0);
    return `<div class="list-row workout"><div class="meal-icon">⌁</div><div class="meal-info"><b>${esc(w.name)} <span class="muted small">· ${esc(w.type || '')} · ${new Date(w.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span></b>
      <small>${fmt(w.duration)} min${w.calories ? ` · ${fmt(w.calories)} kcal` : ''}${vol ? ` · volume ${fmt(vol)} kg` : ''}${w.notes ? ' · ' + esc(w.notes) : ''}${w.steps ? ` · ${fmt(w.steps)} passos` : ''}</small>
      ${(w.exercises || []).length ? `<ul class="ex-list">${w.exercises.map(e => `<li>${esc(e.name)} — ${esc(e.sets || '?')}×${esc(e.reps || '?')}${e.weight ? ` × ${fmtNum(e.weight)} kg` : ''}</li>`).join('')}</ul>` : w.exercise ? `<small>${esc(w.exercise)} ${esc(w.sets || '')}</small>` : ''}</div>
      <button class="icon-button" data-del-workout="${w.id}" aria-label="Excluir treino">×</button></div>`;
  }

  const MEASURE_TIPS = {
    weight: ['Peso (kg)', 'Ao acordar, após urinar, em jejum, com pouca roupa, na mesma balança.'],
    bodyFat: ['Gordura corporal (%)', 'Mesmo aparelho (bioimpedância) e mesmas condições: manhã, jejum, sem treinar antes.'],
    muscle: ['Massa muscular (kg)', 'Mesmo aparelho e condições da gordura corporal.'],
    neck: ['Pescoço (cm)', 'Logo abaixo do “pomo de Adão”, olhando para frente, ombros relaxados.'],
    chest: ['Peito (cm)', 'Na linha dos mamilos, braços soltos, ao fim de uma expiração normal.'],
    waist: ['Cintura (cm)', 'Ponto médio entre a última costela e o osso do quadril, ao fim da expiração, sem encolher a barriga.'],
    abdomen: ['Abdômen (cm)', 'Na altura do umbigo, ao fim da expiração, abdômen relaxado.'],
    hip: ['Quadril (cm)', 'Maior volume dos glúteos, pés juntos.'],
    arm: ['Braço (cm)', 'Ponto médio entre o ombro e o cotovelo, braço relaxado ao lado do corpo. Sempre o mesmo lado.'],
    thigh: ['Coxa (cm)', 'Ponto médio entre a virilha e o topo do joelho, em pé, peso nas duas pernas. Mesmo lado.'],
    calf: ['Panturrilha (cm)', 'Maior volume da panturrilha, em pé, peso nas duas pernas. Mesmo lado.']
  };
  function bodyPage() {
    const rows = state.body.slice().sort((a, b) => b.date.localeCompare(a.date));
    const recent = rows.filter(x => x.weight).slice(0, 8).reverse();
    const max = Math.max(...recent.map(y => +y.weight || 0), 1), min = Math.min(...recent.map(y => +y.weight || max));
    const base = Math.max(0, min - (max - min) * 0.6 - 1);
    const fields = Object.keys(MEASURE_TIPS);
    const last = rows[0];
    return `<div class="content">
      <section class="card guide-card"><details class="guide" ${state.body.length ? '' : 'open'}><summary><b>Como medir do mesmo jeito sempre</b> <span class="muted small">(toque para ${state.body.length ? 'ver' : 'esconder'})</span></summary>
        <div class="grid grid-2" style="margin-top:12px"><div><h3 class="section-title">Regras gerais</h3><ul class="small">
          <li>Meça no <b>mesmo horário</b>, de preferência ao acordar, em jejum e após ir ao banheiro.</li>
          <li>Use <b>fita métrica flexível</b> que não estica, direto na pele, <b>rente sem apertar</b> e paralela ao chão.</li>
          <li>Fique em pé, relaxado, respirando normal. Meça ao <b>fim de uma expiração</b> (sem prender o ar nem encolher a barriga).</li>
          <li>Meça <b>2 vezes</b> cada ponto e anote a média. Se passar de 1 cm de diferença, meça uma terceira vez.</li>
          <li>Braço, coxa e panturrilha: escolha <b>um lado</b> (ex.: direito) e use sempre o mesmo.</li>
          <li>Se possível, a mesma pessoa mede sempre. Evite medir logo após treinar (o “pump” aumenta as medidas).</li>
          <li>Frequência sugerida: peso 1×/semana (ou diário, olhando a média); medidas a cada 2–4 semanas.</li>
          <li>Foto: mesma luz, mesmo lugar, mesma distância e poses (frente, lado e costas).</li></ul></div>
          <div><h3 class="section-title">Cada medida</h3><ul class="small">${fields.map(k => `<li><b>${MEASURE_TIPS[k][0].replace(/ \(.*/, '')}:</b> ${MEASURE_TIPS[k][1]}</li>`).join('')}</ul></div></div>
      </details></section>
      <div class="grid grid-2"><section class="card"><div class="card-head"><div><h2>Registrar evolução</h2><p>Preencha só o que mediu hoje</p></div></div>
        <form id="bodyForm" class="form-grid cols-3"><div class="field"><label>Data</label><input name="date" type="date" value="${today()}"></div>
          ${fields.map(k => `<div class="field"><label>${MEASURE_TIPS[k][0]}</label><input name="${k}" type="number" step="any" min="0" placeholder="${last && last[k] ? esc(last[k]) : ''}"><small class="muted">${MEASURE_TIPS[k][1]}</small></div>`).join('')}
          <div class="field full"><label>Foto de progresso (opcional)</label><input name="photo" type="file" accept="image/*"><small>A foto é reduzida e fica só neste aparelho.</small></div>
          <div class="field full"><button class="button button-primary">Salvar medidas</button></div></form></section>
        <section class="card"><div class="card-head"><div><h2>Seu histórico</h2><p>Os números em cinza no formulário são da última medição</p></div></div>
          ${recent.length ? `<div class="chart">${recent.map((x, i) => `<div class="chart-col"><em>${esc(x.weight)} kg</em><div class="chart-bar ${i === recent.length - 1 ? 'current' : ''}" style="height:${Math.max(6, ((+x.weight - base) / (max - base)) * 100)}%"></div><small>${new Date(x.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</small></div>`).join('')}</div>` : ''}
          ${rows.length ? `<div style="margin-top:20px">${rows.slice(0, 8).map((x, i) => { const prevRow = rows[i + 1]; return `<div class="list-row">${thumb(x.photo)}<div class="meal-info"><b>${new Date(x.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}</b><small>${fields.filter(k => x[k]).map(k => { const dlt = prevRow && prevRow[k] ? (+x[k] - +prevRow[k]) : null; return `${MEASURE_TIPS[k][0].replace(/ \(.*/, '')} ${esc(x[k])}${dlt ? ` <span class="${dlt > 0 ? 'up' : 'down'}">(${dlt > 0 ? '+' : ''}${fmtNum(dlt)})</span>` : ''}`; }).join(' · ') || 'Só foto'}</small></div><button class="icon-button" data-del-body="${x.id}" aria-label="Excluir medição">×</button></div>`; }).join('')}</div>` : empty('Ainda sem medições', 'Registre seu peso ou uma circunferência para acompanhar as mudanças.')}
        </section></div></div>`;
  }

  function assistantPage() {
    const ai = window.NutriAI;
    const on = ai?.isConfigured();
    const model = on ? ai.MODELS.find(m => m[0] === ai.getConfig().model)?.[1].split(' —')[0] : '';
    const msgs = state.chats.length ? state.chats : [{ who: 'bot', text: on ? 'Olá! Pode perguntar o que quiser sobre sua alimentação, treinos e metas. Eu vejo seus registros para responder.' : 'Olá! No modo básico eu respondo sobre seus registros (calorias, proteínas, água, passos, peso e semana). Para conversar de verdade e reconhecer fotos, ative a IA em Configurações.' }];
    const prompts = ['O que posso comer para bater minha proteína hoje?', 'Monte um jantar com o que falta das minhas metas', 'Como foi minha alimentação nesta semana?', 'Como está minha média de passos?', 'Quanto ainda preciso comer hoje?'];
    return `<div class="content">
      ${on ? '' : `<div class="notice orange"><span>✳</span><div><b>Modo básico</b> — para respostas completas e análise de fotos, conecte a IA em <a href="#configuracoes" data-go="configuracoes">Configurações → Inteligência artificial</a>.</div></div>`}
      <div class="grid grid-2"><section class="card assistant-box"><div class="card-head"><div><h2>Assistente NutriFit</h2><p>${on ? 'Usa seus registros como contexto' : 'Respostas a partir dos seus registros'}</p></div><span class="tag">${on ? 'IA: ' + esc(model) : 'Modo básico'}</span></div>
        <div class="chat-log" id="chatLog">${msgs.map(x => `<div class="bubble ${x.who === 'user' ? 'user' : ''}">${x.who === 'user' ? esc(x.text) : richText(x.text)}</div>`).join('')}${ui.thinking ? '<div class="bubble typing">Pensando…</div>' : ''}</div>
        <form id="chatForm" class="chat-form"><input name="message" placeholder="Pergunte algo…" required ${ui.thinking ? 'disabled' : ''}><button class="button button-primary" ${ui.thinking ? 'disabled' : ''}>Enviar</button></form>
        <div class="chips" style="margin-top:12px">${prompts.map(p => `<button class="chip" data-prompt="${esc(p)}">${esc(p)}</button>`).join('')}</div>
        ${state.chats.length ? '<button class="button button-light button-small" data-x="clear-chat" style="margin-top:10px">Limpar conversa</button>' : ''}</section>
        <section class="card"><div class="card-head"><div><h2>Hoje</h2><p>Síntese do diário</p></div></div>
          ${goalBars(totals(dayMeals()))}
          <div class="list-row"><div class="meal-icon">💧</div><div class="meal-info"><b>${fmt(dayWater())} de ${fmt(waterTarget())} ml de água</b></div></div>
          <div class="list-row"><div class="meal-icon">⌁</div><div class="meal-info"><b>${fmt(stepsOf(state.activeDate || today()))} passos</b><small>${(() => { const a = stepsAverage(7); return a ? `Média de 7 dias: ${fmt(a.avg)}` : 'Importe do Apple Saúde em Atividades'; })()}</small></div></div>
          <p class="small muted" style="margin-top:16px">A assistente não substitui nutricionista ou médico. ${on ? 'Ao perguntar, um resumo dos seus registros é enviado à Anthropic (empresa do Claude) para gerar a resposta.' : ''}</p></section></div></div>`;
  }
  function richText(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  }
  // Resumo dos dados enviado à IA junto com a pergunta.
  function aiContext() {
    const d = state.activeDate || today();
    const p = state.profile, m = macroTarget();
    const day = dayMeals();
    const lines = [];
    lines.push(`Data de hoje: ${today()} (${new Date().toLocaleDateString('pt-BR', { weekday: 'long' })}). Dia aberto no app: ${d}.`);
    lines.push(`Perfil: ${p.name || 'sem nome'}, ${p.age || '?'} anos, sexo ${p.sex || '?'}, ${p.height || '?'} cm, ${p.weight || '?'} kg, meta de peso ${p.targetWeight || '?'} kg, objetivo ${p.goal}, atividade ${p.activity}, treino ${p.training || '?'}.`);
    lines.push(`Metas diárias: ${fmt(kcalGoal())} kcal${state.goal.exerciseCalories ? ' (inclui exercício)' : ''}, proteína ${m.p} g, carboidratos ${m.c} g, gorduras ${m.f} g, água ${waterTarget()} ml.`);
    lines.push(`Preferências: alergias ${state.prefs.allergies || 'nenhuma'}; gosta de ${state.prefs.likes || '-'}; não come ${state.prefs.dislikes || '-'}.`);
    lines.push(`Diário de ${d}: ${day.length ? '' : 'nada registrado.'}`);
    MEALS.forEach(meal => { const r = day.filter(x => x.meal === meal); if (r.length) lines.push(`- ${meal}: ${r.map(x => `${x.name} ${fmtNum(x.amount)} ${x.unit || ''} (${fmt(x.kcal)} kcal, ${fmtNum(x.protein)}P ${fmtNum(x.carbs)}C ${fmtNum(x.fat)}G)`).join('; ')}`); });
    const t = totals(day);
    lines.push(`Total do dia: ${macroLine(t)}, fibras ${fmt(t.fiber)} g, sódio ${fmt(t.sodium)} mg. Água: ${dayWater()} ml.`);
    const h = dayHealth(d); const a7 = stepsAverage(7), a30 = stepsAverage(30);
    lines.push(`Atividade em ${d}: ${fmt(stepsOf(d))} passos${h?.activeKcal != null ? `, ${h.activeKcal} kcal ativas` : ''}${h?.exerciseMin != null ? `, ${h.exerciseMin} min de exercício` : ''}. Média de passos 7 dias: ${a7 ? fmt(a7.avg) : '-'}; 30 dias: ${a30 ? fmt(a30.avg) : '-'}.`);
    const ws = state.workouts.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    if (ws.length) lines.push('Treinos recentes:\n' + ws.map(w => `- ${w.date} ${w.name} (${w.type || ''}, ${w.duration || '?'} min${w.calories ? ', ' + w.calories + ' kcal' : ''}): ${(w.exercises || []).map(e => `${e.name} ${e.sets}x${e.reps}${e.weight ? 'x' + e.weight + 'kg' : ''}`).join(', ')}`).join('\n'));
    const week = [];
    for (let i = 6; i >= 0; i--) { const dd = new Date(); dd.setDate(dd.getDate() - i); const iso = localISO(dd); const r = state.meals.filter(x => x.date === iso); if (r.length) week.push(`${iso}: ${macroLine(totals(r))}`); }
    if (week.length) lines.push('Últimos 7 dias (dias com registro):\n' + week.join('\n'));
    const bw = state.body.filter(x => x.weight).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    if (bw.length) lines.push('Peso recente: ' + bw.map(x => `${x.date} ${x.weight} kg${x.waist ? ', cintura ' + x.waist + ' cm' : ''}`).join('; '));
    const dd = dietForDate(today());
    if (dd) lines.push(`Dieta pré-definida de hoje (“${dd.name}”): ${dd.items.map(x => `${x.meal}: ${x.name} ${fmtNum(x.amount)} ${x.unit}`).join('; ')}`);
    return lines.join('\n');
  }
  function localAnswer(q) {
    const t = norm(q), m = macroTarget(), day = totals(dayMeals());
    if (t.includes('passo')) { const a7 = stepsAverage(7), a30 = stepsAverage(30); return `Hoje: ${fmt(stepsOf(state.activeDate || today()))} passos. Média de 7 dias: ${a7 ? fmt(a7.avg) : 'sem dados'}; de 30 dias: ${a30 ? fmt(a30.avg) : 'sem dados'}.`; }
    if (t.includes('peso') || t.includes('evolu')) { const bw = state.body.filter(x => x.weight).sort((a, b) => a.date.localeCompare(b.date)); return bw.length ? `Último peso: ${bw.at(-1).weight} kg (${bw.at(-1).date}).${bw.length > 1 ? ` Variação desde ${bw[0].date}: ${fmtNum(bw.at(-1).weight - bw[0].weight)} kg.` : ''}` : 'Ainda não há pesos registrados em Evolução.'; }
    if (t.includes('treino')) { const w = state.workouts.slice().sort((a, b) => b.date.localeCompare(a.date))[0]; return w ? `Último treino: ${w.name} em ${w.date}${w.calories ? `, ${w.calories} kcal` : ''}.` : 'Nenhum treino registrado ainda.'; }
    if ((t.includes('comer') || t.includes('bater') || t.includes('sugest')) && t.includes('prote')) {
      const falta = Math.max(0, m.p - day.protein);
      const opts = ['Frango, peito, sem pele, grelhado', 'Ovo, de galinha, inteiro, cozido/10minutos', 'Atum, conserva em óleo', 'Iogurte, natural, desnatado', 'Queijo, minas, frescal'].map(n => tacoFoods().find(f => f.name === n)).filter(Boolean);
      return `Faltam ${fmt(falta)} g de proteína. Opções da TACO (por 100 g): ${opts.map(f => `${f.name}: ${fmtNum(f.per.protein)} g de proteína, ${fmt(f.per.kcal)} kcal`).join('; ')}. Para sugestões montadas, ative a IA em Configurações.`;
    }
    return chatbotAnswer(q);
  }

  function render() {
    maybeAutoDiet();
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
          const form = document.querySelector('[data-food-form="diary"]');
          if (!form) return;
          const words = phrase.match(/(?:comi|consumi|tomei)\s+(.+?)(?:\s+no\s+(café da manhã|almoço|jantar|lanche|ceia))?\.?$/i);
          const what = (words ? words[1] : phrase).replace(/^(\d+(?:[,.]\d+)?)\s*(g|gramas|ml|mililitros)\s*(de\s+)?/i, '');
          form.q.value = what;
          formSel.diary = null;
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
          renderPicker(form.q);
          form.q.focus();
          notify('Escolha o alimento na lista e confira a quantidade.');
          form.scrollIntoView({
            behavior: 'smooth'
          })
        };
        rec.onerror = () => notify('Não foi possível reconhecer a fala');
        rec.start();
        notify('Ouvindo… fale o alimento e a quantidade');
        return
      }
      if (a === 'photo') { startPhoto(); return }
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
      if (x) addFood(recalc({
        name: x.name, meal: document.querySelector('[data-food-form="diary"] [name=meal]')?.value || 'Lanches', amount: 1, unit: 'porção', basis: 'unit', unitGrams: null,
        per: { kcal: x.kcal, protein: x.protein, carbs: x.carbs, fat: x.fat, fiber: 0, sodium: 0 }, source: 'Receita'
      }));
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
      if (q) handleChat(q);
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
  async function barcodeLookup(code) {
    if (!code) return;
    const form = document.querySelector('[data-food-form="diary"]');
    notify('Buscando o código ' + code + '…');
    try {
      const food = await offBarcode(code);
      if (!food) { notify('Produto não encontrado no Open Food Facts. Informe os valores do rótulo.'); if (form) { form.q.value = ''; form.querySelector('details.manual').open = true; } return; }
      if (form) { selectFood(form, food); form.amount.focus(); notify('Produto encontrado: ' + food.name); }
    } catch {
      notify('O Open Food Facts não respondeu. Tente de novo em instantes.');
    }
  }
  function startBarcode() {
    if (!('BarcodeDetector'in window)) {
      notify('Leitura pela câmera indisponível neste navegador. Pesquise o código do produto.');
      const q = prompt('Digite o código de barras (números abaixo das barras)');
      if (q) barcodeLookup(q.replace(/\D/g, ''));
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
              barcodeLookup(code);
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
  /* ===================== NutriFit 1.2: eventos ===================== */
  let pickerTimer = null;
  document.addEventListener('input', e => {
    const inp = e.target.closest('[data-picker]');
    if (inp) {
      const form = inp.form;
      if (formSel[inp.dataset.picker] && norm(formSel[inp.dataset.picker].name) !== norm(inp.value)) formSel[inp.dataset.picker] = null;
      clearTimeout(pickerTimer);
      pickerTimer = setTimeout(() => renderPicker(inp), 120);
      if (form) updatePreview(form);
      return;
    }
    const ff = e.target.closest('[data-food-form]');
    if (ff && e.target.name !== 'q') updatePreview(ff);
  });
  document.addEventListener('focusin', e => {
    const inp = e.target.closest('[data-picker]');
    if (inp && inp.value.trim().length >= 2 && !formSel[inp.dataset.picker]) renderPicker(inp);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePickers();
    const inp = e.target.closest('[data-picker]');
    if (inp && e.key === 'Enter') {
      const first = pickerResults[inp.dataset.picker]?.[0];
      const list = inp.parentElement.querySelector('.picker-list');
      if (!list.hidden && first && !formSel[inp.dataset.picker]) { e.preventDefault(); selectFood(inp.form, first); }
    }
  });

  document.addEventListener('change', e => {
    const el = e.target;
    if (el.closest('[data-food-form]') && el.name === 'unit') { updatePreview(el.form); return; }
    if (el.dataset.qty) {
      const it = state.meals.find(x => x.id === el.dataset.qty);
      if (it) { setItemAmount(it, num(el.value)); save(); render(); }
      return;
    }
    if (el.dataset.dietQty) {
      const [did, iid] = el.dataset.dietQty.split(':');
      const it = dietById(did)?.items.find(x => x.id === iid);
      if (it) { setItemAmount(it, num(el.value)); save(); render(); }
      return;
    }
    if (el.dataset.weekDay != null) { state.dietWeek[el.dataset.weekDay] = el.value; save(); notify('Semana atualizada'); return; }
    if (el.dataset.x === 'auto-diet') { state.prefs.autoDiet = el.checked; if (el.checked) delete state.dietApplied[today()]; save(); if (el.checked) maybeAutoDiet(); notify(el.checked ? 'O diário de hoje será preenchido com a dieta' : 'Preenchimento automático desligado'); return; }
    if (el.dataset.x === 'rename-diet') { const d = dietById(ui.dietId); if (d && el.value.trim()) { d.name = el.value.trim(); save(); render(); } return; }
    if (el.dataset.bulkPick != null) { ui.bulk[+el.dataset.bulkPick].pick = +el.value; render(); return; }
    if (el.dataset.bulkOn != null) { ui.bulk[+el.dataset.bulkOn].on = el.checked; return; }
    if (el.matches('[data-ex-name]')) {
      const hint = el.parentElement.querySelector('.ex-hint');
      const last = state.workouts.slice().sort((a, b) => b.date.localeCompare(a.date)).flatMap(w => (w.exercises || []).map(x => ({ ...x, date: w.date }))).find(x => norm(x.name) === norm(el.value));
      if (hint) hint.textContent = last ? `Última vez (${last.date.slice(8)}/${last.date.slice(5, 7)}): ${last.sets}×${last.reps}${last.weight ? ' × ' + last.weight + ' kg' : ''}` : '';
    }
  });

  document.addEventListener('click', async e => {
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const food = pickerResults[pick.dataset.pick]?.[+pick.dataset.idx];
      const form = document.querySelector(`[data-food-form="${pick.dataset.pick}"]`);
      if (food && form) selectFood(form, food);
      return;
    }
    const offBtn = e.target.closest('[data-off-search]');
    if (offBtn) {
      const id = offBtn.dataset.offSearch;
      const inp = document.querySelector(`[data-picker="${id}"]`);
      renderPicker(inp, [], 'Buscando produtos no Open Food Facts…');
      try {
        const res = await offSearch(inp.value.trim());
        renderPicker(inp, res, res.length ? '' : 'Nenhum produto com tabela nutricional encontrado. Tente o nome da marca ou o código de barras.');
      } catch {
        renderPicker(inp, [], 'O Open Food Facts não respondeu agora (o serviço fica instável às vezes). Use a base TACO, o código de barras ou os valores do rótulo.');
      }
      return;
    }
    if (!e.target.closest('.picker')) closePickers();

    const quick = e.target.closest('[data-quick-food]');
    if (quick) {
      const form = document.querySelector('[data-food-form="diary"]');
      const food = searchFoods(quick.dataset.quickFood, 1)[0];
      if (form && food) { selectFood(form, food); form.amount.focus(); }
      return;
    }
    const delDiet = e.target.closest('[data-diet-del]');
    if (delDiet) {
      const [did, iid] = delDiet.dataset.dietDel.split(':');
      const d = dietById(did);
      if (d) { d.items = d.items.filter(x => x.id !== iid); save(); render(); }
      return;
    }
    const x = e.target.closest('[data-x]');
    if (!x || x.tagName === 'INPUT' || x.tagName === 'SELECT') return;
    const act = x.dataset.x;
    const d = dietById(ui.dietId);
    if (act === 'apply-diet') {
      const diet = dietById($('#applyDietSel')?.value);
      const date = state.activeDate || today();
      const n = applyDiet(diet, date, dayMeals().length > 0);
      save(); render(); notify(n ? `${n} itens da dieta adicionados` : 'Todos os itens da dieta já estão no dia');
    } else if (act === 'open-diet') { ui.dietId = x.dataset.id; ui.bulk = []; render(); }
    else if (act === 'default-diet' && d) { state.defaultDietId = d.id; save(); render(); notify('Dieta padrão definida'); }
    else if (act === 'apply-diet-today' && d) { const n = applyDiet(d, today(), state.meals.some(m => m.date === today())); save(); notify(`${n} itens adicionados ao diário de hoje`); }
    else if (act === 'dup-diet' && d) { const c = { ...cloneItem(d), id: uid(), name: d.name + ' (cópia)' }; c.items.forEach(i => i.id = uid()); state.diets.push(c); ui.dietId = c.id; save(); render(); }
    else if (act === 'del-diet' && d && confirm(`Excluir a dieta “${d.name}”?`)) { state.diets = state.diets.filter(y => y.id !== d.id); if (state.defaultDietId === d.id) state.defaultDietId = state.diets[0]?.id || null; Object.keys(state.dietWeek).forEach(k => { if (state.dietWeek[k] === d.id) state.dietWeek[k] = ''; }); ui.dietId = null; save(); render(); }
    else if (act === 'bulk-add' && d) {
      const items = ui.bulk.filter(r => r.on !== false && r.cands.length && !r.cands[r.pick]?.noData).map(r => bulkItem(r, ui.bulkMeal)).filter(Boolean);
      items.forEach(it => d.items.push({ ...it, id: uid() }));
      ui.bulk = []; ui.bulkText = ''; save(); render(); notify(`${items.length} itens adicionados à dieta`);
    } else if (act === 'bulk-clear') { ui.bulk = []; render(); }
    else if (act === 'photo') startPhoto();
    else if (act === 'drop-photo') { ui.pendingPhoto = null; render(); }
    else if (act === 'paste-health') {
      try {
        const text = await navigator.clipboard.readText();
        const recs = importHealth(text);
        if (!recs.length) { notify('A área de transferência não tem dados do atalho. Rode o atalho “NutriFit Saúde” primeiro.'); return; }
        save(); render(); notify(`Saúde importado: ${recs.map(r => `${fmt(r.steps)} passos`).join(', ')}`);
      } catch { notify('Não consegui ler a área de transferência. Cole o texto no campo abaixo.'); }
    } else if (act === 'add-ex') { $('#exRows').insertAdjacentHTML('beforeend', exRow()); }
    else if (act === 'del-ex') { x.closest('.ex-row').remove(); }
    else if (act === 'load-last') {
      const name = $('#trainingForm').name.value.trim();
      const last = state.workouts.filter(w => !name || norm(w.name) === norm(name)).sort((a, b) => b.date.localeCompare(a.date))[0];
      if (!last) { notify(name ? 'Nenhum treino anterior com esse nome' : 'Digite o nome do treino primeiro'); return; }
      const f = $('#trainingForm');
      f.name.value = last.name; f.type.value = last.type || 'Musculação'; f.duration.value = last.duration || '';
      $('#exRows').innerHTML = (last.exercises || []).map(exRow).join('') || exRow();
      f.querySelectorAll('[data-ex-name]').forEach(i => i.dispatchEvent(new Event('change', { bubbles: true })));
      notify('Treino anterior carregado: ajuste cargas e repetições');
    } else if (act === 'clear-chat') { state.chats = []; save(); render(); }
    else if (act === 'ai-save') {
      const key = $('#aiKey').value.trim(), model = $('#aiModel').value;
      if (key && !/^sk-ant-/.test(key)) { notify('A chave deve começar com “sk-ant-”'); return; }
      window.NutriAI.setConfig({ ...(key ? { key } : {}), model }); render(); notify('Configuração da IA salva');
    } else if (act === 'ai-test') {
      x.disabled = true; x.textContent = 'Testando…';
      try { await window.NutriAI.testConnection(); notify('Conexão com a IA funcionando ✓'); }
      catch (err) { notify(err.message); }
      finally { render(); }
    } else if (act === 'ai-remove' && confirm('Remover a chave da IA deste aparelho?')) { window.NutriAI.clearConfig(); render(); notify('Chave removida'); }
    else if (act === 'photo-add') addPhotoItems();
    else if (act === 'photo-close') closePhotoDialog(false, !!x.dataset.keep);
  });

  document.addEventListener('submit', async e => {
    const f = e.target;
    if (f.dataset.foodForm) {
      e.preventDefault();
      const id = f.dataset.foodForm;
      if (!f.q.value.trim()) return;
      const it = itemFromForm(f, id);
      if (!(it.amount > 0)) { notify('Informe a quantidade'); return; }
      if (!NUTR.some(k => it.per[k])) { notify('Sem valores nutricionais: escolha um alimento da lista ou preencha os valores'); f.querySelector('details.manual').open = true; return; }
      if (id === 'diary') {
        if (ui.pendingPhoto) { it.photo = ui.pendingPhoto; ui.pendingPhoto = null; }
        state.meals.push({ ...it, id: uid(), date: state.activeDate || today(), created: new Date().toISOString() });
      } else {
        const d = dietById(ui.dietId);
        if (!d) return;
        d.items.push({ ...it, id: uid() });
      }
      formSel[id] = null;
      const meal = it.meal;
      if (save()) notify(`${it.name} adicionado (${fmt(it.kcal)} kcal)`);
      render();
      const nf = document.querySelector(`[data-food-form="${id}"]`);
      if (nf) { nf.meal.value = meal; nf.q.focus(); }
      return;
    }
    const xf = f.dataset.xForm;
    if (!xf) return;
    e.preventDefault();
    const fd = new FormData(f);
    if (xf === 'new-diet') {
      const d = { id: uid(), name: fd.get('name').trim(), items: [] };
      state.diets.push(d); if (!state.defaultDietId) state.defaultDietId = d.id; ui.dietId = d.id; save(); render();
    } else if (xf === 'diet-from-day') {
      const rows = state.meals.filter(m => m.date === fd.get('date'));
      if (!rows.length) { notify('Esse dia não tem registros'); return; }
      const d = { id: uid(), name: fd.get('name').trim(), items: rows.map(r => { const c = cloneItem(r); delete c.date; delete c.created; delete c.photo; delete c.fromDiet; c.id = uid(); return c; }) };
      state.diets.push(d); if (!state.defaultDietId) state.defaultDietId = d.id; ui.dietId = d.id; save(); render(); notify(`Dieta criada com ${d.items.length} itens`);
    } else if (xf === 'bulk-parse') {
      ui.bulkText = fd.get('text'); ui.bulkMeal = fd.get('meal'); ui.bulk = parseBulk(ui.bulkText); render();
      if (!ui.bulk.length) notify('Escreva um alimento por linha');
    } else if (xf === 'shop-from-diet') {
      const d = dietById(fd.get('diet')), days = Math.max(1, +fd.get('days') || 7);
      const agg = {};
      d.items.forEach(it => { const k = norm(it.name); const a = agg[k] || (agg[k] = { name: it.name, g: 0, un: 0, unit: it.unit }); if (it.basis === 'unit') a.un += +it.amount; else a.g += +(it.grams || it.amount); });
      Object.values(agg).forEach(a => state.shopping.push({ id: uid(), name: a.name, amount: a.g ? (a.g * days >= 1000 ? `${fmtNum(a.g * days / 1000)} kg` : `${fmt(a.g * days)} g`) : `${fmtNum(a.un * days)} ${a.unit === 'un' ? 'un.' : a.unit}`, category: `Dieta · ${days} dias`, checked: false }));
      save(); render(); notify(`${Object.keys(agg).length} itens na lista`);
    } else if (xf === 'health-text') {
      const recs = importHealth(fd.get('text'));
      if (!recs.length) { notify('Texto não reconhecido. Ele deve começar com NUTRIFIT|'); return; }
      save(); render(); notify(`${recs.length} dia(s) importado(s) do Saúde`);
    } else if (xf === 'health-manual') {
      const date = state.activeDate || today();
      const rec = { ...(state.health[date] || {}), date, source: 'manual', updated: new Date().toISOString() };
      ['steps', 'activeKcal', 'exerciseMin'].forEach(k => { const v = fd.get(k); if (v !== '') rec[k] = +v; else delete rec[k]; });
      state.health[date] = rec; save(); render(); notify('Atividade do dia salva');
    }
  });

  // Formulário de treino (exercícios em linhas).
  document.addEventListener('submit', e => {
    const f = e.target;
    if (f.id !== 'trainingForm') return;
    e.preventDefault();
    const fd = new FormData(f);
    const ns = fd.getAll('ex_name'), ss = fd.getAll('ex_sets'), rs = fd.getAll('ex_reps'), ws = fd.getAll('ex_weight');
    const exercises = ns.map((n, i) => ({ name: n.trim(), sets: ss[i] ? +ss[i] : '', reps: rs[i].trim(), weight: ws[i] ? num(ws[i]) : '' })).filter(x => x.name);
    state.workouts.push({ id: uid(), name: fd.get('name').trim(), type: fd.get('type'), duration: +fd.get('duration') || 0, calories: +fd.get('calories') || 0, date: fd.get('date') || today(), notes: fd.get('notes'), exercises });
    save(); render(); notify('Treino salvo');
  });

  // ---------- Foto do prato ----------
  function startPhoto() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.style.display = 'none';
    document.body.append(input); // no iPhone, o campo precisa estar na página para o evento disparar
    input.addEventListener('change', async () => {
      const file = input.files[0];
      input.remove();
      if (!file) return;
      let small, forAi;
      try {
        small = await compressImage(file, 800, 0.7);
        forAi = await compressImage(file, 1280, 0.8);
      } catch { notify('Não foi possível ler a imagem'); return; }
      if (!window.NutriAI?.isConfigured()) {
        ui.pendingPhoto = small;
        render();
        notify('Foto anexada. Para reconhecer os alimentos automaticamente, ative a IA em Configurações.');
        document.querySelector('[data-food-form="diary"] [name=q]')?.focus();
        return;
      }
      openPhotoDialog(small, forAi);
    });
    input.click();
  }
  let photoState = null;
  function openPhotoDialog(small, forAi) {
    photoState = { small, items: [], comment: '', loading: true, meal: guessMeal() };
    let dlg = $('#photoDialog');
    if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'photoDialog'; document.body.append(dlg); }
    renderPhotoDialog();
    dlg.showModal();
    const hint = '';
    window.NutriAI.analyzePhoto(forAi.split(',')[1], hint).then(res => {
      photoState.loading = false;
      photoState.comment = res.comment;
      photoState.items = res.items.map(r => {
        const taco = r.taco_name ? tacoFoods().find(f => f.name === r.taco_name) : null;
        const per = taco ? { ...taco.per } : { kcal: r.kcal_100g, protein: r.protein_100g, carbs: r.carbs_100g, fat: r.fat_100g, fiber: r.fiber_100g, sodium: 0 };
        return recalc({ name: taco ? taco.name : r.name, label: r.name, amount: Math.round(r.grams), unit: 'g', unitGrams: 1, basis: '100g', per, tacoId: taco?.tacoId || null, measures: taco?.measures?.length ? taco.measures : null, source: taco ? 'Foto · IA + TACO' : 'Foto · estimativa da IA', confidence: r.confidence, on: true });
      });
      renderPhotoDialog();
    }).catch(err => { photoState.loading = false; photoState.error = err.message; renderPhotoDialog(); });
  }
  function guessMeal() {
    const h = new Date().getHours();
    return h < 10 ? 'Café da manhã' : h < 15 ? 'Almoço' : h < 18 ? 'Lanches' : h < 22 ? 'Jantar' : 'Ceia';
  }
  function renderPhotoDialog() {
    const dlg = $('#photoDialog');
    if (!dlg || !photoState) return;
    const p = photoState;
    const t = totals(p.items.filter(i => i.on));
    dlg.innerHTML = `<div class="dialog-card photo-card"><div class="dialog-head"><div><span class="eyebrow">FOTO DO PRATO</span><h2>${p.loading ? 'Analisando…' : p.error ? 'Não deu certo' : 'Confira os alimentos'}</h2></div><button class="icon-button" data-x="photo-close" aria-label="Fechar">×</button></div>
      <img src="${p.small}" alt="Foto da refeição" class="photo-preview">
      ${p.loading ? '<p class="small muted">A IA está identificando os alimentos e estimando as porções. Leva alguns segundos.</p>' : ''}
      ${p.error ? `<div class="notice orange">${esc(p.error)}</div><p class="small">Você pode registrar manualmente: a foto ficará anexada ao próximo alimento.</p><button class="button button-soft" data-x="photo-close" data-keep="1">Registrar manualmente</button>` : ''}
      ${!p.loading && !p.error ? `${p.comment ? `<p class="small muted">${esc(p.comment)}</p>` : ''}
        ${p.items.length ? `<div class="photo-items">${p.items.map((it, i) => `<div class="photo-item"><input type="checkbox" class="checkbox" data-photo-on="${i}" ${it.on ? 'checked' : ''}><div class="meal-info"><b>${esc(it.label || it.name)}</b><small>${it.tacoId ? 'TACO: ' + esc(it.name) : 'valores estimados pela IA'} · confiança ${esc(it.confidence)} · ${macroLine(it)}</small></div><label class="qty-wrap"><input class="qty" type="number" min="0" step="1" value="${it.amount}" data-photo-g="${i}"><span>g</span></label></div>`).join('')}</div>
          <div class="inline-form" style="margin-top:12px"><div class="field"><label>Refeição</label><select data-photo-meal>${MEALS.map(m => `<option ${m === p.meal ? 'selected' : ''}>${m}</option>`).join('')}</select></div><div class="small"><b>Total: ${macroLine(t)}</b></div></div>
          <p class="small muted">Porções e valores são estimativas. Ajuste os gramas se souber o peso real.</p>
          <div class="toolbar-actions"><button class="button button-primary" data-x="photo-add">Adicionar ao diário</button><button class="button button-light" data-x="photo-close">Cancelar</button></div>` : '<p>Nenhum alimento identificado.</p>'}` : ''}
    </div>`;
  }
  document.addEventListener('change', e => {
    if (!photoState) return;
    const el = e.target;
    if (el.dataset.photoOn != null) { photoState.items[+el.dataset.photoOn].on = el.checked; renderPhotoDialog(); }
    else if (el.dataset.photoG != null) { const it = photoState.items[+el.dataset.photoG]; it.amount = num(el.value) || 0; recalc(it); renderPhotoDialog(); }
    else if (el.matches('[data-photo-meal]')) photoState.meal = el.value;
  });
  function addPhotoItems() {
    const sel = photoState.items.filter(i => i.on && i.amount > 0);
    if (!sel.length) { notify('Selecione ao menos um alimento'); return; }
    const date = state.activeDate || today();
    sel.forEach((it, i) => {
      const { on, label, confidence, ...item } = it;
      state.meals.push({ ...item, meal: photoState.meal, id: uid(), date, created: new Date().toISOString(), ...(i === 0 ? { photo: photoState.small } : {}) });
    });
    const meal = photoState.meal;
    const ok = save();
    closePhotoDialog(true);
    render();
    if (ok) notify(`${sel.length} alimento(s) adicionados em ${meal}`);
  }
  function closePhotoDialog(done, keep) {
    if (keep && photoState) { ui.pendingPhoto = photoState.small; render(); }
    $('#photoDialog')?.close();
    photoState = null;
  }

  // ---------- Chat ----------
  async function handleChat(q) {
    state.chats.push({ who: 'user', text: q });
    save();
    const ai = window.NutriAI;
    if (!ai?.isConfigured()) {
      state.chats.push({ who: 'bot', text: localAnswer(q) });
      save(); render(); scrollChat();
      return;
    }
    ui.thinking = true; render(); scrollChat();
    try {
      const text = await ai.chat(state.chats, aiContext());
      state.chats.push({ who: 'bot', text });
    } catch (err) {
      state.chats.push({ who: 'bot', text: `⚠️ ${err.message}` });
    } finally {
      ui.thinking = false;
      if (state.chats.length > 60) state.chats = state.chats.slice(-60);
      save(); render(); scrollChat();
    }
  }
  function scrollChat() { const c = $('#chatLog'); if (c) c.scrollTop = c.scrollHeight; }

  // ---------- Configurações: cartão da IA ----------
  function aiSettingsCard() {
    const ai = window.NutriAI;
    if (!ai) return '<section class="card"><h2>Inteligência artificial</h2><p class="small muted">Carregando…</p></section>';
    const cfg = ai.getConfig();
    return `<section class="card" id="aiCard"><div class="card-head"><div><h2>Inteligência artificial</h2><p>Reconhecimento de fotos e assistente completa</p></div><span class="tag">${cfg.key ? 'Conectada' : 'Desligada'}</span></div>
      <div class="form-grid"><div class="field full"><label>Chave da API da Anthropic (Claude)</label><input id="aiKey" type="password" autocomplete="off" placeholder="${cfg.key ? 'Chave salva: …' + esc(cfg.key.slice(-4)) + ' (digite outra para trocar)' : 'sk-ant-…'}"></div>
        <div class="field full"><label>Modelo</label><select id="aiModel">${ai.MODELS.map(([v, l]) => `<option value="${v}" ${v === cfg.model ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>
      <div class="toolbar-actions" style="margin-top:12px"><button class="button button-primary button-small" data-x="ai-save">Salvar</button>${cfg.key ? '<button class="button button-soft button-small" data-x="ai-test">Testar conexão</button><button class="button button-light button-small" data-x="ai-remove">Remover chave</button>' : ''}</div>
      <details class="guide" style="margin-top:12px"><summary>Como conseguir a chave e quanto custa</summary><ol class="small">
        <li>Crie uma conta em <b>console.anthropic.com</b> e adicione créditos (pagamento por uso, em dólar; dá para começar com US$ 5).</li>
        <li>Em <b>API Keys</b>, crie uma chave e cole aqui.</li>
        <li>Custo aproximado com o Opus 5.5: cerca de US$ 0,05 por foto analisada e US$ 0,02 por pergunta. Com o Haiku 5.5, menos de US$ 0,005. São estimativas e variam com o tamanho da conversa.</li>
        <li>Dica: em console.anthropic.com você pode definir um limite de gasto mensal.</li></ol>
        <p class="small muted">A chave fica salva só neste aparelho e não vai no backup JSON. Ao usar a IA, a foto ou um resumo dos seus registros é enviado à Anthropic para gerar a resposta.</p></details></section>`;
  }
  window.addEventListener('nutriai-ready', () => { if (route === 'configuracoes' || route === 'assistente') render(); });

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

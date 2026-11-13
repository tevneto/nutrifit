/* NutriFit — integração com a IA (Claude) direto do navegador.
   A chave da API fica apenas neste aparelho (localStorage "nutrifit.ai") e não entra no backup JSON.
   O SDK oficial é carregado sob demanda, só quando a IA é usada. */

const SDK_URL = './vendor/anthropic-sdk-1.3.0.mjs';
const CONFIG_KEY = 'nutrifit.ai';

export const MODELS = [
  ['claude-opus-5-5', 'Claude Opus 5.5 — mais preciso (recomendado)'],
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5 — equilíbrio entre custo e precisão'],
  ['claude-haiku-5-5', 'Claude Haiku 5.5 — mais barato e rápido']
];

export function getConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    return { key: c.key || '', model: MODELS.some(m => m[0] === c.model) ? c.model : MODELS[0][0] };
  } catch {
    return { key: '', model: MODELS[0][0] };
  }
}

export function setConfig(cfg) {
  const cur = getConfig();
  const next = { ...cur, ...cfg };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  client = null;
  return next;
}

export function clearConfig() {
  localStorage.removeItem(CONFIG_KEY);
  client = null;
}

export const isConfigured = () => !!getConfig().key;

let client = null;
let clientKey = '';
let AnthropicClass = null;

async function getClient() {
  const { key } = getConfig();
  if (!key) throw new Error('Configure a chave da IA em Configurações.');
  if (!AnthropicClass) ({ Anthropic: AnthropicClass } = await import(SDK_URL));
  if (!client || clientKey !== key) {
    // Uso pessoal: a chave é do próprio usuário e fica só no navegador dele.
    client = new AnthropicClass({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 });
    clientKey = key;
  }
  return client;
}

// Parâmetros comuns: fallback no servidor em caso de recusa (Opus/Sonnet; o Haiku não tem fallback no servidor).
function baseParams(model, effort, maxTokens) {
  const p = { model, max_tokens: maxTokens, output_config: { effort } };
  if (model !== 'claude-haiku-5-5') {
    p.betas = ['server-side-fallback-2026-07-01'];
    p.fallbacks = 'default';
  }
  return p;
}

function friendlyError(err) {
  const A = AnthropicClass;
  if (A) {
    if (err instanceof A.AuthenticationError) return 'Chave da API inválida. Confira em Configurações.';
    if (err instanceof A.PermissionDeniedError) return 'A chave não tem permissão para usar este modelo.';
    if (err instanceof A.RateLimitError) return 'Muitas solicitações seguidas. Aguarde um minuto e tente de novo.';
    if (err instanceof A.BadRequestError) {
      return /credit|balance|billing/i.test(err.message)
        ? 'Sem créditos na conta da Anthropic. Adicione créditos em console.anthropic.com.'
        : 'A IA recusou a solicitação: ' + err.message;
    }
    if (err instanceof A.APIConnectionError) return 'Sem conexão com a IA. Verifique a internet.';
    if (err instanceof A.APIError) return `Erro da IA (${err.status ?? '?'}). Tente novamente.`;
  }
  return err?.message || 'Erro desconhecido ao falar com a IA.';
}

function textOf(response) {
  if (response.stop_reason === 'refusal') throw new Error('A IA não pôde responder a esta solicitação.');
  if (response.stop_reason === 'max_tokens') throw new Error('A resposta da IA ficou longa demais. Tente de novo.');
  return response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
}

/* ---------- Foto do prato ---------- */

const PHOTO_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nome curto do alimento em português, como a pessoa diria (ex.: "Arroz branco").' },
          taco_name: { type: 'string', description: 'Nome EXATO de um item da lista TACO fornecida que corresponda ao alimento, ou "" se nenhum servir.' },
          grams: { type: 'number', description: 'Peso estimado da porção visível, em gramas (parte comestível, como servido).' },
          kcal_100g: { type: 'number' },
          protein_100g: { type: 'number' },
          carbs_100g: { type: 'number' },
          fat_100g: { type: 'number' },
          fiber_100g: { type: 'number' },
          confidence: { type: 'string', enum: ['alta', 'média', 'baixa'] }
        },
        required: ['name', 'taco_name', 'grams', 'kcal_100g', 'protein_100g', 'carbs_100g', 'fat_100g', 'fiber_100g', 'confidence'],
        additionalProperties: false
      }
    },
    comment: { type: 'string', description: 'Observação curta para a pessoa (ex.: itens incertos, molhos não visíveis).' }
  },
  required: ['items', 'comment'],
  additionalProperties: false
};

let photoSystemCache = null;
function photoSystem() {
  if (photoSystemCache) return photoSystemCache;
  const names = (window.TACO?.foods || []).map(f => f[1]).join('\n');
  photoSystemCache = [
    {
      type: 'text',
      text:
`Você analisa fotos de refeições para um diário alimentar brasileiro.
Para cada alimento ou bebida visível:
- dê um nome curto em português;
- estime o peso da porção em gramas como servida (parte comestível). Use referências visuais: prato raso comum tem 24–27 cm, colher de sopa ~ 15 ml, copo americano 190 ml;
- informe valores nutricionais por 100 g do alimento como preparado;
- em taco_name, escolha o item da lista TACO abaixo que melhor corresponda (copie o texto exatamente) ou deixe "" se nenhum servir;
- indique a confiança da identificação e da porção.
Separe preparações distintas (ex.: arroz e feijão são itens diferentes). Não invente itens escondidos; mencione em comment o que não dá para ver (óleo, molhos, açúcar).
Se a foto não mostrar comida, devolva items vazio e explique em comment.

Lista TACO (um alimento por linha):
${names}`,
      cache_control: { type: 'ephemeral' }
    }
  ];
  return photoSystemCache;
}

export async function analyzePhoto(base64Jpeg, hint = '') {
  const { model } = getConfig();
  try {
    const c = await getClient();
    const response = await c.beta.messages.create({
      ...baseParams(model, 'medium', 8000),
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: PHOTO_SCHEMA } },
      system: photoSystem(),
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Jpeg } },
          { type: 'text', text: hint ? `Observação da pessoa: ${hint}` : 'Identifique os alimentos e estime as porções.' }
        ]
      }]
    });
    const data = JSON.parse(textOf(response));
    return { items: Array.isArray(data.items) ? data.items : [], comment: data.comment || '' };
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

/* ---------- Assistente ---------- */

const CHAT_SYSTEM =
`Você é a assistente do NutriFit, um app pessoal de diário alimentar, treinos e evolução corporal.
Responda em português do Brasil, de forma direta e prática, em texto simples (pode usar listas curtas com "-" e **negrito**; não use tabelas).
Use os dados do usuário enviados entre <dados> para personalizar: metas, o que já comeu hoje, treinos, passos, peso e a dieta padrão.
Você pode responder dúvidas gerais de nutrição e treino, sugerir refeições e quantidades com alimentos comuns no Brasil para fechar as metas do dia, comparar alimentos e explicar números.
Quando estimar valores, diga que é estimativa. Não invente registros que não estão nos dados.
Não faça diagnósticos. Para doenças, gestação, uso de medicamentos ou sintomas, recomende acompanhamento de nutricionista ou médico.`;

export async function chat(history, context) {
  const { model } = getConfig();
  try {
    const c = await getClient();
    const msgs = history.slice(-16).map(m => ({ role: m.who === 'user' ? 'user' : 'assistant', content: m.text }));
    while (msgs.length && msgs[0].role !== 'user') msgs.shift();
    const last = msgs[msgs.length - 1];
    last.content = `<dados>\n${context}\n</dados>\n\n${last.content}`;
    const response = await c.beta.messages.create({
      ...baseParams(model, 'low', 8000),
      system: CHAT_SYSTEM,
      messages: msgs
    });
    return textOf(response);
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export async function testConnection() {
  const { model } = getConfig();
  try {
    const c = await getClient();
    const response = await c.beta.messages.create({
      ...baseParams(model, 'low', 2000),
      messages: [{ role: 'user', content: 'Responda apenas: ok' }]
    });
    textOf(response);
    return true;
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

window.NutriAI = { MODELS, getConfig, setConfig, clearConfig, isConfigured, analyzePhoto, chat, testConnection };
window.dispatchEvent(new Event('nutriai-ready'));

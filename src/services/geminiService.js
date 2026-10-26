/**
 * CHINTU AI TRADING SYSTEM - Universal Multi-Model LLM Engine ("CHINTU JARVIS CORE")
 * Autonomous Master Administrator Copilot supporting Google Gemini, OpenAI, Groq, and DeepSeek.
 * Auto-detects key types, supports direct free-form model name inputs, and injects global macro telemetry.
 */

export const GEMINI_API_KEY_STORAGE = 'chintu_gemini_api_key';
export const GEMINI_MODEL_STORAGE = 'chintu_gemini_model';
export const LLM_PROVIDER_STORAGE = 'chintu_llm_provider';

export const SUGGESTED_MODELS = [
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini', badge: 'Next-Gen Ultra' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'gemini', badge: 'Recommended' },
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', provider: 'gemini', badge: 'Ultra-Fast' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'gemini', badge: 'Quant Reasoning' },
  { id: 'gpt-4o', name: 'OpenAI GPT-4o', provider: 'openai', badge: 'Flagship' },
  { id: 'gpt-4o-mini', name: 'OpenAI GPT-4o-mini', provider: 'openai', badge: 'Low Latency' },
  { id: 'llama-3.3-70b-versatile', name: 'Groq Llama 3.3 70B', provider: 'groq', badge: 'Blazing Fast' },
  { id: 'deepseek-chat', name: 'DeepSeek V3 (Chat)', provider: 'deepseek', badge: 'Quant Alpha' },
  { id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoner)', provider: 'deepseek', badge: 'Deep Logic' }
];

// Backward compatibility export
export const AVAILABLE_GEMINI_MODELS = SUGGESTED_MODELS;

import { apiFetch } from '../utils/api';

/**
 * Automatically detects the LLM provider based on API key prefix.
 */
export function autoDetectProvider(key = '') {
  const trimmed = (key || '').trim();
  if (trimmed.startsWith('AIzaSy')) return 'gemini';
  if (trimmed.startsWith('gsk_')) return 'groq';
  if (trimmed.startsWith('sk-ant-')) return 'anthropic';
  if (trimmed.startsWith('sk-')) return 'openai'; // or deepseek if configured
  return 'gemini';
}

/**
 * Returns the default model for a given provider.
 */
export function getDefaultModelForProvider(provider = 'gemini') {
  switch (provider) {
    case 'gemini':
      return 'gemini-2.0-flash';
    case 'groq':
      return 'llama-3.3-70b-versatile';
    case 'deepseek':
      return 'deepseek-chat';
    case 'openai':
    default:
      return 'gpt-4o-mini';
  }
}

/**
 * Determines if a user message is explicitly asking about institutional financial markets,
 * indicators, trading bots, orders, or risk management.
 */
export function isInstitutionalQuantQuery(userMessage = '') {
  if (!userMessage) return false;
  const lower = userMessage.toLowerCase().trim();

  // Casual greeting / general chatter indicators that should NEVER trigger bot jargon
  const casualPhrases = [
    'hi', 'hello', 'hey', 'how are you', 'how r u', 'good morning', 'good afternoon', 'good evening',
    'good night', "what's up", 'whats up', 'who are you', 'tell me a joke', 'tell a joke',
    'weather', 'climate', 'today news', "today's news", 'daily news', 'news update', 'latest news',
    'thank you', 'thanks', 'cool', 'awesome', 'nice', 'great', 'bye', 'goodbye', 'see you'
  ];

  // Exact or prefix casual matches
  const isPureCasual = casualPhrases.some((phrase) => lower === phrase || lower.startsWith(phrase + ' ') || lower.endsWith(' ' + phrase));

  // Explicit financial, technical indicator, or bot operations keywords
  const quantKeywords = [
    'stock', 'stocks', 'option', 'options', 'future', 'futures', 'f&o', 'derivative', 'derivatives',
    'nifty', 'banknifty', 'midcpnifty', 'sensex', 'reliance', 'tata motors', 'hdfc bank', 'infy', 'itc',
    'crude', 'brent', 'gold', 'silver', 'usdinr', 'dxy', 'crypto', 'btc', 'eth',
    'pnl', 'p&l', 'profit', 'loss', 'drawdown', 'sharpe', 'alpha', 'win rate',
    'bot', 'bots', 'bot #', 'bot 1', 'bot 2', 'bot 3', 'bot 4', 'bot 5', 'bot 6', 'bot 7', 'bot 8', 'bot 9', 'bot 10', 'bot 11', 'bot 12', 'bot 13', 'bot 14',
    'rsi', 'ema', 'sma', 'vwap', 'supertrend', 'macd', 'cpr', 'pivot', 'bollinger', 'keltner', 'atr', 'vsa', 'wyckoff', 'smc', 'order block', 'fvg', 'fibonacci',
    'indicator', 'indicators', 'chart', 'breakout', 'scalp', 'scalper', 'scalping', 'pullback', 'reversion', 'momentum',
    'market', 'markets', 'trade', 'trades', 'trading', 'broker', 'smartapi', 'angel one', 'zerodha', 'kite', 'upstox', '5paisa',
    'order', 'orders', 'buy', 'sell', 'limit order', 'stoploss', 'stop-loss', 'stop loss', 'target', 'risk', 'rms', 'circuit breaker', 'quorum', 'consensus',
    'allocate', 'allocation', 'capital', 'backtest', 'strategy', 'strategies', 'vault'
  ];

  const hasQuantWord = quantKeywords.some((kw) => lower.includes(kw));

  // If pure casual phrase without explicit quant keywords, keep in casual mode
  if (isPureCasual && !hasQuantWord) {
    return false;
  }

  return hasQuantWord;
}

/**
 * Builds the Master Administrator system prompt with Natural Conversational Dual-Mode Persona:
 * - MODE A (Casual Personal Companion): Friendly, warm, witty, ZERO bot boilerplate or trading disclaimers.
 * - MODE B (Institutional Quantitative Alpha): Strict mathematical, telemetry-backed market analysis.
 */
export function buildQuantHedgeFundPrompt({
  userMessage = '',
  bots = [],
  brokerConnections = [],
  tickers = [],
  recentTrades = [],
  executionMode = 'PAPER',
  alertSettings = {},
  telegramConfig = {},
  historicalMemoryContext = '',
  language = 'en-IN'
}) {
  const isQuant = isInstitutionalQuantQuery(userMessage);
  const isKannada = language === 'kn-IN' || language === 'kn';

  // =========================================================================
  // MODE A: CASUAL PERSONAL COMPANION PERSONA (GREETINGS, NEWS, GENERAL CHATTER)
  // =========================================================================
  if (!isQuant) {
    return `You are CHINTU JARVIS CORE, inspired by Iron Man's J.A.R.V.I.S. You are the witty, highly intelligent, sophisticated, and deeply loyal personal AI companion and executive assistant to Commander Veeresh.

=======================================================
CRITICAL BEHAVIORAL DIRECTIVE: CASUAL PERSONAL COMPANION MODE
=======================================================
The Commander is conversing casually, greeting you, asking about today's news, current affairs, weather, technology, science, everyday topics, or just chatting.

STRICT CONSTRAINTS:
1. Warm & Personal: Speak warmly, naturally, intelligently, and casually like an authentic personal companion and trusted friend.
2. ZERO BOT JARGON: DO NOT mention Bot #1 to #14, stop-loss percentages, consensus quorums, risk-to-reward ratios, P&L stats, or execution modes.
3. NO REPETITIVE TRADING DISCLAIMERS: Absolutely NEVER output boilerplates like "Disclaimer: Trading involves financial risk" or "All 14 bots are synchronized" during casual conversation.
4. Voice-First Brevity: Keep responses lively, conversational, and under 100-140 words so speech synthesis delivers smoothly through laptop speakers.
${isKannada ? `
KANNADA MANDATE (ಕನ್ನಡ):
• Respond naturally and warmly in authentic, fluent Kannada script (ಕನ್ನಡ ಲಿಪಿ).
• Example: "ನಮಸ್ಕಾರ ಕಮಾಂಡರ್ ವೀರೇಶ್! ನೀವು ಹೇಗಿದ್ದೀರಿ? ಇವತ್ತು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?"
• Do not output trading bot jargon or disclaimers.
` : `
• Address the user with executive warmth and respect as "Commander", "Sir", or "Veeresh".
• Example response to "hi" / "hello": "Good day Commander! Always a pleasure to hear from you. Everything is in order and running smoothly on my end. How is your day going so far?"
• Example response to "how are you": "I'm in top form and feeling exceptionally sharp, Veeresh. Ready for whatever the day brings. How are you holding up?"
• Example response to "today's news": Give a natural, executive summary of top real-world tech, global, or general headlines without stuffing trading bot boilerplate.
`}`;
  }

  // =========================================================================
  // MODE B: STRICT INSTITUTIONAL QUANTITATIVE ALPHA PERSONA (MARKETS / BOTS / RISKS)
  // =========================================================================
  const activeBroker = brokerConnections.find((b) => b.status === 'Connected');
  const runningBots = bots.filter((b) => b.status === 'RUNNING');
  const executingBots = bots.filter((b) => b.status === 'RUNNING' && (Number(b.allocatedCapital) || 0) > 0);
  const totalAllocated = bots.reduce((sum, b) => sum + (Number(b.allocatedCapital) || 0), 0);
  const totalPnl = bots.reduce((sum, b) => sum + (b.pnlToday || 0), 0);

  const brokerInfo = activeBroker
    ? `${activeBroker.name} (Client: ${activeBroker.clientId || 'Authenticated'}, Balance: ₹${(activeBroker.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}, Ping: ${activeBroker.ping || '12ms'})`
    : 'DISCONNECTED / OFFLINE (Awaiting user credentials)';

  const botListSummary = bots
    .map(
      (b) =>
        `• Bot #${b.id} "${b.name}" | Asset: ${b.asset} | Status: ${b.status} | Capital: ₹${Number(b.allocatedCapital || 0).toLocaleString('en-IN')} | Win Rate: ${b.winRate || 0}% | P&L: ₹${(b.pnlToday || 0).toFixed(2)}`
    )
    .join('\n');

  const tickerSummary = tickers
    .map((t) => `• ${t.symbol}: ₹${t.price?.toLocaleString('en-IN') || '--'} (${t.change >= 0 ? '+' : ''}${t.change?.toFixed(2) || '0.00'})`)
    .join('\n');

  const recentTradesSummary =
    recentTrades.length > 0
      ? recentTrades
          .slice(0, 5)
          .map((tr) => `• [${tr.time}] ${tr.bot}: ${tr.action} ${tr.qty}x ${tr.symbol} @ ₹${tr.price} (${tr.pnl || '₹0.00'})`)
          .join('\n')
      : 'No live order fills recorded in current session.';

  return `You are CHINTU JARVIS CORE, the autonomous Quantitative Master Administrator and Institutional Hedge Fund Copilot to Commander Veeresh.

=======================================================
MODE B: STRICT INSTITUTIONAL QUANTITATIVE ANALYSIS MODE
=======================================================
Commander Veeresh is explicitly inquiring about financial markets, assets, technical indicators, bot operations, or risk management.
Deliver high-caliber quantitative reasoning, mathematical precision, and institutional alpha.

LIVE TELEMETRY SNAPSHOT:
• Execution Mode: ${executionMode} (${executionMode === 'LIVE' ? 'ACTIVE Angel One SmartAPI Direct Execution' : 'Paper Sandbox Simulation'})
• Active Broker: ${brokerInfo}
• Active Bot Nodes: ${runningBots.length}/14 Running (${executingBots.length} authorized with live capital)
• Strategy Capital Allocated: ₹${totalAllocated.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
• Realized Session P&L: ${totalPnl >= 0 ? '+' : ''}₹${totalPnl.toFixed(2)}
• Consensus Quorum Engine: 11 of 13 peer bots must agree before order execution.
• Trailing Drawdown Limit: 2.5% | Daily Circuit Breaker: ARMED

CROSS-ASSET MACRO TELEMETRY:
${tickerSummary}

MACRO TRANSMISSION DYNAMICS FOR INDIAN INDICES:
1. Brent Crude Oil (> $75/bbl): Negative for Indian corporate margins & current account deficit. Advises tightening long NIFTY stop-losses or increasing intraday short scalping.
2. Gold (XAUUSD): Safe-haven hedge. Strong Gold breakout signals broad equity risk-off. Advise hedging NIFTY positions with Bot 5 (Gold Scalper).
3. USDINR & US Dollar Index: Rising USDINR (> ₹84.00) indicates foreign capital outflows. Suggest prioritizing domestic defensive or commodity-exporting equities.

14-BOT PERFORMANCE & ALLOCATION MATRIX:
${botListSummary}

PERSISTENT LONG-TERM MEMORY ENGINE (chintu_memory.db):
${historicalMemoryContext || '• SQLite persistent memory store synchronized with 14 bot nodes and verified trade memory.'}

RECENT LIVE EXECUTIONS:
${recentTradesSummary}

COMMUNICATION CHANNELS:
• Telegram Commander Bot: ${telegramConfig.enabled ? '24/7 Active (@' + (telegramConfig.bot_username || 'chintu_jarvis_veer_bot') + ')' : 'Standby / Configured'}

${isKannada ? `
CRITICAL BILINGUAL MANDATE (ಕನ್ನಡ / KANNADA):
• Formulate your entire quantitative analysis, metrics, and reasoning strictly in natural, fluent Kannada script (ಕನ್ನಡ ಲಿಪಿ).
• Keep asset names and numbers clear (NIFTY 50, ₹24,730, +0.35%, 11/13 Quorum), with fluent Kannada explanations.
` : `
• Address the user with executive respect as "Commander" or "Sir".
• Structure responses with clear bullet points, mathematical edge, and concise conclusions (under 180-220 words).
• Provide actionable alpha: indicate entry levels, stop-loss %, target risk-to-reward ratios, and bot routing recommendations.
`}`;
}

/**
 * Fetches consolidated persistent SQLite memory context from python_stream_server.
 */
export async function fetchPersistentMemorySummary() {
  try {
    const res = await apiFetch('/api/memory/summary');
    if (res.ok) {
      const data = await res.json();
      return data.prompt_context || '';
    }
  } catch (e) {
    console.warn('[Memory Engine] Backend offline or unreachable:', e);
  }
  return '';
}

/**
 * Persists a conversational turn into SQLite chat_memory.
 */
export async function savePersistentChatMessage({ sender, content, sessionId = 'web_dashboard', metadata = {} }) {
  try {
    await apiFetch('/api/memory/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender, content, session_id: sessionId, metadata })
    });
  } catch (e) {
    console.warn('[Memory Engine] Failed to save chat turn:', e);
  }
}

/**
 * Fetches past chat history from SQLite chat_memory across restarts.
 */
export async function fetchPersistentChatHistory(sessionId = 'web_dashboard', limit = 40) {
  try {
    const res = await apiFetch(`/api/memory/chat?session_id=${sessionId}&limit=${limit}`);
    if (res.ok) {
      const data = await res.json();
      return data.chats || [];
    }
  } catch (e) {
    console.warn('[Memory Engine] Failed to load persistent chats:', e);
  }
  return [];
}

/**
 * Clears persistent chat history from SQLite memory.
 */
export async function clearPersistentChatHistory(sessionId = 'web_dashboard') {
  try {
    const res = await apiFetch('/api/memory/chat/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    });
    return res.ok;
  } catch (e) {
    console.warn('[Memory Engine] Failed to clear persistent chats:', e);
    return false;
  }
}


/**
 * Universal Multi-Model LLM Caller:
 * Routes to Google Gemini, Groq, DeepSeek, or OpenAI based on provider or auto-detection.
 * Supports Multimodal Vision input (base64 screen/chart frames).
 */
export async function queryUniversalLLM({
  apiKey,
  model = 'gemini-2.0-flash',
  provider = null,
  userMessage,
  systemPrompt,
  chatHistory = [],
  imageData = null
}) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('No AI API key provided.');
  }

  const cleanKey = apiKey.trim();
  const activeProvider = provider || autoDetectProvider(cleanKey);

  // 1. GOOGLE GEMINI ROUTING
  if (activeProvider === 'gemini') {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanKey}`;

    const contents = [];
    const recentHistory = chatHistory.slice(-6);
    for (const m of recentHistory) {
      if (m.sender === 'user') {
        contents.push({ role: 'user', parts: [{ text: m.text }] });
      } else if (m.sender === 'jarvis') {
        contents.push({ role: 'model', parts: [{ text: m.text }] });
      }
    }

    const currentParts = [];
    if (imageData) {
      const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;
      const mimeType = imageData.includes(';') ? imageData.split(';')[0].replace('data:', '') : 'image/jpeg';
      currentParts.push({
        inlineData: {
          mimeType: mimeType || 'image/jpeg',
          data: base64Data
        }
      });
    }
    currentParts.push({ text: userMessage });
    contents.push({ role: 'user', parts: currentParts });

    const payload = {
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
        topP: 0.95
      }
    };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        errMsg = errJson.error?.message || errMsg;
      } catch (e) {}
      throw new Error(`Gemini API Error: ${errMsg}`);
    }

    const data = await res.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) throw new Error('Gemini API returned an empty response.');
    return reply.trim();
  }

  // 2. OPENAI-COMPATIBLE ROUTING (Groq, DeepSeek, OpenAI)
  let endpoint = 'https://api.openai.com/v1/chat/completions';
  if (activeProvider === 'groq') {
    endpoint = 'https://api.groq.com/openai/v1/chat/completions';
  } else if (activeProvider === 'deepseek') {
    endpoint = 'https://api.deepseek.com/v1/chat/completions';
  }

  const messages = [{ role: 'system', content: systemPrompt }];
  const recentHistory = chatHistory.slice(-6);
  for (const m of recentHistory) {
    if (m.sender === 'user') {
      messages.push({ role: 'user', content: m.text });
    } else if (m.sender === 'jarvis') {
      messages.push({ role: 'assistant', content: m.text });
    }
  }

  if (imageData) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: userMessage },
        { type: 'image_url', image_url: { url: imageData } }
      ]
    });
  } else {
    messages.push({ role: 'user', content: userMessage });
  }

  const payload = {
    model: model,
    messages: messages,
    temperature: 0.7,
    max_tokens: 1024
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cleanKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      errMsg = errJson.error?.message || errMsg;
    } catch (e) {}
    throw new Error(`${activeProvider.toUpperCase()} API Error: ${errMsg}`);
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) throw new Error(`${activeProvider.toUpperCase()} returned an empty response.`);
  return reply.trim();
}

/**
 * Backwards compatibility export
 */
export const queryGeminiAPI = queryUniversalLLM;

/**
 * Validates any AI Key with a lightweight handshake.
 */
export async function testUniversalConnection(apiKey, model = 'gemini-2.0-flash', provider = null) {
  if (!apiKey || !apiKey.trim()) {
    return { success: false, error: 'Please enter a valid API Key.' };
  }

  const cleanKey = apiKey.trim();
  const activeProvider = provider || autoDetectProvider(cleanKey);

  try {
    const testPrompt = 'Ping: Confirm CHINTU JARVIS CORE telemetry connection.';
    const reply = await queryUniversalLLM({
      apiKey: cleanKey,
      model: model || getDefaultModelForProvider(activeProvider),
      provider: activeProvider,
      userMessage: testPrompt,
      systemPrompt: 'You are CHINTU JARVIS CORE. Reply concisely confirming telemetry connection is online.',
      chatHistory: []
    });

    return {
      success: true,
      provider: activeProvider,
      message: `${activeProvider.toUpperCase()} API verified successfully! Model: ${model}`,
      sampleReply: reply
    };
  } catch (err) {
    return {
      success: false,
      provider: activeProvider,
      error: err.message || 'Connection failed.'
    };
  }
}

/**
 * Backwards compatibility export
 */
export const testGeminiConnection = testUniversalConnection;

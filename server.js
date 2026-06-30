require('dotenv').config();
const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { XMLParser } = require('fast-xml-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'news.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Competitor signal rules ───────────────────────────────
const COMPETITOR_SIGNAL_RULES = {
  '新製品・機能': ['新製品', 'リリース', '新機能', 'バージョンアップ', 'アップデート', '新サービス', '提供開始', '新システム', '新ソリューション', 'ローンチ', '発売'],
  '受注・導入事例': ['受注', '採用', '導入', '選定', '契約締結', '実績', '事例', '納入', '稼働開始', 'PoC', '実証実験', '試験導入'],
  '提携・協業': ['提携', '協業', '協力', 'アライアンス', 'パートナー', '合弁', 'MOU', '連携協定', '共同開発', '共同研究'],
  '資金調達・上場': ['資金調達', '調達', '上場', 'IPO', 'シリーズ', '出資', '投資', 'VC', 'ファンド', '増資', '評価額'],
  '人事・体制': ['社長', '代表', '人事', 'CEO', 'CTO', '役員', '体制変更', '新体制', '代表取締役', '就任', '退任'],
  '価格・戦略': ['値下げ', '価格改定', '料金', 'プライシング', '無償', '無料', '戦略', '方針', '撤退', '縮小', '新市場'],
};

function classifyCompetitorSignal(title, desc) {
  const text = title + ' ' + desc;
  const scores = {};
  for (const [signal, keywords] of Object.entries(COMPETITOR_SIGNAL_RULES)) {
    scores[signal] = keywords.filter(kw => text.includes(kw)).length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : '一般情報';
}

function suggestCompetitorAction(signal) {
  const map = {
    '新製品・機能':   '🔍 競合の新機能を把握 — 差別化ポイントを営業資料に反映',
    '受注・導入事例': '⚡ 競合の導入先を特定 — 同業他社への先手提案を検討',
    '提携・協業':     '🤝 競合のエコシステム拡大 — 我々の連携戦略を見直す',
    '資金調達・上場': '💰 競合が資金力を強化 — 製品投資・値下げリスクに注意',
    '人事・体制':     '👤 競合の意思決定者が変化 — 対競合トークを更新する機会',
    '価格・戦略':     '💡 競合の価格戦略を把握 — 自社の優位性を再確認',
    '一般情報':       '📰 競合動向として情報収集',
  };
  return map[signal] || '📰 競合動向として情報収集';
}

// ── Signal classification ─────────────────────────────────
const SIGNAL_RULES = {
  '投資・拡大': ['投資', '増設', '新設', '拡大', '着手', '導入', '採択', '受注', '建設', '計画発表', '包括協定', '連携協定', 'MOU', '調印', '新工場', '新拠点', '増強', '整備'],
  '課題・問題': ['課題', '問題', 'コスト削減', '効率化', '困難', '対策', '改善', '削減', 'リスク', '停電', '不具合', 'トラブル', '赤字', '値上げ', '負担増', '逼迫'],
  '規制・政策': ['規制', 'ガイドライン', '法改正', '義務化', '省エネ', '政策', '制度', '認定', '指針', '閣議決定', '省令', '条例', '審議', '答申'],
  '競合動向': ['提携', '協業', '採用', '選定', 'システム導入', 'ソリューション採用', '他社', '競合', '入札', '落札', '契約締結'],
  '組織変化': ['社長', '人事', '役員', '体制', '分社', '統合', 'M&A', '買収', '合併', '子会社', '新組織', '新部署', '代表取締役'],
};

const CATEGORY_RULES = {
  '小売り': ['小売', '料金プラン', '電気料金', '料金改定', '需要家', 'PPS', '新電力', '切り替え', 'スイッチング', 'コーポレートPPA', 'オフサイトPPA', '従量', '低圧', '高圧', '電力販売', '供給契約', 'でんき', 'オール電化', '電力会社', 'DR', 'デマンドレスポンス', 'アグリゲーター', 'BCP', '電気代'],
  '発電': ['発電', '発電所', '再エネ', '再生可能エネルギー', '太陽光', '風力', '水力', '原子力', '原発', '火力', 'LNG', '石炭', '燃料', 'kWh', 'MW', 'GW', 'バイオマス', '地熱', 'FIT', 'FIP', '電源', '出力', '発電量', 'PPA', 'ソーラー', '蓄電池', 'VPP', '水素', 'アンモニア', 'CCS'],
  '送配電': ['送電', '配電', '送配電', '系統', '連系', 'ネットワーク', '接続', '変電', '潮流', '増強', '架線', '鉄塔', '地中化', '停電', '復旧', '電力融通', '周波数', '電圧', '調整力', '容量市場', '需給調整', 'OCCTO', '広域機関', 'インバランス', '一般送配電', 'スマートグリッド', 'DER'],
};

const GRID_KEYWORDS = {
  '火力最適化': ['火力最適化', 'ELD', '単価表', '燃料費最適化', '発電コスト最適化', '火力スケジューリング', '発電計画最適化', '燃料調達最適化'],
  '需給管理': ['需給最適化', '需給管理', '需給調整', '需給予測', 'バランシング', 'インバランス回避', 'インバランス管理', '需要予測', '供給計画'],
  '系統運用': ['系統運用', '系統安定', '潮流計算', '電力融通', '連系線活用', '系統制御', '系統整備'],
  'DX・AI': ['AIエージェント', 'AI活用', 'データ活用', 'データ統合', 'DX推進', 'デジタル変革', '業務自動化', '意思決定支援', 'SaaS導入', 'デジタル人材'],
};

function classifySignal(title, desc) {
  const text = title + ' ' + desc;
  const scores = {};
  for (const [signal, keywords] of Object.entries(SIGNAL_RULES)) {
    scores[signal] = keywords.filter(kw => text.includes(kw)).length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : '一般情報';
}

function classifyCategory(title, desc) {
  const text = (title + ' ' + desc).toLowerCase();
  const scores = {};
  for (const [cat, keywords] of Object.entries(CATEGORY_RULES)) {
    scores[cat] = keywords.filter(kw => text.includes(kw.toLowerCase())).length;
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : null;
}

function analyzeGridRelevance(title, desc) {
  const text = title + ' ' + desc;
  const matched = {};
  for (const [product, keywords] of Object.entries(GRID_KEYWORDS)) {
    const hits = keywords.filter(kw => text.includes(kw));
    if (hits.length > 0) matched[product] = hits;
  }
  if (Object.keys(matched).length === 0) return { isGridRelated: false, gridProduct: '', gridRelevance: '' };

  const product = Object.keys(matched)[0];
  const relevanceMap = {
    '火力最適化': 'GRIDの火力最適化・ELD単価自動作成ソリューションの直接提案対象',
    '需給管理': 'GRIDの電力需給最適化AIによる自動化・高度化の提案機会',
    '系統運用': 'GRIDの系統運用支援システムとの親和性が高い案件',
    'DX・AI': 'DX推進の文脈でGRIDのSaaSソリューション導入を提案できる',
  };
  return {
    isGridRelated: true,
    gridProduct: product,
    gridRelevance: relevanceMap[product] || 'GRIDのソリューション提案機会',
  };
}

function calcUrgency(signal, isGridRelated) {
  if (isGridRelated && ['投資・拡大', '課題・問題'].includes(signal)) return 'high';
  if (isGridRelated || signal === '投資・拡大') return 'medium';
  return 'low';
}

function suggestAction(signal, urgency, isGridRelated, gridProduct) {
  if (urgency === 'high') {
    if (gridProduct === '火力最適化') return '🔥 ELD単価提案の絶好タイミング — 至急アポ打診';
    if (gridProduct === '需給管理') return '🔥 需給管理AIの提案機会 — 担当者へ即コンタクト';
    return '🔥 提案機会あり — 至急アポ打診を検討';
  }
  if (signal === '投資・拡大') return '📈 投資・拡大のタイミングで需要が生まれやすい — ヒアリング推奨';
  if (signal === '課題・問題') return '💡 課題の裏にGRID提案のフックあり — 課題ヒアリングに活用';
  if (signal === '規制・政策') return '📋 規制対応ニーズが顕在化している — 対応支援として提案';
  if (signal === '競合動向') return '⚠️ 競合製品の採用動向を把握 — 差別化ポイントを確認';
  if (signal === '組織変化') return '👤 人事・体制変化後は提案リセットの好機 — 新担当者への挨拶検討';
  return '📰 業界トレンドとして情報収集';
}

// ── RSS fetch ─────────────────────────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function cleanText(str) {
  return String(str || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
}

async function fetchRSS(company) {
  const queries = [
    `${company} 電力 投資 計画`,
    `${company} 電力 課題 DX 効率化`,
    `${company} 発電 再エネ 火力`,
    `${company} 送配電 系統 ネットワーク`,
    `${company} 電力 小売 料金 需要家`,
    `${company} エネルギー 規制 政策`,
  ];

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const articles = [];

  for (const q of queries) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ja&gl=JP&ceid=JP:ja`;
      const xml = await fetchUrl(url);
      const parsed = parser.parse(xml);
      const items = parsed?.rss?.channel?.item || [];
      const list = Array.isArray(items) ? items : [items];

      for (const item of list.slice(0, 6)) {
        const title = cleanText(item.title);
        const link = cleanText(item.link || (typeof item.guid === 'string' ? item.guid : item.guid?.['#text']) || '');
        const pubDate = cleanText(item.pubDate);
        const desc = cleanText(item.description).split(' - ')[0];
        const source = cleanText(item.source?.['#text'] || item.source || '');
        if (title && link) articles.push({ title, url: link, publishedAt: pubDate, desc, source });
      }
    } catch (e) {
      console.error(`RSS [${q}]:`, e.message);
    }
  }

  const seen = new Set();
  return articles.filter(a => {
    const key = a.title.slice(0, 30);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Storage ───────────────────────────────────────────────
async function loadNews() {
  try { return JSON.parse(await fs.readFile(DATA_FILE, 'utf-8')); }
  catch { return []; }
}

async function saveNews(news) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(news, null, 2), 'utf-8');
}

function cleanOldNews(news) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  return news.filter(n => new Date(n.fetchedAt) > cutoff);
}

// ── Routes ────────────────────────────────────────────────
app.get('/api/status', (req, res) => res.json({ ready: true }));

app.get('/api/news', async (req, res) => {
  try {
    const { company, range, category, signal, urgency, mode } = req.query;
    let news = cleanOldNews(await loadNews());

    // mode: 'customer' | 'competitor' | undefined(all)
    if (mode === 'competitor') news = news.filter(n => n.companyType === 'competitor');
    else if (mode === 'customer') news = news.filter(n => n.companyType !== 'competitor');

    if (company) news = news.filter(n => n.company === company);

    const now = new Date();
    if (range === 'daily') {
      const today = new Date(now); today.setHours(0, 0, 0, 0);
      news = news.filter(n => new Date(n.fetchedAt) >= today);
    } else if (range === 'weekly') {
      const w = new Date(now); w.setDate(w.getDate() - 7);
      news = news.filter(n => new Date(n.fetchedAt) >= w);
    }

    if (category && category !== 'all') news = news.filter(n => n.category === category);
    if (signal && signal !== 'all') news = news.filter(n => n.signal === signal);
    if (urgency && urgency !== 'all') news = news.filter(n => n.urgency === urgency);

    news.sort((a, b) => {
      const urgencyOrder = { high: 0, medium: 1, low: 2 };
      return (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2)
        || new Date(b.fetchedAt) - new Date(a.fetchedAt);
    });

    res.json({ success: true, articles: news });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/companies', async (req, res) => {
  try {
    const { mode } = req.query;
    const news = await loadNews();
    let filtered = news;
    if (mode === 'competitor') filtered = news.filter(n => n.companyType === 'competitor');
    else if (mode === 'customer') filtered = news.filter(n => n.companyType !== 'competitor');
    const companies = [...new Set(filtered.map(n => n.company))].sort();
    res.json({ companies });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/summary', async (req, res) => {
  try {
    const { company } = req.query;
    let news = cleanOldNews(await loadNews());
    if (company) news = news.filter(n => n.company === company);

    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    const recentNews = news.filter(n => new Date(n.fetchedAt) >= weekAgo);

    const summary = {
      total: news.length,
      recentCount: recentNews.length,
      highUrgency: news.filter(n => n.urgency === 'high').length,
      gridRelated: news.filter(n => n.isGridRelated).length,
      signals: {},
      categories: {},
    };

    news.forEach(n => {
      summary.signals[n.signal] = (summary.signals[n.signal] || 0) + 1;
      summary.categories[n.category] = (summary.categories[n.category] || 0) + 1;
    });

    res.json({ success: true, summary });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/fetch-news', async (req, res) => {
  const { company, companyType = 'customer' } = req.body;
  if (!company?.trim()) return res.status(400).json({ success: false, error: '企業名を入力してください' });

  const companyName = company.trim();
  const isCompetitor = companyType === 'competitor';

  // 競合用のRSSクエリ
  async function fetchCompetitorRSS(name) {
    const queries = [
      `${name} 新製品 サービス リリース`,
      `${name} 受注 導入 採用 契約`,
      `${name} 提携 協業 パートナー`,
      `${name} 資金調達 上場 IPO`,
      `${name} 電力 エネルギー AI システム`,
    ];
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const articles = [];
    for (const q of queries) {
      try {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ja&gl=JP&ceid=JP:ja`;
        const xml = await fetchUrl(url);
        const parsed = parser.parse(xml);
        const items = parsed?.rss?.channel?.item || [];
        const list = Array.isArray(items) ? items : [items];
        for (const item of list.slice(0, 5)) {
          const title = cleanText(item.title);
          const link = cleanText(item.link || (typeof item.guid === 'string' ? item.guid : item.guid?.['#text']) || '');
          const pubDate = cleanText(item.pubDate);
          const desc = cleanText(item.description).split(' - ')[0];
          const source = cleanText(item.source?.['#text'] || item.source || '');
          if (title && link) articles.push({ title, url: link, publishedAt: pubDate, desc, source });
        }
      } catch (e) { console.error(`Competitor RSS [${q}]:`, e.message); }
    }
    const seen = new Set();
    return articles.filter(a => { const k = a.title.slice(0, 30); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  try {
    const rawArticles = isCompetitor ? await fetchCompetitorRSS(companyName) : await fetchRSS(companyName);
    if (rawArticles.length === 0) {
      return res.json({ success: true, count: 0, articles: [], message: 'ニュースが見つかりませんでした' });
    }

    const now = new Date().toISOString();
    const enriched = rawArticles.map(a => {
      let category = null, signal, urgency, action, isGridRelated = false, gridProduct = '', gridRelevance = '';

      if (isCompetitor) {
        // 競合モード: カテゴリ不要、競合シグナルで分類
        signal = classifyCompetitorSignal(a.title, a.desc);
        urgency = ['受注・導入事例', '新製品・機能', '資金調達・上場'].includes(signal) ? 'high'
                : ['提携・協業', '価格・戦略'].includes(signal) ? 'medium' : 'low';
        action = suggestCompetitorAction(signal);
        category = '競合情報'; // 競合は固定カテゴリ
      } else {
        category = classifyCategory(a.title, a.desc);
        if (!category) return null;
        signal = classifySignal(a.title, a.desc);
        const grid = analyzeGridRelevance(a.title, a.desc);
        isGridRelated = grid.isGridRelated; gridProduct = grid.gridProduct; gridRelevance = grid.gridRelevance;
        urgency = calcUrgency(signal, isGridRelated);
        action = suggestAction(signal, urgency, isGridRelated, gridProduct);
      }

      let pubDate = '';
      if (a.publishedAt) {
        try { pubDate = new Date(a.publishedAt).toISOString().slice(0, 10); } catch {}
      }

      return {
        id: crypto.randomUUID(),
        company: companyName,
        companyType,
        title: a.title,
        summary: a.desc || a.title,
        url: a.url,
        source: a.source,
        category,
        signal,
        urgency,
        action,
        isGridRelated,
        gridProduct,
        gridRelevance,
        publishedAt: pubDate,
        fetchedAt: now,
      };
    }).filter(Boolean);

    const existing = cleanOldNews(await loadNews());
    const existingKeys = new Set(existing.filter(n => n.company === companyName).map(n => n.title));
    const newOnly = enriched.filter(a => !existingKeys.has(a.title));

    await saveNews([...existing, ...newOnly]);
    res.json({ success: true, count: newOnly.length, total: enriched.length, articles: newOnly });
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`⚡ Energy News Tracker: http://localhost:${PORT}`);
});

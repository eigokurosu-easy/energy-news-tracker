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

// ── Classification rules ──────────────────────────────────
const CATEGORY_RULES = {
  '小売り': [
    '小売', '料金プラン', '電気料金', '料金改定', '需要家', 'PPS', '新電力',
    '切り替え', 'スイッチング', 'サービス開始', 'コーポレートPPA', 'オフサイトPPA',
    '従量', '低圧', '高圧', 'アンペア', '電力販売', '供給契約', 'でんき'
  ],
  '発電': [
    '発電', '発電所', '再エネ', '再生可能エネルギー', '太陽光', '風力', '水力',
    '原子力', '原発', '火力', 'LNG', '石炭', '燃料', 'kWh', 'MW', 'GW',
    'バイオマス', '地熱', 'FIT', 'FIP', '電源', '出力', '発電量', 'PPA',
    'ソーラー', '蓄電池', '蓄電', 'VPP'
  ],
  '送配電': [
    '送電', '配電', '送配電', '系統', '連系', 'ネットワーク', '接続', '変電',
    '潮流', '増強', '整備', '架線', '鉄塔', '地中化', '停電', '復旧',
    '電力融通', '周波数', '電圧', '調整力', '容量市場', '需給調整', 'OCCTO',
    '広域機関', 'インバランス', '一般送配電'
  ],
};

const GRID_KEYWORDS = [
  '需給最適化', '需給管理', '需給調整', 'ELD', '単価表', '燃料費最適化',
  '火力最適化', '系統運用', 'AIエージェント', 'AI活用', 'DX', 'デジタル',
  'スケジューリング', '最適化AI', '需給予測', '電力AI', '業務効率化',
  'データ活用', 'データ統合', '意思決定支援', '自動化', 'SaaS'
];

function classifyArticle(title, desc) {
  const text = (title + ' ' + desc).toLowerCase();
  const scores = {};

  for (const [cat, keywords] of Object.entries(CATEGORY_RULES)) {
    scores[cat] = keywords.filter(kw => text.includes(kw.toLowerCase())).length;
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (best[1] === 0) return null; // 電力関連でない
  return best[0];
}

function checkGridRelevance(title, desc) {
  const text = title + ' ' + desc;
  const matched = GRID_KEYWORDS.filter(kw => text.includes(kw));
  if (matched.length === 0) return { isGridRelated: false, gridRelevance: '' };

  const relevance = generateGridRelevance(title, matched);
  return { isGridRelated: true, gridRelevance: relevance };
}

function generateGridRelevance(title, matched) {
  const kw = matched[0];
  if (['ELD', '単価表', '燃料費最適化', '火力最適化'].some(k => matched.includes(k))) {
    return 'GRIDの火力最適化・ELD単価ソリューションの直接的な適用領域';
  }
  if (['需給最適化', '需給管理', '需給調整', '需給予測'].some(k => matched.includes(k))) {
    return 'GRIDの電力需給最適化AIとの連携・提案機会';
  }
  if (['系統運用', 'AIエージェント', 'AI活用', '最適化AI'].some(k => matched.includes(k))) {
    return 'GRIDの系統運用支援AIによる業務効率化の提案機会';
  }
  if (['DX', 'デジタル', 'データ活用', 'データ統合', 'SaaS'].some(k => matched.includes(k))) {
    return 'DX推進に伴いGRIDの需給管理SaaSの導入提案が有望';
  }
  return `「${kw}」領域でGRIDのソリューション提案が可能`;
}

// ── RSS fetch ─────────────────────────────────────────────
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      }
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
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('RSS fetch timeout')); });
  });
}

function cleanText(str) {
  return String(str || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchRSS(company) {
  const queries = [
    `${company} 電力`,
    `${company} エネルギー 発電`,
    `${company} 送配電 系統`,
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

      for (const item of list.slice(0, 8)) {
        const title = cleanText(item.title);
        const url = cleanText(item.link || (typeof item.guid === 'string' ? item.guid : item.guid?.['#text']) || '');
        const pubDate = cleanText(item.pubDate);
        const desc = cleanText(item.description).split(' - ')[0]; // remove source name suffix
        const source = cleanText(item.source?.['#text'] || item.source || '');

        if (title && url) {
          articles.push({ title, url, publishedAt: pubDate, desc, source });
        }
      }
    } catch (e) {
      console.error(`RSS error [${q}]:`, e.message);
    }
  }

  // Deduplicate by title similarity
  const seen = new Set();
  return articles.filter(a => {
    const key = a.title.slice(0, 30);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Storage ──────────────────────────────────────────────
async function loadNews() {
  try {
    return JSON.parse(await fs.readFile(DATA_FILE, 'utf-8'));
  } catch { return []; }
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
app.get('/api/status', (req, res) => {
  res.json({ ready: true, mode: 'rss-keyword' });
});

app.get('/api/news', async (req, res) => {
  try {
    const { company, range, category } = req.query;
    let news = cleanOldNews(await loadNews());

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
    news.sort((a, b) => new Date(b.fetchedAt) - new Date(a.fetchedAt));
    res.json({ success: true, articles: news });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/companies', async (req, res) => {
  try {
    const news = await loadNews();
    const companies = [...new Set(news.map(n => n.company))].sort();
    res.json({ companies });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/fetch-news', async (req, res) => {
  const { company } = req.body;
  if (!company?.trim()) return res.status(400).json({ success: false, error: '企業名を入力してください' });

  const companyName = company.trim();

  try {
    const rawArticles = await fetchRSS(companyName);

    const now = new Date().toISOString();
    const enriched = rawArticles
      .map(a => {
        const category = classifyArticle(a.title, a.desc);
        if (!category) return null;

        const { isGridRelated, gridRelevance } = checkGridRelevance(a.title, a.desc);

        let pubDate = '';
        if (a.publishedAt) {
          try { pubDate = new Date(a.publishedAt).toISOString().slice(0, 10); } catch {}
        }

        return {
          id: crypto.randomUUID(),
          company: companyName,
          title: a.title,
          summary: a.desc || a.title,
          url: a.url,
          source: a.source,
          category,
          isGridRelated,
          gridRelevance,
          publishedAt: pubDate,
          fetchedAt: now,
        };
      })
      .filter(Boolean);

    const existing = cleanOldNews(await loadNews());
    // Remove duplicates (same company + title)
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
  console.log(`   Mode: Google News RSS + keyword classification`);
});

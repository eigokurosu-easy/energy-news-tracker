const CATEGORY_CONFIG = {
  '小売り': { key: 'retail' },
  '発電':   { key: 'generation' },
  '送配電': { key: 'transmission' },
};

let currentRange = 'daily';
let currentCategory = 'all';
let currentSignal = 'all';
let currentUrgency = 'all';
let currentCompany = '';
let currentMode = 'customer';
let currentCompetitorSignal = 'all';
let currentCompetitor = '';
let allArticles = [];
let allCompetitorArticles = [];

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupModeToggle();
  setupRangeToggle();
  setupFilters();
  setupFetchForm();
  setupCompanyFilter();
  setupCompetitorForm();
  setupCompetitorFilters();
  loadNews();
});

// ── Mode Toggle ───────────────────────────────────────────
function setupModeToggle() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      if (currentMode === 'customer') {
        document.getElementById('customerMode').style.display = 'block';
        document.getElementById('competitorMode').style.display = 'none';
        loadNews();
      } else {
        document.getElementById('customerMode').style.display = 'none';
        document.getElementById('competitorMode').style.display = 'block';
        loadCompetitorNews();
      }
    });
  });
}

// ── Range ────────────────────────────────────────────────
function setupRangeToggle() {
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRange = btn.dataset.range;
      if (currentMode === 'customer') loadNews();
      else loadCompetitorNews();
    });
  });
}

// ── Customer Filters ───────────────────────────────────────────
function setupFilters() {
  document.querySelectorAll('#urgencyTabs .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#urgencyTabs .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentUrgency = btn.dataset.urgency;
      renderArticles(allArticles);
    });
  });

  document.querySelectorAll('#signalTabs .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#signalTabs .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSignal = btn.dataset.signal;
      renderArticles(allArticles);
    });
  });

  document.querySelectorAll('#categoryTabs .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#categoryTabs .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.cat;
      renderArticles(allArticles);
    });
  });
}

// ── Competitor Filters ─────────────────────────────────────────
function setupCompetitorFilters() {
  document.querySelectorAll('#competitorSignalTabs .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#competitorSignalTabs .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCompetitorSignal = btn.dataset.csignal;
      renderCompetitorArticles(allCompetitorArticles);
    });
  });

  document.getElementById('competitorFilter').addEventListener('change', e => {
    currentCompetitor = e.target.value;
    loadCompetitorNews();
  });
}

// ── Company filter ────────────────────────────────────────
function setupCompanyFilter() {
  document.getElementById('companyFilter').addEventListener('change', e => {
    currentCompany = e.target.value;
    loadNews();
    updateSummary();
  });
}

// ── Customer Fetch form ────────────────────────────────────────
function setupFetchForm() {
  const input = document.getElementById('companyInput');
  const btn = document.getElementById('fetchBtn');
  btn.addEventListener('click', fetchNews);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') fetchNews(); });
  renderHistoryTags();
}

function getHistory() {
  return JSON.parse(localStorage.getItem('companyHistory') || '[]');
}

function addToHistory(company) {
  let h = getHistory();
  h = [company, ...h.filter(c => c !== company)].slice(0, 8);
  localStorage.setItem('companyHistory', JSON.stringify(h));
  renderHistoryTags();
}

function renderHistoryTags() {
  const container = document.getElementById('companyHistory');
  container.innerHTML = getHistory().map(c =>
    `<span class="history-tag" onclick="selectCompany('${escHtml(c)}')">${escHtml(c)}</span>`
  ).join('');
}

function selectCompany(company) {
  document.getElementById('companyInput').value = company;
}

async function fetchNews() {
  const company = document.getElementById('companyInput').value.trim();
  if (!company) { showToast('企業名を入力してね', 'error'); return; }

  const btn = document.getElementById('fetchBtn');
  const status = document.getElementById('fetchStatus');
  btn.disabled = true;
  btn.textContent = '収集中...';
  showLoading(true);
  status.textContent = `「${company}」のニュースを分析中...`;

  try {
    const res = await fetch('/api/fetch-news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company, companyType: 'customer' }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    addToHistory(company);
    showToast(`${data.count}件の新着ニュースを取得`, 'success');
    status.textContent = `新着 ${data.count}件`;

    document.getElementById('companyFilter').value = company;
    currentCompany = company;

    await loadNews();
    await refreshCompanyFilter();
    updateSummary();
  } catch (err) {
    showToast(`エラー: ${err.message}`, 'error');
    status.textContent = '';
    showLoading(false);
  } finally {
    btn.disabled = false;
    btn.textContent = 'ニュースを取得';
  }
}

// ── Competitor Fetch form ──────────────────────────────────────
function getCompetitorHistory() {
  return JSON.parse(localStorage.getItem('competitorHistory') || '[]');
}

function addToCompetitorHistory(company) {
  let h = getCompetitorHistory();
  h = [company, ...h.filter(c => c !== company)].slice(0, 8);
  localStorage.setItem('competitorHistory', JSON.stringify(h));
  renderCompetitorHistoryTags();
}

function renderCompetitorHistoryTags() {
  const container = document.getElementById('competitorHistory');
  container.innerHTML = getCompetitorHistory().map(c =>
    `<span class="history-tag competitor" onclick="selectCompetitor('${escHtml(c)}')">${escHtml(c)}</span>`
  ).join('');
}

function selectCompetitor(company) {
  document.getElementById('competitorInput').value = company;
}

function setupCompetitorForm() {
  const input = document.getElementById('competitorInput');
  const btn = document.getElementById('competitorFetchBtn');
  btn.addEventListener('click', fetchCompetitorNews);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') fetchCompetitorNews(); });
  renderCompetitorHistoryTags();
}

async function fetchCompetitorNews() {
  const company = document.getElementById('competitorInput').value.trim();
  if (!company) { showToast('競合企業名を入力してね', 'error'); return; }

  const btn = document.getElementById('competitorFetchBtn');
  const status = document.getElementById('competitorFetchStatus');
  btn.disabled = true;
  btn.textContent = '収集中...';
  showCompetitorLoading(true);
  status.textContent = `「${company}」の競合情報を分析中...`;

  try {
    const res = await fetch('/api/fetch-news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company, companyType: 'competitor' }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    addToCompetitorHistory(company);
    showToast(`${data.count}件の競合情報を取得`, 'success');
    status.textContent = `新着 ${data.count}件`;

    await loadCompetitorNews();
    await refreshCompetitorFilter();
  } catch (err) {
    showToast(`エラー: ${err.message}`, 'error');
    status.textContent = '';
    showCompetitorLoading(false);
  } finally {
    btn.disabled = false;
    btn.textContent = '競合として登録・取得';
  }
}

// ── Load / Render (Customer) ───────────────────────────────────
async function loadNews() {
  showLoading(true);
  try {
    const params = new URLSearchParams({ range: currentRange, mode: 'customer' });
    if (currentCompany) params.set('company', currentCompany);

    const res = await fetch(`/api/news?${params}`);
    const data = await res.json();
    allArticles = data.articles || [];
    renderArticles(allArticles);
    await refreshCompanyFilter();
  } catch {
    showToast('ニュースの読み込みに失敗しました', 'error');
  } finally {
    showLoading(false);
  }
}

async function refreshCompanyFilter() {
  const res = await fetch('/api/companies?mode=customer');
  const data = await res.json();
  const select = document.getElementById('companyFilter');
  const current = select.value;
  select.innerHTML = '<option value="">すべての企業</option>' +
    (data.companies || []).map(c =>
      `<option value="${escHtml(c)}" ${c === current ? 'selected' : ''}>${escHtml(c)}</option>`
    ).join('');
}

async function updateSummary() {
  const summaryEl = document.getElementById('companySummary');
  if (!currentCompany) { summaryEl.style.display = 'none'; return; }

  const res = await fetch(`/api/summary?company=${encodeURIComponent(currentCompany)}`);
  const data = await res.json();
  if (!data.success) return;

  const s = data.summary;
  summaryEl.style.display = 'block';

  const topSignal = Object.entries(s.signals || {}).sort((a, b) => b[1] - a[1])[0];

  document.getElementById('summaryCards').innerHTML = `
    <div class="summary-card ${s.highUrgency > 0 ? 'urgent' : ''}">
      <div class="summary-num ${s.highUrgency > 0 ? 'red' : ''}">${s.highUrgency}</div>
      <div class="summary-label">要アクション</div>
    </div>
    <div class="summary-card ${s.gridRelated > 0 ? 'grid' : ''}">
      <div class="summary-num ${s.gridRelated > 0 ? 'green' : ''}">${s.gridRelated}</div>
      <div class="summary-label">GRID提案機会</div>
    </div>
    <div class="summary-card">
      <div class="summary-num">${s.recentCount}</div>
      <div class="summary-label">直近7日間</div>
    </div>
    <div class="summary-card">
      <div class="summary-num">${s.total}</div>
      <div class="summary-label">総記事数（30日）</div>
    </div>
    ${topSignal ? `
    <div class="summary-card">
      <div class="summary-num" style="font-size:16px;padding-top:4px">${topSignal[0]}</div>
      <div class="summary-label">主要シグナル（${topSignal[1]}件）</div>
    </div>` : ''}
  `;
}

function applyFilters(articles) {
  return articles.filter(a => {
    if (currentCategory !== 'all' && a.category !== currentCategory) return false;
    if (currentSignal !== 'all' && a.signal !== currentSignal) return false;
    if (currentUrgency !== 'all' && a.urgency !== currentUrgency) return false;
    return true;
  });
}

function renderArticles(articles) {
  const filtered = applyFilters(articles);
  const gridArticles = filtered.filter(a => a.isGridRelated);
  const regularArticles = filtered.filter(a => !a.isGridRelated);

  const gridSection = document.getElementById('gridTopicsSection');
  document.getElementById('gridCount').textContent = `${gridArticles.length}件`;
  if (gridArticles.length > 0) {
    gridSection.style.display = 'block';
    document.getElementById('gridArticles').innerHTML = gridArticles.map(renderCard).join('');
  } else {
    gridSection.style.display = 'none';
  }

  const container = document.getElementById('categoriesContainer');
  const empty = document.getElementById('emptyState');

  if (filtered.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  const cats = currentCategory === 'all' ? Object.keys(CATEGORY_CONFIG) : [currentCategory];
  container.innerHTML = cats.map(cat => {
    const catArticles = regularArticles.filter(a => a.category === cat);
    if (catArticles.length === 0) return '';
    const cfg = CATEGORY_CONFIG[cat];
    return `
      <div class="category-section">
        <div class="cat-section-header">
          <span class="cat-line ${cfg.key}"></span>
          <h3>${cat}</h3>
          <span class="cat-article-count">${catArticles.length}件</span>
        </div>
        <div class="news-grid">${catArticles.map(renderCard).join('')}</div>
      </div>`;
  }).join('');
}

function renderCard(article) {
  const cfg = CATEGORY_CONFIG[article.category] || { key: 'retail' };
  const pubDate = article.publishedAt
    ? article.publishedAt.slice(5).replace('-', '/')
    : new Date(article.fetchedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });

  const proposalPrompt = encodeURIComponent(
    `以下の電力業界ニュースから営業提案仮説を作ってください。\n\n` +
    `【企業】${article.company}\n` +
    `【タイトル】${article.title}\n` +
    `【シグナル】${article.signal}\n` +
    `【カテゴリ】${article.category}\n` +
    `【サマリー】${article.summary}\n` +
    `【出典】${article.source}\n\n` +
    `このニュースから提案を作って`
  );

  const isHighUrgency = article.urgency === 'high';

  return `
    <div class="article-card">
      <div class="card-urgency-bar ${article.urgency || 'low'}"></div>
      <div class="article-top">
        <span class="cat-tag ${cfg.key}">${article.category}</span>
        <span class="signal-tag ${escHtml(article.signal || '一般情報')}">${escHtml(article.signal || '一般情報')}</span>
        <div class="article-meta-right">
          <span class="article-company">${escHtml(article.company)}</span>
          <span class="article-date">${pubDate}</span>
        </div>
      </div>
      <div class="article-title">${escHtml(article.title)}</div>
      <div class="article-summary">${escHtml(article.summary)}</div>
      ${article.isGridRelated && article.gridRelevance ? `
        <div class="grid-relevance">${escHtml(article.gridRelevance)}</div>` : ''}
      ${article.action ? `
        <div class="action-box action-${article.urgency || 'low'}">${escHtml(article.action)}</div>` : ''}
      <div class="article-source">${escHtml(article.source || '')}</div>
      <div class="article-actions">
        <a href="${escHtml(article.url)}" target="_blank" rel="noopener" class="btn-link btn-article">記事を読む →</a>
        <a href="https://claude.ai/new?q=${proposalPrompt}" target="_blank" rel="noopener"
           class="btn-link btn-proposal ${isHighUrgency ? 'urgent' : ''}">提案資料を作成</a>
      </div>
    </div>`;
}

// ── Load / Render (Competitor) ─────────────────────────────────
async function loadCompetitorNews() {
  showCompetitorLoading(true);
  try {
    const params = new URLSearchParams({ range: currentRange, mode: 'competitor' });
    if (currentCompetitor) params.set('company', currentCompetitor);

    const res = await fetch(`/api/news?${params}`);
    const data = await res.json();
    allCompetitorArticles = data.articles || [];
    renderCompetitorArticles(allCompetitorArticles);
    await refreshCompetitorFilter();
  } catch {
    showToast('競合情報の読み込みに失敗しました', 'error');
  } finally {
    showCompetitorLoading(false);
  }
}

async function refreshCompetitorFilter() {
  const res = await fetch('/api/companies?mode=competitor');
  const data = await res.json();
  const select = document.getElementById('competitorFilter');
  const current = select.value;
  select.innerHTML = '<option value="">すべての競合</option>' +
    (data.companies || []).map(c =>
      `<option value="${escHtml(c)}" ${c === current ? 'selected' : ''}>${escHtml(c)}</option>`
    ).join('');
}

function renderCompetitorArticles(articles) {
  const filtered = articles.filter(a => {
    if (currentCompetitorSignal !== 'all' && a.signal !== currentCompetitorSignal) return false;
    return true;
  });

  const landscape = document.getElementById('competitorLandscape');
  const empty = document.getElementById('competitorEmptyState');

  if (filtered.length === 0) {
    landscape.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  // Group by company
  const byCompany = {};
  filtered.forEach(a => {
    if (!byCompany[a.company]) byCompany[a.company] = [];
    byCompany[a.company].push(a);
  });

  landscape.innerHTML = Object.entries(byCompany).map(([company, arts]) => {
    const signalCounts = {};
    arts.forEach(a => { signalCounts[a.signal] = (signalCounts[a.signal] || 0) + 1; });
    const topSignal = Object.entries(signalCounts).sort((a, b) => b[1] - a[1])[0];

    return `
      <div class="competitor-section">
        <div class="competitor-header">
          <div class="competitor-title-row">
            <span class="competitor-icon">🏢</span>
            <h3 class="competitor-name">${escHtml(company)}</h3>
            <span class="competitor-count">${arts.length}件</span>
            ${topSignal ? `<span class="csignal-tag ${signalTagKey(topSignal[0])}">${escHtml(topSignal[0])}</span>` : ''}
          </div>
        </div>
        <div class="news-grid">${arts.map(renderCompetitorCard).join('')}</div>
      </div>`;
  }).join('');
}

function renderCompetitorCard(article) {
  const pubDate = article.publishedAt
    ? article.publishedAt.slice(5).replace('-', '/')
    : new Date(article.fetchedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });

  return `
    <div class="article-card competitor-card">
      <div class="card-urgency-bar ${article.urgency || 'low'}"></div>
      <div class="article-top">
        <span class="csignal-tag ${signalTagKey(article.signal)}">${escHtml(article.signal || '一般情報')}</span>
        <div class="article-meta-right">
          <span class="article-company">${escHtml(article.company)}</span>
          <span class="article-date">${pubDate}</span>
        </div>
      </div>
      <div class="article-title">${escHtml(article.title)}</div>
      <div class="article-summary">${escHtml(article.summary)}</div>
      ${article.action ? `
        <div class="action-box competitor-action">${escHtml(article.action)}</div>` : ''}
      <div class="article-source">${escHtml(article.source || '')}</div>
      <div class="article-actions">
        <a href="${escHtml(article.url)}" target="_blank" rel="noopener" class="btn-link btn-article">記事を読む →</a>
      </div>
    </div>`;
}

function signalTagKey(signal) {
  const map = {
    '新製品・機能': 'csig-product',
    '受注・導入事例': 'csig-win',
    '提携・協業': 'csig-partner',
    '資金調達・上場': 'csig-funding',
    '人事・体制': 'csig-hr',
    '価格・戦略': 'csig-strategy',
  };
  return map[signal] || 'csig-other';
}

// ── Utils ─────────────────────────────────────────────────
function showLoading(show) {
  document.getElementById('loadingState').style.display = show ? 'block' : 'none';
  document.getElementById('categoriesContainer').style.display = show ? 'none' : 'block';
}

function showCompetitorLoading(show) {
  document.getElementById('competitorLoadingState').style.display = show ? 'block' : 'none';
  document.getElementById('competitorLandscape').style.display = show ? 'none' : 'block';
}

function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => { toast.className = 'toast'; }, 3500);
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

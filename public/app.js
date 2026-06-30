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
let allArticles = [];

// ── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupRangeToggle();
  setupFilters();
  setupFetchForm();
  setupCompanyFilter();
  loadNews();
});

// ── Range ────────────────────────────────────────────────
function setupRangeToggle() {
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRange = btn.dataset.range;
      loadNews();
    });
  });
}

// ── Filters ───────────────────────────────────────────────
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

// ── Company filter ────────────────────────────────────────
function setupCompanyFilter() {
  document.getElementById('companyFilter').addEventListener('change', e => {
    currentCompany = e.target.value;
    loadNews();
    updateSummary();
  });
}

// ── Fetch form ────────────────────────────────────────────
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
      body: JSON.stringify({ company }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    addToHistory(company);
    showToast(`${data.count}件の新着ニュースを取得`, 'success');
    status.textContent = `新着 ${data.count}件`;

    // 取得した会社を選択状態にする
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

// ── Load / Render ─────────────────────────────────────────
async function loadNews() {
  showLoading(true);
  try {
    const params = new URLSearchParams({ range: currentRange });
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
  const res = await fetch('/api/companies');
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

  // GRID Topics
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

// ── Utils ─────────────────────────────────────────────────
function showLoading(show) {
  document.getElementById('loadingState').style.display = show ? 'block' : 'none';
  document.getElementById('categoriesContainer').style.display = show ? 'none' : 'block';
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

const CATEGORY_CONFIG = {
  '小売り': { key: 'retail', icon: '🛒', color: '#f59e0b' },
  '発電': { key: 'generation', icon: '🏭', color: '#3b82f6' },
  '送配電': { key: 'transmission', icon: '🔌', color: '#10b981' },
};

let currentRange = 'daily';
let currentCategory = 'all';
let currentCompany = '';
let allArticles = [];

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
  setupRangeToggle();
  setupCategoryFilter();
  setupFetchForm();
  setupCompanyFilter();
  loadNews();
});

// --- Range Toggle ---
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

// --- Category Filter ---
function setupCategoryFilter() {
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.cat;
      renderArticles(allArticles);
    });
  });
}

// --- Company Filter ---
function setupCompanyFilter() {
  document.getElementById('companyFilter').addEventListener('change', e => {
    currentCompany = e.target.value;
    loadNews();
  });
}

// --- Fetch Form ---
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
  let history = getHistory();
  history = [company, ...history.filter(c => c !== company)].slice(0, 8);
  localStorage.setItem('companyHistory', JSON.stringify(history));
  renderHistoryTags();
}

function renderHistoryTags() {
  const history = getHistory();
  const container = document.getElementById('companyHistory');
  container.innerHTML = history.map(c =>
    `<span class="history-tag" onclick="selectCompany('${c}')">${c}</span>`
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
  btn.innerHTML = '<span class="btn-icon">⏳</span> 検索中...';
  showLoading(true);
  status.textContent = `Claude が「${company}」のニュースを検索中...`;

  try {
    const res = await fetch('/api/fetch-news', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company })
    });
    const data = await res.json();

    if (!data.success) throw new Error(data.error);

    addToHistory(company);
    showToast(`✅ ${data.count}件のニュースを取得しました`, 'success');
    status.textContent = `${data.count}件取得完了`;
    await loadNews();
    await refreshCompanyFilter();
  } catch (err) {
    showToast(`エラー: ${err.message}`, 'error');
    status.textContent = 'エラーが発生しました';
    showLoading(false);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">🔍</span> ニュースを取得';
  }
}

// --- Load / Render ---
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
  } catch (err) {
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
    (data.companies || []).map(c => `<option value="${c}" ${c === current ? 'selected' : ''}>${c}</option>`).join('');
}

function renderArticles(articles) {
  const filtered = currentCategory === 'all'
    ? articles
    : articles.filter(a => a.category === currentCategory);

  const gridArticles = filtered.filter(a => a.isGridRelated);
  const regularArticles = filtered.filter(a => !a.isGridRelated);

  // GRID Topics
  const gridSection = document.getElementById('gridTopicsSection');
  const gridContainer = document.getElementById('gridArticles');
  document.getElementById('gridCount').textContent = `${gridArticles.length}件`;

  if (gridArticles.length > 0) {
    gridSection.style.display = 'block';
    gridContainer.innerHTML = gridArticles.map(a => renderCard(a)).join('');
  } else {
    gridSection.style.display = 'none';
  }

  // Regular by category
  const container = document.getElementById('categoriesContainer');
  const empty = document.getElementById('emptyState');

  if (regularArticles.length === 0 && gridArticles.length === 0) {
    container.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';

  const byCategory = {};
  const cats = currentCategory === 'all' ? Object.keys(CATEGORY_CONFIG) : [currentCategory];
  cats.forEach(cat => {
    byCategory[cat] = regularArticles.filter(a => a.category === cat);
  });

  container.innerHTML = cats.map(cat => {
    const catArticles = byCategory[cat];
    if (catArticles.length === 0) return '';
    const cfg = CATEGORY_CONFIG[cat];
    return `
      <div class="category-section">
        <div class="cat-section-header">
          <span class="cat-line ${cfg.key}"></span>
          <h3>${cat}</h3>
          <span class="cat-article-count">${catArticles.length}件</span>
        </div>
        <div class="news-grid">
          ${catArticles.map(a => renderCard(a)).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function renderCard(article) {
  const cfg = CATEGORY_CONFIG[article.category] || { key: 'retail' };
  const fetchedDate = new Date(article.fetchedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
  const pubDate = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
    : fetchedDate;

  const proposalPrompt = encodeURIComponent(
    `以下のニュース記事から提案仮説を作ってください。\n\n【タイトル】${article.title}\n【サマリー】${article.summary}\n【出典】${article.source || article.url}\n\nこのニュースから提案を作って`
  );

  return `
    <div class="article-card">
      <div class="article-meta">
        <span class="cat-tag ${cfg.key}">${article.category}</span>
        <span class="article-company">${escHtml(article.company)}</span>
        <span class="article-date">${pubDate}</span>
      </div>
      <div class="article-title">${escHtml(article.title)}</div>
      <div class="article-summary">${escHtml(article.summary)}</div>
      ${article.isGridRelated && article.gridRelevance ? `
        <div class="grid-relevance">${escHtml(article.gridRelevance)}</div>
      ` : ''}
      <div class="article-source">${escHtml(article.source || '出典不明')}</div>
      <div class="article-actions">
        <a href="${escHtml(article.url)}" target="_blank" rel="noopener" class="btn-link btn-article">記事を読む →</a>
        <a href="https://claude.ai/new?q=${proposalPrompt}" target="_blank" rel="noopener" class="btn-link btn-proposal">提案資料を作成</a>
      </div>
    </div>
  `;
}

// --- Utils ---
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
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

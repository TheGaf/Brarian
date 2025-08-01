// BRARIAN Results Controller
class BrarianResults {
  constructor() {
    this.config = null;
    this.searchData = null;
    this.pageMap = {}; // per-category pagination (0-indexed)
    this.pageSize = 25; // news uses 25 per page
    this.loadingCategories = new Set(); // track which category is currently loading more
    this.initializeConfig().then(() => {
      this.initializeFromURL();
      this.setupEventHandlers();
    });
  }

  async initializeConfig() {
    // Embedded config - no external file needed
    this.config = {
      AI_AGENT: {
        enabled: true
      },
      UI: {
        maxResultsPerCategory: 6
      }
    };
  }

  initializeFromURL() {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    const categories = params.get('categories')?.split(',').filter(c => c) || ['articles', 'news'];
    const useAI = params.get('ai') === '1';

    if (!query) {
      this.showError('No search query provided');
      return;
    }

    const decodedQuery = decodeURIComponent(query);
    document.getElementById('searchInput').value = decodedQuery;

    // reset paging
    categories.forEach((cat) => {
      this.pageMap[cat] = 0;
    });

    this.performSearch(decodedQuery, categories, useAI);
  }

  setupEventHandlers() {
    // Search handlers
    const searchBtn = document.getElementById('searchBtn');
    const searchInput = document.getElementById('searchInput');

    if (searchBtn) {
      searchBtn.addEventListener('click', () => this.triggerNewSearch());
    }

    if (searchInput) {
      searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.triggerNewSearch();
      });
    }
    
    // Ask BRARIAN handlers
    const askBtn = document.getElementById('askBtn');
    const askInput = document.getElementById('askInput');
    
    if (askBtn && askInput) {
      askBtn.addEventListener('click', () => this.askBrarian());
      askInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') this.askBrarian();
      });
    }
  }

  triggerNewSearch() {
    const query = document.getElementById('searchInput')?.value.trim();
    if (!query) return;
    
    const params = new URLSearchParams(window.location.search);
    const categories = params.get('categories')?.split(',').filter(c => c) || ['articles', 'news'];
    const useAI = params.get('ai') === '1';

    // reset paging
    categories.forEach((cat) => {
      this.pageMap[cat] = 0;
    });

    // update URL without reloading
    const newParams = new URLSearchParams({
      q: query,
      categories: categories.join(','),
      ai: useAI ? '1' : '0'
    });
    window.history.replaceState(null, '', `results.html?${newParams.toString()}`);

    this.performSearch(query, categories, useAI);
  }

  async performSearch(query, categories, useAI = true) {
    this.searchData = { query, categories, useAI };
    this.showLoading();

    try {
      const message = {
        action: 'search',
        query,
        categories,
        useAI,
        pageMap: this.pageMap
      };
      
      const response = await this.sendBackgroundMessage(message);
      
      if (!response) {
        this.showError('No response received. Please try again.');
        return;
      }
      
      this.displayResults(response);
      
    } catch (error) {
      console.error('Search failed:', error);
      this.showError(`Search failed: ${error.message}. Please try again.`);
    }
  }

  async loadMore(category) {
    if (!this.searchData || this.loadingCategories.has(category)) return;
    
    this.loadingCategories.add(category);
    this.pageMap[category] = (this.pageMap[category] || 0) + 1;
    
    // Update the button to show loading state
    const categorySection = document.querySelector(`[data-category="${category}"]`);
    const loadMoreBtn = categorySection?.querySelector('.load-more-btn');
    
    if (loadMoreBtn) {
      loadMoreBtn.disabled = true;
      loadMoreBtn.textContent = 'Loading...';
    }
    
    const { query, categories, useAI } = this.searchData;
    await this.performSearch(query, categories, useAI);
    
    this.loadingCategories.delete(category);
  }

  displayResults(data) {
    if (!data) {
      this.showError('No response received. Please try again.');
      return;
    }

    const { query, originalQuery, suggestions, results } = data;

    // Update header
    document.getElementById('queryTitle').textContent = `Results for "${this.escapeHtml(query)}"`;
    
    // Show AI status
    const aiStatus = document.getElementById('aiStatus');
    if (originalQuery && originalQuery !== query && this.searchData?.useAI) {
      aiStatus.textContent = `AI refined: "${originalQuery}" → "${query}"`;
      aiStatus.style.display = 'block';
    } else {
      aiStatus.style.display = 'none';
    }
    
    // Show Ask BRARIAN if AI is enabled
    const askBrarian = document.getElementById('askBrarian');
    if (askBrarian && this.config?.AI_AGENT?.enabled) {
      askBrarian.style.display = 'block';
    }

    // Suggestions
    const suggestionContainer = document.getElementById('suggestionTags');
    const suggestionsWrapper = document.getElementById('suggestions');
    
    if (suggestions && suggestions.length > 0 && suggestionContainer && suggestionsWrapper) {
      suggestionContainer.innerHTML = '';
      suggestions.forEach((s) => {
        const tag = document.createElement('button');
        tag.type = 'button';
        tag.className = 'suggestion-tag';
        tag.textContent = s;
        tag.setAttribute('aria-label', `Related search: ${s}`);
        tag.addEventListener('click', () => {
          document.getElementById('searchInput').value = s;
          this.triggerNewSearch();
        });
        suggestionContainer.appendChild(tag);
      });
      suggestionsWrapper.style.display = 'block';
    } else if (suggestionsWrapper) {
      suggestionsWrapper.style.display = 'none';
    }

    // Render category blocks
    const container = document.getElementById('results');
    container.innerHTML = '';
    let hasAnyResults = false;

    results.forEach((categoryData) => {
      const { category, results: categoryResults, diagnostics } = categoryData;

      if (!categoryResults || categoryResults.length === 0) return;

      hasAnyResults = true;
      const categorySection = this.createCategorySection(category, categoryResults, diagnostics);
      container.appendChild(categorySection);
    });

    if (!hasAnyResults) {
      container.innerHTML = '<div class="no-results">No results found in any category. Try different search terms.</div>';
    }
  }

  createCategorySection(category, results, diagnostics) {
    const section = document.createElement('div');
    section.className = 'category-section';
    section.setAttribute('data-category', category);

    const header = document.createElement('div');
    header.className = 'category-header';

    const encodedQuery = encodeURIComponent(this.searchData?.query || '');

    const titleEl = document.createElement('h3');
    titleEl.className = 'category-title';
    titleEl.textContent = category;

    const moreLink = document.createElement('a');
    moreLink.href = `category.html?category=${encodeURIComponent(category)}&q=${encodedQuery}`;
    moreLink.className = 'more-btn';
    moreLink.textContent = 'More';
    moreLink.setAttribute('aria-label', `More ${category} results`);

    header.appendChild(titleEl);
    header.appendChild(moreLink);
    section.appendChild(header);

    // Diagnostics display (if present)
    if (diagnostics && diagnostics.failed?.length > 0) {
      const diagContainer = document.createElement('div');
      diagContainer.className = 'diagnostics-wrapper';
      
      const summaryText = document.createElement('span');
      const failed = diagnostics.failed || [];
      const usedFallback = diagnostics.usedFallback;
      
      if (usedFallback) {
        summaryText.textContent = `Using fallback: ${usedFallback}`;
      } else if (failed.length > 0) {
        summaryText.textContent = `Some sources failed (${failed.length})`;
      }
      
      diagContainer.appendChild(summaryText);
      section.appendChild(diagContainer);
    }

    // Result cards
    results.forEach((res) => {
      const card = this.renderResultCard(res);
      section.appendChild(card);
    });

    // Pagination / Load more
    const isNews = category === 'news';
    const pageSize = isNews ? this.pageSize : this.config.UI.maxResultsPerCategory;
    const currentPage = this.pageMap[category] || 0;

    // If we got a full page, assume there might be more
    if (results.length >= pageSize) {
      const loadMoreWrapper = document.createElement('div');
      loadMoreWrapper.className = 'load-more';
      
      const loadMoreBtn = document.createElement('button');
      loadMoreBtn.className = 'load-more-btn';
      loadMoreBtn.type = 'button';
      loadMoreBtn.textContent = 'Load more';
      loadMoreBtn.setAttribute('aria-label', `Load more ${category} results`);
      
      loadMoreBtn.addEventListener('click', () => this.loadMore(category));
      
      loadMoreWrapper.appendChild(loadMoreBtn);
      section.appendChild(loadMoreWrapper);
    }

    return section;
  }

  renderResultCard(result) {
    const card = document.createElement('div');
    card.className = 'result-card';
    
    if (!result || !result.url) {
      card.innerHTML = '<p class="result-snippet">Invalid result data</p>';
      return card;
    }

    // Header with favicon and title
    const header = document.createElement('div');
    header.className = 'result-header';

    if (result.favicon) {
      const favicon = document.createElement('img');
      favicon.className = 'result-favicon';
      favicon.src = result.favicon;
      favicon.alt = '';
      favicon.setAttribute('aria-hidden', 'true');
      favicon.onerror = function() { this.style.display = 'none'; };
      header.appendChild(favicon);
    }

    const titleWrapper = document.createElement('h4');
    titleWrapper.className = 'result-title';

    const titleLink = document.createElement('a');
    titleLink.href = result.url;
    titleLink.textContent = result.title || 'Untitled';
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
    titleLink.setAttribute('aria-label', `Open result: ${result.title || result.url}`);

    titleWrapper.appendChild(titleLink);
    header.appendChild(titleWrapper);

    // Trust badge
    const trust = result.trustScore || { level: 'medium', score: 50 };
    const trustBadge = document.createElement('div');
    trustBadge.className = `trust-badge trust-${trust.level}`;
    trustBadge.textContent = trust.score;
    trustBadge.setAttribute('title', trust.reason || 'Trust score');
    trustBadge.setAttribute('aria-label', `Trust score: ${trust.score}, level: ${trust.level}`);
    header.appendChild(trustBadge);

    card.appendChild(header);

    // Handle thumbnails for different content types
    if (result.thumbnail) {
      const thumbnailClass = result.type === 'video' ? 'thumbnail video-thumbnail' : 'thumbnail';
      const thumbnail = document.createElement('img');
      thumbnail.src = result.thumbnail;
      thumbnail.alt = 'Preview';
      thumbnail.className = thumbnailClass;
      thumbnail.onerror = function() { this.style.display = 'none'; };
      card.appendChild(thumbnail);
    }

    // Snippet
    if (result.snippet) {
      const snippet = document.createElement('p');
      snippet.className = 'result-snippet';
      snippet.textContent = result.snippet;
      card.appendChild(snippet);
    }

    // Meta
    const meta = document.createElement('div');
    meta.className = 'result-meta';

    const source = document.createElement('span');
    source.className = 'result-source';
    source.textContent = result.source || 'Unknown';

    const urlEl = document.createElement('span');
    urlEl.className = 'result-url';
    urlEl.textContent = this.getDomain(result.url);
    urlEl.setAttribute('title', result.url);

    meta.appendChild(source);
    meta.appendChild(urlEl);
    card.appendChild(meta);

    return card;
  }
  
  async askBrarian() {
    const askInput = document.getElementById('askInput');
    const askBtn = document.getElementById('askBtn');
    
    if (!askInput || !askBtn) return;
    
    const question = askInput.value.trim();
    if (!question) return;
    
    const originalText = askBtn.textContent;
    
    try {
      askBtn.textContent = 'Thinking...';
      askBtn.disabled = true;
      askInput.disabled = true;
      
      // Send question to AI with context of current search
      const response = await this.sendBackgroundMessage({
        action: 'ai_refine_query',
        query: `${this.searchData?.query || ''} ${question}`,
        context: this.searchData
      });
      
      if (response && response.refinedQuery) {
        document.getElementById('searchInput').value = response.refinedQuery;
        askInput.value = '';
        this.triggerNewSearch();
      }
      
    } catch (error) {
      console.error('Ask BRARIAN failed:', error);
      alert('Sorry, BRARIAN is currently unavailable. Please ensure your AI provider is running and try again.');
    } finally {
      askBtn.textContent = originalText;
      askBtn.disabled = false;
      askInput.disabled = false;
    }
  }

  showLoading() {
    document.getElementById('results').innerHTML = '<div class="loading" role="status" aria-label="Searching">Searching</div>';
    document.getElementById('queryTitle').textContent = 'Searching...';
  }

  showError(message) {
    document.getElementById('results').innerHTML = `<div class="no-results">${this.escapeHtml(message)}</div>`;
    document.getElementById('queryTitle').textContent = 'Error';
  }

  escapeHtml(text) {
    if (typeof text !== 'string') {
      text = String(text || '');
    }
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  sendBackgroundMessage(payload) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(payload, (resp) => {
        if (chrome.runtime.lastError) {
          console.error('[BRARIAN] Message error:', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else {
          resolve(resp);
        }
      });
    });
  }

  getDomain(url) {
    try {
      const domain = new URL(url).hostname;
      return domain.replace('www.', '');
    } catch {
      return 'invalid-url';
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new BrarianResults();
});
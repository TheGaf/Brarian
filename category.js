// BRARIAN Category Controller
class BrarianCategory {
  constructor() {
    this.config = null;
    this.allResults = [];
    this.filteredResults = [];
    this.displayedCount = 0;
    this.resultsPerPage = 20;
    this.category = '';
    this.query = '';
    
    this.initializeConfig().then(() => {
      this.initializeFromURL();
      this.setupEventHandlers();
    });
  }
  
  async initializeConfig() {
    // Embedded config - no external file needed
    this.config = {
      "AI_AGENT": {
        "enabled": true
      },
      "UI": {
        "maxResultsPerCategory": 6
      }
    };
  }
  
  initializeFromURL() {
    const params = new URLSearchParams(window.location.search);
    this.category = params.get('category') || 'articles';
    this.query = params.get('q') || '';
    
    if (!this.query) {
      this.showError('No search query provided');
      return;
    }
    
    // Update UI
    document.getElementById('categoryTitle').textContent = this.category;
    document.getElementById('categorySubtitle').textContent = `Search: "${this.query}"`;
    
    // Set up back button
    const backUrl = `results.html?q=${encodeURIComponent(this.query)}&categories=${this.category}&ai=1`;
    document.getElementById('backBtn').href = backUrl;
    
    this.loadCategoryResults();
  }
  
  setupEventHandlers() {
    // Filter change handlers
    document.getElementById('sortBy').addEventListener('change', () => this.applyFilters());
    document.getElementById('trustFilter').addEventListener('change', () => this.applyFilters());
    document.getElementById('sourceFilter').addEventListener('change', () => this.applyFilters());
    
    // Load more handler
    document.getElementById('loadMoreBtn').addEventListener('click', () => this.loadMoreResults());
  }
  
  async loadCategoryResults() {
    this.showLoading();
    
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          action: 'search',
          query: this.query,
          categories: [this.category],
          useAI: false,
          fullResults: true // Request more comprehensive results
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
      
      if (response && response.error) {
        throw new Error(response.error);
      }
      
      if (response && response.results && response.results[0]) {
        this.allResults = response.results[0].results || [];
        this.populateSourceFilter();
        this.applyFilters();
      } else {
        this.showNoResults();
      }
      
    } catch (error) {
      console.error('Category search failed:', error);
      this.showError(`Failed to load results: ${error.message}. Please try again.`);
    }
  }
  
  populateSourceFilter() {
    const sourceFilter = document.getElementById('sourceFilter');
    const sources = [...new Set(this.allResults.map(result => result.source).filter(Boolean))].sort();
    
    // Clear existing options except "All Sources"
    sourceFilter.innerHTML = '<option value="">All Sources</option>';
    
    sources.forEach(source => {
      const option = document.createElement('option');
      option.value = source;
      option.textContent = source;
      sourceFilter.appendChild(option);
    });
  }
  
  applyFilters() {
    const sortBy = document.getElementById('sortBy').value;
    const minTrust = parseInt(document.getElementById('trustFilter').value) || 0;
    const sourceFilter = document.getElementById('sourceFilter').value;
    
    // Filter results
    this.filteredResults = this.allResults.filter(result => {
      if (!result) return false;
      
      // Trust filter
      if (minTrust > 0 && (result.trustScore?.score || 0) < minTrust) {
        return false;
      }
      
      // Source filter
      if (sourceFilter && result.source !== sourceFilter) {
        return false;
      }
      
      return true;
    });
    
    // Sort results
    this.sortResults(sortBy);
    
    // Reset display and show results
    this.displayedCount = 0;
    this.displayResults(true);
  }
  
  sortResults(sortBy) {
    switch (sortBy) {
      case 'trust':
        this.filteredResults.sort((a, b) => (b.trustScore?.score || 0) - (a.trustScore?.score || 0));
        break;
      case 'date':
        this.filteredResults.sort((a, b) => {
          const dateA = a.metadata?.created || a.metadata?.published || '0';
          const dateB = b.metadata?.created || b.metadata?.published || '0';
          return new Date(dateB) - new Date(dateA);
        });
        break;
      case 'source':
        this.filteredResults.sort((a, b) => (a.source || '').localeCompare(b.source || ''));
        break;
      case 'relevance':
      default:
        // Keep original order (already sorted by relevance from search)
        break;
    }
  }
  
  displayResults(reset = false) {
    const container = document.getElementById('results');
    
    if (reset) {
      container.innerHTML = '';
      this.displayedCount = 0;
    }
    
    if (this.filteredResults.length === 0) {
      container.innerHTML = '<div class="no-results">No results found with current filters.</div>';
      document.getElementById('loadMore').style.display = 'none';
      return;
    }
    
    const endIndex = Math.min(this.displayedCount + this.resultsPerPage, this.filteredResults.length);
    const resultsToShow = this.filteredResults.slice(this.displayedCount, endIndex);
    
    resultsToShow.forEach(result => {
      if (result) {
        const card = this.createResultCard(result);
        container.appendChild(card);
      }
    });
    
    this.displayedCount = endIndex;
    
    // Show/hide load more button
    const loadMore = document.getElementById('loadMore');
    if (this.displayedCount < this.filteredResults.length) {
      loadMore.style.display = 'block';
      document.getElementById('loadMoreBtn').textContent = 
        `Load More (${this.filteredResults.length - this.displayedCount} remaining)`;
      document.getElementById('loadMoreBtn').disabled = false;
    } else {
      loadMore.style.display = 'none';
    }
  }
  
  createResultCard(result) {
    const card = document.createElement('div');
    card.className = 'result-card';
    
    if (!result || !result.url) {
      card.innerHTML = '<p class="result-snippet">Invalid result data</p>';
      return card;
    }
    
    const trustClass = `trust-${result.trustScore?.level || 'medium'}`;
    const trustScore = result.trustScore?.score ?? 50;
    
    // Create media preview for images/videos
    let mediaHTML = '';
    if (result.thumbnail) {
      if (result.type === 'video') {
        mediaHTML = `
          <div class="media-preview">
            <div class="video-thumbnail">
              <img src="${this.escapeHtml(result.thumbnail)}" alt="Video preview" class="thumbnail" onerror="this.style.display='none'">
            </div>
          </div>
        `;
      } else if (result.type === 'image') {
        mediaHTML = `
          <div class="media-preview">
            <img src="${this.escapeHtml(result.thumbnail)}" alt="Image preview" class="thumbnail" onerror="this.style.display='none'">
          </div>
        `;
      }
    }
    
    // Format date if available
    let dateHTML = '';
    if (result.metadata?.created || result.metadata?.published) {
      try {
        const date = new Date(result.metadata.created || result.metadata.published);
        if (!isNaN(date.getTime())) {
          dateHTML = `<span class="result-date">${date.toLocaleDateString()}</span>`;
        }
      } catch (e) {
        // Invalid date, skip
      }
    }
    
    // Ensure required fields exist
    const title = result.title || 'Untitled';
    const snippet = result.snippet || 'No description available';
    const source = result.source || 'Unknown';
    
    card.innerHTML = `
      <div class="trust-badge ${trustClass}" title="${this.escapeHtml(result.trustScore?.reason || 'Unknown')}">${trustScore}</div>
      
      <div class="result-content">
        <div class="result-header">
          ${result.favicon ? `<img src="${this.escapeHtml(result.favicon)}" alt="" class="result-favicon" onerror="this.style.display='none'">` : ''}
          <h3 class="result-title">
            <a href="${this.escapeHtml(result.url)}" target="_blank" rel="noopener noreferrer">${this.escapeHtml(title)}</a>
          </h3>
        </div>
        
        ${mediaHTML}
        
        <p class="result-snippet">${this.escapeHtml(snippet)}</p>
        
        <div class="result-meta">
          <span class="result-source">${this.escapeHtml(source)}</span>
          <span class="result-url">${this.escapeHtml(this.getDomain(result.url))}</span>
          ${dateHTML}
        </div>
      </div>
    `;
    
    return card;
  }
  
  loadMoreResults() {
    const btn = document.getElementById('loadMoreBtn');
    btn.disabled = true;
    btn.textContent = 'Loading...';
    
    // Small delay for visual feedback
    setTimeout(() => {
      this.displayResults(false);
    }, 100);
  }
  
  showLoading() {
    document.getElementById('results').innerHTML = '<div class="loading">Loading category results</div>';
    document.getElementById('loadMore').style.display = 'none';
  }
  
  showNoResults() {
    document.getElementById('results').innerHTML = '<div class="no-results">No results found for this category.</div>';
    document.getElementById('loadMore').style.display = 'none';
  }
  
  showError(message) {
    document.getElementById('results').innerHTML = `<div class="no-results">${this.escapeHtml(message)}</div>`;
    document.getElementById('loadMore').style.display = 'none';
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
  
  getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }
}

// Initialize category page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new BrarianCategory();
});
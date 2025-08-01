// BRARIAN Popup Controller
class BrarianPopup {
  constructor() {
    this.config = null;
    this.initializeConfig().then(() => {
      this.initializeEventListeners();
      this.checkAIStatus();
      this.loadRecentSearches();
      this.validateSearch(); // Initial validation
    });
  }
  
  async initializeConfig() {
    // Embedded config - no external file needed
    this.config = {
      "AI_AGENT": {
        "enabled": true,
        "provider": "ollama"
      },
      "UI": {
        "maxResultsPerCategory": 6
      }
    };
  }
  
  initializeEventListeners() {
    // Search button and input
    document.getElementById('searchBtn').addEventListener('click', () => this.performSearch());
    document.getElementById('searchInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.performSearch();
    });
    
    // Validate on input change
    document.getElementById('searchInput').addEventListener('input', () => this.validateSearch());
    
    // Category change handlers
    document.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', () => this.validateSearch());
    });
    
    // Recent search handlers
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('recent-item')) {
        this.loadRecentSearch(e.target.textContent);
      }
    });
  }
  
  async checkAIStatus() {
    const statusElement = document.getElementById('aiStatus');
    const aiToggle = document.getElementById('aiAgent');
    
    if (!this.config.AI_AGENT.enabled) {
      statusElement.textContent = 'AI disabled in config';
      statusElement.style.color = '#666666';
      aiToggle.checked = false;
      aiToggle.disabled = true;
      return;
    }
    
    try {
      statusElement.textContent = 'Checking AI agent...';
      statusElement.style.color = '#59DCFF';
      
      const result = await this.testAIConnection();
      if (result && result.connected) {
        statusElement.textContent = `${this.config.AI_AGENT.provider} connected`;
        statusElement.style.color = '#00FF33';
        aiToggle.checked = true;
      } else {
        const reason = result?.reason || 'unavailable';
        statusElement.textContent = `${this.config.AI_AGENT.provider} ${reason}`;
        statusElement.style.color = '#FF6B6B';
        aiToggle.checked = false;
      }
    } catch (error) {
      statusElement.textContent = 'AI agent offline';
      statusElement.style.color = '#FF6B6B';
      aiToggle.checked = false;
      console.error('[BRARIAN] AI status check failed:', error);
    }
  }
  
  async testAIConnection() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'test_ai_connection'
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[BRARIAN] Message error:', chrome.runtime.lastError);
          resolve({ connected: false, reason: 'Extension error' });
        } else {
          resolve(response || { connected: false, reason: 'No response' });
        }
      });
    });
  }
  
  validateSearch() {
    const query = document.getElementById('searchInput').value.trim();
    const categories = this.getSelectedCategories();
    const searchBtn = document.getElementById('searchBtn');
    
    searchBtn.disabled = !query || categories.length === 0;
    
    // Update button text based on state
    if (!query) {
      searchBtn.textContent = 'Enter a search query';
    } else if (categories.length === 0) {
      searchBtn.textContent = 'Select at least one category';
    } else {
      searchBtn.textContent = 'Search';
    }
  }
  
  getSelectedCategories() {
    const categories = [];
    ['articles', 'news', 'images', 'videos', 'academic'].forEach(cat => {
      if (document.getElementById(cat).checked) {
        categories.push(cat);
      }
    });
    return categories;
  }
  
  async performSearch() {
    const query = document.getElementById('searchInput').value.trim();
    const categories = this.getSelectedCategories();
    const useAI = document.getElementById('aiAgent').checked;
    
    if (!query || categories.length === 0) {
      return;
    }
    
    // Save to recent searches
    this.saveRecentSearch(query);
    
    // Build search parameters
    const params = new URLSearchParams({
      q: query,
      categories: categories.join(','),
      ai: useAI ? '1' : '0'
    });
    
    // Open results page
    chrome.tabs.create({
      url: `results.html?${params.toString()}`
    });
    
    // Close popup
    window.close();
  }
  
  saveRecentSearch(query) {
    chrome.storage.local.get(['recentSearches'], (result) => {
      let recent = result.recentSearches || [];
      
      // Remove if already exists
      recent = recent.filter(item => item !== query);
      
      // Add to beginning
      recent.unshift(query);
      
      // Keep only last 5
      recent = recent.slice(0, 5);
      
      chrome.storage.local.set({ recentSearches: recent });
      this.displayRecentSearches(recent);
    });
  }
  
  loadRecentSearches() {
    chrome.storage.local.get(['recentSearches'], (result) => {
      const recent = result.recentSearches || [];
      this.displayRecentSearches(recent);
    });
  }
  
  displayRecentSearches(searches) {
    const container = document.getElementById('recentSearches');
    const list = document.getElementById('recentList');
    
    if (searches.length === 0) {
      container.style.display = 'none';
      return;
    }
    
    container.style.display = 'block';
    list.innerHTML = searches.map(search => 
      `<div class="recent-item" title="Click to search: ${this.escapeHtml(search)}">${this.escapeHtml(search)}</div>`
    ).join('');
  }
  
  loadRecentSearch(query) {
    document.getElementById('searchInput').value = query;
    this.validateSearch();
    // Focus input so user can modify if needed
    document.getElementById('searchInput').focus();
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new BrarianPopup();
});
// BRARIAN Background Service Worker
class BrarianBackground {
  constructor() {
    this.config = null;
    this.trustConfig = null;
    this.initializeConfig();
    this.setupMessageHandlers();
  }
  
  async initializeConfig() {
    try {
      // Embedded config - no external files needed
      this.config = {
        "AI_AGENT": {
          "enabled": true,
          "provider": "ollama",
          "ollama": {
            "endpoint": "http://localhost:11434",
            "model": "mistral"
          },
          "gpt4all": {
            "endpoint": "http://localhost:8080", 
            "model": "gpt4all-j-v1.3-groovy"
          },
          "huggingface": {
            "endpoint": "https://api-inference.huggingface.co",
            "apiKey": "",
            "model": "microsoft/DialoGPT-medium"
          }
        },
        "SOURCES": {
          "articles": {
            "duckduckgo": { "enabled": true, "weight": 0.9 }
          },
          "news": {
            "duckduckgo": { "enabled": true, "weight": 0.9 },
            "hackernews": { "enabled": true, "weight": 0.3 }
          },
          "images": {
            "duckduckgo": { "enabled": true, "weight": 0.7 }
          },
          "videos": {
            "duckduckgo": { "enabled": true, "weight": 0.7 }
          },
          "academic": {
            "duckduckgo": { "enabled": true, "weight": 0.8 }
          }
        },
        "UI": {
          "maxResultsPerCategory": 6
        }
      };
      
      // Embedded trust config
      this.trustConfig = {
        "domains": {
          // Zero trust - known problematic sources
          "wikipedia.org": 0,
          "x.com": 0,
          "twitter.com": 0,
          "facebook.com": 0,
          "tiktok.com": 0,
          
          // High trust - academic and scientific
          "nature.com": 95,
          "science.org": 95,
          "arxiv.org": 90,
          "pubmed.ncbi.nlm.nih.gov": 90,
          "scholar.google.com": 85,
          "jstor.org": 85,
          "ieee.org": 85,
          
          // High trust - major news organizations
          "reuters.com": 85,
          "apnews.com": 85,
          "bbc.com": 80,
          "npr.org": 80,
          "pbs.org": 80,
          
          // Medium-high trust - tech and specialized
          "github.com": 80,
          "stackoverflow.com": 75,
          "mozilla.org": 75,
          "w3.org": 80,
          
          // Medium trust - mainstream news
          "nytimes.com": 70,
          "washingtonpost.com": 70,
          "theguardian.com": 70,
          "wsj.com": 70,
          "economist.com": 70,
          
          // Lower trust - aggregators and social
          "reddit.com": 30,
          "medium.com": 40,
          "quora.com": 35,
          "yahoo.com": 40
        },
        "patterns": {
          "\\.gov$": 80,
          "\\.edu$": 75,
          "\\.org$": 65,
          "\\.mil$": 75,
          "\\.ac\\.uk$": 75,
          "blog\\.": 40,
          "wiki\\.": 30,
          "\\.wordpress\\.com$": 35,
          "\\.blogspot\\.com$": 35
        },
        "categories": {
          "high": { "min": 80, "color": "#00FF33" },
          "medium": { "min": 50, "color": "#FBAE17" },
          "low": { "min": 30, "color": "#FF6B6B" },
          "zero": { "min": 0, "color": "#FF0066" }
        }
      };
      
      console.log('[BRARIAN] Configuration loaded successfully');
    } catch (error) {
      console.error('[BRARIAN] Config loading failed:', error);
      this.useDefaultConfig();
    }
  }
  
  useDefaultConfig() {
    this.config = {
      AI_AGENT: { enabled: false },
      UI: { maxResultsPerCategory: 6 },
      SOURCES: {
        articles: { duckduckgo: { enabled: true, weight: 0.8 } },
        news: { duckduckgo: { enabled: true, weight: 0.9 } },
        images: { duckduckgo: { enabled: true, weight: 0.7 } },
        videos: { duckduckgo: { enabled: true, weight: 0.7 } },
        academic: { duckduckgo: { enabled: true, weight: 0.8 } }
      }
    };
    this.trustConfig = { 
      domains: {}, 
      patterns: {},
      categories: {
        "high": { "min": 80, "color": "#00FF33" },
        "medium": { "min": 50, "color": "#FBAE17" },
        "low": { "min": 30, "color": "#FF6B6B" },
        "zero": { "min": 0, "color": "#FF0066" }
      }
    };
  }
  
  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'search':
          this.handleSearch(message).then(sendResponse).catch(error => {
            console.error('[BRARIAN] Search handler error:', error);
            sendResponse({ error: error.message });
          });
          return true;
          
        case 'test_ai_connection':
          this.testAIConnection().then(sendResponse).catch(error => {
            console.error('[BRARIAN] AI test error:', error);
            sendResponse({ connected: false, reason: error.message });
          });
          return true;
          
        case 'ai_refine_query':
          this.refineQueryWithAI(message.query).then(sendResponse).catch(error => {
            console.error('[BRARIAN] AI refine error:', error);
            sendResponse({ error: error.message });
          });
          return true;
          
        case 'get_trust_score':
          sendResponse(this.calculateTrustScore(message.url));
          return false;
          
        default:
          sendResponse({ error: 'Unknown action' });
          return false;
      }
    });
  }
  
  async handleSearch(message) {
    console.log('[BRARIAN] Search request:', message);
    
    const { query, categories, useAI } = message;
    let searchQuery = query;
    let suggestions = [];
    
    // AI Enhancement Phase
    if (useAI && this.config?.AI_AGENT?.enabled) {
      try {
        const aiResult = await this.enhanceSearchWithAI(query, categories);
        searchQuery = aiResult.refinedQuery || query;
        suggestions = aiResult.suggestions || [];
      } catch (error) {
        console.error('[BRARIAN] AI enhancement failed:', error);
        // Continue with original query
      }
    }
    
    // Multi-source Search Phase
    const allResults = [];
    const searchPromises = [];
    
    for (const category of categories) {
      searchPromises.push(this.searchCategory(category, searchQuery));
    }
    
    const categoryResults = await Promise.allSettled(searchPromises);
    
    // Process results
    categoryResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const category = categories[index];
        allResults.push({
          category,
          results: result.value.slice(0, this.config?.UI?.maxResultsPerCategory || 6)
        });
      }
    });
    
    return {
      query: searchQuery,
      originalQuery: query,
      suggestions,
      results: allResults,
      timestamp: Date.now()
    };
  }
  
  async searchCategory(category, query) {
    console.log(`[BRARIAN] Searching ${category} for:`, query);
    
    const sources = this.config?.SOURCES?.[category] || {};
    const results = [];
    
    // DuckDuckGo (primary source)
    if (sources.duckduckgo?.enabled !== false) {
      try {
        const duckResults = await this.searchDuckDuckGo(query, category);
        results.push(...duckResults);
      } catch (error) {
        console.error(`[BRARIAN] DuckDuckGo ${category} failed:`, error);
      }
    }
    
    // Category-specific sources
    switch (category) {
      case 'news':
        // Hacker News as supplementary
        if (sources.hackernews?.enabled !== false) {
          try {
            const hnResults = await this.searchHackerNews(query);
            results.push(...hnResults.slice(0, 3)); // Limit to 3 results
          } catch (error) {
            console.error('[BRARIAN] HackerNews failed:', error);
          }
        }
        break;
        
      case 'articles':
        // Use DuckDuckGo for articles (already handled above)
        break;
        
      case 'images':
        // Use DuckDuckGo with image-specific query
        break;
        
      case 'videos':
        // Use DuckDuckGo with video-specific query
        break;
        
      case 'academic':
        try {
          const academicResults = await this.searchAcademic(query);
          results.push(...academicResults);
        } catch (error) {
          console.error('[BRARIAN] Academic search failed:', error);
        }
        break;
    }
    
    // Add trust scores and deduplicate
    return this.processResults(results, category);
  }
  
  async searchDuckDuckGo(query, category) {
    return this.searchDuckDuckGoInstantAnswers(query, category);
  }
  
  async searchDuckDuckGoInstantAnswers(query, category) {
    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const results = [];
      
      // Abstract result
      if (data.Abstract && data.AbstractURL) {
        results.push({
          title: data.Heading || query,
          url: data.AbstractURL,
          snippet: data.Abstract,
          source: 'DuckDuckGo',
          type: category,
          favicon: this.getFaviconUrl(data.AbstractURL)
        });
      }
      
      // Related topics
      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        data.RelatedTopics.forEach(topic => {
          if (topic && topic.Text && topic.FirstURL && !topic.FirstURL.includes('duckduckgo.com')) {
            results.push({
              title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 100),
              url: topic.FirstURL,
              snippet: topic.Text,
              source: 'DuckDuckGo',
              type: category,
              favicon: this.getFaviconUrl(topic.FirstURL)
            });
          }
        });
      }
      
      return results;
    } catch (error) {
      console.error('[BRARIAN] DuckDuckGo API error:', error);
      return [];
    }
  }
  
  async searchAcademic(query) {
    const results = [];
    
    try {
      const academicQuery = `${query} site:arxiv.org OR site:pubmed.ncbi.nlm.nih.gov OR filetype:pdf`;
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(academicQuery)}&format=json&no_redirect=1&no_html=1`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
        data.RelatedTopics.forEach(topic => {
          if (topic && topic.FirstURL && this.isAcademicSource(topic.FirstURL)) {
            results.push({
              title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 100),
              url: topic.FirstURL,
              snippet: topic.Text,
              source: 'Academic',
              type: 'academic',
              favicon: this.getFaviconUrl(topic.FirstURL)
            });
          }
        });
      }
    } catch (error) {
      console.error('Academic search failed:', error);
    }
    
    return results;
  }
  
  async searchHackerNews(query) {
    try {
      const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=10`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const results = [];
      
      if (data.hits && Array.isArray(data.hits)) {
        data.hits.forEach(hit => {
          if (hit.url && !hit.url.includes('news.ycombinator.com')) {
            results.push({
              title: hit.title || 'Untitled',
              url: hit.url,
              snippet: `${hit.points || 0} points, ${hit.num_comments || 0} comments on Hacker News`,
              source: 'Hacker News',
              type: 'news',
              favicon: this.getFaviconUrl(hit.url),
              metadata: {
                points: hit.points || 0,
                comments: hit.num_comments || 0,
                author: hit.author || 'unknown',
                created: hit.created_at
              }
            });
          }
        });
      }
      
      return results;
    } catch (error) {
      console.error('[BRARIAN] HackerNews search failed:', error);
      return [];
    }
  }
  
  async searchImages(query) {
    // Image search using DuckDuckGo with specific parameters
    const imageQuery = `${query} site:unsplash.com OR site:pexels.com OR site:pixabay.com OR site:flickr.com`;
    return this.searchDuckDuckGoInstantAnswers(imageQuery, 'images');
  }
  
  async searchVideos(query) {
    // Video search using DuckDuckGo with video platforms
    const videoQuery = `${query} site:youtube.com OR site:vimeo.com OR site:dailymotion.com`;
    return this.searchDuckDuckGoInstantAnswers(videoQuery, 'videos');
  }
  
  processResults(results, category) {
    // Remove duplicates by URL
    const seen = new Set();
    const unique = results.filter(result => {
      if (!result || !result.url) return false;
      if (seen.has(result.url)) return false;
      seen.add(result.url);
      return true;
    });
    
    // Add trust scores
    return unique.map(result => ({
      ...result,
      trustScore: this.calculateTrustScore(result.url),
      category: category
    }));
  }
  
  calculateTrustScore(url) {
    if (!url || !this.trustConfig) {
      return { score: 50, level: 'medium', reason: 'Unknown source' };
    }
    
    try {
      const domain = new URL(url).hostname.toLowerCase();
      
      // Check direct domain matches
      if (this.trustConfig.domains && this.trustConfig.domains[domain] !== undefined) {
        const score = this.trustConfig.domains[domain];
        return {
          score,
          level: this.getTrustLevel(score),
          reason: `Domain: ${domain}`
        };
      }
      
      // Check pattern matches
      if (this.trustConfig.patterns) {
        for (const [pattern, score] of Object.entries(this.trustConfig.patterns)) {
          try {
            const regex = new RegExp(pattern);
            if (regex.test(domain)) {
              return {
                score,
                level: this.getTrustLevel(score),
                reason: `Pattern: ${pattern}`
              };
            }
          } catch (e) {
            console.error(`Invalid regex pattern: ${pattern}`, e);
          }
        }
      }
      
      // Default score
      return { score: 50, level: 'medium', reason: 'Standard evaluation' };
      
    } catch (error) {
      return { score: 50, level: 'medium', reason: 'Unable to verify' };
    }
  }
  
  getTrustLevel(score) {
    const categories = this.trustConfig?.categories || {};
    if (score >= (categories.high?.min || 80)) return 'high';
    if (score >= (categories.medium?.min || 50)) return 'medium';
    if (score >= (categories.low?.min || 30)) return 'low';
    return 'zero';
  }
  
  getFaviconUrl(url) {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
    } catch {
      return '';
    }
  }
  
  getVideoSource(url) {
    if (url.includes('youtube.com')) return 'YouTube';
    if (url.includes('vimeo.com')) return 'Vimeo';
    return 'Video';
  }
  
  getVideoThumbnail(url) {
    if (url.includes('youtube.com')) {
      const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
      if (videoId && videoId[1]) {
        return `https://img.youtube.com/vi/${videoId[1]}/mqdefault.jpg`;
      }
    }
    return '';
  }
  
  isAcademicSource(url) {
    const academicDomains = ['arxiv.org', 'pubmed.ncbi.nlm.nih.gov', 'scholar.google', 'jstor.org', 'ieee.org'];
    return academicDomains.some(domain => url.includes(domain)) || 
           url.includes('.edu') || 
           url.includes('filetype:pdf');
  }
  
  // AI Integration Methods
  async testAIConnection() {
    if (!this.config?.AI_AGENT?.enabled) {
      return { connected: false, reason: 'AI disabled in configuration' };
    }
    
    try {
      const provider = this.config.AI_AGENT.provider;
      
      switch (provider) {
        case 'ollama':
          return await this.testOllama();
        case 'gpt4all':
          return await this.testGPT4All();
        case 'huggingface':
          return await this.testHuggingFace();
        default:
          return { connected: false, reason: 'Unknown provider' };
      }
    } catch (error) {
      return { connected: false, reason: error.message };
    }
  }
  
  async testOllama() {
    const endpoint = this.config.AI_AGENT.ollama.endpoint;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(`${endpoint}/api/tags`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data.models && data.models.length > 0) {
          return { connected: true };
        } else {
          return { connected: false, reason: 'No models available' };
        }
      }
      return { connected: false, reason: `HTTP ${response.status}` };
    } catch (error) {
      if (error.name === 'AbortError') {
        return { connected: false, reason: 'Connection timeout' };
      }
      return { connected: false, reason: 'Ollama not running' };
    }
  }
  
  async testGPT4All() {
    const endpoint = this.config.AI_AGENT.gpt4all.endpoint;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${endpoint}/v1/models`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return { connected: response.ok };
    } catch {
      return { connected: false, reason: 'GPT4All not running' };
    }
  }
  
  async testHuggingFace() {
    const apiKey = this.config.AI_AGENT.huggingface.apiKey;
    if (!apiKey) return { connected: false, reason: 'No API key configured' };
    
    try {
      const response = await fetch('https://api-inference.huggingface.co/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      return { connected: response.ok };
    } catch {
      return { connected: false, reason: 'Network error' };
    }
  }
  
  async enhanceSearchWithAI(query, categories) {
    if (!this.config?.AI_AGENT?.enabled) {
      return { refinedQuery: query, suggestions: [] };
    }
    
    const prompt = `You are BRARIAN, an AI research assistant. A user wants to search for: "${query}" in categories: ${categories.join(', ')}.

Provide:
1. A refined search query that would yield better results
2. 3 related search suggestions

Respond ONLY with valid JSON in this exact format:
{
  "refinedQuery": "improved search terms",
  "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"]
}`;
    
    try {
      const response = await this.queryAI(prompt);
      
      // Try to parse the response
      let parsed;
      try {
        parsed = JSON.parse(response);
      } catch (parseError) {
        // If parsing fails, try to extract JSON from the response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Could not parse AI response');
        }
      }
      
      // Validate the response structure
      if (!parsed.refinedQuery || !Array.isArray(parsed.suggestions)) {
        throw new Error('Invalid AI response format');
      }
      
      return parsed;
    } catch (error) {
      console.error('[BRARIAN] AI enhancement failed:', error);
      // Return original query on failure
      return { refinedQuery: query, suggestions: [] };
    }
  }
  
  async refineQueryWithAI(query) {
    if (!this.config?.AI_AGENT?.enabled) {
      return { refinedQuery: query };
    }
    
    const prompt = `Refine this search query to be more effective: "${query}". Respond with ONLY the refined query, nothing else.`;
    
    try {
      const response = await this.queryAI(prompt);
      return { refinedQuery: response.trim() };
    } catch (error) {
      console.error('[BRARIAN] Query refinement failed:', error);
      return { refinedQuery: query };
    }
  }
  
  async queryAI(prompt) {
    const provider = this.config.AI_AGENT.provider;
    
    switch (provider) {
      case 'ollama':
        return await this.queryOllama(prompt);
      case 'gpt4all':
        return await this.queryGPT4All(prompt);
      case 'huggingface':
        return await this.queryHuggingFace(prompt);
      default:
        throw new Error('Unknown AI provider');
    }
  }
  
  async queryOllama(prompt) {
    const config = this.config.AI_AGENT.ollama;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(`${config.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          prompt: prompt,
          stream: false,
          format: "json"
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }
      
      const data = await response.json();
      return data.response || '';
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      console.error('[BRARIAN] Ollama query failed:', error);
      throw error;
    }
  }
  
  async queryGPT4All(prompt) {
    const config = this.config.AI_AGENT.gpt4all;
    try {
      const response = await fetch(`${config.endpoint}/v1/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          prompt: prompt,
          max_tokens: 200,
          temperature: 0.7
        })
      });
      
      if (!response.ok) {
        throw new Error(`GPT4All error: ${response.status}`);
      }
      
      const data = await response.json();
      return data.choices?.[0]?.text || '';
    } catch (error) {
      console.error('[BRARIAN] GPT4All query failed:', error);
      throw error;
    }
  }
  
  async queryHuggingFace(prompt) {
    const config = this.config.AI_AGENT.huggingface;
    try {
      const response = await fetch(`${config.endpoint}/models/${config.model}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: { 
            max_length: 200,
            temperature: 0.7
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`HuggingFace error: ${response.status}`);
      }
      
      const data = await response.json();
      return data[0]?.generated_text || '';
    } catch (error) {
      console.error('[BRARIAN] HuggingFace query failed:', error);
      throw error;
    }
  }
}

// Initialize background service
new BrarianBackground();
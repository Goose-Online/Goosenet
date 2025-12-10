// rss-parser.js - чистый JS, без зависимостей
class GooseRSSParser {
    constructor() {
        this.cache = new Map();
        this.cacheTime = 5 * 60 * 1000; // 5 минут
    }
    
    /**
     * Парсинг RSS/Atom ленты
     * @param {string} url - URL RSS ленты
     * @returns {Promise<Array>} - Массив записей
     */
    async parseFeed(url) {
        // Проверяем кэш
        const cached = this.getCached(url);
        if (cached) return cached;
        
        try {
            // Загружаем RSS через CORS прокси
            const response = await this.fetchWithCORS(url);
            const text = await response.text();
            
            // Определяем тип ленты и парсим
            const items = this.parseXML(text);
            
            // Сохраняем в кэш
            this.setCached(url, items);
            
            return items;
        } catch (error) {
            console.error('Ошибка парсинга RSS:', error);
            return [];
        }
    }
    
    /**
     * Загрузка через CORS прокси
     */
    async fetchWithCORS(url) {
        // Пробуем напрямую
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'GooseNet RSS Reader/1.0'
                }
            });
            
            if (response.ok) return response;
        } catch (e) {
            // Если CORS ошибка, используем прокси
        }
        
        // Используем публичный CORS прокси
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`Ошибка загрузки: ${response.status}`);
        }
        
        const data = await response.json();
        return {
            ok: true,
            text: () => Promise.resolve(data.contents),
            headers: {
                get: () => null
            }
        };
    }
    
    /**
     * Парсинг XML
     */
    parseXML(xmlText) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        
        // Проверяем на ошибки парсинга
        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
            throw new Error('Ошибка парсинга XML');
        }
        
        // Определяем тип ленты
        if (xmlDoc.querySelector('rss')) {
            return this.parseRSS(xmlDoc);
        } else if (xmlDoc.querySelector('feed')) {
            return this.parseAtom(xmlDoc);
        } else {
            throw new Error('Неизвестный формат ленты');
        }
    }
    
    /**
     * Парсинг RSS 2.0
     */
    parseRSS(xmlDoc) {
        const items = [];
        const itemNodes = xmlDoc.getElementsByTagName('item');
        
        for (let i = 0; i < itemNodes.length; i++) {
            const item = itemNodes[i];
            const entry = {
                title: this.getNodeText(item, 'title'),
                link: this.getNodeText(item, 'link'),
                description: this.getNodeText(item, 'description'),
                content: this.getNodeText(item, 'content:encoded') || 
                        this.getNodeText(item, 'description'),
                pubDate: this.parseDate(this.getNodeText(item, 'pubDate')),
                author: this.getNodeText(item, 'author') || 
                       this.getNodeText(item, 'dc:creator'),
                guid: this.getNodeText(item, 'guid') || 
                     this.getNodeText(item, 'link'),
                categories: this.getCategories(item),
                enclosure: this.getEnclosure(item)
            };
            
            // Очищаем от пустых значений
            Object.keys(entry).forEach(key => {
                if (!entry[key]) delete entry[key];
            });
            
            if (entry.title && entry.link) {
                items.push(entry);
            }
        }
        
        // Получаем информацию о канале
        const channel = xmlDoc.querySelector('channel');
        if (channel) {
            return {
                channel: {
                    title: this.getNodeText(channel, 'title'),
                    description: this.getNodeText(channel, 'description'),
                    link: this.getNodeText(channel, 'link'),
                    lastBuildDate: this.getNodeText(channel, 'lastBuildDate')
                },
                items: items
            };
        }
        
        return { items: items };
    }
    
    /**
     * Парсинг Atom
     */
    parseAtom(xmlDoc) {
        const items = [];
        const entries = xmlDoc.getElementsByTagName('entry');
        
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const item = {
                title: this.getNodeText(entry, 'title'),
                link: this.getLink(entry),
                description: this.getNodeText(entry, 'summary'),
                content: this.getNodeText(entry, 'content'),
                pubDate: this.parseDate(this.getNodeText(entry, 'published') || 
                                       this.getNodeText(entry, 'updated')),
                author: this.getNodeText(entry.querySelector('author'), 'name'),
                guid: this.getNodeText(entry, 'id'),
                categories: this.getCategories(entry, 'category')
            };
            
            if (item.title && item.link) {
                items.push(item);
            }
        }
        
        const feed = xmlDoc.querySelector('feed');
        return {
            channel: {
                title: this.getNodeText(feed, 'title'),
                description: this.getNodeText(feed, 'subtitle'),
                link: this.getLink(feed, 'self')
            },
            items: items
        };
    }
    
    /**
     * Вспомогательные методы
     */
    getNodeText(parent, tagName) {
        const node = parent.getElementsByTagName(tagName)[0];
        return node ? node.textContent.trim() : null;
    }
    
    getLink(entry, rel = 'alternate') {
        const links = entry.getElementsByTagName('link');
        for (let link of links) {
            if (!rel || link.getAttribute('rel') === rel) {
                return link.getAttribute('href');
            }
        }
        return links[0]?.getAttribute('href') || null;
    }
    
    getCategories(item, tag = 'category') {
        const categories = [];
        const catNodes = item.getElementsByTagName(tag);
        
        for (let cat of catNodes) {
            const term = cat.getAttribute('term') || cat.textContent;
            if (term) categories.push(term.trim());
        }
        
        return categories.length > 0 ? categories : null;
    }
    
    getEnclosure(item) {
        const enclosure = item.querySelector('enclosure');
        if (enclosure) {
            return {
                url: enclosure.getAttribute('url'),
                type: enclosure.getAttribute('type'),
                length: enclosure.getAttribute('length')
            };
        }
        return null;
    }
    
    parseDate(dateString) {
        if (!dateString) return null;
        
        // Пробуем разные форматы
        const date = new Date(dateString);
        if (isNaN(date.getTime())) {
            return null;
        }
        
        return date.toISOString();
    }
    
    /**
     * Кэширование
     */
    getCached(url) {
        const cached = this.cache.get(url);
        if (cached && Date.now() - cached.timestamp < this.cacheTime) {
            return cached.data;
        }
        return null;
    }
    
    setCached(url, data) {
        this.cache.set(url, {
            data: data,
            timestamp: Date.now()
        });
        
        // Очищаем старый кэш
        this.cleanCache();
    }
    
    cleanCache() {
        const now = Date.now();
        for (const [url, cached] of this.cache.entries()) {
            if (now - cached.timestamp > this.cacheTime * 2) {
                this.cache.delete(url);
            }
        }
    }
    
    /**
     * Обнаружение RSS лент на сайте
     */
    async discoverFeeds(siteUrl) {
        try {
            // Загружаем главную страницу
            const response = await this.fetchWithCORS(siteUrl);
            const html = await response.text();
            
            // Ищем ссылки на RSS
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const feeds = [];
            
            // Ищем в meta тегах
            const metaLinks = doc.querySelectorAll('link[type*="rss"], link[type*="atom"], link[type*="xml"]');
            metaLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (href) {
                    feeds.push({
                        url: new URL(href, siteUrl).href,
                        title: link.getAttribute('title') || 'RSS Feed',
                        type: link.getAttribute('type')
                    });
                }
            });
            
            // Ищем по текстовым ссылкам
            const textLinks = doc.querySelectorAll('a[href*="rss"], a[href*="atom"], a[href*="feed"], a[href*="xml"]');
            textLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (href && !feeds.some(f => f.url === href)) {
                    feeds.push({
                        url: new URL(href, siteUrl).href,
                        title: link.textContent.trim() || 'RSS Feed',
                        type: this.guessFeedType(href)
                    });
                }
            });
            
            // Проверяем стандартные пути
            const commonPaths = [
                '/rss.xml', '/feed.xml', '/atom.xml',
                '/rss', '/feed', '/atom',
                '/index.xml', '/feed/rss', '/feed/atom'
            ];
            
            for (const path of commonPaths) {
                try {
                    const feedUrl = new URL(path, siteUrl).href;
                    const testResponse = await fetch(feedUrl, { method: 'HEAD' });
                    
                    if (testResponse.ok && testResponse.headers.get('content-type')?.includes('xml')) {
                        if (!feeds.some(f => f.url === feedUrl)) {
                            feeds.push({
                                url: feedUrl,
                                title: 'RSS Feed',
                                type: this.guessFeedType(path)
                            });
                        }
                    }
                } catch (e) {
                    // Игнорируем ошибки
                }
            }
            
            return feeds;
        } catch (error) {
            console.error('Ошибка поиска RSS:', error);
            return [];
        }
    }
    
    guessFeedType(url) {
        if (url.includes('atom')) return 'atom';
        if (url.includes('rss')) return 'rss';
        return 'xml';
    }
}

// Экспорт для использования
if (typeof window !== 'undefined') {
    window.GooseRSSParser = GooseRSSParser;
}

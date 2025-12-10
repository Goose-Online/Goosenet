// rss-generator.js - генерация RSS для статических сайтов
class GooseRSSGenerator {
    constructor(siteConfig) {
        this.config = siteConfig;
        this.items = [];
    }
    
    /**
     * Добавление записи
     */
    addItem(item) {
        this.items.push({
            title: item.title,
            link: item.link || `${this.config.url}/${item.slug}`,
            description: item.description,
            content: item.content,
            pubDate: item.date ? new Date(item.date).toUTCString() : new Date().toUTCString(),
            author: item.author || this.config.author,
            guid: item.guid || item.link || `item-${Date.now()}-${Math.random()}`,
            categories: item.categories || [],
            ...item
        });
    }
    
    /**
     * Генерация RSS XML
     */
    generate() {
        const itemsXML = this.items.map(item => `
            <item>
                <title>${this.escapeXML(item.title)}</title>
                <link>${this.escapeXML(item.link)}</link>
                <description>${this.escapeXML(item.description || '')}</description>
                ${item.content ? `<content:encoded><![CDATA[${item.content}]]></content:encoded>` : ''}
                <pubDate>${item.pubDate}</pubDate>
                <guid isPermaLink="${item.guid === item.link ? 'true' : 'false'}">${this.escapeXML(item.guid)}</guid>
                ${item.author ? `<author>${this.escapeXML(item.author)}</author>` : ''}
                ${item.categories.map(cat => `<category>${this.escapeXML(cat)}</category>`).join('')}
            </item>
        `).join('\n');
        
        return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
    <channel>
        <title>${this.escapeXML(this.config.title)}</title>
        <link>${this.escapeXML(this.config.url)}</link>
        <description>${this.escapeXML(this.config.description || '')}</description>
        <language>ru</language>
        <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
        <atom:link href="${this.escapeXML(this.config.url + '/rss.xml')}" rel="self" type="application/rss+xml" />
        <generator>Гусиный Интернет</generator>
        
        ${itemsXML}
    </channel>
</rss>`;
    }
    
    /**
     * Генерация Atom XML
     */
    generateAtom() {
        const itemsXML = this.items.map(item => `
            <entry>
                <title>${this.escapeXML(item.title)}</title>
                <link href="${this.escapeXML(item.link)}" />
                <id>${this.escapeXML(item.guid)}</id>
                <updated>${new Date(item.pubDate).toISOString()}</updated>
                <summary type="html">${this.escapeXML(item.description || '')}</summary>
                ${item.content ? `<content type="html"><![CDATA[${item.content}]]></content>` : ''}
                <author>
                    <name>${this.escapeXML(item.author || this.config.author)}</name>
                </author>
                ${item.categories.map(cat => `<category term="${this.escapeXML(cat)}" />`).join('')}
            </entry>
        `).join('\n');
        
        return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
    <title>${this.escapeXML(this.config.title)}</title>
    <subtitle>${this.escapeXML(this.config.description || '')}</subtitle>
    <link href="${this.escapeXML(this.config.url)}" />
    <link href="${this.escapeXML(this.config.url + '/atom.xml')}" rel="self" />
    <updated>${new Date().toISOString()}</updated>
    <id>${this.escapeXML(this.config.url)}</id>
    <author>
        <name>${this.escapeXML(this.config.author || 'Гусиный Интернет')}</name>
    </author>
    <generator>Гусиный Интернет</generator>
    
    ${itemsXML}
</feed>`;
    }
    
    /**
     * Генерация JSON Feed (современный формат)
     */
    generateJSON() {
        return JSON.stringify({
            version: "https://jsonfeed.org/version/1.1",
            title: this.config.title,
            description: this.config.description,
            home_page_url: this.config.url,
            feed_url: `${this.config.url}/feed.json`,
            icon: this.config.icon,
            favicon: this.config.favicon,
            author: {
                name: this.config.author,
                url: this.config.authorUrl
            },
            items: this.items.map(item => ({
                id: item.guid,
                url: item.link,
                title: item.title,
                content_html: item.content,
                content_text: item.description,
                summary: item.description,
                date_published: item.pubDate,
                date_modified: item.pubDate,
                author: {
                    name: item.author || this.config.author
                },
                tags: item.categories
            }))
        }, null, 2);
    }
    
    /**
     * Сохранение в файл (для GitHub Pages)
     */
    async saveToGitHub(token, path = 'rss.xml') {
        const content = this.generate();
        
        try {
            const response = await fetch(`https://api.github.com/repos/${this.config.repo}/contents/${path}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: 'Обновление RSS ленты',
                    content: btoa(content)
                })
            });
            
            return response.ok;
        } catch (error) {
            console.error('Ошибка сохранения RSS:', error);
            return false;
        }
    }
    
    /**
     * Автоматическое создание из HTML страниц
     */
    async generateFromPages(pages) {
        pages.forEach(page => {
            this.addItem({
                title: page.title,
                link: page.url,
                description: page.excerpt,
                content: page.content,
                date: page.date,
                categories: page.categories
            });
        });
    }
    
    /**
     * Экранирование XML
     */
    escapeXML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

// Пример использования в статическом сайте
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        // Автогенерация RSS для сайта Гуснета
        if (document.querySelector('[data-goosenet-site="true"]')) {
            const siteConfig = {
                title: document.title,
                url: window.location.origin,
                description: document.querySelector('meta[name="description"]')?.content || '',
                author: document.querySelector('meta[name="author"]')?.content || 'Гусиный Интернет'
            };
            
            // Создаём RSS на лету
            const generator = new GooseRSSGenerator(siteConfig);
            
            // Ищем статьи на странице
            const articles = document.querySelectorAll('article, .post, [itemtype="http://schema.org/BlogPosting"]');
            
            articles.forEach(article => {
                const title = article.querySelector('h1, h2, h3, .title')?.textContent;
                const link = article.querySelector('a[href]')?.href || window.location.href;
                const description = article.querySelector('.excerpt, .description, p')?.textContent;
                const date = article.querySelector('time')?.datetime || article.querySelector('.date')?.textContent;
                
                if (title && link) {
                    generator.addItem({
                        title: title,
                        link: link,
                        description: description,
                        date: date
                    });
                }
            });
            
            // Добавляем ссылку на RSS
            if (generator.items.length > 0) {
                const rssLink = document.createElement('link');
                rssLink.rel = 'alternate';
                rssLink.type = 'application/rss+xml';
                rssLink.title = 'RSS';
                rssLink.href = '/rss.xml';
                document.head.appendChild(rssLink);
                
                // Создаём кнопку подписки
                const subscribeBtn = document.createElement('a');
                subscribeBtn.href = '/rss.xml';
                subscribeBtn.innerHTML = '📰 RSS';
                subscribeBtn.style.cssText = `
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: #ffcc00;
                    color: #333;
                    padding: 10px 15px;
                    border-radius: 20px;
                    text-decoration: none;
                    font-weight: bold;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                    z-index: 1000;
                `;
                document.body.appendChild(subscribeBtn);
            }
        }
    });
}

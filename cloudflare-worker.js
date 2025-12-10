// cloudflare-worker.js - парсинг RSS на edge
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
    const url = new URL(request.url)
    
    if (url.pathname === '/api/rss/parse') {
        return handleRSSParse(request)
    }
    
    if (url.pathname === '/api/rss/discover') {
        return handleRSSDiscover(request)
    }
    
    return new Response('Not found', { status: 404 })
}

// Парсинг RSS ленты
async function handleRSSParse(request) {
    const { rss_url } = await request.json()
    
    if (!rss_url) {
        return new Response(JSON.stringify({ error: 'No RSS URL provided' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        })
    }
    
    try {
        // Загружаем RSS
        const response = await fetch(rss_url, {
            headers: {
                'User-Agent': 'GooseNet RSS Parser/1.0'
            }
        })
        
        if (!response.ok) {
            throw new Error(`Failed to fetch RSS: ${response.status}`)
        }
        
        const text = await response.text()
        
        // Простой парсинг RSS (без библиотек)
        const items = parseRSS(text)
        
        return new Response(JSON.stringify({
            success: true,
            items: items.slice(0, 10), // Ограничиваем
            etag: response.headers.get('etag'),
            lastModified: response.headers.get('last-modified')
        }), {
            headers: { 'Content-Type': 'application/json' }
        })
        
    } catch (error) {
        return new Response(JSON.stringify({
            error: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        })
    }
}

// Автоопределение RSS ленты
async function handleRSSDiscover(request) {
    const { site_url } = await request.json()
    
    if (!site_url) {
        return new Response(JSON.stringify({ error: 'No site URL provided' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        })
    }
    
    try {
        const commonRssPaths = [
            '/rss.xml',
            '/feed.xml',
            '/atom.xml',
            '/feed/',
            '/rss/',
            '/index.xml'
        ]
        
        const discoveredFeeds = []
        
        // Проверяем стандартные пути
        for (const path of commonRssPaths) {
            try {
                const rssUrl = new URL(path, site_url).toString()
                const response = await fetch(rssUrl, { method: 'HEAD' })
                
                if (response.ok) {
                    discoveredFeeds.push({
                        url: rssUrl,
                        type: guessFeedType(rssUrl)
                    })
                }
            } catch (e) {
                // Игнорируем ошибки
            }
        }
        
        return new Response(JSON.stringify({
            success: true,
            feeds: discoveredFeeds
        }), {
            headers: { 'Content-Type': 'application/json' }
        })
        
    } catch (error) {
        return new Response(JSON.stringify({
            error: error.message
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        })
    }
}

// Простой парсер RSS
function parseRSS(xmlText) {
    const items = []
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml')
    
    // Пытаемся найти items
    const itemNodes = xmlDoc.getElementsByTagName('item')
    
    for (let i = 0; i < itemNodes.length; i++) {
        const item = itemNodes[i]
        const title = getText(item, 'title')
        const link = getText(item, 'link')
        const description = getText(item, 'description')
        const pubDate = getText(item, 'pubDate')
        
        if (title && link) {
            items.push({
                title: title,
                link: link,
                description: description,
                pubDate: pubDate
            })
        }
    }
    
    return items
}

function getText(element, tagName) {
    const nodes = element.getElementsByTagName(tagName)
    return nodes.length > 0 ? nodes[0].textContent : null
}

function guessFeedType(url) {
    if (url.includes('rss')) return 'rss'
    if (url.includes('atom')) return 'atom'
    if (url.includes('feed')) return 'feed'
    return 'xml'
}

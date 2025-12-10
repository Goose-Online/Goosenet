// api/generate-rss.js (для Vercel)
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY
    );
    
    const { siteId, userId } = req.query;
    
    try {
        // RSS для конкретного сайта
        if (siteId) {
            const { data: site } = await supabase
                .from('sites')
                .select('*')
                .eq('id', siteId)
                .eq('status', 'approved')
                .single();
            
            if (!site) {
                return res.status(404).json({ error: 'Site not found' });
            }
            
            const { data: items } = await supabase
                .from('rss_items')
                .select('*')
                .eq('site_id', siteId)
                .order('published_at', { ascending: false })
                .limit(50);
            
            // Формируем RSS
            const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
    <channel>
        <title>${escapeXML(site.title)}</title>
        <link>${site.url}</link>
        <description>${escapeXML(site.description || '')}</description>
        <language>ru-ru</language>
        <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
        ${items.map(item => `
        <item>
            <title>${escapeXML(item.title)}</title>
            <link>${item.url}</link>
            <description>${escapeXML(item.description || '')}</description>
            <pubDate>${new Date(item.published_at).toUTCString()}</pubDate>
            <guid>${item.guid || item.url}</guid>
            ${item.author ? `<author>${escapeXML(item.author)}</author>` : ''}
        </item>
        `).join('')}
    </channel>
</rss>`;
            
            res.setHeader('Content-Type', 'application/xml');
            return res.status(200).send(rss);
        }
        
        // Персональная лента для пользователя
        if (userId) {
            const { data: subscriptions } = await supabase
                .from('subscriptions')
                .select('site_id')
                .eq('user_id', userId);
            
            const siteIds = subscriptions.map(s => s.site_id);
            
            if (siteIds.length === 0) {
                return res.status(200).send(generateEmptyRSS());
            }
            
            const { data: items } = await supabase
                .from('rss_items')
                .select('*, sites(title, url)')
                .in('site_id', siteIds)
                .order('published_at', { ascending: false })
                .limit(100);
            
            const rss = generatePersonalRSS(items, userId);
            res.setHeader('Content-Type', 'application/xml');
            return res.status(200).send(rss);
        }
        
        // Общая лента (все одобренные сайты)
        const { data: items } = await supabase
            .from('rss_items')
            .select('*, sites(title, url)')
            .order('published_at', { ascending: false })
            .limit(100);
        
        const rss = generateGlobalRSS(items);
        res.setHeader('Content-Type', 'application/xml');
        return res.status(200).send(rss);
        
    } catch (error) {
        console.error('RSS generation error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};

function escapeXML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function generatePersonalRSS(items, userId) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
    <channel>
        <title>Моя лента Гусиного Интернета</title>
        <link>https://ваш-хаб.vercel.app</link>
        <description>Персональная RSS-лента из подписок</description>
        <language>ru-ru</language>
        <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
        ${items.map(item => `
        <item>
            <title>[${item.sites.title}] ${escapeXML(item.title)}</title>
            <link>${item.url}</link>
            <description>${escapeXML(item.description || '')}</description>
            <pubDate>${new Date(item.published_at).toUTCString()}</pubDate>
            <guid>${item.guid || item.url}</guid>
            <source url="${item.sites.url}">${escapeXML(item.sites.title)}</source>
        </item>
        `).join('')}
    </channel>
</rss>`;
}

function generateGlobalRSS(items) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
    <channel>
        <title>Гусиный Интернет - Общая лента</title>
        <link>https://ваш-хаб.vercel.app</link>
        <description>Все новости из сети Гусиного Интернета</description>
        <language>ru-ru</language>
        <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
        ${items.map(item => `
        <item>
            <title>[${item.sites.title}] ${escapeXML(item.title)}</title>
            <link>${item.url}</link>
            <description>${escapeXML(item.description || '')}</description>
            <pubDate>${new Date(item.published_at).toUTCString()}</pubDate>
            <guid>${item.guid || item.url}</guid>
        </item>
        `).join('')}
    </channel>
</rss>`;
}

function generateEmptyRSS() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
    <channel>
        <title>Гусиный Интернет</title>
        <link>https://ваш-хаб.vercel.app</link>
        <description>У вас пока нет подписок. Добавьте сайты в избранное!</description>
        <language>ru-ru</language>
        <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    </channel>
</rss>`;
}

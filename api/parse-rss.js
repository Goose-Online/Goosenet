// api/parse-rss.js
const Parser = require('rss-parser');

module.exports = async (req, res) => {
    const parser = new Parser();
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    try {
        const feed = await parser.parseURL(url);
        
        const items = feed.items.map(item => ({
            title: item.title,
            link: item.link,
            description: item.contentSnippet || item.content,
            pubDate: item.pubDate,
            author: item.author || item.creator,
            guid: item.guid || item.link
        }));
        
        res.json({
            title: feed.title,
            description: feed.description,
            items: items.slice(0, 10) // Последние 10 записей
        });
        
    } catch (error) {
        res.status(500).json({ error: 'Failed to parse RSS feed' });
    }
};

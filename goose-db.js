// goose-db.js - работа с базой через анонимный доступ
class GooseDB {
    constructor() {
        this.supabase = window.supabase.createClient(
            GOOSE_CONFIG.supabase.url,
            GOOSE_CONFIG.supabase.anonKey
        );
    }
    
    // Получение списка сайтов (публичные)
    async getSites(page = 1, limit = 20, category = null) {
        let query = this.supabase
            .from('sites')
            .select('*')
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);
        
        if (category) {
            query = query.eq('category', category);
        }
        
        const { data, error } = await query;
        
        return {
            sites: data || [],
            error: error
        };
    }
    
    // Поиск сайтов
    async searchSites(query) {
        const { data, error } = await this.supabase
            .from('sites')
            .select('*')
            .eq('status', 'approved')
            .ilike('title', `%${query}%`)
            .limit(10);
        
        return data || [];
    }
    
    // Получение RSS записей
    async getRSSFeed(options = {}) {
        const { page = 1, limit = 20, site_id = null } = options;
        
        let query = this.supabase
            .from('rss_items')
            .select(`
                *,
                site:sites(*)
            `)
            .order('published_at', { ascending: false })
            .range((page - 1) * limit, page * limit - 1);
        
        if (site_id) {
            query = query.eq('site_id', site_id);
        }
        
        const { data, error } = await query;
        
        return {
            items: data || [],
            error: error
        };
    }
    
    // Добавление сайта (через OAuth)
    async addSite(siteData, userToken) {
        // Используем пользовательский токен для записи
        const response = await fetch(`${GOOSE_CONFIG.oauth.authServer}/api/sites`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${userToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(siteData)
        });
        
        return await response.json();
    }
    
    // Простая проверка, существует ли сайт
    async siteExists(url) {
        const { data, error } = await this.supabase
            .from('sites')
            .select('id')
            .eq('url', url)
            .eq('status', 'approved')
            .single();
        
        return !error && data;
    }
}

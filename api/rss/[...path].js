// api/rss/[...path].js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://uvhtwedzxejuwiaofavk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2aHR3ZWR6eGVqdXdpYW9mYXZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNDA3MjgsImV4cCI6MjA4MDcxNjcyOH0.9l4Xlj4CwRJS9Q3cT-pK9udW25-ptewrozUDbLgTjUM'
)

export default async function handler(req, res) {
  const { path } = req.query
  const method = req.method
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  
  if (method === 'OPTIONS') return res.status(200).end()
  
  const token = req.headers.authorization?.replace('Bearer ', '')
  const { data: { user }, error: authError } = token 
    ? await supabase.auth.getUser(token)
    : { data: { user: null }, error: null }
  
  switch (path[0]) {
    case 'feed':
      return handleFeed(req, res, user)
    case 'subscriptions':
      return handleSubscriptions(req, res, user)
    case 'read':
      return handleReadStatus(req, res, user)
    case 'favorites':
      return handleFavorites(req, res, user)
    default:
      return res.status(404).json({ error: 'Not found' })
  }
}

// Получение ленты
async function handleFeed(req, res, user) {
  try {
    const { 
      page = 1, 
      limit = 20, 
      category,
      site_id,
      only_unread = false,
      only_favorites = false
    } = req.query
    
    const offset = (page - 1) * limit
    
    // Базовый запрос
    let query = supabase
      .from('rss_items')
      .select(`
        *,
        site:sites(id, title, url, category, description)
      `)
      .order('published_at', { ascending: false })
    
    // Фильтры
    if (category) {
      query = query.contains('site.categories', [category])
    }
    
    if (site_id) {
      query = query.eq('site_id', site_id)
    }
    
    if (only_favorites && user) {
      // Получаем ID избранных записей
      const { data: favorites } = await supabase
        .from('rss_favorites')
        .select('item_id')
        .eq('user_id', user.id)
      
      if (favorites?.length > 0) {
        const favoriteIds = favorites.map(f => f.item_id)
        query = query.in('id', favoriteIds)
      } else {
        return res.json({ items: [], hasMore: false })
      }
    }
    
    // Пагинация
    query = query.range(offset, offset + limit - 1)
    
    const { data: items, error, count } = await query
    
    if (error) throw error
    
    // Отмечаем прочитанные записи если пользователь авторизован
    if (user) {
      // Получаем прочитанные записи
      const { data: readItems } = await supabase
        .from('rss_read_items')
        .select('item_id')
        .eq('user_id', user.id)
        .in('item_id', items.map(item => item.id))
      
      const readIds = new Set(readItems?.map(r => r.item_id) || [])
      
      // Добавляем флаг прочитано
      items.forEach(item => {
        item.read = readIds.has(item.id)
      })
      
      // Фильтр "только непрочитанные"
      if (only_unread === 'true') {
        const unreadItems = items.filter(item => !item.read)
        return res.json({
          items: unreadItems,
          hasMore: unreadItems.length === limit
        })
      }
    }
    
    res.json({
      items: items || [],
      hasMore: items?.length === limit,
      page: parseInt(page),
      total: count
    })
    
  } catch (error) {
    console.error('Feed error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// Управление подписками
async function handleSubscriptions(req, res, user) {
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  
  try {
    if (req.method === 'GET') {
      // Получение подписок
      const { data: subscriptions, error } = await supabase
        .from('rss_subscriptions')
        .select(`
          *,
          site:sites(*)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      
      return res.json(subscriptions || [])
    }
    
    if (req.method === 'POST') {
      // Добавление подписки
      const { site_id } = req.body
      
      if (!site_id) {
        return res.status(400).json({ error: 'site_id is required' })
      }
      
      const { data: subscription, error } = await supabase
        .from('rss_subscriptions')
        .insert({
          user_id: user.id,
          site_id: site_id
        })
        .select()
        .single()
      
      if (error) throw error
      
      return res.status(201).json(subscription)
    }
    
    if (req.method === 'DELETE') {
      // Удаление подписки
      const { site_id } = req.query
      
      if (!site_id) {
        return res.status(400).json({ error: 'site_id is required' })
      }
      
      const { error } = await supabase
        .from('rss_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('site_id', site_id)
      
      if (error) throw error
      
      return res.status(204).end()
    }
    
  } catch (error) {
    console.error('Subscriptions error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// Отметка прочитанного
async function handleReadStatus(req, res, user) {
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  
  try {
    if (req.method === 'POST') {
      const { item_id, read = true } = req.body
      
      if (!item_id) {
        return res.status(400).json({ error: 'item_id is required' })
      }
      
      if (read) {
        // Отмечаем как прочитанное
        const { error } = await supabase
          .from('rss_read_items')
          .upsert({
            user_id: user.id,
            item_id: item_id
          }, {
            onConflict: 'user_id,item_id'
          })
        
        if (error) throw error
        
        return res.status(200).json({ success: true })
      } else {
        // Удаляем отметку о прочтении
        const { error } = await supabase
          .from('rss_read_items')
          .delete()
          .eq('user_id', user.id)
          .eq('item_id', item_id)
        
        if (error) throw error
        
        return res.status(200).json({ success: true })
      }
    }
    
    if (req.method === 'POST' && req.query.bulk) {
      // Массовое отмечание как прочитанное
      const { item_ids } = req.body
      
      if (!Array.isArray(item_ids)) {
        return res.status(400).json({ error: 'item_ids must be an array' })
      }
      
      const records = item_ids.map(item_id => ({
        user_id: user.id,
        item_id: item_id
      }))
      
      const { error } = await supabase
        .from('rss_read_items')
        .upsert(records, {
          onConflict: 'user_id,item_id',
          ignoreDuplicates: true
        })
      
      if (error) throw error
      
      return res.status(200).json({ 
        success: true, 
        count: item_ids.length 
      })
    }
    
  } catch (error) {
    console.error('Read status error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

// Избранное
async function handleFavorites(req, res, user) {
  if (!user) return res.status(401).json({ error: 'Unauthorized' })
  
  try {
    if (req.method === 'GET') {
      const { page = 1, limit = 20 } = req.query
      const offset = (page - 1) * limit
      
      const { data: favorites, error, count } = await supabase
        .from('rss_favorites')
        .select(`
          *,
          item:rss_items(*, site:sites(*))
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
      
      if (error) throw error
      
      return res.json({
        items: favorites?.map(f => f.item) || [],
        hasMore: favorites?.length === limit,
        page: parseInt(page),
        total: count
      })
    }
    
    if (req.method === 'POST') {
      const { item_id } = req.body
      
      if (!item_id) {
        return res.status(400).json({ error: 'item_id is required' })
      }
      
      const { data: favorite, error } = await supabase
        .from('rss_favorites')
        .insert({
          user_id: user.id,
          item_id: item_id
        })
        .select()
        .single()
      
      if (error) throw error
      
      return res.status(201).json(favorite)
    }
    
    if (req.method === 'DELETE') {
      const { item_id } = req.query
      
      if (!item_id) {
        return res.status(400).json({ error: 'item_id is required' })
      }
      
      const { error } = await supabase
        .from('rss_favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('item_id', item_id)
      
      if (error) throw error
      
      return res.status(204).end()
    }
    
  } catch (error) {
    console.error('Favorites error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}

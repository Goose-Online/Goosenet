// RSS Crawler для Гусиного Интернета
import { createClient } from '@supabase/supabase-js'
import Parser from 'rss-parser'

const supabase = createClient(
  'https://uvhtwedzxejuwiaofavk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2aHR3ZWR6eGVqdXdpYW9mYXZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNDA3MjgsImV4cCI6MjA4MDcxNjcyOH0.9l4Xlj4CwRJS9Q3cT-pK9udW25-ptewrozUDbLgTjUM'
)

const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'GooseNet RSS Crawler/1.0'
  }
})

export async function crawlRSSFeeds() {
  console.log('🦢 Начинаем обход RSS лент...')
  
  try {
    // Получаем сайты с RSS
    const { data: sites, error } = await supabase
      .from('sites')
      .select('id, url, rss_url, rss_etag, rss_last_modified')
      .not('rss_url', 'is', null)
      .order('last_rss_check', { ascending: true })
      .limit(50) // Ограничиваем количество за один запуск
    
    if (error) throw error
    
    for (const site of sites) {
      await crawlSiteRSS(site)
      // Ждём между запросами
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    console.log(`✅ Обход завершён. Обработано ${sites.length} сайтов.`)
    
  } catch (error) {
    console.error('❌ Ошибка при обходе RSS:', error)
  }
}

async function crawlSiteRSS(site) {
  console.log(`📡 Проверяем RSS: ${site.url}`)
  
  try {
    const feedOptions = {}
    
    // Добавляем заголовки для кэширования
    if (site.rss_etag) {
      feedOptions.headers = { 'If-None-Match': site.rss_etag }
    }
    if (site.rss_last_modified) {
      feedOptions.headers = {
        ...feedOptions.headers,
        'If-Modified-Since': site.rss_last_modified
      }
    }
    
    const feed = await parser.parseURL(site.rss_url, feedOptions)
    
    // Обновляем метаданные
    const etag = feed.meta?.etag
    const lastModified = feed.meta?.lastModified
    
    await supabase
      .from('sites')
      .update({
        last_rss_check: new Date().toISOString(),
        rss_etag: etag || site.rss_etag,
        rss_last_modified: lastModified || site.rss_last_modified
      })
      .eq('id', site.id)
    
    // Обрабатываем записи
    let newItemsCount = 0
    for (const item of feed.items) {
      const saved = await saveRSSItem(site.id, item)
      if (saved) newItemsCount++
    }
    
    if (newItemsCount > 0) {
      console.log(`✅ ${site.url}: добавлено ${newItemsCount} новых записей`)
      // Триггерим уведомления для подписчиков
      await triggerNotifications(site.id, newItemsCount)
    } else {
      console.log(`ℹ️ ${site.url}: обновлений нет`)
    }
    
  } catch (error) {
    console.error(`❌ Ошибка при парсинге RSS ${site.url}:`, error.message)
    
    // Обновляем время проверки даже при ошибке
    await supabase
      .from('sites')
      .update({ last_rss_check: new Date().toISOString() })
      .eq('id', site.id)
  }
}

async function saveRSSItem(siteId, item) {
  try {
    // Генерируем guid если нет
    const guid = item.guid || item.link || `generated-${Date.now()}-${Math.random()}`
    
    // Парсим дату
    let publishedDate = new Date()
    if (item.pubDate) {
      publishedDate = new Date(item.pubDate)
    } else if (item.isoDate) {
      publishedDate = new Date(item.isoDate)
    }
    
    // Парсим категории
    let categories = []
    if (item.categories) {
      categories = Array.isArray(item.categories) 
        ? item.categories.map(c => typeof c === 'string' ? c : c._ || c.$.term)
        : [item.categories]
    }
    
    // Сохраняем в базу
    const { error } = await supabase
      .from('rss_items')
      .upsert({
        site_id: siteId,
        guid: guid,
        title: item.title || 'Без названия',
        description: item.description || item.contentSnippet,
        content: item.content || item['content:encoded'] || item.description,
        link: item.link,
        author: item.creator || item.author || item['dc:creator'],
        categories: categories,
        published_at: publishedDate.toISOString()
      }, {
        onConflict: 'site_id,guid',
        ignoreDuplicates: false
      })
    
    if (error) throw error
    return true
    
  } catch (error) {
    console.error('Ошибка сохранения RSS записи:', error)
    return false
  }
}

async function triggerNotifications(siteId, newItemsCount) {
  // Получаем подписчиков сайта
  const { data: subscribers, error } = await supabase
    .from('rss_subscriptions')
    .select('user_id')
    .eq('site_id', siteId)
  
  if (error || !subscribers) return
  
  // Для каждого подписчика создаём уведомление
  for (const subscriber of subscribers) {
    await createNotification(
      subscriber.user_id,
      'rss_update',
      {
        site_id: siteId,
        new_items_count: newItemsCount
      }
    )
  }
}

async function createNotification(userId, type, data) {
  const { error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type: type,
      data: data,
      read: false
    })
  
  if (error) {
    console.error('Ошибка создания уведомления:', error)
  }
}

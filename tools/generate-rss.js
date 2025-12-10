// tools/generate-rss.js - генерирует RSS для всех сайтов
import { createClient } from '@supabase/supabase-js'
import { promises as fs } from 'fs'
import path from 'path'

const supabase = createClient(
  'https://uvhtwedzxejuwiaofavk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2aHR3ZWR6eGVqdXdpYW9mYXZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNDA3MjgsImV4cCI6MjA4MDcxNjcyOH0.9l4Xlj4CwRJS9Q3cT-pK9udW25-ptewrozUDbLgTjUM'
)

export async function generateSiteRSS(sitePath, siteConfig) {
  const rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXML(siteConfig.title)}</title>
    <description>${escapeXML(siteConfig.description || '')}</description>
    <link>${siteConfig.url}</link>
    <atom:link href="${siteConfig.url}/rss.xml" rel="self" type="application/rss+xml"/>
    <language>ru</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    
    <!-- Статические записи для новых сайтов -->
    <item>
      <title>Добро пожаловать в Гусиный Интернет!</title>
      <description>Это ваш новый сайт в Гусином Интернете. Начните добавлять контент!</description>
      <link>${siteConfig.url}/welcome</link>
      <guid>${siteConfig.url}/welcome</guid>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <author>${siteConfig.author || 'Гусиный Интернет'}</author>
    </item>
  </channel>
</rss>`
  
  // Сохраняем файл
  const rssPath = path.join(sitePath, 'rss.xml')
  await fs.writeFile(rssPath, rssContent, 'utf-8')
  
  // Обновляем URL RSS в базе данных
  await supabase
    .from('sites')
    .update({ 
      rss_url: `${siteConfig.url}/rss.xml`,
      last_rss_check: new Date().toISOString()
    })
    .eq('id', siteConfig.id)
  
  console.log(`✅ Сгенерирован RSS для: ${siteConfig.title}`)
}

function escapeXML(str) {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

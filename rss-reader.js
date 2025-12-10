// rss-reader.js - читалка в браузере
class GooseRSSReader {
    constructor() {
        this.db = new GooseDB();
        this.subscriptions = new Set();
    }
    
    // Загрузка ленты
    async loadFeed(options = {}) {
        const feed = await this.db.getRSSFeed(options);
        
        if (!feed.error) {
            // Сохраняем в localStorage для офлайн-доступа
            this.saveToCache('rss_feed', feed.items);
            return feed.items;
        }
        
        // Если ошибка - пробуем загрузить из кэша
        return this.loadFromCache('rss_feed') || [];
    }
    
    // Парсинг RSS напрямую в браузере
    async parseRSS(url) {
        // Используем CORS прокси (Cloudflare Worker)
        const response = await fetch('https://rss-proxy.goose.ink/api/rss/parse', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ rss_url: url })
        });
        
        if (response.ok) {
            return await response.json();
        }
        
        throw new Error('Не удалось загрузить RSS');
    }
    
    // Автоопределение RSS
    async discoverRSS(siteUrl) {
        const response = await fetch('https://rss-proxy.goose.ink/api/rss/discover', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ site_url: siteUrl })
        });
        
        if (response.ok) {
            return await response.json();
        }
        
        return { feeds: [] };
    }
    
    // Кэширование
    saveToCache(key, data) {
        localStorage.setItem(key, JSON.stringify({
            data: data,
            timestamp: Date.now()
        }));
    }
    
    loadFromCache(key) {
        const cached = localStorage.getItem(key);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            
            // Кэш действителен 5 минут
            if (Date.now() - timestamp < 5 * 60 * 1000) {
                return data;
            }
        }
        return null;
    }
    
    // Офлайн-режим
    isOnline() {
        return navigator.onLine;
    }
    
    // Подписка на обновления через Service Worker
    async setupNotifications() {
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                
                // Запрашиваем разрешение на уведомления
                const permission = await Notification.requestPermission();
                
                if (permission === 'granted') {
                    // Подписываемся на push-уведомления
                    const subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: GOOSE_CONFIG.push.publicKey
                    });
                    
                    // Отправляем subscription на сервер
                    await this.savePushSubscription(subscription);
                }
                
            } catch (error) {
                console.error('Ошибка настройки уведомлений:', error);
            }
        }
    }
}

// Service Worker для офлайн-работы
// sw.js - устанавливается на хабе
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open('goosenet-v1').then(cache => {
            return cache.addAll([
                '/',
                '/rss-reader.html',
                '/config.js',
                '/rss-reader.js',
                '/styles.css'
            ]);
        })
    );
});

self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        })
    );
});

self.addEventListener('push', event => {
    const data = event.data.json();
    
    const options = {
        body: data.message,
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.url
        }
    };
    
    event.waitUntil(
        self.registration.showNotification('Гусиный Интернет', options)
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    event.waitUntil(
        clients.openWindow(event.notification.data.url)
    );
});

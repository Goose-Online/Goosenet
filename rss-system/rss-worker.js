// rss-worker.js - Service Worker для RSS читалки
const CACHE_NAME = 'goose-rss-v1';
const OFFLINE_URL = '/offline.html';

// Файлы для кэширования
const STATIC_CACHE = [
    '/',
    '/rss-reader.html',
    '/rss-parser.js',
    '/styles.css',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
    OFFLINE_URL
];

// Установка Service Worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Кэшируем статические файлы');
                return cache.addAll(STATIC_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Активация
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Удаляем старый кэш:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Перехват запросов
self.addEventListener('fetch', event => {
    // Пропускаем chrome-extension и другие не-http запросы
    if (!event.request.url.startsWith('http')) return;
    
    // Для RSS лент используем сеть с fallback на кэш
    if (event.request.url.match(/\.(xml|rss|atom|json)$/)) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    // Кэшируем RSS ленты
                    const clonedResponse = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, clonedResponse);
                    });
                    return response;
                })
                .catch(() => {
                    // Если офлайн, используем кэш
                    return caches.match(event.request)
                        .then(cached => cached || caches.match(OFFLINE_URL));
                })
        );
        return;
    }
    
    // Для остальных запросов: кэш с fallback на сеть
    event.respondWith(
        caches.match(event.request)
            .then(cached => {
                // Всегда пытаемся обновить из сети
                const fetched = fetch(event.request)
                    .then(response => {
                        // Обновляем кэш
                        const clonedResponse = response.clone();
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, clonedResponse);
                        });
                        return response;
                    })
                    .catch(() => {
                        // Ошибка сети
                        if (cached) return cached;
                        
                        // Если это HTML запрос, показываем офлайн страницу
                        if (event.request.headers.get('Accept').includes('text/html')) {
                            return caches.match(OFFLINE_URL);
                        }
                    });
                
                // Возвращаем кэш немедленно, потом обновляем
                return cached || fetched;
            })
    );
});

// Фоновое обновление RSS лент
self.addEventListener('periodicsync', event => {
    if (event.tag === 'update-rss-feeds') {
        event.waitUntil(updateFeeds());
    }
});

// Обновление лент в фоне
async function updateFeeds() {
    const clients = await self.clients.matchAll();
    
    // Получаем подписки из хранилища
    const cache = await caches.open(CACHE_NAME);
    const subscriptions = await getSubscriptions();
    
    for (const feed of subscriptions) {
        try {
            const response = await fetch(feed.url);
            if (response.ok) {
                // Сохраняем в кэш
                await cache.put(feed.url, response.clone());
                
                // Проверяем на новые записи
                const oldResponse = await cache.match(feed.url);
                if (oldResponse) {
                    const oldText = await oldResponse.text();
                    const newText = await response.text();
                    
                    if (oldText !== newText) {
                        // Уведомляем клиентов о новых записях
                        clients.forEach(client => {
                            client.postMessage({
                                type: 'NEW_FEED_ITEMS',
                                feed: feed.url,
                                count: 1 // Упрощённо
                            });
                        });
                        
                        // Показываем уведомление
                        self.registration.showNotification('Новые записи в ленте!', {
                            body: `В ленте "${feed.title}" новые записи`,
                            icon: '/icon-192.png',
                            badge: '/badge-72.png',
                            tag: 'rss-update'
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Ошибка обновления ленты:', error);
        }
    }
}

// Получение подписок из хранилища клиента
async function getSubscriptions() {
    // Читаем из IndexedDB
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('goose-rss', 1);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('subscriptions')) {
                db.createObjectStore('subscriptions', { keyPath: 'url' });
            }
        };
        
        request.onsuccess = (event) => {
            const db = event.target.result;
            const transaction = db.transaction(['subscriptions'], 'readonly');
            const store = transaction.objectStore('subscriptions');
            const getAllRequest = store.getAll();
            
            getAllRequest.onsuccess = () => {
                resolve(getAllRequest.result || []);
            };
            
            getAllRequest.onerror = () => {
                reject(getAllRequest.error);
            };
        };
        
        request.onerror = () => {
            reject(request.error);
        };
    });
}

// Обработка push-уведомлений
self.addEventListener('push', event => {
    let data = {};
    
    if (event.data) {
        data = event.data.json();
    }
    
    const options = {
        body: data.body || 'Новые записи в подписках',
        icon: '/icon-192.png',
        badge: '/badge-72.png',
        tag: 'rss-update',
        data: {
            url: data.url || '/'
        },
        actions: [
            {
                action: 'open',
                title: 'Открыть'
            },
            {
                action: 'dismiss',
                title: 'Закрыть'
            }
        ]
    };
    
    event.waitUntil(
        self.registration.showNotification('Гусиный Интернет', options)
    );
});

// Клик по уведомлению
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    if (event.action === 'open') {
        event.waitUntil(
            clients.openWindow(event.notification.data.url)
        );
    }
});

// Сообщения от клиента
self.addEventListener('message', event => {
    if (event.data.type === 'REGISTER_SYNC') {
        // Регистрируем периодическую синхронизацию
        self.registration.periodicSync.register('update-rss-feeds', {
            minInterval: 15 * 60 * 1000 // 15 минут
        }).catch(console.error);
    }
    
    if (event.data.type === 'CACHE_FEED') {
        // Кэшируем ленту по запросу клиента
        caches.open(CACHE_NAME).then(cache => {
            fetch(event.data.url).then(response => {
                cache.put(event.data.url, response);
            });
        });
    }
});

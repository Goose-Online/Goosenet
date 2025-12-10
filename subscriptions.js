// subscriptions.js
class GooseSubscriptions {
    constructor(supabase) {
        this.supabase = supabase;
        this.currentUser = null;
    }
    
    // Подписаться на сайт
    async subscribeToSite(siteId) {
        if (!this.currentUser) return false;
        
        const { error } = await this.supabase
            .from('subscriptions')
            .insert({
                user_id: this.currentUser.id,
                site_id: siteId
            });
        
        if (!error) {
            this.sendNotification({
                type: 'subscription_added',
                title: 'Новая подписка',
                message: 'Вы подписались на сайт'
            });
            return true;
        }
        return false;
    }
    
    // Отписаться от сайта
    async unsubscribeFromSite(siteId) {
        if (!this.currentUser) return false;
        
        const { error } = await this.supabase
            .from('subscriptions')
            .delete()
            .match({ user_id: this.currentUser.id, site_id: siteId });
        
        return !error;
    }
    
    // Получить мои подписки
    async getMySubscriptions() {
        if (!this.currentUser) return [];
        
        const { data } = await this.supabase
            .from('subscriptions')
            .select(`
                site_id,
                sites (
                    id,
                    title,
                    url,
                    description,
                    category
                )
            `)
            .eq('user_id', this.currentUser.id);
        
        return data || [];
    }
    
    // Получить RSS-ленту
    async getFeed(limit = 20) {
        if (!this.currentUser) return [];
        
        // Получаем ID подписок
        const subscriptions = await this.getMySubscriptions();
        const siteIds = subscriptions.map(s => s.site_id);
        
        if (siteIds.length === 0) return [];
        
        // Получаем записи
        const { data } = await this.supabase
            .from('rss_items')
            .select(`
                *,
                sites (
                    title,
                    url
                )
            `)
            .in('site_id', siteIds)
            .order('published_at', { ascending: false })
            .limit(limit);
        
        return data || [];
    }
    
    // Добавить RSS-запись (для владельцев сайтов)
    async addRSSItem(siteId, itemData) {
        const { data: site } = await this.supabase
            .from('sites')
            .select('user_id')
            .eq('id', siteId)
            .single();
        
        // Проверяем, что пользователь - владелец сайта
        if (!site || site.user_id !== this.currentUser?.id) {
            throw new Error('Not authorized');
        }
        
        const { data, error } = await this.supabase
            .from('rss_items')
            .insert({
                site_id: siteId,
                title: itemData.title,
                description: itemData.description,
                url: itemData.url,
                author: itemData.author,
                guid: itemData.guid || itemData.url
            })
            .select();
        
        if (!error && data) {
            // Отправляем уведомления подписчикам
            await this.notifySubscribers(siteId, data[0]);
        }
        
        return { data, error };
    }
    
    // Уведомить подписчиков о новом посте
    async notifySubscribers(siteId, rssItem) {
        const { data: subscribers } = await this.supabase
            .from('subscriptions')
            .select('user_id')
            .eq('site_id', siteId);
        
        if (!subscribers || subscribers.length === 0) return;
        
        const notifications = subscribers.map(sub => ({
            user_id: sub.user_id,
            type: 'new_post',
            title: 'Новая запись в подписке',
            message: `${rssItem.title}`,
            data: {
                site_id: siteId,
                rss_item_id: rssItem.id,
                url: rssItem.url
            }
        }));
        
        await this.supabase
            .from('notifications')
            .insert(notifications);
    }
    
    // Получить уведомления
    async getNotifications(limit = 50) {
        if (!this.currentUser) return [];
        
        const { data } = await this.supabase
            .from('notifications')
            .select('*')
            .eq('user_id', this.currentUser.id)
            .order('created_at', { ascending: false })
            .limit(limit);
        
        return data || [];
    }
    
    // Отметить как прочитанное
    async markAsRead(notificationId) {
        await this.supabase
            .from('notifications')
            .update({ read: true })
            .eq('id', notificationId)
            .eq('user_id', this.currentUser.id);
    }
    
    // Отметить все как прочитанные
    async markAllAsRead() {
        await this.supabase
            .from('notifications')
            .update({ read: true })
            .eq('user_id', this.currentUser.id)
            .eq('read', false);
    }
    
    // Удалить уведомление
    async deleteNotification(notificationId) {
        await this.supabase
            .from('notifications')
            .delete()
            .eq('id', notificationId)
            .eq('user_id', this.currentUser.id);
    }
    
    // Очистить все уведомления
    async clearNotifications() {
        await this.supabase
            .from('notifications')
            .delete()
            .eq('user_id', this.currentUser.id);
    }
}

// Инициализация в основном скрипте
let gooseSubscriptions = null;

supabase.auth.onAuthStateChange(async (event, session) => {
    if (session) {
        gooseSubscriptions = new GooseSubscriptions(supabase);
        gooseSubscriptions.currentUser = session.user;
        loadFeed();
        loadNotifications();
    } else {
        gooseSubscriptions = null;
    }
});

// Функции для UI
async function loadFeed() {
    if (!gooseSubscriptions) return;
    
    const feedContainer = document.getElementById('rss-feed');
    const subscriptionsContainer = document.getElementById('subscriptions-list');
    
    // Загружаем подписки
    const subscriptions = await gooseSubscriptions.getMySubscriptions();
    
    if (subscriptions.length === 0) {
        subscriptionsContainer.innerHTML = '<p>У вас пока нет подписок.</p>';
    } else {
        subscriptionsContainer.innerHTML = subscriptions.map(sub => `
            <div class="site-card">
                <h4>${sub.sites.title}</h4>
                <p>${sub.sites.description || ''}</p>
                <button onclick="unsubscribe('${sub.site_id}')">Отписаться</button>
            </div>
        `).join('');
    }
    
    // Загружаем ленту
    const feed = await gooseSubscriptions.getFeed();
    
    if (feed.length === 0) {
        feedContainer.innerHTML = '<p>В вашей ленте пока нет записей.</p>';
    } else {
        feedContainer.innerHTML = feed.map(item => `
            <div class="feed-item">
                <div class="feed-source">${item.sites.title}</div>
                <h4><a href="${item.url}" target="_blank">${item.title}</a></h4>
                <div class="feed-meta">
                    ${new Date(item.published_at).toLocaleDateString()}
                    ${item.author ? ` • ${item.author}` : ''}
                </div>
                <p>${item.description || ''}</p>
            </div>
        `).join('');
    }
}

async function loadNotifications() {
    if (!gooseSubscriptions) return;
    
    const notifications = await gooseSubscriptions.getNotifications();
    const container = document.getElementById('notifications-list');
    
    if (notifications.length === 0) {
        container.innerHTML = '<p>У вас нет уведомлений.</p>';
        return;
    }
    
    container.innerHTML = notifications.map(notif => `
        <div class="notification ${notif.read ? 'read' : 'unread'}" 
             onclick="openNotification('${notif.id}', ${JSON.stringify(notif.data).replace(/"/g, '&quot;')})">
            <div class="notification-icon">
                ${getNotificationIcon(notif.type)}
            </div>
            <div class="notification-content">
                <strong>${notif.title}</strong>
                <p>${notif.message}</p>
                <small>${new Date(notif.created_at).toLocaleString()}</small>
            </div>
            <button class="delete-notif" onclick="event.stopPropagation(); deleteNotification('${notif.id}')">
                ×
            </button>
        </div>
    `).join('');
}

function getNotificationIcon(type) {
    const icons = {
        'new_post': '📝',
        'new_comment': '💬',
        'site_approved': '✅',
        'subscription_added': '🔔',
        'message': '✉️'
    };
    return icons[type] || '🔔';
}

async function subscribe(siteId) {
    if (await gooseSubscriptions.subscribeToSite(siteId)) {
        alert('Подписка добавлена!');
        loadFeed();
    }
}

async function unsubscribe(siteId) {
    if (confirm('Отписаться от этого сайта?')) {
        if (await gooseSubscriptions.unsubscribeFromSite(siteId)) {
            loadFeed();
        }
    }
}

async function markAllAsRead() {
    if (gooseSubscriptions) {
        await gooseSubscriptions.markAllAsRead();
        loadNotifications();
    }
}

async function deleteNotification(notificationId) {
    if (gooseSubscriptions) {
        await gooseSubscriptions.deleteNotification(notificationId);
        loadNotifications();
    }
}

async function clearNotifications() {
    if (confirm('Очистить все уведомления?')) {
        if (gooseSubscriptions) {
            await gooseSubscriptions.clearNotifications();
            loadNotifications();
        }
    }
}

function openNotification(notificationId, data) {
    if (gooseSubscriptions) {
        gooseSubscriptions.markAsRead(notificationId);
        
        if (data?.url) {
            window.open(data.url, '_blank');
        } else if (data?.site_id) {
            // Перейти к сайту
            window.location.hash = `site-${data.site_id}`;
        }
        
        loadNotifications();
    }
}

// Экспорт OPML (формат для RSS-клиентов)
async function exportOPML() {
    if (!gooseSubscriptions) return;
    
    const subscriptions = await gooseSubscriptions.getMySubscriptions();
    
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="1.0">
    <head>
        <title>Мои подписки Гусиного Интернета</title>
        <dateCreated>${new Date().toUTCString()}</dateCreated>
    </head>
    <body>
        ${subscriptions.map(sub => `
        <outline text="${sub.sites.title}" 
                 title="${sub.sites.title}"
                 type="rss"
                 xmlUrl="https://goosenet-one.vercel.app/api/generate-rss?siteId=${sub.site_id}"
                 htmlUrl="${sub.sites.url}"/>
        `).join('')}
    </body>
</opml>`;
    
    // Создаём ссылку для скачивания
    const blob = new Blob([opml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'goose-subscriptions.opml';
    a.click();
    URL.revokeObjectURL(url);
}

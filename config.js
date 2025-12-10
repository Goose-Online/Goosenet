// config.js - полностью открытый
window.GOOSE_CONFIG = {
    // Supabase (анонимный доступ)
    supabase: {
        url: 'https://uvhtwedzxejuwiaofavk.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2aHR3ZWR6eGVqdXdpYW9mYXZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNDA3MjgsImV4cCI6MjA4MDcxNjcyOH0.9l4Xlj4CwRJS9Q3cT-pK9udW25-ptewrozUDbLgTjUM'// Это публичный ключ, его можно показывать
    },
    
    // GitHub репозиторий (публичный)
    github: {
        repo: 'goose-nests/goose-sites',
        owner: 'goose-nests'
    },
    
    // OAuth приложение Гуснета (публичные данные)
    oauth: {
        clientId: 'публичный_client_id',
        authServer: 'https://ваш-хаб.vercel.app/api/oauth'
    },
    
    // URL для самохостинга
    hosting: {
        baseUrl: 'https://goose-nests.github.io/goose-sites/sites',
        proxyUrl: 'https://goose.ink' // Прокси для красивых URL
    }
};

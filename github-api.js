// API для работы с GitHub репозиторием гнёзд
class GitHubNestsAPI {
    constructor(token, repo = 'goose-nests/goose-sites') {
        this.token = token;
        this.repo = repo;
        this.baseUrl = 'https://api.github.com';
    }
    
    // Создание папки сайта
    async createSiteFolder(username, siteName) {
        const folderPath = `sites/${username}/${siteName}`;
        
        const response = await fetch(`${this.baseUrl}/repos/${this.repo}/contents/${folderPath}/.keep`, {
            method: 'PUT',
            headers: this.getHeaders(),
            body: JSON.stringify({
                message: `Create site: ${siteName}`,
                content: btoa('') // Пустой файл-маркер
            })
        });
        
        return response.ok;
    }
    
    // Получение списка сайтов пользователя
    async getUserSites(username) {
        try {
            const response = await fetch(
                `${this.baseUrl}/repos/${this.repo}/contents/sites/${username}`,
                { headers: this.getHeaders() }
            );
            
            if (!response.ok) return [];
            
            const data = await response.json();
            return data.filter(item => item.type === 'dir');
            
        } catch (error) {
            console.error('Error fetching user sites:', error);
            return [];
        }
    }
    
    // Получение файлов сайта
    async getSiteFiles(username, siteName) {
        try {
            const response = await fetch(
                `${this.baseUrl}/repos/${this.repo}/contents/sites/${username}/${siteName}`,
                { headers: this.getHeaders() }
            );
            
            if (!response.ok) return [];
            
            const data = await response.json();
            return data;
            
        } catch (error) {
            console.error('Error fetching site files:', error);
            return [];
        }
    }
    
    // Чтение файла
    async readFile(filePath) {
        try {
            const response = await fetch(
                `${this.baseUrl}/repos/${this.repo}/contents/${filePath}`,
                { headers: this.getHeaders() }
            );
            
            if (!response.ok) return null;
            
            const data = await response.json();
            return {
                content: atob(data.content),
                sha: data.sha,
                size: data.size
            };
            
        } catch (error) {
            console.error('Error reading file:', error);
            return null;
        }
    }
    
    // Запись файла
    async writeFile(filePath, content, message = 'Update file') {
        try {
            // Получаем текущий SHA файла
            const current = await this.readFile(filePath);
            
            const response = await fetch(
                `${this.baseUrl}/repos/${this.repo}/contents/${filePath}`,
                {
                    method: 'PUT',
                    headers: this.getHeaders(),
                    body: JSON.stringify({
                        message: message,
                        content: btoa(content),
                        sha: current?.sha || undefined
                    })
                }
            );
            
            return response.ok;
            
        } catch (error) {
            console.error('Error writing file:', error);
            return false;
        }
    }
    
    // Удаление файла
    async deleteFile(filePath, message = 'Delete file') {
        try {
            const current = await this.readFile(filePath);
            if (!current) return true; // Файла уже нет
            
            const response = await fetch(
                `${this.baseUrl}/repos/${this.repo}/contents/${filePath}`,
                {
                    method: 'DELETE',
                    headers: this.getHeaders(),
                    body: JSON.stringify({
                        message: message,
                        sha: current.sha
                    })
                }
            );
            
            return response.ok;
            
        } catch (error) {
            console.error('Error deleting file:', error);
            return false;
        }
    }
    
    // Подсчёт размера папки
    async calculateFolderSize(folderPath) {
        try {
            const response = await fetch(
                `${this.baseUrl}/repos/${this.repo}/contents/${folderPath}?recursive=1`,
                { headers: this.getHeaders() }
            );
            
            if (!response.ok) return 0;
            
            const data = await response.json();
            
            let totalSize = 0;
            data.forEach(item => {
                if (item.type === 'file') {
                    totalSize += item.size || 0;
                }
            });
            
            // Конвертируем байты в МБ
            return totalSize / 1024 / 1024;
            
        } catch (error) {
            console.error('Error calculating folder size:', error);
            return 0;
        }
    }
    
    // Проверка лимита хранилища
    async checkStorageLimit(username, limitMB = 50) {
        const used = await this.calculateFolderSize(`sites/${username}`);
        return {
            used: used,
            limit: limitMB,
            remaining: limitMB - used,
            isOverLimit: used > limitMB
        };
    }
    
    // Вспомогательный метод для заголовков
    getHeaders() {
        return {
            'Authorization': `token ${this.token}`,
            'Accept': 'application/vnd.github.v3+json'
        };
    }
}

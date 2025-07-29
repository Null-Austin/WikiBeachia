/**
 * API Client for WikiBeachia Bot Framework
 */

const EventEmitter = require('events');

class WikiBeachiaAPIClient extends EventEmitter {
    constructor(baseUrl, logger) {
        super();
        this.baseUrl = baseUrl;
        this.logger = logger;
        this.token = null;
        this.refreshTimer = null;
        this.isAuthenticated = false;
        
        // Dynamic import for fetch (supports both Node.js versions)
        this.fetchModule = null;
        this.initializeFetch();
    }

    async initializeFetch() {
        try {
            // Try built-in fetch first (Node.js 18+)
            if (globalThis.fetch) {
                this.fetchModule = globalThis.fetch;
            } else {
                // Fall back to node-fetch
                const { default: fetch } = await import('node-fetch');
                this.fetchModule = fetch;
            }
        } catch (error) {
            this.logger.error('Failed to initialize fetch module:', error.message);
            throw new Error('No fetch implementation available');
        }
    }

    async ensureFetch() {
        if (!this.fetchModule) {
            await this.initializeFetch();
        }
    }

    async authenticate(username, clientSecret) {
        await this.ensureFetch();
        
        try {
            const response = await this.fetchModule(`${this.baseUrl}/api/v1/bot/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, clientSecret })
            });

            if (response.ok) {
                const data = await response.json();
                this.token = data.token;
                this.isAuthenticated = true;
                this.logger.info(`Authenticated as ${username}`);
                
                // Schedule token refresh (every 23 hours)
                this.scheduleTokenRefresh();
                
                this.emit('authenticated', data.user);
                return data;
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Authentication failed');
            }
        } catch (error) {
            this.logger.error(`Authentication failed: ${error.message}`);
            throw error;
        }
    }

    scheduleTokenRefresh() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }

        // Refresh token every 23 hours
        this.refreshTimer = setTimeout(async () => {
            try {
                await this.refreshToken();
            } catch (error) {
                this.logger.error(`Token refresh failed: ${error.message}`);
                this.emit('token-refresh-failed', error);
            }
        }, 23 * 60 * 60 * 1000);
    }

    async refreshToken() {
        if (!this.isAuthenticated) {
            throw new Error('Not authenticated');
        }

        try {
            const response = await this.fetchModule(`${this.baseUrl}/api/v1/bot/refresh-token`, {
                method: 'POST',
                headers: this.getHeaders()
            });

            if (response.ok) {
                const data = await response.json();
                this.token = data.token;
                this.logger.info('Token refreshed successfully');
                this.emit('token-refreshed');
                return data;
            } else {
                const error = await response.json();
                throw new Error(error.error || 'Token refresh failed');
            }
        } catch (error) {
            this.isAuthenticated = false;
            this.token = null;
            throw error;
        }
    }

    async logout() {
        if (!this.isAuthenticated) {
            return;
        }

        try {
            await this.fetchModule(`${this.baseUrl}/api/v1/bot/logout`, {
                method: 'POST',
                headers: this.getHeaders()
            });
        } catch (error) {
            this.logger.warn(`Logout request failed: ${error.message}`);
        } finally {
            this.token = null;
            this.isAuthenticated = false;
            if (this.refreshTimer) {
                clearTimeout(this.refreshTimer);
                this.refreshTimer = null;
            }
            this.emit('logged-out');
        }
    }

    getHeaders() {
        return {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
        };
    }

    async request(endpoint, options = {}) {
        await this.ensureFetch();
        
        if (!this.isAuthenticated && !options.skipAuth) {
            throw new Error('Not authenticated');
        }

        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
        const config = {
            headers: options.skipAuth ? { 'Content-Type': 'application/json' } : this.getHeaders(),
            ...options
        };

        try {
            const response = await this.fetchModule(url, config);
            
            if (response.ok) {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    return await response.json();
                } else {
                    return await response.text();
                }
            } else {
                const error = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(error.error || `HTTP ${response.status}`);
            }
        } catch (error) {
            this.logger.error(`API request failed [${endpoint}]: ${error.message}`);
            throw error;
        }
    }

    // Page operations
    async getPage(name) {
        return await this.request(`/api/v1/bot/pages/${encodeURIComponent(name)}`);
    }

    async getAllPages(offset = 0, limit = 50) {
        return await this.request(`/api/v1/bot/pages?offset=${offset}&limit=${limit}`);
    }

    async createPage(displayName, content, permission = 0, markdown = false) {
        return await this.request('/api/v1/bot/pages', {
            method: 'POST',
            body: JSON.stringify({
                display_name: displayName,
                content,
                permission,
                markdown
            })
        });
    }

    async updatePage(name, displayName, content) {
        return await this.request(`/api/v1/bot/pages/${encodeURIComponent(name)}`, {
            method: 'PUT',
            body: JSON.stringify({
                display_name: displayName,
                content
            })
        });
    }

    async searchPages(query, type = 'all') {
        return await this.request(`/api/v1/bot/search?query=${encodeURIComponent(query)}&type=${type}`);
    }

    // User operations
    async getUser(username) {
        return await this.request(`/api/v1/bot/users/${encodeURIComponent(username)}`);
    }

    // Wiki operations
    async getWikiSettings() {
        return await this.request('/api/v1/bot/wiki/settings');
    }

    async healthCheck() {
        return await this.request('/api/v1/bot/health');
    }

    // Direct database access (for local bots)
    async getDatabase() {
        try {
            const db = require('../../../src/modules/db.js');
            return db;
        } catch (error) {
            this.logger.error('Failed to get database connection:', error.message);
            throw error;
        }
    }
}

module.exports = WikiBeachiaAPIClient;

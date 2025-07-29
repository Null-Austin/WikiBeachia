/**
 * WikiBeachia Bot Framework
 * A simple JavaScript framework for creating bots that interact with WikiBeachia
 */

// Import fetch for Node.js versions that don't have it built-in
let fetch;
try {
    // Try to use built-in fetch (Node.js 18+)
    fetch = globalThis.fetch;
    if (!fetch) {
        throw new Error('No built-in fetch');
    }
} catch (error) {
    // Fall back to node-fetch for older Node.js versions
    fetch = require('node-fetch');
}

class WikiBeachiaBot {
    constructor(baseUrl, username, clientSecret) {
        this.baseUrl = baseUrl;
        this.username = username;
        this.clientSecret = clientSecret;
        this.token = null;
        this.botInfo = null;
    }

    /**
     * Authenticate the bot and retrieve access token
     */
    async login() {
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/bot/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: this.username,
                    clientSecret: this.clientSecret
                })
            });

            if (response.ok) {
                const data = await response.json();
                this.token = data.token;
                this.botInfo = data.user;
                console.log(`✅ Bot '${this.username}' logged in successfully`);
                return true;
            } else {
                const error = await response.json();
                console.error('❌ Login failed:', error.error);
                return false;
            }
        } catch (error) {
            console.error('❌ Login error:', error.message);
            return false;
        }
    }

    /**
     * Get authorization headers for authenticated requests
     */
    getHeaders() {
        return {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json'
        };
    }

    /**
     * Check if bot is authenticated
     */
    isAuthenticated() {
        return this.token !== null;
    }

    /**
     * Refresh the bot token
     */
    async refreshToken() {
        if (!this.isAuthenticated()) {
            throw new Error('Bot must be logged in to refresh token');
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/v1/bot/refresh-token`, {
                method: 'POST',
                headers: this.getHeaders()
            });

            if (response.ok) {
                const data = await response.json();
                this.token = data.token;
                console.log('✅ Token refreshed successfully');
                return true;
            } else {
                const error = await response.json();
                console.error('❌ Token refresh failed:', error.error);
                return false;
            }
        } catch (error) {
            console.error('❌ Token refresh error:', error.message);
            return false;
        }
    }

    /**
     * Logout and invalidate token
     */
    async logout() {
        if (!this.isAuthenticated()) {
            return true;
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/v1/bot/logout`, {
                method: 'POST',
                headers: this.getHeaders()
            });

            this.token = null;
            this.botInfo = null;
            console.log('✅ Bot logged out successfully');
            return true;
        } catch (error) {
            console.error('❌ Logout error:', error.message);
            return false;
        }
    }

    /**
     * Get bot information
     */
    async getBotInfo() {
        if (!this.isAuthenticated()) {
            throw new Error('Bot must be logged in');
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/v1/bot/info`, {
                headers: this.getHeaders()
            });

            if (response.ok) {
                return await response.json();
            } else {
                const error = await response.json();
                throw new Error(error.error);
            }
        } catch (error) {
            console.error('❌ Error getting bot info:', error.message);
            throw error;
        }
    }

    /**
     * Get a specific page by name
     */
    async getPage(name) {
        if (!this.isAuthenticated()) {
            throw new Error('Bot must be logged in');
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/v1/bot/pages/${encodeURIComponent(name)}`, {
                headers: this.getHeaders()
            });

            if (response.ok) {
                return await response.json();
            } else if (response.status === 404) {
                return null; // Page not found
            } else {
                const error = await response.json();
                throw new Error(error.error);
            }
        } catch (error) {
            console.error(`❌ Error getting page '${name}':`, error.message);
            throw error;
        }
    }

    /**
     * Get all accessible pages with pagination
     */
    async getAllPages(offset = 0, limit = 50) {
        if (!this.isAuthenticated()) {
            throw new Error('Bot must be logged in');
        }

        try {
            const response = await fetch(
                `${this.baseUrl}/api/v1/bot/pages?offset=${offset}&limit=${limit}`,
                { headers: this.getHeaders() }
            );

            if (response.ok) {
                return await response.json();
            } else {
                const error = await response.json();
                throw new Error(error.error);
            }
        } catch (error) {
            console.error('❌ Error getting pages:', error.message);
            throw error;
        }
    }

    /**
     * Create a new page
     */
    async createPage(displayName, content, permission = 0, markdown = false) {
        if (!this.isAuthenticated()) {
            throw new Error('Bot must be logged in');
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/v1/bot/pages`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    display_name: displayName,
                    content: content,
                    permission: permission,
                    markdown: markdown
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log(`✅ Page '${displayName}' created successfully`);
                return result.page;
            } else {
                const error = await response.json();
                throw new Error(error.error);
            }
        } catch (error) {
            console.error(`❌ Error creating page '${displayName}':`, error.message);
            throw error;
        }
    }

    /**
     * Update an existing page
     */
    async updatePage(name, displayName, content) {
        if (!this.isAuthenticated()) {
            throw new Error('Bot must be logged in');
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/v1/bot/pages/${encodeURIComponent(name)}`, {
                method: 'PUT',
                headers: this.getHeaders(),
                body: JSON.stringify({
                    display_name: displayName,
                    content: content
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log(`✅ Page '${name}' updated successfully`);
                return result.page;
            } else {
                const error = await response.json();
                throw new Error(error.error);
            }
        } catch (error) {
            console.error(`❌ Error updating page '${name}':`, error.message);
            throw error;
        }
    }

    /**
     * Search for pages
     */
    async searchPages(query, type = 'all') {
        if (!this.isAuthenticated()) {
            throw new Error('Bot must be logged in');
        }

        try {
            const response = await fetch(
                `${this.baseUrl}/api/v1/bot/search?query=${encodeURIComponent(query)}&type=${type}`,
                { headers: this.getHeaders() }
            );

            if (response.ok) {
                return await response.json();
            } else {
                const error = await response.json();
                throw new Error(error.error);
            }
        } catch (error) {
            console.error(`❌ Error searching for '${query}':`, error.message);
            throw error;
        }
    }

    /**
     * Get user information (requires admin role)
     */
    async getUser(username) {
        if (!this.isAuthenticated()) {
            throw new Error('Bot must be logged in');
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/v1/bot/users/${encodeURIComponent(username)}`, {
                headers: this.getHeaders()
            });

            if (response.ok) {
                return await response.json();
            } else if (response.status === 404) {
                return null; // User not found
            } else {
                const error = await response.json();
                throw new Error(error.error);
            }
        } catch (error) {
            console.error(`❌ Error getting user '${username}':`, error.message);
            throw error;
        }
    }

    /**
     * Get wiki settings (requires admin role)
     */
    async getWikiSettings() {
        if (!this.isAuthenticated()) {
            throw new Error('Bot must be logged in');
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/v1/bot/wiki/settings`, {
                headers: this.getHeaders()
            });

            if (response.ok) {
                return await response.json();
            } else {
                const error = await response.json();
                throw new Error(error.error);
            }
        } catch (error) {
            console.error('❌ Error getting wiki settings:', error.message);
            throw error;
        }
    }

    /**
     * Health check
     */
    async healthCheck() {
        if (!this.isAuthenticated()) {
            throw new Error('Bot must be logged in');
        }

        try {
            const response = await fetch(`${this.baseUrl}/api/v1/bot/health`, {
                headers: this.getHeaders()
            });

            if (response.ok) {
                return await response.json();
            } else {
                const error = await response.json();
                throw new Error(error.error);
            }
        } catch (error) {
            console.error('❌ Health check failed:', error.message);
            throw error;
        }
    }
}

// Example usage
async function exampleBotUsage() {
    // Initialize bot
    const bot = new WikiBeachiaBot('http://localhost:3000', '_home', 'your_bot_secret');

    try {
        // Login
        if (await bot.login()) {
            // Get bot info
            const info = await bot.getBotInfo();
            console.log('Bot Info:', info);

            // Get a page
            const homePage = await bot.getPage('home');
            if (homePage) {
                console.log('Home page:', homePage.display_name);
            }

            // Search for pages
            const searchResults = await bot.searchPages('welcome');
            console.log('Search results:', searchResults.count);

            // Create a page (example)
            // await bot.createPage('Bot Test Page', 'This page was created by a bot!');

            // Health check
            const health = await bot.healthCheck();
            console.log('Bot health:', health.status);

            // Logout
            await bot.logout();
        }
    } catch (error) {
        console.error('Bot error:', error.message);
    }
}

// Uncomment to run example
// exampleBotUsage();

module.exports = WikiBeachiaBot;

/**
 * WikiBeachia Lightweight Bot Framework
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');

class BotFramework extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            baseUrl: config.baseUrl || 'http://localhost:3000',
            enableScheduler: config.enableScheduler !== false,
            ...config
        };

        this.bots = new Map();
        this.scheduler = null;
        this.isInitialized = false;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            // Discover and register bots
            await this.discoverBots();
            
            // Initialize scheduler if enabled
            if (this.config.enableScheduler) {
                this.scheduler = new (require('./BotScheduler'))();
                await this.scheduler.initialize();
            }
            
            this.isInitialized = true;
            this.emit('framework:initialized');
            
        } catch (error) {
            throw error;
        }
    }

    async discoverBots() {
        const botDirectories = [
            path.join(__dirname, '../bots'),
            path.join(__dirname, '../server')
        ];

        for (const directory of botDirectories) {
            try {
                await this.scanBotDirectory(directory);
            } catch (error) {
                // Silently continue
            }
        }
    }

    async scanBotDirectory(directory) {
        try {
            const files = await fs.readdir(directory, { withFileTypes: true });
            
            for (const file of files) {
                const fullPath = path.join(directory, file.name);
                
                if (file.isDirectory()) {
                    await this.scanBotDirectory(fullPath);
                } else if (file.name.endsWith('.js') && !file.name.startsWith('_')) {
                    await this.registerBotFromFile(fullPath);
                }
            }
        } catch (error) {
            // Silently continue
        }
    }

    async registerBotFromFile(filePath) {
        try {
            delete require.cache[require.resolve(filePath)];
            const BotModule = require(filePath);
            
            const botName = path.basename(filePath, '.js');
            let botInstance;
            
            if (typeof BotModule === 'function') {
                botInstance = new (require('./BotManagers').ManagedBot)(botName, BotModule, this);
            } else if (typeof BotModule === 'object' && typeof BotModule.execute === 'function') {
                botInstance = new (require('./BotManagers').ModuleBot)(botName, BotModule, this);
            }
            
            if (botInstance) {
                this.bots.set(botName, botInstance);
                this.emit('bot:registered', botName, botInstance);
            }
        } catch (error) {
            // Silently continue
        }
    }

    async startBot(name, context = {}) {
        const bot = this.bots.get(name);
        if (!bot) {
            throw new Error(`Bot ${name} not found`);
        }

        try {
            await bot.start(context);
            this.emit('bot:started', name);
        } catch (error) {
            this.emit('bot:error', name, error);
            throw error;
        }
    }

    async stopBot(name) {
        const bot = this.bots.get(name);
        if (!bot) {
            throw new Error(`Bot ${name} not found`);
        }

        try {
            await bot.stop();
            this.emit('bot:stopped', name);
        } catch (error) {
            this.emit('bot:error', name, error);
            throw error;
        }
    }

    getBotStatus() {
        const status = {
            total: this.bots.size,
            running: 0,
            stopped: 0,
            bots: []
        };

        for (const [name, bot] of this.bots) {
            const botStatus = {
                name,
                type: bot.constructor.name,
                status: bot.isRunning ? 'running' : 'stopped',
                lastRun: bot.lastRun,
                runCount: bot.runCount
            };

            status.bots.push(botStatus);
            
            if (bot.isRunning) {
                status.running++;
            } else {
                status.stopped++;
            }
        }

        return status;
    }

    async shutdown() {
        this.emit('framework:shutdown');
        
        // Stop all running bots
        for (const [name, bot] of this.bots) {
            if (bot.isRunning) {
                try {
                    await this.stopBot(name);
                } catch (error) {
                    // Silently continue
                }
            }
        }

        // Shutdown scheduler
        if (this.scheduler) {
            await this.scheduler.shutdown();
        }
    }
}

module.exports = BotFramework;

module.exports = BotFramework;

/**
 * WikiBeachia Bot Manager
 * Automatically discovers and starts all bots in the bots directory
 */

const fs = require('fs');
const path = require('path');

class BotManager {
    constructor() {
        this.bots = new Map();
        this.runningBots = new Set();
        this.botDirectory = __dirname;
        this.logFile = path.join(this.botDirectory, 'bot-manager.log');
    }

    /**
     * Log messages with timestamp
     */
    log(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level}] ${message}`;
        
        console.log(logMessage);
        
        // Also write to log file
        try {
            fs.appendFileSync(this.logFile, logMessage + '\n');
        } catch (error) {
            console.error('Failed to write to log file:', error.message);
        }
    }

    /**
     * Discover all bot files in the bots directory and subdirectories
     */
    async discoverBots() {
        this.log('🔍 Discovering bot files...');
        
        const botFiles = [];
        
        try {
            // Check server directory for bot files
            const serverDir = path.join(this.botDirectory, 'server');
            if (fs.existsSync(serverDir)) {
                const serverFiles = fs.readdirSync(serverDir);
                for (const file of serverFiles) {
                    if (file.endsWith('.js') && file !== 'index.js') {
                        botFiles.push({
                            name: path.basename(file, '.js'),
                            path: path.join(serverDir, file),
                            type: 'server'
                        });
                    }
                }
            }

            // Check root bots directory for additional bot files
            const rootFiles = fs.readdirSync(this.botDirectory);
            for (const file of rootFiles) {
                if (file.endsWith('.js') && 
                    file !== 'bot-default.js' && 
                    file !== '_bot.js' && 
                    !file.startsWith('.')) {
                    
                    botFiles.push({
                        name: path.basename(file, '.js'),
                        path: path.join(this.botDirectory, file),
                        type: 'standalone'
                    });
                }
            }

            // Check for any other subdirectories that might contain bots
            for (const item of rootFiles) {
                const itemPath = path.join(this.botDirectory, item);
                if (fs.statSync(itemPath).isDirectory() && item !== 'server') {
                    try {
                        const subFiles = fs.readdirSync(itemPath);
                        for (const file of subFiles) {
                            if (file.endsWith('.js')) {
                                botFiles.push({
                                    name: `${item}_${path.basename(file, '.js')}`,
                                    path: path.join(itemPath, file),
                                    type: item
                                });
                            }
                        }
                    } catch (error) {
                        this.log(`Warning: Could not read directory ${item}: ${error.message}`, 'WARN');
                    }
                }
            }

            this.log(`📦 Discovered ${botFiles.length} bot files`);
            
            for (const bot of botFiles) {
                this.log(`   - ${bot.name} (${bot.type}): ${bot.path}`);
            }

            return botFiles;
        } catch (error) {
            this.log(`❌ Error discovering bots: ${error.message}`, 'ERROR');
            return [];
        }
    }

    /**
     * Load and validate a bot file
     */
    async loadBot(botInfo) {
        try {
            this.log(`📥 Loading bot: ${botInfo.name}`);
            
            // Clear require cache to ensure fresh load
            delete require.cache[require.resolve(botInfo.path)];
            
            const BotModule = require(botInfo.path);
            
            // Check if it's a class or has a runnable function
            let botInstance = null;
            
            if (typeof BotModule === 'function') {
                // If it's a class, we might need to instantiate it
                if (BotModule.prototype && BotModule.prototype.constructor === BotModule) {
                    // It's a class - check if it has the expected methods
                    const testInstance = new BotModule('http://localhost:3000', 'test', 'test');
                    if (typeof testInstance.login === 'function') {
                        botInstance = {
                            type: 'class',
                            BotClass: BotModule,
                            info: botInfo
                        };
                    }
                } else {
                    // It's a function - might be a runner function
                    botInstance = {
                        type: 'function',
                        runFunction: BotModule,
                        info: botInfo
                    };
                }
            } else if (typeof BotModule === 'object' && BotModule.runHomerBot) {
                // Check for specific function names we've seen
                botInstance = {
                    type: 'module',
                    runFunction: BotModule.runHomerBot,
                    info: botInfo
                };
            }

            if (botInstance) {
                this.bots.set(botInfo.name, botInstance);
                this.log(`✅ Successfully loaded bot: ${botInfo.name}`);
                return true;
            } else {
                this.log(`⚠️ Bot file ${botInfo.name} doesn't appear to be a valid bot`, 'WARN');
                return false;
            }
        } catch (error) {
            this.log(`❌ Failed to load bot ${botInfo.name}: ${error.message}`, 'ERROR');
            return false;
        }
    }

    /**
     * Start a specific bot
     */
    async startBot(botName) {
        if (!this.bots.has(botName)) {
            this.log(`❌ Bot ${botName} not found`, 'ERROR');
            return false;
        }

        if (this.runningBots.has(botName)) {
            this.log(`⚠️ Bot ${botName} is already running`, 'WARN');
            return true;
        }

        const bot = this.bots.get(botName);
        
        try {
            this.log(`🚀 Starting bot: ${botName}`);
            
            if (bot.type === 'class') {
                // For class-based bots, create instance and start
                const botInstance = new bot.BotClass('http://localhost:3000', '_bot', 'your_bot_secret_here');
                
                if (typeof botInstance.runDailyMaintenance === 'function') {
                    // Start the bot's main function
                    setTimeout(async () => {
                        try {
                            if (await botInstance.login()) {
                                await botInstance.runDailyMaintenance();
                                await botInstance.logout();
                                this.log(`✅ Bot ${botName} completed successfully`);
                            }
                        } catch (error) {
                            this.log(`❌ Bot ${botName} encountered an error: ${error.message}`, 'ERROR');
                        }
                    }, 1000); // Small delay to prevent overwhelming the server
                }
            } else if (bot.type === 'function' || bot.type === 'module') {
                // For function-based bots
                setTimeout(async () => {
                    try {
                        await bot.runFunction();
                        this.log(`✅ Bot ${botName} completed successfully`);
                    } catch (error) {
                        this.log(`❌ Bot ${botName} encountered an error: ${error.message}`, 'ERROR');
                    }
                }, 1000);
            }

            this.runningBots.add(botName);
            return true;
        } catch (error) {
            this.log(`❌ Failed to start bot ${botName}: ${error.message}`, 'ERROR');
            return false;
        }
    }

    /**
     * Start all discovered and loaded bots
     */
    async startAllBots() {
        this.log('🎯 Starting all bots...');
        
        const botNames = Array.from(this.bots.keys());
        const results = {
            total: botNames.length,
            started: 0,
            failed: 0
        };

        for (const botName of botNames) {
            const success = await this.startBot(botName);
            if (success) {
                results.started++;
            } else {
                results.failed++;
            }
            
            // Small delay between starting bots
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        this.log(`📊 Bot startup complete: ${results.started}/${results.total} started successfully`);
        return results;
    }

    /**
     * Get status of all bots
     */
    getBotStatus() {
        const status = {
            discovered: this.bots.size,
            running: this.runningBots.size,
            bots: []
        };

        for (const [name, bot] of this.bots.entries()) {
            status.bots.push({
                name: name,
                type: bot.type,
                running: this.runningBots.has(name),
                path: bot.info.path
            });
        }

        return status;
    }

    /**
     * Schedule bots to run periodically
     */
    schedulePeriodicRuns(intervalMinutes = 60) {
        this.log(`⏰ Scheduling bots to run every ${intervalMinutes} minutes`);
        
        setInterval(async () => {
            this.log('🔄 Running scheduled bot maintenance...');
            await this.startAllBots();
        }, intervalMinutes * 60 * 1000);
    }

    /**
     * Main initialization and startup method
     */
    async initialize() {
        this.log('🤖 WikiBeachia Bot Manager starting up...');
        
        try {
            // Discover all bot files
            const botFiles = await this.discoverBots();
            
            if (botFiles.length === 0) {
                this.log('⚠️ No bot files discovered', 'WARN');
                return;
            }

            // Load all discovered bots
            let loadedCount = 0;
            for (const botFile of botFiles) {
                const loaded = await this.loadBot(botFile);
                if (loaded) loadedCount++;
            }

            this.log(`📋 Loaded ${loadedCount}/${botFiles.length} bots successfully`);

            if (loadedCount === 0) {
                this.log('❌ No bots were loaded successfully', 'ERROR');
                return;
            }

            // Start all bots
            const results = await this.startAllBots();
            
            // Schedule periodic runs (every hour)
            this.schedulePeriodicRuns(60);
            
            this.log('🎉 Bot Manager initialization complete!');
            this.log(`📈 Final status: ${results.started} bots running`);
            
            return results;
        } catch (error) {
            this.log(`💥 Bot Manager initialization failed: ${error.message}`, 'ERROR');
            throw error;
        }
    }
}

// Create and start the bot manager
const botManager = new BotManager();

// Handle graceful shutdown
process.on('SIGINT', () => {
    botManager.log('🛑 Received shutdown signal, stopping Bot Manager...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    botManager.log('🛑 Received termination signal, stopping Bot Manager...');
    process.exit(0);
});

// Auto-start when this file is run directly
if (require.main === module) {
    botManager.initialize().catch(error => {
        console.error('💥 Failed to start Bot Manager:', error.message);
        process.exit(1);
    });
}

// Export for use in other modules
module.exports = BotManager;
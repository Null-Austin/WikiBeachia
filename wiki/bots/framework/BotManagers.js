/**
 * Lightweight Bot Managers
 */

const EventEmitter = require('events');

class BaseBot extends EventEmitter {
    constructor(name, framework) {
        super();
        this.name = name;
        this.framework = framework;
        this.isRunning = false;
        this.lastRun = null;
        this.runCount = 0;
    }

    async start(context = {}) {
        if (this.isRunning) {
            throw new Error(`Bot ${this.name} is already running`);
        }

        try {
            if (typeof this.initialize === 'function') {
                await this.initialize(context);
            }

            this.isRunning = true;
            this.lastRun = new Date();
            this.runCount++;

            await this.execute(context);
            this.emit('executed', { success: true, context });

        } catch (error) {
            this.emit('error', error);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    async stop() {
        if (!this.isRunning) return;
        
        if (typeof this.cleanup === 'function') {
            await this.cleanup();
        }
        
        this.isRunning = false;
        this.emit('stopped');
    }

    async execute(context) {
        throw new Error('execute method must be implemented by subclass');
    }
}

class ManagedBot extends BaseBot {
    constructor(name, BotClass, framework) {
        super(name, framework);
        this.BotClass = BotClass;
        this.botInstance = null;
    }

    async initialize(context) {
        this.botInstance = new this.BotClass(this.name, this.framework);
        
        if (typeof this.botInstance.initialize === 'function') {
            await this.botInstance.initialize(context);
        }
    }

    async execute(context) {
        if (!this.botInstance) {
            throw new Error('Bot instance not initialized');
        }

        if (typeof this.botInstance.execute === 'function') {
            return await this.botInstance.execute(context);
        } else if (typeof this.botInstance.run === 'function') {
            return await this.botInstance.run(context);
        } else {
            throw new Error('Bot instance has no execute or run method');
        }
    }

    async cleanup() {
        if (this.botInstance && typeof this.botInstance.cleanup === 'function') {
            await this.botInstance.cleanup();
        }
    }
}

class ModuleBot extends BaseBot {
    constructor(name, botModule, framework) {
        super(name, framework);
        this.botModule = botModule;
    }

    async initialize(context) {
        if (typeof this.botModule.initialize === 'function') {
            await this.botModule.initialize(context, this.framework);
        }
    }

    async execute(context) {
        return await this.botModule.execute(context, this.framework);
    }

    async cleanup() {
        if (typeof this.botModule.cleanup === 'function') {
            await this.botModule.cleanup();
        }
    }
}

module.exports = {
    BaseBot,
    ManagedBot,
    ModuleBot
};

/**
 * Lightweight Framework Entry Point
 */

const BotFramework = require('./BotFramework');
const { BaseBot, ManagedBot, ModuleBot } = require('./BotManagers');
const BotScheduler = require('./BotScheduler');

module.exports = {
    BotFramework,
    BaseBot,
    ManagedBot,
    ModuleBot,
    BotScheduler
};

module.exports.createFramework = (config = {}) => new BotFramework(config);
module.exports.default = BotFramework;

/**
 * Simple Test - Just Test HomeUpdaterBot
 */

const path = require('path');
const { BotFramework } = require('./framework');

async function testHomeBot() {
    console.log('🏠 Testing HomeUpdaterBot specifically...\n');

    const testConfig = {
        baseUrl: 'http://localhost:3000',
        logLevel: 'info',
        enableScheduler: false,
        pluginDirectory: path.join(__dirname, 'plugins'),
        configFile: path.join(__dirname, 'config', 'bot-config.json'),
        logFile: path.join(__dirname, 'logs', 'test-home.log')
    };

    try {
        const framework = new BotFramework(testConfig);
        await framework.initialize();
        
        console.log('✅ Framework initialized');
        
        // Try to run HomeUpdaterBot
        const botName = 'HomeUpdaterBot';
        if (framework.bots.has(botName)) {
            console.log(`🚀 Running ${botName}...`);
            await framework.startBot(botName);
            console.log(`✅ ${botName} completed successfully`);
        } else {
            console.log(`❌ ${botName} not found`);
            console.log('Available bots:', Array.from(framework.bots.keys()));
        }
        
        await framework.shutdown();
        console.log('✅ Test completed!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

testHomeBot();

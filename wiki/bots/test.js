/**
 * Simple Test Script for WikiBeachia Bot Framework
 * Quick way to test if the new framework is working
 */

const path = require('path');
const { BotFramework } = require('./framework');

// Simple test configuration
const testConfig = {
    baseUrl: 'http://localhost:3000',
    logLevel: 'info',
    enableScheduler: false, // Disable for testing
    pluginDirectory: path.join(__dirname, 'plugins'),
    configFile: path.join(__dirname, 'config', 'bot-config.json'),
    logFile: path.join(__dirname, 'logs', 'test.log')
};

async function runTest() {
    console.log('🧪 Testing WikiBeachia Bot Framework...\n');

    try {
        // Create framework instance
        const framework = new BotFramework(testConfig);
        
        // Initialize framework
        console.log('⚡ Initializing framework...');
        await framework.initialize();
        
        // Show discovered bots
        const status = framework.getBotStatus();
        console.log(`📊 Framework Status:`);
        console.log(`   Total Bots: ${status.total}`);
        console.log(`   Running: ${status.running}`);
        console.log(`   Stopped: ${status.stopped}\n`);
        
        if (status.bots.length > 0) {
            console.log('🤖 Discovered Bots:');
            for (const bot of status.bots) {
                console.log(`   - ${bot.name} (${bot.type})`);
            }
            console.log('');
            
            // Test running the first bot
            const firstBot = status.bots[0];
            if (firstBot) {
                console.log(`🚀 Testing bot: ${firstBot.name}`);
                try {
                    await framework.startBot(firstBot.name);
                    console.log(`✅ Bot ${firstBot.name} executed successfully`);
                } catch (error) {
                    console.log(`❌ Bot ${firstBot.name} failed: ${error.message}`);
                }
            }
        } else {
            console.log('⚠️  No bots discovered');
        }
        
        // Shutdown
        await framework.shutdown();
        console.log('\n✅ Test completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        process.exit(1);
    }
}

// Run test if this file is executed directly
if (require.main === module) {
    runTest().catch(error => {
        console.error('💥 Test crashed:', error.message);
        process.exit(1);
    });
}

module.exports = { runTest };

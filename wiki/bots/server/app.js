const db = require('../../../src/modules/db.js');

class HomerBot {
    constructor() {
        // No need for API calls, we can use the database directly
    }

    async createTestPage() {
        const content = `# Test Page

This is a test page created by Homer Bot.

- Created: ${new Date().toISOString()}
- Status: Active`;

        try {
            const name = 'test_page';
            const display_name = 'Test Page';
            
            // Check if page already exists
            try {
                await db.pages.getPage(name);
                console.log('ℹTest page already exists');
                return;
            } catch (error) {
                // Page doesn't exist, create it
            }
            
            await db.pages.createPage(name, display_name, content);
            console.log('✅ Test page created');
        } catch (error) {
            console.error('Error creating test page:', error.message);
        }
    }
}

async function runBot() {
    const homer = new HomerBot();
    
    try {
        await homer.createTestPage();
    } catch (error) {
        console.error('Bot error:', error.message);
    }
}

module.exports = HomerBot;

// Only run if this file is executed directly, not when required
if (require.main === module) {
    runBot();
}
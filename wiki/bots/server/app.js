const db = require('../../../src/modules/db.js');

class HomerBot {
    constructor() {
        // No need for API calls, we can use the database directly
    }

    async updateHome() {
        console.log('Updating home page...');
        let content = `# Home Page
        This is the updated content for the home page.`;
        try{
            // First get the home page to get its ID
            const homePage = await db.pages.getPage('home');
            await db.pages.updatePage(homePage.id, 'home', 'Home', content);
            console.log('Home page updated');
        } catch (error){
            console.error('Error updating home page:', error.message);
        }
    }
}

async function runBot() {
    const homer = new HomerBot();
    
    try {
        await homer.updateHome();
    } catch (error) {
        console.error('Bot error:', error.message);
    }
}

module.exports = HomerBot;

runBot();
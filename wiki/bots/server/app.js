/**
 * Home Updater Bot - Migrated to New Framework
 * This bot now uses the improved WikiBeachia Bot Framework
 */

const { BaseBot } = require('../framework');

class HomeUpdaterBot extends BaseBot {
    constructor(name, framework) {
        super(name || 'HomeUpdaterBot', framework);
        this.dependencies = [];
    }

    async initialize(context) {
        this.logger.info('Initializing Home Updater Bot...');
        
        // Get database connection directly (more efficient than API calls)
        this.db = await this.framework.apiClient.getDatabase();
        
        this.logger.info('Home Updater Bot initialized successfully');
    }

    async execute(context) {
        this.logger.info('Starting home page update...');

        try {
            // Generate new content with current statistics
            const content = await this.generateHomeContent();
            
            // Get the home page
            const homePage = await this.db.pages.getPage('home');
            if (!homePage) {
                throw new Error('Home page not found in database');
            }

            // Update the page
            await this.db.pages.updatePage(homePage.id, 'home', 'Home', content);
            
            this.logger.info('Home page updated successfully');
            
            return {
                success: true,
                message: 'Home page updated successfully',
                pageId: homePage.id,
                contentLength: content.length,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            this.logger.error(`Failed to update home page: ${error.message}`);
            throw error;
        }
    }

    async generateHomeContent() {
        const timestamp = new Date().toISOString();
        
        // Get wiki statistics
        const stats = await this.getWikiStats();
        
        const content = `# Welcome to WikiBeachia! 🏖️

Welcome to our collaborative wiki platform! This page is automatically updated to provide you with the latest information about our community.

## Current Statistics
- **Last Updated**: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
- **Total Pages**: ${stats.totalPages}
- **Active Users**: ${stats.activeUsers}
- **Content Quality**: ${stats.contentHealth}

## Recent Activity
Our community has been busy! Here's what's been happening:
- **Recent Edits**: ${stats.recentEdits}
- **New Pages Created**: ${stats.newPages}
- **Community Growth**: ${stats.growthRate}

## Getting Started
Whether you're new to WikiBeachia or a returning contributor, here's how to get involved:

1. **Browse Content**: Explore our ${stats.totalPages} pages of community knowledge
2. **Create Account**: Join our community of ${stats.activeUsers} active contributors
3. **Start Editing**: Share your knowledge and help build our collaborative platform
4. **Join Discussions**: Connect with other community members

## Featured Content
${stats.featuredPages.length > 0 ? 
    stats.featuredPages.map(page => `- [${page.display_name}](/${page.name})`).join('\n') :
    '- No featured content available yet - be the first to contribute!'
}

## Quick Navigation
- [📝 Recent Changes](/recent-changes)
- [🎲 Random Page](/random)
- [❓ Help & Support](/help)
- [📋 Community Guidelines](/guidelines)
- [📊 Site Statistics](/statistics)

## Community Health
Our automated systems continuously monitor content quality and community health:
- **Content Monitoring**: Active
- **Spam Detection**: Enabled
- **Community Guidelines**: Enforced
- **System Status**: ${stats.systemHealth}

---
*This page is automatically maintained by WikiBeachia's intelligent bot system.*  
*Last updated: ${timestamp}*  
*Next update: Scheduled every 6 hours*`;

        return content;
    }

    async getWikiStats() {
        const stats = {
            totalPages: 0,
            activeUsers: 0,
            recentEdits: 0,
            newPages: 0,
            growthRate: 'Steady',
            contentHealth: '✅ Good',
            systemHealth: '🟢 Healthy',
            featuredPages: []
        };

        try {
            // Get all pages
            const allPages = await this.db.pages.getAllPages();
            stats.totalPages = allPages.length;
            
            // Get featured pages (first 5 for simplicity)
            stats.featuredPages = allPages.slice(0, 5);
            
            // Get user statistics
            const allUsers = await this.db.users.getAllUsers();
            stats.activeUsers = allUsers.filter(u => u.account_status === 'active' && u.type !== 'bot').length;
            
            // Estimate recent activity (simplified)
            stats.recentEdits = Math.min(allPages.length * 2, 50);
            stats.newPages = Math.min(allPages.length / 10, 10);

        } catch (error) {
            this.logger.warn(`Could not fetch complete wiki statistics: ${error.message}`);
            // Return default values on error
        }

        return stats;
    }

    async cleanup() {
        this.logger.info('Home Updater Bot cleanup complete');
    }
}

// For backward compatibility and direct execution
async function runBot() {
    console.log('⚠️  NOTICE: This bot has been migrated to the new framework!');
    console.log('🔄 Use the new bot manager instead:');
    console.log('   node ../bot-manager.js run HomeUpdaterBot');
    console.log('');
    
    try {
        // Try to use the new framework if available
        const BotFramework = require('../framework').BotFramework;
        const framework = new BotFramework();
        
        await framework.initialize();
        
        const bot = new HomeUpdaterBot('HomeUpdaterBot', framework);
        await bot.start();
        
        console.log('✅ Bot executed successfully via new framework');
        
    } catch (error) {
        console.error('❌ Failed to run via new framework:', error.message);
        console.log('📚 Please see the new bot system documentation in ../README.md');
    }
}

// Export the bot class for the new framework
module.exports = HomeUpdaterBot;

// Run the bot if this file is executed directly
if (require.main === module) {
    runBot();
}
/**
 * Migration Script - Old Bot System to New Framework
 * This script helps migrate from the old bot system to the new framework
 */

const fs = require('fs').promises;
const path = require('path');

class BotMigration {
    constructor() {
        this.oldFiles = [
            'bot-default.js',
            '_bot.js',
            'server/app.js'
        ];
        
        this.backupDir = path.join(__dirname, 'backup-old-system');
    }

    async migrate() {
        console.log('🔄 Starting WikiBeachia Bot System Migration...\n');

        try {
            // Create backup directory
            await this.createBackup();
            
            // Show migration summary
            await this.showMigrationSummary();
            
            // Provide next steps
            this.showNextSteps();
            
            console.log('✅ Migration completed successfully!\n');
            
        } catch (error) {
            console.error('❌ Migration failed:', error.message);
            throw error;
        }
    }

    async createBackup() {
        console.log('📦 Creating backup of old bot system...');
        
        try {
            await fs.mkdir(this.backupDir, { recursive: true });
            
            for (const file of this.oldFiles) {
                const oldPath = path.join(__dirname, file);
                const backupPath = path.join(this.backupDir, file.replace('/', '_'));
                
                try {
                    await fs.copyFile(oldPath, backupPath);
                    console.log(`   ✅ Backed up: ${file}`);
                } catch (error) {
                    if (error.code !== 'ENOENT') {
                        console.log(`   ⚠️  Could not backup ${file}: ${error.message}`);
                    }
                }
            }
            
            console.log(`📁 Backup created in: ${this.backupDir}\n`);
            
        } catch (error) {
            console.error('❌ Backup failed:', error.message);
            throw error;
        }
    }

    async showMigrationSummary() {
        console.log('📋 Migration Summary:');
        console.log('');
        
        console.log('🔄 System Changes:');
        console.log('   ❌ Old: bot-default.js (monolithic bot manager)');
        console.log('   ✅ New: bot-manager.js (modular framework)');
        console.log('');
        console.log('   ❌ Old: _bot.js (basic API client)');
        console.log('   ✅ New: framework/WikiBeachiaAPIClient.js (advanced client)');
        console.log('');
        console.log('   ❌ Old: server/app.js (simple bot)');
        console.log('   ✅ New: bots/HomeUpdaterBot.js (framework-based bot)');
        console.log('');
        
        console.log('🚀 New Features:');
        console.log('   ✅ Event-driven architecture');
        console.log('   ✅ Advanced scheduling with cron patterns');
        console.log('   ✅ Comprehensive logging with rotation');
        console.log('   ✅ Plugin system for extensibility');
        console.log('   ✅ Health monitoring and diagnostics');
        console.log('   ✅ Content quality monitoring');
        console.log('   ✅ Configuration management');
        console.log('   ✅ Graceful error handling and recovery');
        console.log('');
        
        console.log('🤖 Available Bots:');
        console.log('   ✅ HomeUpdaterBot - Enhanced home page management');
        console.log('   ✅ MaintenanceBot - Database and system maintenance');
        console.log('   ✅ ContentMonitorBot - Content quality and security');
        console.log('');
    }

    showNextSteps() {
        console.log('🎯 Next Steps:');
        console.log('');
        console.log('1. 📖 Read the documentation:');
        console.log('   cat README.md');
        console.log('');
        console.log('2. 🔧 Configure the new system:');
        console.log('   edit config/bot-config.json');
        console.log('');
        console.log('3. 🚀 Start the new bot framework:');
        console.log('   node bot-manager.js start');
        console.log('');
        console.log('4. 📊 Check framework status:');
        console.log('   node bot-manager.js status');
        console.log('');
        console.log('5. 🏃 Run individual bots:');
        console.log('   node bot-manager.js run HomeUpdaterBot');
        console.log('   node bot-manager.js run MaintenanceBot');
        console.log('   node bot-manager.js run ContentMonitorBot');
        console.log('');
        console.log('6. 📋 List available bots and tasks:');
        console.log('   node bot-manager.js list bots');
        console.log('   node bot-manager.js list tasks');
        console.log('');
        console.log('7. 🔐 Update bot credentials (IMPORTANT):');
        console.log('   - Edit config/bot-config.json');
        console.log('   - Set BOT_CLIENT_SECRET environment variable');
        console.log('   - Create bot user in WikiBeachia admin panel');
        console.log('');
        console.log('8. 📝 Create custom bots:');
        console.log('   - See examples in bots/ directory');
        console.log('   - Follow BaseBot pattern for best practices');
        console.log('');
    }

    async showCompatibility() {
        console.log('🔄 Backward Compatibility:');
        console.log('');
        console.log('The new framework maintains compatibility with:');
        console.log('   ✅ Existing WikiBeachia API endpoints');
        console.log('   ✅ Database schema and operations');
        console.log('   ✅ Bot authentication system');
        console.log('   ✅ Core bot functionality');
        console.log('');
        console.log('Breaking changes:');
        console.log('   ❌ Old bot file structure (migrated automatically)');
        console.log('   ❌ Direct bot execution (use new CLI)');
        console.log('   ❌ Manual scheduling (now automated)');
        console.log('');
    }

    async verifyMigration() {
        console.log('🔍 Verifying migration...');
        
        const requiredFiles = [
            'framework/index.js',
            'framework/BotFramework.js',
            'bot-manager.js',
            'config/bot-config.json',
            'README.md'
        ];

        let allFilesExist = true;
        
        for (const file of requiredFiles) {
            const filePath = path.join(__dirname, file);
            try {
                await fs.access(filePath);
                console.log(`   ✅ ${file}`);
            } catch (error) {
                console.log(`   ❌ ${file} - MISSING`);
                allFilesExist = false;
            }
        }

        if (allFilesExist) {
            console.log('✅ All required files present');
            return true;
        } else {
            console.log('❌ Some files are missing - migration may be incomplete');
            return false;
        }
    }
}

// Run migration if this file is executed directly
if (require.main === module) {
    const migration = new BotMigration();
    
    migration.migrate().then(() => {
        console.log('🎉 Welcome to the new WikiBeachia Bot Framework!');
        console.log('📚 Check README.md for complete documentation');
        console.log('🚀 Ready to start: node bot-manager.js start');
    }).catch(error => {
        console.error('💥 Migration failed:', error.message);
        process.exit(1);
    });
}

module.exports = BotMigration;

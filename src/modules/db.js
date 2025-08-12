const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const db_path = path.join(__dirname, '../misc/database.db');
const db = new sqlite3.Database(db_path);

const crypto = require('node:crypto');

function randomBytes(size=32){
    return crypto.randomBytes(size).toString('hex');
}
function hash(s){
    return bcrypt.hashSync(s, 12); // Use bcrypt with cost factor 12
}
const _db = new class{
    constructor(){
            this.randomBytes = randomBytes;
            this.hash = hash;
            this.db = db;
            this.hashIP = function(ip) {
                return crypto.createHash('sha256').update(ip).digest('hex');
            };
    }
    async init() {
        const sql = `
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            CREATE TABLE IF NOT EXISTS pages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE,
                display_name TEXT UNIQUE,
                content TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_modified DATETIME DEFAULT CURRENT_TIMESTAMP,
                permission INTEGER DEFAULT 0,
                markdown BOOLEAN DEFAULT 0
            );
            INSERT OR IGNORE INTO pages (name, display_name, content, permission) VALUES ('home', 'Home', 'Welcome to the home page. :)', 500);
            INSERT OR IGNORE INTO pages (name, display_name, content, permission) VALUES ('404', '404', 'This page does not exist. Please check the URL or return to the homepage.', 500);
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                role INTEGER DEFAULT 1, 
                token TEXT UNIQUE DEFAULT NULL,
                display_name TEXT UNIQUE,
                account_status TEXT DEFAULT 'active',
                type TEXT DEFAULT 'user',
                bio  TEXT DEFAULT 'This is the default user bio, you should change this :)',
                ip TEXT DEFAULT NULL
            );
            
            CREATE TABLE IF NOT EXISTS banned_ips (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip TEXT UNIQUE NOT NULL,
                banned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                banned_by INTEGER,
                FOREIGN KEY(banned_by) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS applications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT default NULL,
                email TEXT default NULL,
                reason TEXT default NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                permission INTEGER DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS page_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                page_id INTEGER NOT NULL,
                display_name TEXT,
                content TEXT,
                edited_by INTEGER,
                edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(page_id) REFERENCES pages(id)
            );

            INSERT OR IGNORE INTO users (username, password, display_name, role, type)
                VALUES ('admin', '${hash('admin')}', 'Site Administrator', 500, 'user');
            INSERT OR IGNORE INTO users (username, password, display_name, role, type)
                VALUES ('_system', '${this.randomBytes()}', 'System Bot', 500, 'bot');

            CREATE TABLE IF NOT EXISTS wiki_variables (
                name TEXT PRIMARY KEY UNIQUE NOT NULL,
                value TEXT DEFAULT NULL,
                description TEXT DEFAULT NULL
            );
            CREATE TABLE IF NOT EXISTS logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                userid INTEGER DEFAULT 0,
                page TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            );
            INSERT OR IGNORE INTO wiki_variables (name, value, description) VALUES
                ('site_name', 'WikiBeachia', 'The name of the wiki'),
                ('admin_account_enabled', 'true', 'please make your own admin account in prod'),
                ('icon','icon.png','uh, icon url :)'),
                ('logging','true','Is logging enabled?'),
                ('applications','true','is registration application based?');
        `;
        // Check if 'bio' column exists, and add it if not
        new Promise((resolve, reject) => {
            this.db.exec(sql, err => {
                if (err) return reject(err);
                this.db.all("PRAGMA table_info(users);", (err, columns) => {
                    if (err) return reject(err);
                    const hasBio = columns.some(col => col.name === 'bio');
                    if (!hasBio) {
                        this.db.run("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT 'This is the default user bio, you should change this :)';", err2 => {
                            if (err2) return reject(err2);
                            // After adding bio column, check for last_edited_by column in pages table
                            this.checkAndAddLastEditedBy(resolve, reject);
                        });
                    } else {
                        // Bio column exists, check for last_edited_by column
                        this.checkAndAddLastEditedBy(resolve, reject);
                    }
                });
            });
        });
        new Promise((resolve, reject) => {
            this.db.exec(sql, err => {
                if (err) return reject(err);
                this.db.all("PRAGMA table_info(users);", (err, columns) => {
                    if (err) return reject(err);
                    const hasBio = columns.some(col => col.name === 'ip');
                    if (!hasBio) {
                        this.db.run("ALTER TABLE users ADD COLUMN ip TEXT DEFAULT null;", err2 => {
                            if (err2) return reject(err2);
                            // After adding bio column, check for last_edited_by column in pages table
                            this.checkAndAddLastEditedBy(resolve, reject);
                        });
                    } else {
                        // Bio column exists, check for last_edited_by column
                        this.checkAndAddLastEditedBy(resolve, reject);
                    }
                });
            });
        });
    }
    
    checkAndAddLastEditedBy(resolve, reject) {
        this.db.all("PRAGMA table_info(pages);", (err, columns) => {
            if (err) return reject(err); 
            const hasLastEditedBy = columns.some(col => col.name === 'last_edited_by');
            if (!hasLastEditedBy) {
                this.db.run("ALTER TABLE pages ADD COLUMN last_edited_by INTEGER;", err2 => {
                    if (err2) return reject(err2);
                    // After adding last_edited_by, migrate logs table
                    this.migrateLogs(resolve, reject);
                });
            } else {
                // Column exists, migrate logs table
                this.migrateLogs(resolve, reject);
            }
        });
    }
    
    migrateLogs(resolve, reject) {
        // Check and add new columns to logs table
        this.db.all("PRAGMA table_info(logs);", (err, columns) => {
            if (err) {
                console.error('Failed to check logs table structure:', err);
                return reject(err);
            }
            
            const columnNames = columns.map(col => col.name);
            const addColumns = [];
            
            if (!columnNames.includes('action')) {
                addColumns.push("ALTER TABLE logs ADD COLUMN action TEXT DEFAULT 'page_view';");
            }
            if (!columnNames.includes('details')) {
                addColumns.push("ALTER TABLE logs ADD COLUMN details TEXT DEFAULT NULL;");
            }
            if (!columnNames.includes('ip_hash')) {
                addColumns.push("ALTER TABLE logs ADD COLUMN ip_hash TEXT DEFAULT NULL;");
            }
            if (!columnNames.includes('target_user')) {
                addColumns.push("ALTER TABLE logs ADD COLUMN target_user INTEGER DEFAULT NULL;");
            }
            if (!columnNames.includes('target_resource')) {
                addColumns.push("ALTER TABLE logs ADD COLUMN target_resource TEXT DEFAULT NULL;");
            }
            
            // Execute column additions
            if (addColumns.length > 0) {
                let completed = 0;
                const total = addColumns.length;
                
                addColumns.forEach(sql => {
                    this.db.run(sql, (err) => {
                        if (err) {
                            console.error('Failed to add column:', err);
                            return reject(err);
                        }
                        completed++;
                        if (completed === total) {
                            // After adding all columns, migrate existing data
                            this.finalizeMigration(resolve, reject);
                        }
                    });
                });
            } else {
                resolve();
            }
        });
    }
    
    finalizeMigration(resolve, reject) {
        // Migrate existing data
        this.db.run(`
            UPDATE logs 
            SET target_resource = page, action = 'page_view' 
            WHERE page IS NOT NULL AND (target_resource IS NULL OR target_resource = '')
        `, (err) => {
            if (err) {
                console.error('Failed to migrate existing log data:', err);
                return reject(err);
            }
            
            console.log('Successfully migrated logs table to enhanced format');
            
            // Create indexes for better performance
            const indexes = [
                "CREATE INDEX IF NOT EXISTS idx_logs_userid ON logs(userid);",
                "CREATE INDEX IF NOT EXISTS idx_logs_action ON logs(action);", 
                "CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);",
                "CREATE INDEX IF NOT EXISTS idx_logs_target_user ON logs(target_user);"
            ];
            
            let indexCompleted = 0;
            indexes.forEach(sql => {
                this.db.run(sql, (err) => {
                    if (err) console.error('Failed to create index:', err);
                    indexCompleted++;
                    if (indexCompleted === indexes.length) {
                        resolve();
                    }
                });
            });
        });
    }
    logs = new class{
        constructor(){
            this.db = db;
        }
        // Enhanced logging with action types and details
        async add(uid, action, details = null, ip = null, target_user = null, target_resource = null){
            return new Promise((res, rej) => {
                this.db.prepare(
                    'INSERT INTO logs (userid, action, details, ip_hash, target_user, target_resource, timestamp) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
                ).run(uid, action, details, ip ? _db.hashIP(ip) : null, target_user, target_resource, function(err){
                    if (err) return rej(err);
                    res(this.lastID);
                });
            });
        }
        // Legacy method for backward compatibility - maps old page-based logging to new system
        async addLegacy(uid, page){
            return this.add(uid, 'page_view', null, null, null, page);
        }
        // Specific logging methods for different action types
        async logAuth(uid, action, details, ip, success = true){
            const actionType = success ? action : `${action}_failed`;
            return this.add(uid, actionType, details, ip);
        }
        async logPageAction(uid, action, page_name, details = null, ip = null){
            return this.add(uid, `page_${action}`, details, ip, null, page_name);
        }
        async logUserAction(uid, action, target_uid, details = null, ip = null){
            return this.add(uid, `user_${action}`, details, ip, target_uid);
        }
        async logAdminAction(uid, action, details = null, ip = null, target = null){
            return this.add(uid, `admin_${action}`, details, ip, null, target);
        }
        async logMediaAction(uid, action, filename, details = null, ip = null){
            return this.add(uid, `media_${action}`, details, ip, null, filename);
        }
        async logSecurityAction(uid, action, details, ip, target_user = null){
            return this.add(uid, `security_${action}`, details, ip, target_user);
        }
        // Get methods with enhanced filtering
        async getByUser(uid, limit = 20, offset = 0){
            return new Promise((res, rej) => {
                this.db.prepare(`
                    SELECT l.*, u.username as user_username, tu.username as target_username 
                    FROM logs l
                    LEFT JOIN users u ON l.userid = u.id
                    LEFT JOIN users tu ON l.target_user = tu.id
                    WHERE l.userid = ? 
                    ORDER BY l.timestamp DESC 
                    LIMIT ? OFFSET ?
                `).all(uid, limit, offset, (err, rows) => {
                    if (err) return rej(err);
                    res(rows);
                });
            });
        }
        async getAll(limit = 50, offset = 0){
            return new Promise((res, rej) => {
                this.db.prepare(`
                    SELECT l.*, u.username as user_username, tu.username as target_username 
                    FROM logs l
                    LEFT JOIN users u ON l.userid = u.id
                    LEFT JOIN users tu ON l.target_user = tu.id
                    ORDER BY l.timestamp DESC 
                    LIMIT ? OFFSET ?
                `).all(limit, offset, (err, rows) => {
                    if (err) return rej(err);
                    res(rows);
                });
            });
        }
        async getByAction(action, limit = 50, offset = 0){
            return new Promise((res, rej) => {
                this.db.prepare(`
                    SELECT l.*, u.username as user_username, tu.username as target_username 
                    FROM logs l
                    LEFT JOIN users u ON l.userid = u.id
                    LEFT JOIN users tu ON l.target_user = tu.id
                    WHERE l.action = ? 
                    ORDER BY l.timestamp DESC 
                    LIMIT ? OFFSET ?
                `).all(action, limit, offset, (err, rows) => {
                    if (err) return rej(err);
                    res(rows);
                });
            });
        }
        async getSecurityLogs(limit = 100, offset = 0){
            return new Promise((res, rej) => {
                this.db.prepare(`
                    SELECT l.*, u.username as user_username, tu.username as target_username 
                    FROM logs l
                    LEFT JOIN users u ON l.userid = u.id
                    LEFT JOIN users tu ON l.target_user = tu.id
                    WHERE l.action LIKE 'security_%' OR l.action LIKE 'login%' OR l.action LIKE 'user_ban%' OR l.action LIKE 'user_suspend%'
                    ORDER BY l.timestamp DESC 
                    LIMIT ? OFFSET ?
                `).all(limit, offset, (err, rows) => {
                    if (err) return rej(err);
                    res(rows);
                });
            });
        }
        async getLogStats(){
            return new Promise((res, rej) => {
                this.db.all(`
                    SELECT 
                        action,
                        COUNT(*) as count,
                        COUNT(DISTINCT userid) as unique_users,
                        DATE(timestamp) as date
                    FROM logs 
                    WHERE timestamp >= date('now', '-30 days')
                    GROUP BY action, DATE(timestamp)
                    ORDER BY timestamp DESC
                `, (err, rows) => {
                    if (err) return rej(err);
                    res(rows);
                });
            });
        }
        // Clean up old logs (keep last 90 days by default)
        async cleanup(days = 90){
            return new Promise((res, rej) => {
                this.db.prepare(`DELETE FROM logs WHERE timestamp < datetime('now', '-${days} days')`).run(function(err){
                    if (err) return rej(err);
                    res(this.changes);
                });
            });
        }
        async deleteByUser(uid){
            return new Promise((res, rej) => {
                this.db.prepare('DELETE FROM logs WHERE userid = ?').run(uid, function(err){
                    if (err) return rej(err);
                    res(this.changes);
                });
            });
        }
        async deleteById(logid){
            return new Promise((res, rej) => {
                this.db.prepare('DELETE FROM logs WHERE id = ?').run(logid, function(err){
                    if (err) return rej(err);
                    res(this.changes);
                });
            });
        }
    }
    applications = new class{
        constructor(){
            this.db = db;
        }
        async delete(id){
            return new Promise((res, rej) => {
                this.db.prepare('DELETE FROM applications WHERE id = ?').run(id, function(err){
                    if(err) return rej(err);
                    if(this.changes === 0) return rej(new Error('Application not found'));
                    res(this.changes);
                });
            });
        }
        async create(username, password, email, reason){
            password = hash(password);
            return new Promise((res, rej) => {
                this.db.prepare('INSERT INTO applications (username, password, email, reason) VALUES (?, ?, ?, ?)').run(username, password, email, reason, function(err){
                    if(err) return rej(err);
                    res(this.lastID);
                });
            });
        }
        async getById(id){
            return new Promise((res, rej) => {
                this.db.prepare('SELECT * FROM applications WHERE id = ?').get(id, (err, row) => {
                    if(err) return rej(err);
                    if(!row) return rej(new Error('Application not found'));
                    res(row);
                });
            });
        }
        async get(offset = 0, limit = 10){
            return new Promise((res, rej) => {
                this.db.prepare('SELECT * FROM applications ORDER BY created_at LIMIT ? OFFSET ?').all(limit, offset, (err, rows) => {
                    if(err) return rej(err);
                    res(rows);
                });
            });
        }
        async getAll(){
            return new Promise((res, rej) => {
                this.db.prepare('SELECT * FROM applications ORDER BY created_at DESC').all((err, rows) => {
                    if(err) return rej(err);
                    res(rows);
                });
            });
        }
    }();
    pages = new class{
        constructor(){
            this.db = db;
        }
        async deletePage(id){
            return new Promise((res,rej)=>{
                this.db.prepare('DELETE FROM pages WHERE id = ?').run(id,(err,row)=>{
                    if (err) return rej (err);
                    res(row)
                })
            })
        }
        async getPage(name){
            name = String(name).toLowerCase();
            return new Promise((res,rej)=>{
                this.db.prepare('SELECT p.*, u.display_name as last_editor_name FROM pages p LEFT JOIN users u ON p.last_edited_by = u.id WHERE p.name = ?').get(name,(err,row)=>{
                    if(err) return rej(err);
                    if(!row) return rej('no page found');
                    res(row);
                })
            })
        }
        async createPage(name, display_name, content){
            name = String(name).toLowerCase();
            return new Promise((res,rej)=>{
                this.db.prepare('INSERT INTO pages (name, display_name, content) VALUES (?, ?, ?)').run(name, display_name, content, function(err){
                    if(err) return rej(err);
                    res(this.lastID);
                });
            });
        }
        async updatePage(id, name, display_name, content, userId = null){
            if (!display_name){display_name = name;}
            name = name.toLowerCase().replace(/\s+/g, '_');
            return new Promise((res,rej)=>{
                this.db.prepare('UPDATE pages SET display_name = ?, name = ?, content = ?, last_modified = CURRENT_TIMESTAMP, last_edited_by = ? WHERE id = ?').run(display_name, name, content, userId, id, function(err){
                    if(err) return rej(err);
                    if(this.changes === 0) return rej(new Error('Page not found'));
                    res(this.changes);
                });
            });
        }
        async getAllPages(){
            return new Promise((res,rej)=>{
                this.db.prepare('SELECT * FROM pages WHERE name != "404" ORDER BY display_name').all((err,rows)=>{
                    if(err) return rej(err);
                    res(rows);
                })
            })
        }

        // --- Versioning methods ---
        async saveVersion(pageId, display_name, content, userId){
            return new Promise((res, rej) => {
                this.db.prepare('INSERT INTO page_versions (page_id, display_name, content, edited_by) VALUES (?, ?, ?, ?)')
                    .run(pageId, display_name, content, userId, function(err){
                        if(err) return rej(err);
                        res(this.lastID);
                    });
            });
        }
        async getVersions(pageId){
            return new Promise((res, rej) => {
                this.db.prepare('SELECT v.*, u.display_name as editor_name FROM page_versions v LEFT JOIN users u ON v.edited_by = u.id WHERE v.page_id = ? ORDER BY v.edited_at DESC')
                    .all(pageId, (err, rows) => {
                        if(err) return rej(err);
                        res(rows);
                    });
            });
        }
        async getVersionById(versionId){
            return new Promise((res, rej) => {
                this.db.prepare('SELECT * FROM page_versions WHERE id = ?').get(versionId, (err, row) => {
                    if(err) return rej(err);
                    res(row);
                });
            });
        }
    }();
    bannedIps = new class {
        constructor() {
            this.db = db;
        }

        // Ban all accounts associated with an IP (expects hashed IP from database)
        async banAccountsByHashedIp(hashedIp, adminUserId) {
            return new Promise((res, rej) => {
                // First find all users with this hashed IP
                this.db.all("SELECT id FROM users WHERE ip = ?", hashedIp, async (err, rows) => {
                    if (err) return rej(err);
                    
                    try {
                        // Add hashed IP to banned_ips table
                        await new Promise((resolve, reject) => {
                            this.db.run("INSERT OR IGNORE INTO banned_ips (ip, banned_by) VALUES (?, ?)", 
                                hashedIp, adminUserId, (err) => {
                                    if (err) reject(err);
                                    else resolve();
                                });
                        });
                        
                        // Update status for all found users
                        const updates = rows.map(row => 
                            new Promise((resolve, reject) => {
                                this.db.prepare('UPDATE users SET account_status = ? WHERE id = ?')
                                    .run('suspended', row.id, (err) => {
                                        if (err) reject(err);
                                        else resolve();
                                    });
                            })
                        );
                        
                        await Promise.all(updates);
                        res(rows.length); // Return number of accounts banned
                    } catch (error) {
                        rej(error);
                    }
                });
            });
        }

        // Ban all accounts associated with an IP (expects raw IP)
        async banAccountsByIp(ip, adminUserId) {
            const hashedIp = _db.hashIP(ip);
            return this.banAccountsByHashedIp(hashedIp, adminUserId);
        }

        // Unban all accounts associated with a hashed IP
        async unbanAccountsByHashedIp(hashedIp) {
            return new Promise((res, rej) => {
                this.db.all("SELECT id FROM users WHERE ip = ?", hashedIp, async (err, rows) => {
                    if (err) return rej(err);
                    
                    try {
                        // Remove hashed IP from banned_ips table
                        await new Promise((resolve, reject) => {
                            this.db.run("DELETE FROM banned_ips WHERE ip = ?", hashedIp, (err) => {
                                if (err) reject(err);
                                else resolve();
                            });
                        });
                        
                        // Update status for all found users (only if they were suspended due to IP ban)
                        const updates = rows.map(row => 
                            new Promise((resolve, reject) => {
                                this.db.prepare('UPDATE users SET account_status = ? WHERE id = ? AND account_status = ?')
                                    .run('active', row.id, 'suspended', (err) => {
                                        if (err) reject(err);
                                        else resolve();
                                    });
                            })
                        );
                        
                        await Promise.all(updates);
                        res(rows.length); // Return number of accounts unbanned
                    } catch (error) {
                        rej(error);
                    }
                });
            });
        }

        // Unban all accounts associated with an IP (expects raw IP)
        async unbanAccountsByIp(ip) {
            const hashedIp = _db.hashIP(ip);
            return this.unbanAccountsByHashedIp(hashedIp);
        }

        // Get all banned accounts grouped by IP
        async getBannedAccounts() {
            return new Promise((res, rej) => {
                this.db.all(`
                    SELECT u.ip, 
                           GROUP_CONCAT(u.username) as usernames,
                           COUNT(*) as account_count,
                           MAX(u.account_status) as status
                    FROM users u
                    WHERE u.ip IS NOT NULL 
                    AND u.account_status = 'suspended'
                    GROUP BY u.ip
                    ORDER BY account_count DESC
                `, (err, rows) => {
                    if (err) return rej(err);
                    res(rows);
                });
            });
        }

        // Check if an IP is banned
        async isIpBanned(ip) {
            const hashedIp = _db.hashIP(ip);
            return new Promise((res, rej) => {
                this.db.get("SELECT 1 FROM banned_ips WHERE ip = ?", hashedIp, (err, row) => {
                    if (err) return rej(err);
                    res(!!row); // Convert to boolean
                });
            });
        }

        // Ban a specific IP directly
        async banIp(ip, adminUserId) {
            const hashedIp = _db.hashIP(ip);
            return new Promise((res, rej) => {
                this.db.run("INSERT OR IGNORE INTO banned_ips (ip, banned_by) VALUES (?, ?)", 
                    hashedIp, adminUserId, function(err) {
                        if (err) return rej(err);
                        res(this.changes);
                    });
            });
        }
    }();

    users = new class{
        constructor(){
            this.db = db;
        }
        async setIP(userid, ip) {
            const hashedIp = _db.hashIP(ip);
            return new Promise((res, rej) => {
                this.db.run("UPDATE users SET ip = ? WHERE id = ?", hashedIp, userid, function(err) {
                    if (err) return rej(err);
                    res(this.changes);
                });
            });
        }
        async modifyUser(userid,displayname,bio){
            return new Promise((res,rej)=>{
                this.db.prepare('UPDATE users SET display_name = ?, bio = ? WHERE id = ?').run(displayname,bio,userid,function(err){
                    if (err) return rej(err);
                    if(this.changes === 0) return rej(new Error('User not found'))
                    res(this.changes)
                })
            })
        }
        async modifyStatus(userid, account_status){
            return new Promise((res, rej) => {
                this.db.prepare('UPDATE users SET account_status = ? WHERE id = ?').run(account_status, userid, function(err){
                    if(err) return rej(err);
                    if(this.changes === 0) return rej(new Error('User not found'));
                    res(this.changes);
                });
            });
        }
        async getAll(){
            return new Promise((res, rej) => {
                this.db.prepare('SELECT id, username, display_name, role, created_at, account_status FROM users ORDER BY created_at DESC').all((err, rows) => {
                    if(err) return rej(err);
                    res(rows);
                });
            });
        }
        async changePassword(userid, new_password){
            new_password = hash(new_password);
            return new Promise((res, rej) => {
                this.db.prepare('UPDATE users SET password = ? WHERE id = ?').run(new_password, userid, function(err){
                    if(err) return rej(err);
                    if(this.changes === 0) return rej(new Error('User not found'));
                    res(this.changes);
                });
            });
        }
        async modifyNameDisplayName(userid,name,display_name){
            return new Promise((res, rej) => {
                this.db.prepare('UPDATE users SET username = ?, display_name = ? WHERE id = ?').run(name, display_name || null, userid, function(err){
                    if(err) return rej(err);
                    if(this.changes === 0) return rej(new Error('User not found'));
                    res(this.changes);
                });
            });
        }
        async create(username,password,display_name=false,role=1){
            return new Promise((res,rej)=>{
                this.db.prepare('INSERT INTO users (username, password, display_name, role) VALUES (?, ?, ?, ?)').run(
                    username,
                    password,
                    display_name || null,
                    role || 1,
                    function(err){
                        if(err) return rej(err);
                        res(this.lastID);
                    }
                );
            });
        }
        async modify(userid, username, password, display_name, role){
            return new Promise((res,rej)=>{
                this.db.prepare('UPDATE users SET username = ?, password = ?, display_name = ?, role = ? WHERE id = ?').run(
                    username,
                    password,
                    display_name || null,
                    role || 1,
                    userid,
                    function(err){
                        if(err) return rej(err);
                        if(this.changes === 0) return rej(new Error('User not found'));
                        res(this.changes);
                    }
                );
            });
        }
        async getById(userid){
            return new Promise((res,rej)=>{
                this.db.prepare('SELECT * FROM users WHERE id = ?').get(userid, (err, row) => {
                    if(err) return rej(err);
                    if(!row) return rej(new Error('User not found'));
                    res(row);
                });
            });
        }
        async getByUsername(username){
            return new Promise((res,rej)=>{
                this.db.prepare('SELECT * FROM users WHERE username = ?').get(username, (err, row) => {
                    if(err) return rej(err);
                    if(!row) return rej(new Error('User not found'));
                    res(row);
                });
            });
        }
        async setToken(userid, token){
            return new Promise((res,rej)=>{
                this.db.prepare('UPDATE users SET token = ? WHERE id = ?').run(token, userid, function(err){
                    if(err) return rej(err);
                    if(this.changes === 0) return rej(new Error('User not found'));
                    res({ changes: this.changes, token:token });
                });
            });
        }
        async getUserByToken(token){
            return new Promise((res, rej) => {
                this.db.prepare('SELECT * FROM users WHERE token = ?').get(token, (err, row) => {
                    if(err) return rej(err);
                    if(!row) return rej(new Error('User not found'));
                    res(row);
                });
            });
        }
        async getPaginated(offset = 0, limit = 15){
            return new Promise((res, rej) => {
                // Get total count
                this.db.prepare('SELECT COUNT(*) as total FROM users').get((err, countRow) => {
                    if(err) return rej(err);
                    
                    // Get paginated users
                    this.db.prepare('SELECT id, username, display_name, role, created_at, account_status FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset, (err, rows) => {
                        if(err) return rej(err);
                        res({
                            users: rows,
                            total: countRow.total
                        });
                    });
                });
            });
        }
        async deleteById(userid){
            return new Promise((res, rej) => {
                this.db.prepare('DELETE FROM users WHERE id = ?').run(userid, function(err){
                    if(err) return rej(err);
                    if(this.changes === 0) return rej(new Error('User not found'));
                    res(this.changes);
                });
            });
        }
    };
    settings = new class{
        constructor(){
            this.db = db;
            this.settings = null; // Initialize as null, will be loaded when needed
        }
        async getSettings(){
            return new Promise((res, rej) => {
                this.db.prepare('SELECT * FROM wiki_variables').all((err, rows) => {
                    if(err) return rej(err);
                    const settings = {};
                    rows.forEach(row => {
                        settings[row.name] = row.value;
                    });
                    res(settings);
                });
            });
        }
        async updateSettings(settings) {
            return new Promise(async (res, rej) => {
                try {
                    // Load all current settings from DB
                    const currentSettings = await this.getSettings();
                    // For each key in settings, update the DB
                    this.db.serialize(() => {
                        Object.entries(settings).forEach(([key, value]) => {
                            // Convert boolean to string for DB
                            if (typeof value === 'boolean') value = value.toString();
                            // Only update if key exists in DB
                            if (currentSettings.hasOwnProperty(key)) {
                                this.db.prepare('UPDATE wiki_variables SET value = ? WHERE name = ?').run(value, key);
                            }
                        });
                        // Update cached settings
                        this.settings = { ...currentSettings, ...settings };
                        res(this.settings);
                    });
                } catch (error) {
                    rej(error);
                }
            });
        }
    }
}()
module.exports = _db;
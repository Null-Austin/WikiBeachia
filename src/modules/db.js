const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db_path = path.join(__dirname, '../misc/database.db');
const db = new sqlite3.Database(db_path);

const crypto = require('node:crypto');

function hash(s){
    return crypto.createHash('sha256').update(s).digest('hex');
}
const _db = new class{
    constructor(){
        this.db = db;
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
                permission INTEGER DEFAULT 0
            );
            INSERT OR IGNORE INTO pages (name, display_name, content) VALUES ('404', 'Page Not Found', 'This page does not exist. Please check the URL or return to the homepage.');
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE,
                password TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                role INTEGER DEFAULT 1, 
                token TEXT UNIQUE DEFAULT NULL,
                display_name TEXT UNIQUE,
                account_status TEXT DEFAULT NULL
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
            INSERT OR IGNORE INTO users (username,password,display_name,role) VALUES ('admin','${hash('admin')}','Site Administrator', 100);



            CREATE TABLE IF NOT EXISTS wiki_variables (
                name TEXT PRIMARY KEY UNIQUE NOT NULL,
                value TEXT DEFAULT NULL,
                description TEXT DEFAULT NULL
            );
            INSERT OR IGNORE INTO wiki_variables (name, value, description) VALUES
                ('site_name', 'WikiBeachia', 'The name of the wiki');
        `;
        return new Promise((resolve, reject) => {
            this.db.exec(sql, err => err ? reject(err) : resolve());
        });
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
        async getPage(name){
            name = String(name).toLowerCase();
            return new Promise((res,rej)=>{
                this.db.prepare('SELECT * FROM pages WHERE name = ?').get(name,(err,row)=>{
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
        async updatePage(name, display_name, content){
            if (!display_name){display_name = name;}
            name = String(name).toLowerCase();
            return new Promise((res,rej)=>{
                this.db.prepare('UPDATE pages SET display_name = ?, content = ?, last_modified = CURRENT_TIMESTAMP WHERE name = ?').run(display_name, content, name, function(err){
                    if(err) return rej(err);
                    if(this.changes === 0) return rej(new Error('Page not found'));
                    res(this.changes);
                });
            });
        }
        async getAllPages(){
            return new Promise((res,rej)=>{
                this.db.prepare('SELECT name, display_name, created_at, last_modified FROM pages WHERE name != "404" ORDER BY display_name').all((err,rows)=>{
                    if(err) return rej(err);
                    res(rows);
                })
            })
        }
    }();
    users = new class{
        constructor(){
            this.db = db;
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
                this.db.prepare('SELECT * FROM users WHERE username LIKE ?').get(username, (err, row) => {
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
    };
    settings = new class{
        constructor(){
            this.db = db;
        }
        getSettings(){
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
        modifySetting(name,value){
            return new Promise((res, rej) => {
                this.db.prepare('INSERT INTO wiki_variables (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = ?').run(name, value, value, function(err){
                    if(err) return rej(err);
                    res(this.changes);
                });
            });
        }
    }
}()
module.exports = _db;
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db_path = path.join(__dirname, '../misc/database.db');
const db = new sqlite3.Database(db_path);

const _db = new class{
    constructor(){
        this.db = db;
    }
    async init(){
        this.db.run('PRAGMA journal_mode = WAL');
        this.db.run('PRAGMA synchronous = NORMAL');
        this.db.prepare('CREATE TABLE IF NOT EXISTS pages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, display_name TEXT UNIQUE, content TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_modified DATETIME DEFAULT CURRENT_TIMESTAMP, permission INTEGER DEFAULT 0)').run();
    }
    pages = new class{
        constructor(){
            this.db = db;
        }
        async getPage(name){
            name = String(name).toLowerCase();
            return new Promise((res,rej)=>{
                this.db.prepare('SELECT * FROM pages WHERE name = ?').get(name,(err,row)=>{
                    if(err) return rej(err);
                    if(!row) return rej(new Error('Page not found'));
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
    }();
}()
module.exports = _db;
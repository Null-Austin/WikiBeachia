const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db_path = path.join(__dirname, '../misc/database.db');
const db = new sqlite3.Database(db_path);

const _db = new class{
    constructor(){
        this.init();
        this.db = db;
    }
    init(){
        this.db.run('PRAGMA journal_mode = WAL');
        this.db.run('PRAGMA synchronous = NORMAL');
        this.db.prepare('CREATE TABLE IF NOT EXISTS pages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, display_name TEXT UNIQUE, content TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, last_modified DATETIME DEFAULT CURRENT_TIMESTAMP, permission INTEGER DEFAULT 0)').run();
    }
    pages = new class{
        constructor(){
            this.db = db;
        }
    }();
}()
module.exports = _db;
// ========================================
// WIKIBEACHIA - COMBINED CODE FOR REVIEW
// ========================================
// This file combines all JavaScript modules from the WikiBeachia project
// for code review purposes. Individual modules are separated by comments.

// ========================================
// THIRD PARTY DEPENDENCIES
// ========================================
// Node modules
const path = require('node:path');
const fs = require('node:fs'); 
const crypto = require('node:crypto');

// third party modules
const express = require('express');
const ejs = require('ejs');
const colors = require('colors/safe');
const cookieParser = require('cookie-parser');
const sqlite3 = require('sqlite3').verbose();
const joi = require('joi');

// ========================================
// MODULE: SCHEMAS (schemas.js)
// ========================================
// Validation schemas using Joi
const _schemas = new class {
    constructor(){}

    // for application registration
    registrationSchema = joi.object({
        username: joi.string()
            .pattern(/^[a-zA-Z0-9_]+$/)
            .min(3)
            .max(20)
            .message('Username must contain only letters, numbers, and underscores')
            .required(),
        password: joi.string()
            .min(8)
            .message('Password must be at least 8 characters and include uppercase, lowercase, number, and special character')
            .required(),
        email: joi.string().min(4).email().required(),
        reason: joi.string().min(10).required()
    });

}()

// ========================================
// MODULE: DATABASE (db.js)
// ========================================
// Database connection and operations
const db_path = path.join(__dirname, 'src/misc/database.db');
const db = new sqlite3.Database(db_path);

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
        `;
        return new Promise((resolve, reject) => {
            this.db.exec(sql, err => err ? reject(err) : resolve());
        });
    }
    applications = new class{
        constructor(){
            this.db = db;
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
}()

// ========================================
// MODULE: USER AUTHENTICATION (userauth.js)
// ========================================
// User authentication and management
function randomBytes(size=32){
    return crypto.randomBytes(size).toString('hex');
}

const _userAuth = new class{
    constructor(){
        this.hash = hash;
        this.randomBytes = randomBytes;
    }
    async createUser(username,password,display_name=false,role=1){
        password = hash(password);
        return _db.users.create(username,password,display_name,role);
    }
    async updateUser(userid, username, password, display_name, role){
        return await _db.users.modify(userid, username,password, display_name, role);
    }
    async getUserById(userid){
        return await _db.users.getById(userid);
    }
    async getUserByUsername(username){
        return await _db.users.getByUsername(username);
    }
    async userToken(userid,token){
        return await _db.users.setToken(userid,token);
    }
    async login(username, password){
        try {
            let user = await this.getUserByUsername(username);
            if (user.password !== this.hash(password)) {
                throw new Error('Invalid username or password');
            }
            user.token = (await this.userToken(user.id, this.randomBytes())).token;
            return user;
        } catch (err) {
            // Handle both user not found and other database errors
            if (err.message === 'User not found') {
                throw new Error('Invalid username or password');
            }
            throw err; // Re-throw other errors
        }
    }
}()

// ========================================
// MODULE: FORMS (forms.js)
// ========================================
// Form configurations for the flexible form system
const formConfigs = {
  'create-post': {
    title: 'Create New Wiki Page',
    formTitle: 'Create New Wiki Page',
    method: 'POST',
    action: '/api/v1/create-page',
    submitText: 'Create Page',
    fields: [
      {
        name: 'display_name',
        label: 'Page Title',
        type: 'text',
        placeholder: 'Title',
        required: true
      },
      {
        name: 'content',
        label: 'Content',
        type: 'textarea',
        placeholder: 'Content',
        rows: 12,
        required: true
      }
    ]
  },
  
  'login': {
    title: 'Login',
    formTitle: 'Login to Your Account',
    method: 'POST',
    action: '/api/v1/login',
    submitText: 'Login',
    fields: [
      {
        name: 'username',
        label: 'Username',
        type: 'text',
        placeholder: 'Enter your username',
        required: true
      },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Enter your password',
        required: true
      }
    ]
  },
  'register': {
    title: 'Register',
    formTitle: 'Apply for an account',
    method: 'POST',
    action: '/api/v1/users/apply',
    submitText: 'Apply',
    cancelUrl: '/form/login',
    fields: [
      {
        name: 'username',
        label: 'Username',
        type: 'text',
        placeholder: 'Choose a username',
        required: true,
        helpText: 'Must be 3-20 characters long'
      },
      {
        name:'reason',
        label: 'Reason for Registration',
        type: 'textarea',
        placeholder: 'Why do you want to register?',
        required: true
      },
      {
        name: 'email',
        label: 'Email Address',
        type: 'email',
        placeholder: 'your.email@example.com',
        required: true
      },
      // {
      //   name:'phone',
      //   label: 'Phone Number',
      //   type: 'tel',
      //   placeholder: 'Phone number (optional)',
      //   required: false
      // },
      {
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Choose a strong password',
        required: true,
        helpText: 'Must be at least 8 characters long'
      },
      {
        name: 'confirm_password',
        label: 'Confirm Password',
        type: 'password',
        placeholder: 'Re-enter your password',
        required: true
      }
    ]
  },
};

const _forms = {
  getFormConfig: (formType) => {
    return formConfigs[formType] || null;
  },
  
  getAllFormTypes: () => {
    return Object.keys(formConfigs);
  },
  
  addFormConfig: (formType, config) => {
    formConfigs[formType] = config;
  }
};

// ========================================
// MODULE: MAIN APPLICATION (app.js)
// ========================================
// Express server setup and route handlers

// Developer settings
const developer = process.argv.includes('-t')

// Local modules
// (Combined above as individual modules)

// check developer mode
if (developer){
  console.log(colors.bgBlack(
    colors.red(
      colors.underline(
        'Developer/Testing mode activated. - this product is not intended for prod use.'
      )
    ))
  );
}

// Utility function to render forms
function renderForm(res, formConfig) {
  return res.render('form', {
    ...formConfig,
    header: fs.readFileSync(path.join(__dirname,'src/misc/header.html'), 'utf8')
  });
}

// backend
const app = express();
const port = process.env.PORT || 3000;

// setting up middle ware
app.engine('html', ejs.renderFile);
app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'src/pages'));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// static end points
app.get('/', (req, res) => {
  res.render('index',{
    'header':fs.readFileSync(path.join(__dirname,'src/misc/header.html'), 'utf8')
  });
});
app.get('/wiki/', (req, res) => {
  res.redirect('/');
});
app.get('/login',(req,res)=>{
  const formConfig = _forms.getFormConfig('login');
  renderForm(res, formConfig);
})
app.get('/register',(req,res)=>{
  const formConfig = _forms.getFormConfig('register');
  renderForm(res, formConfig);
})

// Generic form route for future forms
if (developer){
  app.get('/form/:formType', (req, res, next) => {
    const formType = req.params.formType;
    const formConfig = _forms.getFormConfig(formType);
    
    if (!formConfig) {
      return next();
    }

    renderForm(res, formConfig);
  })
}

// dynamic endpoints
app.get('/wiki/:name', async (req, res) => {
  try {
    let page = await _db.pages.getPage(req.params.name)
    res.render('wiki',{
      'header':fs.readFileSync(path.join(__dirname,'src/misc/header.html'), 'utf8'),
      'content':page.content,
      'title': page.display_name || page.name
    });
  } catch (error) {
    return res.status(404).redirect('/wiki/404')
  }
});

// static file endpoints
app.get('/css/:page', (req, res) => {
  const page = req.params.page;
  res.sendFile(path.join(__dirname, 'src/css', page));
});
app.get('/js/:page', (req, res) => {
  const page = req.params.page;
  res.sendFile(path.join(__dirname, 'src/js', page));
});

// api endpoints
app.post('/api/v1/create-page', async (req, res) => {
  let body = req.body;
  if (!body || !body.display_name || !body.content) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  let { display_name, content } = body;
  let name = display_name.toLowerCase().replace(/\s+/g, '_');
  _db.pages.createPage(name, display_name, content)
    .then(() => {
      res.status(201).json({ message: 'Page created successfully...', url: `/wiki/${name}` });
    })
    .catch((error) => {
      console.error('Error creating page:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
});
app.post('/api/v1/login', async (req, res) => {
  const body = req.body;
  if (!body || !body.username || !body.password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const { username, password } = body;
  try {
    const user = await _userAuth.login(username, password);
    
    // Set the token as an httpOnly cookie
    res.cookie('token', user.token, {
      httpOnly: true,  // Prevents XSS attacks
      secure: false,   // Set to true in production with HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax'  // CSRF protection
    });
    
    // Remove token from response for security
    const { token, ...userWithoutToken } = user;
    res.json({ message: 'Login successful', user: userWithoutToken });
  } catch (err) {
    if (err.message === 'Invalid username or password') {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    console.error('Error during login:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.post('/api/v1/users/apply', async (req, res) => {
  const body = req.body;
  if (!body || !body.username || !body.email || !body.reason || !body.password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const { username, email, reason, password } = body;
  const {error,value} = _schemas.registrationSchema.validate({ username, email, reason, password });
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  try{
    await _db.applications.create(username,password,email,reason)
    res.status(201).json({ message: 'Application created successfully' });
  } catch(err){
    console.error('Error creating application:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// wiki content creation pages
app.get('/wikian/:url',async (req,res,next)=>{
  if (developer){
    return next();
  }
  
  let token = req.cookies.token;
  if (!token) {
    return res.redirect('/login');
  }
  
  try {
    const user = await _db.users.getUserByToken(token);
    if (user.role < 10) {
      return res.redirect('/login');
    }
    return next();
  } catch (err) {
    return res.redirect('/login');
  }
})
app.get('/wikian/create-post',(req,res)=>{
  const formConfig = _forms.getFormConfig('create-post');
  if (!formConfig) {
    return res.status(404).redirect('/login');
  }
  renderForm(res, formConfig);
})

// Admin pages
app.get('/admin/:url',async (req,res,next)=>{
  if (developer){
    return next();
  }
  
  let token = req.cookies.token;
  if (!token) {
    return res.redirect('/login');
  }
  
  try {
    const user = await _db.users.getUserByToken(token);
    if (user.role < 100) {
      return res.redirect('/login');
    }
    return next();
  } catch (err) {
    return res.redirect('/login');
  }
})

// error handling
app.use((req,res,next)=>{
  res.status(404).redirect('/wiki/404')
})

// Initialize database and start server
async function startServer() {
  try {
    await _db.init(); // Wait for database initialization
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

// ========================================
// APPLICATION ENTRY POINT
// ========================================
// Start the server if this file is run directly
if (require.main === module) {
  startServer();
}

// ========================================
// EXPORTS (for potential module usage)
// ========================================
module.exports = {
  app,
  db: _db,
  userAuth: _userAuth,
  forms: _forms,
  schemas: _schemas,
  startServer
};

// ========================================
// END OF COMBINED CODE
// ========================================

// Developer settings
const developer = process.argv.includes('-t')

// Node modules
const path = require('node:path');
const fs = require('node:fs'); 

// third party modules
const express = require('express');
const ejs = require('ejs');
const colors = require('colors/safe');
const cookieParser = require('cookie-parser');
const markdownit = require('markdown-it');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// Local modules
const db = require('./modules/db.js');
const userAuth = require('./modules/userauth.js');
const forms = require('./modules/forms.js');
const schemas = require('./modules/schemas.js');
const { func } = require('joi');

// Simple pre run checks
if (developer){
  console.log(colors.bgBlack(
    colors.red(
      colors.underline(
        `Developer/Testing mode activated. - this product is not intended for prod use.\n${colors.bold('Developers note:')} Dev mode has limited functionality, and dont post bugs about it.`
      )
    ))
  );
} else {
  console.log(colors.red('this product is not intended for prod use.\n    This product may require modification to work.\n    To get prod ready, please look at builds,\n    and when they are avalible ;)'))
}
let settings = {};
async function loadSettings() {
  settings = await db.settings.getSettings();
}

// User authentication middleware
async function authenticateUser(req, res, next) {
  const token = req.cookies.token;
  
  if (!token) {
    req.user = null;
    return next();
  }
  
  try {
    const user = await db.users.getUserByToken(token);
    req.user = user;
  } catch (err) {
    // Invalid or expired token
    req.user = null;
    res.clearCookie('token');
  }
  
  next();
}

// Authorization middleware factory
function requireRole(minRole = 0) {
  return (req, res, next) => {
    if (!req.user) {
      // Store the current URL for redirect after login
      res.cookie('returnTo', req.originalUrl, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 10 * 60 * 1000, // 10 minutes
        sameSite: 'strict'
      });
      return res.redirect('/login');
    }
    
    if (req.user.role < minRole) {
      res.cookie('returnTo', req.originalUrl, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 10 * 60 * 1000, // 10 minutes
        sameSite: 'strict'
      });
      return res.redirect('/login');
    }
    
    next();
  };
}

// Utility functions
function renderForm(res, req, formConfig) {
  return res.render('form', {
    ...formConfig,
    header: fs.readFileSync(path.join(__dirname, 'misc/header.html'), 'utf8'),
    wiki: settings,
    head: formConfig.head || '', // Ensure head is passed to the template
    page: { url: req.originalUrl }
  });
}

// backend
const app = express();
const port = process.env.PORT || 3000;

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: { error: 'Too many login attempts, please try again later. Please wait 15 minutes before trying again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// setting up middle ware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for now as it may break the app
  crossOriginEmbedderPolicy: false
}));
app.engine('html', ejs.renderFile);
app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'pages'));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// User authentication middleware
app.use(authenticateUser);

// static end points
app.get('/', async (req, res) => {
  res.redirect('/wiki/home');
});
app.get('/wiki/', (req, res) => {
  res.redirect('/');
});
app.get('/login',(req,res)=>{
  const formConfig = forms.getFormConfig('login');
  renderForm(res, req, formConfig);
})
app.get('/register',(req,res)=>{
  const formConfig = forms.getFormConfig('register');
  renderForm(res, req, formConfig);
})
app.get('/articles',async (req,res)=>{
  let admin = false
  if (req.query.admin){
    admin = true
  }
  // console.log(admin)
  let page = Number(req.query.page) || 1;
  let limit = 15; // Articles per page
  let offset = (page - 1) * limit;

  try {
    // Use pages data since articles are essentially pages in this wiki system
    let allPages = await db.pages.getAllPages();
    let totalArticles = allPages.length;
    let totalPages = Math.ceil(totalArticles / limit);
    
    // Apply pagination manually
    let articles = allPages.slice(offset, offset + limit);

    res.render('articles', {
      header: fs.readFileSync(path.join(__dirname,'misc/header.html'), 'utf8'),
      articles: articles,
      currentPage: page,
      totalPages: totalPages,
      totalArticles: totalArticles,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      wiki:settings,
      admin:admin
    });
  } catch (error) {
    console.error('Error fetching articles:', error);
    res.status(500).redirect('/wiki/500')
  }
})

// Generic form route for future forms
if (developer){
  app.get('/form/:formType', (req, res, next) => {
    const formType = req.params.formType;
    const formConfig = forms.getFormConfig(formType);
    
    if (!formConfig) {
      return next();
    }

    renderForm(res, req, formConfig);
  })
}

// dynamic endpoints
const md = new markdownit();
app.get('/wiki/:name', async (req, res) => {
  try {
    let page = await db.pages.getPage(req.params.name)
    page.url = req.originalUrl
    let markdownEnabled = page.markdown || false;
    res.render('wiki',{
      'header':fs.readFileSync(path.join(__dirname,'misc/header.html'), 'utf8'),
      'content':!markdownEnabled ? md.render(page.content) : page.content,
      permission: page.permission || 100,
      'title': page.display_name || page.name,
      wiki:settings,
      page: page,
      user:req.user
    });
  } catch (error) {
    return res.status(404).redirect('/wiki/404')
  }
});
app.get('/wiki/:name/edit', async (req, res) => {
  let page = await db.pages.getPage(req.params.name);
  if (!page) {
    return res.status(404).redirect('/wiki/404');
  }
  if (!req.user || req.user.role < (page.permission-1 || 99)) {
    return res.status(403).json({ error: 'You do not have permission to edit this page.' });
  }
  let formConfig = forms.getFormConfig('edit-page');
  if (!formConfig) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  let fields = formConfig.fields || false;
  if (!fields) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  fields[0].value = page.display_name;
  fields[1].value = page.content;
  if (!req.user.role >= 100){
    formConfig.btnsecondary
  }
  formConfig.head = `<script>async function _delete(){fetch('/api/v1/delete-page',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title: '${page.name}'})});}</script>`
  renderForm(res, req,formConfig)
})
app.post('/wiki/:name/edit', async (req, res) => {
  // Input validation
  const pageName = req.params.name;
  if (!pageName || typeof pageName !== 'string' || pageName.length > 100) {
    return res.status(400).json({ error: 'Invalid page name.' });
  }
  
  let page = await db.pages.getPage(pageName);
  if (!page) {
    return res.status(404).redirect('/wiki/404');
  }
  if (!req.user || req.user.role < (page.permission-1 || 99)) {
    return res.status(403).json({ error: 'You do not have permission to edit this page.' });
  }
  let body = req.body;
  if (!body || !body.name || !body.content) {
    return res.status(400).json({ error: 'Please provide both a page title and content.' });
  }
  
  // Validate input lengths
  if (body.name.length > 200 || body.content.length > 100000) {
    return res.status(400).json({ error: 'Content too long.' });
  }
  
  let { name, content } = body;
  let display_name = name;
  name = name.toLowerCase().replace(/\s+/g, '_');
  try {
    await db.pages.updatePage(page.id,name,display_name,content)
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' });
  }
  return res.redirect('/wiki/'+name)
})

// static file endpoints
app.get('/css/:page', (req, res) => {
  const page = req.params.page;
  res.sendFile(path.join(__dirname, 'css', page), (error) => {
    if (error) {
      console.warn(error);
      res.redirect('/wiki/404');
    }
  });
});
app.get('/js/:page', (req, res) => {
  const page = req.params.page;
  res.sendFile(path.join(__dirname, 'js', page), (error) => {
    if (error) {
      console.warn(error);
      res.redirect('/wiki/404');
    }
  });
});
app.get('/favicon.ico',(req,res)=>{
  res.redirect('/media/icon.png')
})
app.get('/media/:page', (req, res) => {
  const page = req.params.page;
  res.sendFile(path.join(__dirname, 'media', page), (error) => {
    if (error) {
      console.warn(error);
      res.redirect('/wiki/404');
    }
  });
});

// api endpoints
app.use('/api/', apiLimiter); // Apply rate limiting to all API routes
app.post('/api/v1/create-page', async (req, res) => {
  let body = req.body;
  if (!body || !body.display_name || !body.content) {
    return res.status(400).json({ error: 'Please provide both a page title and content.' });
  }
  let { display_name, content } = body;
  let name = display_name.toLowerCase().replace(/\s+/g, '_');
  db.pages.createPage(name, display_name, content)
    .then(() => {
      res.status(201).json({ message: 'Page created successfully!', url: `/wiki/${name}` });
    })
    .catch((error) => {
      console.error('Error creating page:', error);
      res.status(500).json({ error: 'Unable to create the page at this time. Please try again later.' });
    });
});
app.post('/api/v1/delete-page', async (req, res) => {
  let body = req.body;
  if (!body || !body.title) {
    return res.status(400).json({ error: 'Please provide a page title' });
  }
  
  let title = body.title;
  try {
    let page = await db.pages.getPage(title);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }
    
    // Check user permissions
    if (!req.user || req.user.role < (page.permission || 100) || req.user.role < 100) { // user, user has less role then page.permission or fallback (100), user has less role then admin
      return res.status(403).json({ error: 'You do not have permission to delete this page.' });
    }
    
    // Delete the page
    await db.pages.deletePage(page.id);
    res.status(200).json({ message: 'Page deleted successfully' });
  } catch (error) {
    console.error('Error deleting page:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.post('/api/v1/login', authLimiter, async (req, res) => {
  const body = req.body;
  if (!body || !body.username || !body.password) {
    return res.status(400).json({ error: 'Please enter both username and password.' });
  }
  const { username, password, returnTo } = body;
  try {
    const user = await userAuth.login(username, password);
    if (user.account_status === 'suspended') {
      return res.status(403).json({ error: 'Your account is suspended. Please contact support.' });
    }
    if (user.username === 'admin' && settings.admin_account_enabled === 'false'){
      return res.status(403).json({ error: 'The admin account is currently disabled. Please contact support.' }); // settings available in database settings table.
    }
    
    // Set the token as an httpOnly cookie
    res.cookie('token', user.token, {
      httpOnly: true,  // Prevents XSS attacks
      secure: process.env.NODE_ENV === 'production',   // Set to true in production with HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'strict'  // CSRF protection - stricter than 'lax'
    });
    
    // Clear any previous returnTo cookie
    res.clearCookie('returnTo');
    
    // Determine redirect URL
    let redirectUrl = '/';
    if (returnTo && returnTo.startsWith('/')) {
      redirectUrl = returnTo;
    } else if (req.cookies.returnTo && req.cookies.returnTo.startsWith('/')) {
      redirectUrl = req.cookies.returnTo;
    } else if (user.role >= 100) {
      redirectUrl = '/admin/dashboard'; // Admin users go to admin dashboard
    } else if (user.role >= 10) {
      redirectUrl = '/wikian/create-post'; // Content creators go to create page
    }
    
    // Return minimal user info and redirect URL
    res.json({ 
      message: 'Welcome back! Login successful.', 
      redirectUrl: redirectUrl,
      user: {
        username: user.username,
        display_name: user.display_name,
        role: user.role
      }
    });
  } catch (err) {
    if (err.message === 'Invalid username or password') {
      return res.status(401).json({ error: 'Invalid username or password. Please check your credentials and try again.' });
    }
    console.error('Error during login:', err);
    res.status(500).json({ error: 'We encountered an issue while processing your login. Please try again later.' });
  }
});
app.post('/api/v1/logout', async (req, res) => {
  try {
    if (req.user) {
      // Clear the token from the database
      try {
        await db.users.setToken(req.user.id, null);
      } catch (err) {
        // Token cleanup failed, but that's okay for logout
        console.log('Token cleanup failed during logout:', err.message);
      }
    }
    
    // Clear the token cookie
    res.clearCookie('token');
    res.clearCookie('returnTo');
    
    res.json({ message: 'Logout successful', redirectUrl: '/' });
  } catch (err) {
    console.error('Error during logout:', err);
    // Even if there's an error, clear the cookie and respond successfully
    res.clearCookie('token');
    res.clearCookie('returnTo');
    res.json({ message: 'Logout successful', redirectUrl: '/' });
  }
});
app.post('/api/v1/update-wiki-settings',async (req,res)=>{
  if (!req.user || req.user.role < 100) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const body = req.body;
  if (!body){
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    await db.settings.updateSettings(body);
    await loadSettings();
    res.status(200).json({ message: 'Wiki settings updated successfully' });
  } catch (err){
    console.error('Error updating wiki settings:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});
app.post('/api/v1/users/apply', authLimiter, async (req, res) => {
  const body = req.body;
  if (!body || !body.username || !body.email || !body.reason || !body.password) {
    return res.status(400).json({ error: 'Please fill in all required fields to submit your application.' });
  }
  const { username, email, reason, password, returnTo } = body;
  const {error,value} = schemas.registrationSchema.validate({ username, email, reason, password });
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  try{
    await db.applications.create(username,password,email,reason)
    
    // Clear any previous returnTo cookie
    res.clearCookie('returnTo');
    
    // Determine redirect URL
    let redirectUrl = '/';
    if (returnTo && returnTo.startsWith('/')) {
      redirectUrl = returnTo;
    } else if (req.cookies.returnTo && req.cookies.returnTo.startsWith('/')) {
      redirectUrl = req.cookies.returnTo;
    }
    
    res.status(201).json({ 
      message: 'Your application has been submitted successfully! An administrator will review it soon.', 
      redirectUrl: redirectUrl 
    });
  } catch(err){
    console.error('Error creating application:', err);
    res.status(500).json({ error: 'We encountered an issue while processing your application. Please try again later.' });
  }
});
app.post('/api/v1/users/register',async(req,res)=>{
  if (!req.user || req.user.role < 100) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const body = req.body;
  if (!body || !body.id){
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const { id } = body;
  try {
    const application = await db.applications.getById(id);
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }
    // Password is already hashed in the application, so use db.users.create directly
    await db.users.create(application.username, application.password, application.username, 10);
    await db.applications.delete(id);
    res.status(200).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Error registering user:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
})
app.post('/api/v1/users/register/deny',async(req,res)=>{
  if (!req.user || req.user.role < 100) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const body = req.body;
  if (!body || !body.id){
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const { id } = body;
  try {
    const application = await db.applications.getById(id);
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }
    await db.applications.delete(id);
    res.status(200).json({ message: 'User registration denied successfully' });
  } catch (err) {
    console.error('Error denying user registration:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
})

// Delete user endpoint
app.delete('/api/v1/users/:id', async (req, res) => {
  if (!req.user || req.user.role < 100) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const userId = parseInt(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  
  try {
    // Prevent deleting the admin user
    const userToDelete = await db.users.getById(userId);
    if (userToDelete.username === 'admin') {
      return res.status(403).json({ error: 'Cannot delete the admin user' });
    }
    
    // Prevent users from deleting themselves
    if (req.user.id === userId) {
      return res.status(403).json({ error: 'Cannot delete your own account' });
    }
    
    await db.users.deleteById(userId);
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err);
    if (err.message === 'User not found') {
      res.status(404).json({ error: 'User not found' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
})

// Update user endpoint
app.put('/api/v1/users/:id', async (req, res) => {
  if (!req.user || req.user.role < 100) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const userId = parseInt(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  
  const { displayName, username, role, status } = req.body;
  
  // Validate input
  if (!displayName || !username || role === undefined || !status) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Validate role
  const roleNum = parseInt(role);
  if (![0, 1, 50, 100].includes(roleNum)) {
    return res.status(400).json({ error: 'Invalid role value' });
  }
  
  // Validate status
  if (!['active', 'suspended', 'pending', 'null'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status value' });
  }
  
  try {
    // Get the user being modified
    const userToUpdate = await db.users.getById(userId);
    
    // Prevent modifying admin user's role if not admin themselves
    if (userToUpdate.username === 'admin' && roleNum !== 100) {
      return res.status(403).json({ error: 'Cannot change admin user role' });
    }
    
    // Update user information
    await db.users.modifyNameDisplayName(userId, username, displayName);
    await db.users.modifyStatus(userId, status === 'null' ? null : status);
    
    // Update role if it's different
    if (userToUpdate.role !== roleNum) {
      // For role changes, we need to use the modify method with current password
      await db.users.modify(userId, username, userToUpdate.password, displayName, roleNum);
    }
    
    res.status(200).json({ message: 'User updated successfully' });
  } catch (err) {
    console.error('Error updating user:', err);
    if (err.message === 'User not found') {
      res.status(404).json({ error: 'User not found' });
    } else if (err.message.includes('UNIQUE constraint failed')) {
      res.status(400).json({ error: 'Username or display name already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
})

let last_time = 0
app.post('/api/v1/server/shutdown',async (req,res)=>{
  if (!req.user || req.role < 500){
    return res.status(403).json({"error":"Hey, RUDE.",message:"Wow, yk what? un authorized access is illegal under 18 U.S. Code § 1030. So, we just alerted the NSA. Get on my level script kiddie."}) // will it spook anyone???
  }
  let _Date = new Date
  let _time = _Date.getTime()

  if ((_time-30000)>last_time){
    last_time = _time
    return res.status(409).json({"error":"Please click me again in the next 30 seconds to succeed in shutdown"})
  }
  res.status(200).json({'message':"Shutting down, good night."})
  setTimeout(function(){
    process.exit()
  },3000)
})

// Suspend/Unsuspend user endpoint
app.post('/api/v1/users/:id/suspend', async (req, res) => {
  if (!req.user || req.user.role < 100) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const userId = parseInt(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  
  try {
    // Get the user being suspended/unsuspended
    const userToUpdate = await db.users.getById(userId);
    
    // Prevent suspending admin user
    if (userToUpdate.username === 'admin') {
      return res.status(403).json({ error: 'Cannot suspend the admin user' });
    }
    
    // Prevent users from suspending themselves
    if (req.user.id === userId) {
      return res.status(403).json({ error: 'Cannot suspend your own account' });
    }
    
    // Toggle suspension status
    const newStatus = userToUpdate.account_status === 'suspended' ? 'active' : 'suspended';
    await db.users.modifyStatus(userId, newStatus);
    
    res.status(200).json({ 
      message: `User ${newStatus === 'suspended' ? 'suspended' : 'unsuspended'} successfully`,
      newStatus: newStatus
    });
  } catch (err) {
    console.error('Error suspending/unsuspending user:', err);
    if (err.message === 'User not found') {
      res.status(404).json({ error: 'User not found' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
})

// Reset user token endpoint
app.post('/api/v1/users/:id/reset-token', async (req, res) => {
  if (!req.user || req.user.role < 100) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const userId = parseInt(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  
  try {
    // Get the user whose token is being reset
    const userToUpdate = await db.users.getById(userId);
    
    // Reset token to null (force re-login)
    await db.users.setToken(userId, null);
    
    res.status(200).json({ message: 'User token reset successfully' });
  } catch (err) {
    console.error('Error resetting user token:', err);
    if (err.message === 'User not found') {
      res.status(404).json({ error: 'User not found' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
})

// Reset user password endpoint
app.post('/api/v1/users/:id/reset-password', async (req, res) => {
  if (!req.user || req.user.role < 100) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const userId = parseInt(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }
  
  try {
    // Get the user whose password is being reset
    const userToUpdate = await db.users.getById(userId);
    
    // Reset password
    await db.users.changePassword(userId, newPassword);
    
    // Also reset token to force re-login
    await db.users.setToken(userId, null);
    
    res.status(200).json({ message: 'User password reset successfully' });
  } catch (err) {
    console.error('Error resetting user password:', err);
    if (err.message === 'User not found') {
      res.status(404).json({ error: 'User not found' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
})

// Bot authentication middleware
async function authenticateBot(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }
  
  try {
    const user = await db.users.getUserByToken(token);
    if (!user || user.type !== 'bot') {
      return res.status(401).json({ error: 'Invalid bot token' });
    }
    req.bot = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired bot token' });
  }
}

// Bot's API endpoints
app.post('/api/v1/bot/login', authLimiter, async (req, res) => {
  const body = req.body;

  // Validate request body
  if (!body.username || !body.clientSecret) {
    return res.status(400).json({ error: 'Missing username or client secret' });
  }

  let { username, clientSecret } = body;
  try{
    let user = await db.users.getByUsername(username)
    if ((!user) || (user.password !== clientSecret) || (user.type !== 'bot')) {
      return res.status(401).json({ error: 'Invalid username or client secret' });
    }
    let token = userAuth.randomBytes()
    await db.users.setToken(user.id, token);
    res.json({user:user,token:token})
  } catch (error){
    console.error('Error during bot login:', error);
    if (error.message === 'User not found') {
      return res.status(401).json({ error: 'Invalid username or client secret' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get bot information
app.get('/api/v1/bot/info', authenticateBot, async (req, res) => {
  try {
    const botInfo = {
      id: req.bot.id,
      username: req.bot.username,
      display_name: req.bot.display_name,
      role: req.bot.role,
      account_status: req.bot.account_status,
      created_at: req.bot.created_at
    };
    res.json(botInfo);
  } catch (error) {
    console.error('Error getting bot info:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh bot token
app.post('/api/v1/bot/refresh-token', authenticateBot, async (req, res) => {
  try {
    const newToken = userAuth.randomBytes();
    await db.users.setToken(req.bot.id, newToken);
    res.json({ token: newToken, message: 'Token refreshed successfully' });
  } catch (error) {
    console.error('Error refreshing bot token:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Bot logout (invalidate token)
app.post('/api/v1/bot/logout', authenticateBot, async (req, res) => {
  try {
    await db.users.setToken(req.bot.id, null);
    res.json({ message: 'Bot logged out successfully' });
  } catch (error) {
    console.error('Error during bot logout:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get page content
app.get('/api/v1/bot/pages/:name', authenticateBot, async (req, res) => {
  try {
    const page = await db.pages.getPage(req.params.name);
    
    // Check if bot has permission to read the page
    if (req.bot.role < page.permission) {
      return res.status(403).json({ error: 'Insufficient permissions to access this page' });
    }
    
    res.json({
      id: page.id,
      name: page.name,
      display_name: page.display_name,
      content: page.content,
      permission: page.permission,
      markdown: page.markdown,
      created_at: page.created_at,
      last_modified: page.last_modified
    });
  } catch (error) {
    if (error.message === 'no page found') {
      return res.status(404).json({ error: 'Page not found' });
    }
    console.error('Error getting page:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new page
app.post('/api/v1/bot/pages', authenticateBot, async (req, res) => {
  const { display_name, content, permission, markdown } = req.body;
  
  if (!display_name || !content) {
    return res.status(400).json({ error: 'Missing required fields: display_name and content' });
  }
  
  // Check if bot has sufficient role for the page permission level
  const pagePermission = permission || 0;
  if (req.bot.role < pagePermission) {
    return res.status(403).json({ error: 'Insufficient permissions to create page with this permission level' });
  }
  
  const name = display_name.toLowerCase().replace(/\s+/g, '_');
  
  try {
    const pageId = await db.pages.createPage(name, display_name, content);
    
    // Update page with additional properties if provided
    if (permission !== undefined || markdown !== undefined) {
      // Note: You might need to add an updatePageProperties method to db.pages
      // For now, we'll just create with basic properties
    }
    
    res.status(201).json({ 
      message: 'Page created successfully',
      page: { id: pageId, name, display_name, content, permission: pagePermission }
    });
  } catch (error) {
    console.error('Error creating page:', error);
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'Page name already exists' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Update an existing page
app.put('/api/v1/bot/pages/:name', authenticateBot, async (req, res) => {
  const { display_name, content } = req.body;
  
  if (!display_name || !content) {
    return res.status(400).json({ error: 'Missing required fields: display_name and content' });
  }
  
  try {
    const page = await db.pages.getPage(req.params.name);
    
    // Check if bot has permission to edit the page
    if (req.bot.role < (page.permission - 1 || 99)) {
      return res.status(403).json({ error: 'Insufficient permissions to edit this page' });
    }
    
    await db.pages.updatePage(page.id, req.params.name, display_name, content);
    
    res.json({ 
      message: 'Page updated successfully',
      page: { id: page.id, name: req.params.name, display_name, content }
    });
  } catch (error) {
    if (error.message === 'no page found') {
      return res.status(404).json({ error: 'Page not found' });
    }
    console.error('Error updating page:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user information
app.get('/api/v1/bot/users/:username', authenticateBot, async (req, res) => {
  try {
    // Only allow bots with admin role to get user info
    if (req.bot.role < 100) {
      return res.status(403).json({ error: 'Insufficient permissions to access user information' });
    }
    
    const user = await db.users.getByUsername(req.params.username);
    
    // Return safe user information (no sensitive data)
    res.json({
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      account_status: user.account_status,
      type: user.type,
      created_at: user.created_at
    });
  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({ error: 'User not found' });
    }
    console.error('Error getting user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all pages (with pagination)
app.get('/api/v1/bot/pages', authenticateBot, async (req, res) => {
  try {
    const offset = parseInt(req.query.offset) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100); // Max 100 per request
    
    const pages = await db.pages.getAllPages();
    
    // Filter pages based on bot permissions
    const accessiblePages = pages.filter(page => req.bot.role >= page.permission);
    
    // Apply pagination
    const paginatedPages = accessiblePages.slice(offset, offset + limit);
    
    res.json({
      pages: paginatedPages.map(page => ({
        id: page.id,
        name: page.name,
        display_name: page.display_name,
        permission: page.permission,
        markdown: page.markdown,
        created_at: page.created_at,
        last_modified: page.last_modified
      })),
      total: accessiblePages.length,
      offset,
      limit
    });
  } catch (error) {
    console.error('Error getting pages:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get wiki settings (read-only for bots)
app.get('/api/v1/bot/wiki/settings', authenticateBot, async (req, res) => {
  try {
    // Only allow bots with admin role to access settings
    if (req.bot.role < 100) {
      return res.status(403).json({ error: 'Insufficient permissions to access wiki settings' });
    }
    
    const settings = await db.settings.getSettings();
    res.json(settings);
  } catch (error) {
    console.error('Error getting wiki settings:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Search pages by content
app.get('/api/v1/bot/search', authenticateBot, async (req, res) => {
  const { query, type } = req.query;
  
  if (!query) {
    return res.status(400).json({ error: 'Missing search query parameter' });
  }
  
  try {
    const pages = await db.pages.getAllPages();
    
    // Filter pages based on bot permissions and search criteria
    let results = pages.filter(page => {
      if (req.bot.role < page.permission) return false;
      
      switch (type) {
        case 'title':
          return page.display_name.toLowerCase().includes(query.toLowerCase()) ||
                 page.name.toLowerCase().includes(query.toLowerCase());
        case 'content':
          return page.content.toLowerCase().includes(query.toLowerCase());
        default:
          return page.display_name.toLowerCase().includes(query.toLowerCase()) ||
                 page.name.toLowerCase().includes(query.toLowerCase()) ||
                 page.content.toLowerCase().includes(query.toLowerCase());
      }
    });
    
    // Limit results to prevent overwhelming responses
    results = results.slice(0, 50);
    
    res.json({
      results: results.map(page => ({
        id: page.id,
        name: page.name,
        display_name: page.display_name,
        permission: page.permission,
        created_at: page.created_at,
        last_modified: page.last_modified
      })),
      query,
      type: type || 'all',
      count: results.length
    });
  } catch (error) {
    console.error('Error searching pages:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Bot health check
app.get('/api/v1/bot/health', authenticateBot, async (req, res) => {
  res.json({
    status: 'healthy',
    bot: {
      username: req.bot.username,
      role: req.bot.role
    },
    timestamp: new Date().toISOString(),
    api_version: '1.0'
  });
});

// wiki content creation pages
app.get('/wikian/:url', requireRole(10), (req, res, next) => {
  if (developer) {
    return next();
  }
  return next();
})
app.get('/wikian/',(req,res)=>{
  res.redirect('/wikian/dashboard');
})
app.get('/wikian/dashboard', async (req, res) => {
  res.render('wikian/dashboard', {
    header: fs.readFileSync(path.join(__dirname,'misc/header.html'), 'utf8'),
    user: req.user,
    wiki:settings
  });
});
app.get('/wikian/create-page',(req,res)=>{
  const formConfig = forms.getFormConfig('create-post');
  if (!formConfig) {
    return res.status(404).redirect('/login');
  }
  renderForm(res, req, formConfig);
})

// Admin pages
app.get('/admin/:url', requireRole(100), (req, res, next) => {
  if (developer) {
    return next();
  }
  return next();
})
app.get('/admin/articles',async (req,res)=>{
  res.redirect('/articles?admin=true')
})
app.get('/admin',(req,res)=>{
  res.redirect('/admin/dashboard');
})
app.get('/admin/dashboard', async (req, res) => {
  res.render('admin/dashboard', {
    header: fs.readFileSync(path.join(__dirname,'misc/header.html'), 'utf8'),
    user: req.user,
    wiki:settings
  });
});
app.get('/admin/wiki', async (req, res) => {
  let formConfig = forms.getFormConfig('wiki-settings');
  let fields = formConfig.fields || false;
  if (!fields) {
    return res.status(500).json({ error: 'Internal server error' });
  }

  let {site_name, admin_account_enabled} = settings;
  fields[0].value = settings.site_name;
  fields[1].value = settings.admin_account_enabled;

  formConfig.fields = fields;
  renderForm(res, req, formConfig);
});
app.get('/admin/users/',async (req,res)=>{
  let page = Number(req.query.page) || 1;
  let limit = 15; // Users per page
  let offset = (page - 1) * limit;
  
  try {
    let result = await db.users.getPaginated(offset, limit);
    let totalUsers = result.total;
    let users = result.users;
    let totalPages = Math.ceil(totalUsers / limit);
    
    res.render('admin/users', {
      header: fs.readFileSync(path.join(__dirname,'misc/header.html'), 'utf8'),
      users: users,
      currentPage: page,
      totalPages: totalPages,
      totalUsers: totalUsers,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      wiki:settings
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).render('admin/users', {
      header: fs.readFileSync(path.join(__dirname,'misc/header.html'), 'utf8'),
      users: [],
      currentPage: 1,
      totalPages: 0,
      totalUsers: 0,
      hasNextPage: false,
      hasPrevPage: false,
      error: 'Failed to load users',
      wiki:settings
    });
  }
})
app.get('/admin/applications',async (req,res)=>{
  let offset = Number(req.query.offset) || 0;
  let limit = Number(req.query.limit) || 10;

  try {
    let applications = await db.applications.get(offset,limit);
    res.status(200).render('admin/applications',{
      applications:applications,
      wiki:settings,
      header: fs.readFileSync(path.join(__dirname,'misc/header.html'), 'utf8'),
    })
  } catch (error){
    console.error('Error fetching applications:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }

})

// Handle ECONNABORTED and other errors
app.use((err, req, res, next) => {
  if (err) {
    // Handle connection aborted error
    if (err.code === 'ECONNABORTED' || err.code === 'ECONNRESET') {
      console.warn(`Connection aborted/reset for ${req.method} ${req.url}`);
      return;
    }
    // Log other errors
    console.error('Express error:', err);
    // Only send error response if headers haven't been sent and connection is still alive
    if (!res.headersSent && !res.writableEnded) {
      res.status(500).json({ error: 'Internal server error' });
    }
    return;
  }
  next();
});

// error handling
app.use((req,res,next)=>{
  if (req.url.startsWith('/admin/')){
    return res.status(404).redirect('/admin/dashboard');
  }
  if (req.url.startsWith('/wikian/')){
    return res.status(404).redirect('/wikian/dashboard');
  }
  res.status(404).redirect('/wiki/404')
})

// Initialize database and start server
async function startServer() {
  try {
    await db.init(); // Wait for database initialization
    await loadSettings(); // Load settings before starting server
    app.listen(port, async (e) => {
      if (e) {
        console.error('Error starting server:', e);
        process.exit(1);
      }
      console.log(`Server is running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

startServer();
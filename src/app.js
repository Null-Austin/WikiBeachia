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
loadSettings().catch(err=>{
  if (err){
    console.error(colors.red('Error loading settings...'), err);
  }
})

// Utility functions
function renderForm(res, formConfig) {
  return res.render('form', {
    ...formConfig,
    header: fs.readFileSync(path.join(__dirname,'misc/header.html'), 'utf8'),
    wiki:settings
  });
}

// backend
const app = express();
const port = process.env.PORT || 3000;

// setting up middle ware
app.engine('html', ejs.renderFile);
app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'pages'));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// static end points
app.get('/', (req, res) => {
  res.render('index',{
    'header':fs.readFileSync(path.join(__dirname,'misc/header.html'), 'utf8'),
    wiki:settings
  });
});
app.get('/wiki/', (req, res) => {
  res.redirect('/');
});
app.get('/login',(req,res)=>{
  const formConfig = forms.getFormConfig('login');
  renderForm(res, formConfig);
})
app.get('/register',(req,res)=>{
  const formConfig = forms.getFormConfig('register');
  renderForm(res, formConfig);
})

// Generic form route for future forms
if (developer){
  app.get('/form/:formType', (req, res, next) => {
    const formType = req.params.formType;
    const formConfig = forms.getFormConfig(formType);
    
    if (!formConfig) {
      return next();
    }

    renderForm(res, formConfig);
  })
}

// dynamic endpoints
app.get('/wiki/:name', async (req, res) => {
  try {
    let page = await db.pages.getPage(req.params.name)
    res.render('wiki',{
      'header':fs.readFileSync(path.join(__dirname,'misc/header.html'), 'utf8'),
      'content':page.content,
      'title': page.display_name || page.name,
      wiki:settings
    });
  } catch (error) {
    return res.status(404).redirect('/wiki/404')
  }
});

// static file endpoints
app.get('/css/:page', (req, res) => {
  const page = req.params.page;
  res.sendFile(path.join(__dirname, 'css', page));
});
app.get('/js/:page', (req, res) => {
  const page = req.params.page;
  res.sendFile(path.join(__dirname, 'js', page));
});

// api endpoints
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
app.post('/api/v1/login', async (req, res) => {
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
      secure: false,   // Set to true in production with HTTPS
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      sameSite: 'lax'  // CSRF protection
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
    const token = req.cookies.token;
    if (token) {
      // Clear the token from the database
      try {
        const user = await db.users.getUserByToken(token);
        await db.users.setToken(user.id, null);
      } catch (err) {
        // Token might be invalid or user not found, but that's okay for logout
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
  let token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const user = await db.users.getUserByToken(token);
    if (user.role < 100) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } catch (err) {
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
app.post('/api/v1/users/apply', async (req, res) => {
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
  let token = req.cookies.token;
  if (!token || db.users.getUserByToken(token).role < 100) {
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
  let token = req.cookies.token;
  if (!token || db.users.getUserByToken(token).role < 100) {
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
  let token = req.cookies.token;
  
  try {
    const currentUser = await db.users.getUserByToken(token);
    if (!currentUser || currentUser.role < 100) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userId = parseInt(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    // Prevent deleting the admin user
    const userToDelete = await db.users.getById(userId);
    if (userToDelete.username === 'admin') {
      return res.status(403).json({ error: 'Cannot delete the admin user' });
    }
    
    // Prevent users from deleting themselves
    if (currentUser.id === userId) {
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
  let token = req.cookies.token;
  
  try {
    const currentUser = await db.users.getUserByToken(token);
    if (!currentUser || currentUser.role < 100) {
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

// Suspend/Unsuspend user endpoint
app.post('/api/v1/users/:id/suspend', async (req, res) => {
  let token = req.cookies.token;
  
  try {
    const currentUser = await db.users.getUserByToken(token);
    if (!currentUser || currentUser.role < 100) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userId = parseInt(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    // Get the user being suspended/unsuspended
    const userToUpdate = await db.users.getById(userId);
    
    // Prevent suspending admin user
    if (userToUpdate.username === 'admin') {
      return res.status(403).json({ error: 'Cannot suspend the admin user' });
    }
    
    // Prevent users from suspending themselves
    if (currentUser.id === userId) {
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
  let token = req.cookies.token;
  
  try {
    const currentUser = await db.users.getUserByToken(token);
    if (!currentUser || currentUser.role < 100) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const userId = parseInt(req.params.id);
    if (!userId) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
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
  let token = req.cookies.token;
  
  try {
    const currentUser = await db.users.getUserByToken(token);
    if (!currentUser || currentUser.role < 100) {
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

// wiki content creation pages
app.get('/wikian/:url',async (req,res,next)=>{
  if (developer){
    return next();
  }
  
  let token = req.cookies.token;
  if (!token) {
    // Store the current URL for redirect after login
    res.cookie('returnTo', req.originalUrl, {
      httpOnly: true,
      maxAge: 10 * 60 * 1000, // 10 minutes
      sameSite: 'lax'
    });
    return res.redirect('/login');
  }
  
  try {
    const user = await db.users.getUserByToken(token);
    if (user.role < 10) {
      res.cookie('returnTo', req.originalUrl, {
        httpOnly: true,
        maxAge: 10 * 60 * 1000, // 10 minutes
        sameSite: 'lax'
      });
      return res.redirect('/login');
    }
    return next();
  } catch (err) {
    res.cookie('returnTo', req.originalUrl, {
      httpOnly: true,
      maxAge: 10 * 60 * 1000, // 10 minutes
      sameSite: 'lax'
    });
    return res.redirect('/login');
  }
})
app.get('/wikian/',(req,res)=>{
  res.redirect('/wikian/dashboard');
})
app.get('/wikian/dashboard', async (req, res) => {
  let user = req.cookies.token ? await db.users.getUserByToken(req.cookies.token) : null;
  res.render('wikian/dashboard', {
    header: fs.readFileSync(path.join(__dirname,'misc/header.html'), 'utf8'),
    user: user,
    wiki:settings
  });
});
app.get('/wikian/create-page',(req,res)=>{
  const formConfig = forms.getFormConfig('create-post');
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
    // Store the current URL for redirect after login
    res.cookie('returnTo', req.originalUrl, {
      httpOnly: true,
      maxAge: 10 * 60 * 1000, // 10 minutes
      sameSite: 'lax'
    });
    return res.redirect('/login');
  }
  
  try {
    const user = await db.users.getUserByToken(token);
    if (user.role < 100) {
      res.cookie('returnTo', req.originalUrl, {
        httpOnly: true,
        maxAge: 10 * 60 * 1000, // 10 minutes
        sameSite: 'lax'
      });
      return res.redirect('/login');
    }
    return next();
  } catch (err) {
    res.cookie('returnTo', req.originalUrl, {
      httpOnly: true,
      maxAge: 10 * 60 * 1000, // 10 minutes
      sameSite: 'lax'
    });
    return res.redirect('/login');
  }
})
app.get('/admin',(req,res)=>{
  res.redirect('/admin/dashboard');
})
app.get('/admin/dashboard', async (req, res) => {
  let user = req.cookies.token ? await db.users.getUserByToken(req.cookies.token) : null;
  res.render('admin/dashboard', {
    header: fs.readFileSync(path.join(__dirname,'misc/header.html'), 'utf8'),
    user: user,
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
  renderForm(res, formConfig);
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
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  }
}

startServer();
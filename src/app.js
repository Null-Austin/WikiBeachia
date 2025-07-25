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
    header: fs.readFileSync(path.join(__dirname,'misc/header.html'), 'utf8')
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
    'header':fs.readFileSync(path.join(__dirname,'misc/header.html'), 'utf8')
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
      'title': page.display_name || page.name
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
    return res.status(400).json({ error: 'Missing required fields' });
  }
  let { display_name, content } = body;
  let name = display_name.toLowerCase().replace(/\s+/g, '_');
  db.pages.createPage(name, display_name, content)
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
  const { username, password, returnTo } = body;
  try {
    const user = await userAuth.login(username, password);
    
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
      message: 'Login successful', 
      redirectUrl: redirectUrl,
      user: {
        username: user.username,
        display_name: user.display_name,
        role: user.role
      }
    });
  } catch (err) {
    if (err.message === 'Invalid username or password') {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    console.error('Error during login:', err);
    res.status(500).json({ error: 'Internal server error' });
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

app.post('/api/v1/users/apply', async (req, res) => {
  const body = req.body;
  if (!body || !body.username || !body.email || !body.reason || !body.password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const { username, email, reason, password } = body;
  const {error,value} = schemas.registrationSchema.validate({ username, email, reason, password });
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  try{
    await db.applications.create(username,password,email,reason)
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
app.get('/wikian/dashboard', async (req, res) => {
  let user = req.cookies.token ? await db.users.getUserByToken(req.cookies.token) : null;
  res.render('wikian/dashboard', {
    header: fs.readFileSync(path.join(__dirname,'misc/header.html'), 'utf8'),
    user: user
  });
});
app.get('/wikian/create-post',(req,res)=>{
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
app.get('/admin/dashboard', async (req, res) => {
  let user = req.cookies.token ? await db.users.getUserByToken(req.cookies.token) : null;
  res.render('admin/dashboard', {
    header: fs.readFileSync(path.join(__dirname,'misc/header.html'), 'utf8'),
    user: user
  });
});

// error handling
app.use((req,res,next)=>{
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
// Developer settings
const developer = process.argv.includes('-t')

// Node modules
const path = require('node:path');
const fs = require('node:fs'); 

// third party modules
const express = require('express');
const ejs = require('ejs');
const colors = require('colors/safe');

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
  const { username, password } = body;
  try {
    const user = await userAuth.login(username, password);
    res.send(user);
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
app.get('/wikian/:url',(req,res,next)=>{
  if (developer){
    return next();
  }
  return res.redirect('/login')
})
app.get('/wikian/create-post',(req,res)=>{
  const formConfig = forms.getFormConfig('create-post');
  if (!formConfig) {
    return res.status(404).redirect('/login');
  }
  renderForm(res, formConfig);
})

// Admin pages
app.get('/admin/:url',(req,res,next)=>{
  if (developer){
    return next();
  }
  return res.redirect('/login')
})

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
// Node modules
const path = require('node:path');
const fs = require('node:fs'); 

// third party modules
const express = require('express');
const ejs = require('ejs');

// Local modules
const db = require('./modules/db.js');
const { url } = require('node:inspector');

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
app.get('/blog',(req,res)=>{
  res.redirect('/')
})

// dynamic endpoints
app.get('/blog/:name', async (req, res) => {
  try {
    let page = await db.pages.getPage(req.params.name)
    res.render('blog',{
      'header':fs.readFileSync(path.join(__dirname,'misc/header.html'), 'utf8'),
      'content':page.content,
      'title': page.display_name || page.name
    });
  } catch (error) {
    return res.status(404).redirect('/blog/404')
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
  if (!body || !body.name || !body.display_name || !body.content) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  let { name, display_name, content } = body;
  name = name.toLowerCase().replace(/\s+/g, '_');
  db.pages.createPage(name, display_name, content)
    .then(() => {
      res.status(201).json({ message: 'Page created successfully...', url: `/blog/${name}` });
    })
    .catch((error) => {
      console.error('Error creating page:', error);
      res.status(500).json({ error: 'Internal server error' });
    });
});

// error handling
app.use((req,res,next)=>{
  res.status(404).redirect('/blog/404')
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
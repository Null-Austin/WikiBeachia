// Node modules
const path = require('node:path');
const fs = require('node:fs'); 

// third party modules
const express = require('express');
const ejs = require('ejs');

// Local modules
const db = require('./modules/db.js');

// backend
const app = express();
const port = process.env.PORT || 3000;

app.engine('html', ejs.renderFile);
app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'pages'));

app.get('/', (req, res) => {
  res.render('index',{
    'header':fs.readFileSync(path.join(__dirname,'misc/header.html'), 'utf8')
  });
});
app.get('/blog',(req,res)=>{
  res.redirect('/')
})
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
app.get('/css/:page', (req, res) => {
  const page = req.params.page;
  res.sendFile(path.join(__dirname, 'css', page));
});
app.get('/js/:page', (req, res) => {
  const page = req.params.page;
  res.sendFile(path.join(__dirname, 'js', page));
});
app.use((req,res,next)=>{
  res.status(404).redirect('/blog/404')
})
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
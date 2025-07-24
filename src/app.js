const dev = true
const express = require('express');
const path = require('path');
const fs = require('fs');

const ejs = require('ejs');

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
app.get('/blog/:name', (req, res) => {
  res.render('blog',{
    'header':fs.readFileSync(path.join(__dirname,'misc/header.html'), 'utf8'),
    'content':'this would be some basic <i><b>Shazam</b></i>'
  });
});
app.use((req,res,next)=>{
  res.status(404).redirect('/blog/404')
})
if (dev){
  app.get('/css/:page', (req, res) => {
    const page = req.params.page;
    res.sendFile(path.join(__dirname, 'css', page));
  });
  app.get('/js/:page', (req, res) => {
    const page = req.params.page;
    res.sendFile(path.join(__dirname, 'js', page));
  });
}

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
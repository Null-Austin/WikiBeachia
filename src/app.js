const dev = true
const express = require('express');
const path = require('path');

const ejs = require('ejs');

const app = express();
const port = process.env.PORT || 3000;

app.engine('html', ejs.renderFile);
app.set('view engine', 'html');
app.set('views', path.join(__dirname, 'pages'));

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

if (dev){
    app.get('/pages/:page', (req, res) => {
        const page = req.params.page;
        res.render(`${page}`);
    });
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
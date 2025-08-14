// pneumonoultramicroscopicsilicovolcanoconiosis settings. if you ask https://hackclub.slack.com/archives/C0266FRGV/p1754128156676119
const pneumonoultramicroscopicsilicovolcanoconiosis = process.argv.includes('-t')
const release = false

// Node modules
const path = require('node:path');
const fs = require('node:fs'); 

// third party modules
const express = require('express');
const ejs = require('ejs');
const colors = require('colors/safe');
const cookieParser = require('cookie-parser');
require('dotenv').config()
const markdownit = require('markdown-it')
  // markdownit plugins
  const markdownitfootnote = require('markdown-it-footnote')
  const markdownitlazyload = require("@mdit/plugin-img-lazyload");
  const markdownitimgsize = require("@mdit/plugin-img-size");
  const markdownitmathjax = require("@mdit/plugin-mathjax");
  const markdownitalert = require('@mdit/plugin-alert')
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const multer = require('multer');
const sharp = require('sharp');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Local modules
const db = require('./modules/db.js');
const mphotos = require('./modules/photos.js')
const userAuth = require('./modules/userauth.js');
const forms = require('./modules/forms.js');
const schemas = require('./modules/schemas.js');

// swagger API docs
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WikiBeachia',
      version: '1.0.0',
      description: 'An API for managing WikiBeachia',
    },
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'token',
          description: 'Authentication token stored in httpOnly cookie'
        },
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'Authentication token in Authorization header'
        },
      },
    },
    tags: [
      {
        name: 'Authentication',
        description: 'User authentication endpoints'
      },
      {
        name: 'Pages',
        description: 'Wiki page management'
      },
      {
        name: 'Media',
        description: 'Image and media management'
      },
      {
        name: 'User Management',
        description: 'User registration and application management'
      },
      {
        name: 'Administration',
        description: 'Admin-only endpoints for managing users and settings'
      },
      {
        name: 'System',
        description: 'System-level operations'
      }
    ],
    // servers: [{ url: 'http://localhost:3000' }],
  },
  apis: [path.join(__filename)],
};
const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Simple pre run checks
if (pneumonoultramicroscopicsilicovolcanoconiosis){
  console.log(colors.bgBlack(
    colors.red(
      colors.underline(
        `pneumonoultramicroscopicsilicovolcanoconiosis/Testing mode activated. - this product is not intended for prod use.\n${colors.bold('pneumonoultramicroscopicsilicovolcanoconiosiss note:')} Dev mode has limited functionality, and dont post bugs about it.`
      )
    ))
  );
} else {
  if (!release){
    console.log(colors.red('this product is not intended for prod use.\n    This product may require modification to work.\n    To get prod ready, please look at builds,\n    and when they are avalible ;)'))
  }
}
let settings = {};
async function loadSettings() {
  settings = await db.settings.getSettings();
}

// set up multer
const m_storage = multer.memoryStorage();
const m_upload = multer({m_storage});

// User authentication middleware
async function authenticateUser(req, res, next) {
  let token = req.cookies.token;
  
  // Also check for Authorization header (for API clients like Swagger UI)
  if (!token && req.headers.authorization) {
    const authHeader = req.headers.authorization;
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (authHeader.startsWith('Token ')) {
      token = authHeader.substring(6);
    }
  }
  
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
    if (req.cookies.token) {
      res.clearCookie('token');
    }
  }
  
  next();
}
async function getHeader(req,res,next) {
  req._header = ejs.render(fs.readFileSync(path.join(__dirname, 'misc/header.html'),'utf8'),{
    user:req.user
  })
  return next()
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

// API Authorization middleware factory for JSON responses
function requireApiRole(minRole = 0) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (req.user.role < minRole) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
}

// Utility functions
function renderForm(res, req, formConfig) {
  return res.render('form', {
    ...formConfig,
    header: req._header,
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
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// local middle ware
app.use(authenticateUser);
app.use(getHeader);
app.use(async (req,res,next)=>{ // Enhanced logging and IP ban checking
  const ip = req.headers['x-forwarded-for'] // Please make sure its a proxy!!!! if its not a proxy, then u risk possbily ip banning the wrong people!! i think
    ? req.headers['x-forwarded-for'].split(',')[0].trim()
    : req.socket.remoteAddress;
  
  // Store IP for logging
  req.clientIP = ip;
  
  // Check if IP is banned (unless it's an admin trying to unban)
  if (!req.url.includes('/api/v1/users/') || !req.url.includes('/unban-ip-accounts')) {
    try {
      const isBanned = await db.bannedIps.isIpBanned(ip);
      if (isBanned) {
        // Log the blocked access attempt
        if (settings.logging === 'true') {
          db.logs.logSecurityAction(0, 'blocked_access_banned_ip', `Blocked access from banned IP to ${req.url}`, ip);
        }
        return res.status(403).json({ 
          error: 'Access denied', 
          message: 'Your IP address has been banned from accessing this site' 
        });
      }
    } catch (err) {
      console.warn('Failed to check IP ban status:', err);
    }
  }
  
  // Store the IP in user record if logged in
  if (req.user) {
    db.users.setIP(req.user.id, ip).catch(err => {
      console.warn('Failed to update user IP:', err);
    });
  }
  
  next()
  
  // Enhanced logging after request processing
  if (settings.logging !== 'true'){
    return
  }
  
  let uid = req.user ? req.user.id : 0;
  
  // Log different types of requests with appropriate detail
  try {
    if (req.url.startsWith('/wiki/')) {
      // Page views
      const pageName = req.url.replace('/wiki/', '').split('/')[0] || 'home';
      db.logs.logPageAction(uid, 'view', pageName, `${req.method} ${req.url}`, ip);
    } else if (req.url.startsWith('/api/')) {
      // API calls are logged separately in their handlers
      return;
    } else if (req.url.startsWith('/admin/')) {
      // Admin page access
      const adminPage = req.url.replace('/admin/', '').split('?')[0] || 'dashboard';
      db.logs.logAdminAction(uid, 'page_access', `Admin page access: ${adminPage}`, ip);
    } else if (req.url.startsWith('/user/')) {
      // User profile access
      const userPath = req.url.replace('/user/', '');
      db.logs.add(uid, 'user_profile_view', `User profile access: ${userPath}`, ip);
    } else if (req.url === '/login' || req.url === '/register') {
      // Auth page access
      db.logs.add(uid, 'auth_page_view', req.url, ip);
    } else {
      // General page access
      db.logs.add(uid, 'page_view', req.url, ip);
    }
  } catch (err) {
    console.warn('Failed to log request:', err);
  }
})

// markdown
const md = new markdownit({
  linkify:true,
  typographer: true
});
md.use(markdownitfootnote)
md.use(markdownitimgsize.obsidianImgSize)
md.use(markdownitlazyload.imgLazyload)
md.use(markdownitalert.alert)
const mathjaxInstance = markdownitmathjax.createMathjaxInstance()
const mdIt = md.use(markdownitmathjax.mathjax, mathjaxInstance);

// static end points
app.get('/', async (req, res) => {
  res.redirect('/wiki/home');
});
app.get('/Robots.txt',(req,res)=>{
  res.sendFile(path.join(__dirname,'misc/robots.txt'))
})
app.get('/tos', async (req, res) => {
  let page = fs.readFileSync(path.join(__dirname,'misc','tos.md'),'utf8')
  page = md.render(page)
  res.status(200).render('info.html',{'content':page, wiki:settings,'header':req._header})
});
app.get('/privacy-policy', async (req, res) => {
  let page = fs.readFileSync(path.join(__dirname,'misc','privacy-policy.md'),'utf8')
  page = md.render(page)
  res.status(200).render('info.html',{'content':page, wiki:settings,'header':req._header})
});
app.get('/wiki/', (req, res) => {
  res.redirect('/');
});
app.get('/login',(req,res)=>{
  const formConfig = forms.getFormConfig('login');
  renderForm(res, req, formConfig);
})
app.get('/register',(req,res)=>{
  console.log(settings.applications)
  let form = 'register-register'
  if (settings.applications == 'true'){
    form = 'register-application'
  }
  const formConfig = forms.getFormConfig(form)

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
      header: req._header,
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
if (pneumonoultramicroscopicsilicovolcanoconiosis){
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
app.get('/wiki/:name', async (req, res) => {
  try {
    let page = await db.pages.getPage(req.params.name)
    // console.log(page)
    page.url = req.originalUrl
    let markdownEnabled = page.markdown || false;
    let content = !markdownEnabled ? md.render(page.content) : page.content
    let style = mathjaxInstance.outputStyle()
    res.render('wiki',{
      'header':`${req._header} <style>${style}</style>`,
      'content':content,
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
  
  // Store original content for logging
  const originalContent = page.content;
  const originalDisplayName = page.display_name;
  
  try {
    // Save previous version before updating
    await db.pages.saveVersion(page.id, page.display_name, page.content, req.user.id);
    await db.pages.updatePage(page.id, name, display_name, content, req.user.id);
    
    // Log the page edit with details about changes
    if (settings.logging === 'true') {
      const changes = [];
      if (originalDisplayName !== display_name) changes.push(`title: "${originalDisplayName}" → "${display_name}"`);
      if (originalContent !== content) changes.push(`content: ${originalContent.length} → ${content.length} characters`);
      const changeDesc = changes.length > 0 ? ` (${changes.join(', ')})` : '';
      
      db.logs.logPageAction(req.user.id, 'edit', name, `Edited page: "${display_name}"${changeDesc}`, req.clientIP);
    }
    
  } catch (error) {
    // Log the failed page edit
    if (settings.logging === 'true') {
      db.logs.logPageAction(req.user.id, 'edit_failed', name, `Failed to edit page: "${display_name}" - ${error.message}`, req.clientIP);
    }
    console.error('Error editing page:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
  return res.redirect('/wiki/' + name);
});
// ...existing code...

// View page versions
app.get('/wiki/:name/versions', async (req, res) => {
  let page = await db.pages.getPage(req.params.name);
  if (!page) return res.status(404).redirect('/wiki/404');
  let versions = await db.pages.getVersions(page.id);
  res.render('wiki_versions', {
    header: req._header,
    wiki: settings,
    page: page,
    versions: versions,
    user: req.user
  });
});

// Restore a previous version
app.post('/wiki/:name/restore', async (req, res) => {
  let page = await db.pages.getPage(req.params.name);
  if (!page) return res.status(404).redirect('/wiki/404');
  let versionId = req.body.version_id;
  let version = await db.pages.getVersionById(versionId);
  if (!version) return res.status(404).json({ error: 'Version not found' });

  // Permission check: only allow users who can edit the page
  if (!req.user || req.user.role < (page.permission-1 || 99)) {
    return res.status(403).json({ error: 'You do not have permission to restore this page.' });
  }

  try {
    // Restore the version
    await db.pages.updatePage(page.id, page.name, version.display_name, version.content, req.user.id);
    
    // Log the page restoration
    if (settings.logging === 'true') {
      db.logs.logPageAction(req.user.id, 'restore', page.name, `Restored page "${version.display_name}" to version ${versionId} from ${version.edited_at}`, req.clientIP);
    }
    
    res.redirect('/wiki/' + page.name);
  } catch (error) {
    console.error('Error restoring page:', error);
    
    // Log failed restoration
    if (settings.logging === 'true') {
      db.logs.logPageAction(req.user.id, 'restore_failed', page.name, `Failed to restore page to version ${versionId}: ${error.message}`, req.clientIP);
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});
app.get('/user/:uid',async (req,res,next)=>{
  let profile;
  try{
    profile = await db.users.getById(req.params.uid)
    let markdownEnabled = profile.markdown || false;
    let renderedBio = profile.bio ? (!markdownEnabled ? md.render(profile.bio) : profile.bio) : '';
    let style = mathjaxInstance.outputStyle()
    res.render('user',{
      header: `${req._header} <style>${style}</style>`,
      wiki:settings,
      profile:profile,
      renderedBio: renderedBio,
      user:req.user
    })
  } catch (err){
    console.warn(`couldnt show profile: ${err}`)
    return next()
  }
})
app.get('/user/:uid/edit',async (req,res,next)=>{
  let user = req.user
  if (!user){
    return next()
  }
  let profile;
  try{
    profile = await db.users.getById(req.params.uid)
    if (!profile){
      return next()
    }
    if (profile.id !== user.id){
      if (user.role < 100 && user.role >= profile.role){
        return next()
      }
    }
    let formconfig = forms.getFormConfig('user-edit')
    formconfig.action = `/user/${profile.id}/edit`
    formconfig.formTitle = `${profile.display_name}'s Userpage`
    formconfig.fields[0].value = profile.display_name
    formconfig.fields[1].value = profile.bio
    formconfig.head = `<script>
      document.addEventListener('DOMContentLoaded', function() {
        const form = document.querySelector('.dynamic-form');
        if (form) {
          form.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData(form);
            const data = {};
            
            // Collect form data
            for (let [key, value] of formData.entries()) {
              data[key] = value;
            }
            
            try {
              const response = await fetch(form.action, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify(data)
              });
              
              const result = await response.json();
              
              if (response.ok) {
                notifications.success(result.message || 'Profile updated successfully!');
                if (result.redirectUrl) {
                  setTimeout(() => {
                    window.location.href = result.redirectUrl;
                  }, 1500);
                }
              } else {
                notifications.error(result.error || 'Something went wrong');
              }
            } catch (error) {
              console.error('Error:', error);
              notifications.error('Network error. Please try again.');
            }
          });
        }
      });
    </script>`
    renderForm(res,req,formconfig)
  } catch (err){
    console.warn(colors.yellow(`couldnt show profile: ${err}`))
    return next()
  }
})
app.post('/user/:uid/edit',async (req,res)=>{
  let profile;
  let user;
  
  // Function to handle responses based on request type
  const sendResponse = (statusCode, data, isError = false) => {
    // Check if this is an AJAX request (API-style)
    if (req.headers.accept && req.headers.accept.includes('application/json') || 
        req.headers['content-type'] && req.headers['content-type'].includes('application/json')) {
      return res.status(statusCode).json(data);
    }
    
    // For regular form submissions, redirect or render with message
    if (isError) {
      // For errors, redirect back to the edit page with error in URL params
      return res.redirect(`/user/${req.params.uid}/edit?error=${encodeURIComponent(data.error)}`);
    } else {
      // For success, redirect to profile page
      return res.redirect(data.redirectUrl || `/user/${req.params.uid}`);
    }
  };

  try{
    profile = await db.users.getById(req.params.uid)
    user = req.user
    if (!profile || !user){
      console.log('Missing profile or user:', { profile: !!profile, user: !!user });
      return sendResponse(403, { error: 'Access denied' }, true);
    }
    if (profile.id !== user.id){
      if (user.role < 100 || user.role < profile.role){
        console.log('Permission denied:', { userRole: user.role, profileId: profile.id, userId: user.id });
        return sendResponse(403, { error: 'No permission to edit this profile' }, true);
      }
    }
    
    console.log('Request body:', req.body);
    
    if (!req.body || req.body.display_name === undefined || req.body.bio === undefined){
      console.log('Missing required fields in request body');
      return sendResponse(400, { error: 'Missing required fields: display_name and bio' }, true);
    }
    
    let {display_name, bio} = req.body;
    
    // Allow empty bio
    bio = bio || '';
    
    let {error, value} = schemas.bioSchema.validate({display_name, bio});
    if (error){
      console.log('Validation error:', error.details);
      return sendResponse(400, { error: error.details[0].message }, true);
    }
    
    // Store original values for logging
    const originalDisplayName = profile.display_name;
    const originalBio = profile.bio;
    
    console.log('Updating user:', { profileId: profile.id, display_name, bioLength: bio.length });
    
    await db.users.modifyUser(profile.id, display_name, bio)
    
    // Log the profile update
    if (settings.logging === 'true') {
      const changes = [];
      if (originalDisplayName !== display_name) changes.push(`display name: "${originalDisplayName}" → "${display_name}"`);
      if (originalBio !== bio) changes.push(`bio: ${originalBio ? originalBio.length : 0} → ${bio.length} characters`);
      const changeDesc = changes.length > 0 ? ` (${changes.join(', ')})` : '';
      
      // Log as user action if editing own profile, admin action if admin editing someone else's profile
      if (profile.id === user.id) {
        db.logs.add(user.id, 'profile_edit', `Updated own profile${changeDesc}`, req.clientIP);
      } else {
        db.logs.logUserAction(user.id, 'profile_edit_admin', profile.id, `Admin updated profile for ${profile.username}${changeDesc}`, req.clientIP);
      }
    }
    
    console.log('Profile updated successfully, redirecting to /user/' + profile.id);
    return sendResponse(200, { 
      message: 'Profile updated successfully!', 
      redirectUrl: `/user/${profile.id}` 
    });
  } catch (err){
    console.error('Error updating profile:', err)
    
    // Log failed profile edit
    if (settings.logging === 'true') {
      db.logs.add(user?.id || 0, 'profile_edit_failed', `Failed to update profile: ${err.message}`, req.clientIP);
    }
    
    return sendResponse(500, { error: 'Internal server error: ' + err.message }, true);
  }
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
app.get('/media/user/:page', (req, res) => {
  const page = req.params.page;
  res.sendFile(path.join(__dirname, 'media/user', page), (error) => {
    if (error) {
      console.warn(error);
      res.redirect('/wiki/404');
    }
  });
});
app.get('/favicon.ico',(req,res)=>{
  res.redirect('/media/'+(settings['icon'] || 'icon.png'))
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

/**
 * @swagger
 * /api/v1/settings:
 *   get:
 *     summary: Get server settings
 *     description: Get public wiki settings
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: Settings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 settings:
 *                   type: object
 *                   description: Wiki settings
 *       500:
 *         description: Server error
 */
app.get('/api/v1/settings', async (req, res) => {
  try {
    const publicSettings = await db.settings.getSettings();
    res.status(200).json({ settings: publicSettings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/v1/articles:
 *   get:
 *     summary: Get all articles
 *     description: Get a paginated list of all wiki articles
 *     tags:
 *       - Pages
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 15
 *           maximum: 100
 *         description: Number of articles per page
 *     responses:
 *       200:
 *         description: Articles retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 articles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       name:
 *                         type: string
 *                       display_name:
 *                         type: string
 *                       content:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                       updated_at:
 *                         type: string
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     totalArticles:
 *                       type: integer
 *                     hasNextPage:
 *                       type: boolean
 *                     hasPrevPage:
 *                       type: boolean
 *       500:
 *         description: Server error
 */
app.get('/api/v1/articles', async (req, res) => {
  try {
    let page = Math.max(1, Number(req.query.page) || 1);
    let limit = Math.min(100, Math.max(1, Number(req.query.limit) || 15));
    let offset = (page - 1) * limit;

    let allPages = await db.pages.getAllPages();
    let totalArticles = allPages.length;
    let totalPages = Math.ceil(totalArticles / limit);
    
    // Apply pagination
    let articles = allPages.slice(offset, offset + limit);

    res.status(200).json({
      articles: articles,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        totalArticles: totalArticles,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching articles:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/v1/articles/{name}:
 *   get:
 *     summary: Get specific article
 *     description: Get a specific wiki article by name
 *     tags:
 *       - Pages
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: Article name/slug
 *       - in: query
 *         name: rendered
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Whether to return rendered markdown content
 *     responses:
 *       200:
 *         description: Article retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 article:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     display_name:
 *                       type: string
 *                     content:
 *                       type: string
 *                       description: Raw or rendered content based on 'rendered' parameter
 *                     markdown:
 *                       type: boolean
 *                     permission:
 *                       type: integer
 *                     created_at:
 *                       type: string
 *                     updated_at:
 *                       type: string
 *       404:
 *         description: Article not found
 *       500:
 *         description: Server error
 */
app.get('/api/v1/articles/:name', async (req, res) => {
  try {
    const articleName = req.params.name;
    const shouldRender = req.query.rendered === 'true';
    
    let article = await db.pages.getPage(articleName);
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // If requested, render markdown content
    if (shouldRender && !article.markdown) {
      article.content = md.render(article.content);
    }

    res.status(200).json({ article: article });
  } catch (error) {
    console.error('Error fetching article:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/v1/create-page:
 *   post:
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     summary: Create new page
 *     description: make a new wiki page (need role 10+)
 *     tags:
 *       - Pages
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - display_name
 *               - content
 *             properties:
 *               display_name:
 *                 type: string
 *                 description: page title
 *                 maxLength: 200
 *               content:
 *                 type: string
 *                 description: page content
 *                 maxLength: 100000
 *     responses:
 *       201:
 *         description: page created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 url:
 *                   type: string
 *       400:
 *         description: missing stuff
 *       401:
 *         description: need login
 *       403:
 *         description: no permission
 *       409:
 *         description: page exists already
 *       500:
 *         description: server error
 */
app.post('/api/v1/create-page', requireApiRole(10), async (req, res) => {
  let body = req.body;
  if (!body || !body.display_name || !body.content) {
    return res.status(400).json({ error: 'Please provide both a page title and content.' });
  }
  
  // Validate input lengths
  if (body.display_name.length > 200 || body.content.length > 100000) {
    return res.status(400).json({ error: 'Content too long.' });
  }
  
  let { display_name, content } = body;
  let name = display_name.toLowerCase().replace(/\s+/g, '_');
  
  try {
    const pageId = await db.pages.createPage(name, display_name, content);
    
    // Log the page creation
    if (settings.logging === 'true') {
      db.logs.logPageAction(req.user.id, 'create', name, `Created page: "${display_name}" (${content.length} characters)`, req.clientIP);
    }
    
    res.status(201).json({ message: 'Page created successfully!', url: `/wiki/${name}` });
  } catch (error) {
    console.error('Error creating page:', error);
    
    // Log the failed page creation
    if (settings.logging === 'true') {
      db.logs.logPageAction(req.user.id, 'create_failed', name, `Failed to create page: "${display_name}" - ${error.message}`, req.clientIP);
    }
    
    // Handle specific SQLite constraint errors
    if (error.code === 'SQLITE_CONSTRAINT') {
      if (error.message.includes('pages.name')) {
        return res.status(409).json({ error: 'A page with this name already exists. Please choose a different title.' });
      } else if (error.message.includes('pages.display_name')) {
        return res.status(409).json({ error: 'A page with this title already exists. Please choose a different title.' });
      }
      return res.status(409).json({ error: 'A page with this title or name already exists. Please choose a different title.' });
    }
    
    res.status(500).json({ error: 'Unable to create the page at this time. Please try again later.' });
  }
});
/**
 * @swagger
 * /api/v1/upload-image:
 *   post:
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     summary: Upload image
 *     description: upload a pic (need role 10+)
 *     tags:
 *       - Media
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - photo
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *                 description: image file (max 5MB)
 *     responses:
 *       200:
 *         description: uploaded ok
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 filename:
 *                   type: string
 *                 url:
 *                   type: string
 *       400:
 *         description: file too big or bad format
 *       401:
 *         description: need login
 *       403:
 *         description: no permission
 *       500:
 *         description: server error
 */
app.post('/api/v1/upload-image', requireApiRole(10), m_upload.single('photo'), async (req, res) => {
  if (!req.file){
    return res.status(500).json({error:"Please provide a photo"})
  }
  let file = {size:req.file.size,type:req.file.mimetype}
  // Check file size (5MB limit)
  if (file.size > 5 * 1024 * 1024) {
    // Log failed upload
    if (settings.logging === 'true') {
      db.logs.logMediaAction(req.user.id, 'upload_failed', req.file.originalname, `File too large: ${file.size} bytes`, req.clientIP);
    }
    return res.status(400).json({error: "File size too large. Maximum allowed size is 5MB."});
  }

  if (!file.type.startsWith('image/')) {
    // Log failed upload
    if (settings.logging === 'true') {
      db.logs.logMediaAction(req.user.id, 'upload_failed', req.file.originalname, `Invalid file type: ${file.type}`, req.clientIP);
    }
    return res.status(400).json({error: "Only image files are allowed."});
  }
  // Generate unique filename
  const fileExtension = path.extname(req.file.originalname);
  const uniqueFilename = `${req.user.id}-${new Date().getTime()}-media${fileExtension}`
  const filePath = path.join(__dirname, 'media/user', uniqueFilename);

  // Save file to disk
  try {
    // Process image with sharp for compression
    let imageBuffer = req.file.buffer;
    const metadata = await sharp(imageBuffer).metadata();
    
    // Determine if we need to process this image
    if (metadata.format === 'jpeg' || metadata.format === 'jpg' || metadata.format === 'png') {
      imageBuffer = await sharp(req.file.buffer)
        .jpeg({ quality: 80, progressive: true }) // Good quality, progressive loading
        .withMetadata() // Preserve metadata
        .toBuffer();
    }
    
    // Save the processed (or original if not processed) image
    fs.writeFileSync(filePath, imageBuffer);
    
    // Log successful upload
    if (settings.logging === 'true') {
      db.logs.logMediaAction(req.user.id, 'upload', uniqueFilename, `Uploaded image: "${req.file.originalname}" (${file.size} bytes, ${file.type})`, req.clientIP);
    }
    
    res.status(200).json({
      message: "Photo uploaded successfully",
      filename: uniqueFilename,
      url: `/media/user/${uniqueFilename}`
    });
  } catch (error) {
    console.error('Error processing/saving file:', error);
    
    // Log failed upload
    if (settings.logging === 'true') {
      db.logs.logMediaAction(req.user.id, 'upload_failed', req.file.originalname, `Processing/save error: ${error.message}`, req.clientIP);
    }
    
    res.status(500).json({error: "Failed to save file"});
  }
});
/**
 * @swagger
 * /api/v1/delete-page:
 *   post:
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     summary: Delete page
 *     description: delete wiki page (admin only)
 *     tags:
 *       - Pages
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 description: page name to delete
 *     responses:
 *       200:
 *         description: page deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: missing page title
 *       401:
 *         description: need login
 *       403:
 *         description: no permission
 *       404:
 *         description: page not found
 *       500:
 *         description: server error
 */
app.post('/api/v1/delete-page', requireApiRole(100), async (req, res) => {
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
    
    // Check if user has permission to delete this specific page
    if (req.user.role < (page.permission || 100)) {
      return res.status(403).json({ error: 'You do not have permission to delete this page.' });
    }
    
    // Store page info for logging before deletion
    const pageInfo = {
      id: page.id,
      name: page.name,
      display_name: page.display_name,
      content_length: page.content ? page.content.length : 0
    };
    
    // Delete the page
    await db.pages.deletePage(page.id);
    
    // Log the page deletion
    if (settings.logging === 'true') {
      db.logs.logPageAction(req.user.id, 'delete', pageInfo.name, `Deleted page: "${pageInfo.display_name}" (${pageInfo.content_length} characters)`, req.clientIP);
    }
    
    res.status(200).json({ message: 'Page deleted successfully' });
  } catch (error) {
    console.error('Error deleting page:', error);
    
    // Log the failed page deletion
    if (settings.logging === 'true') {
      db.logs.logPageAction(req.user.id, 'delete_failed', title, `Failed to delete page: "${title}" - ${error.message}`, req.clientIP);
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});
/**
 * @swagger
 * /api/v1/login:
 *   post:
 *     summary: login
 *     description: log in with username and password
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: username
 *               password:
 *                 type: string
 *                 description: password
 *               returnTo:
 *                 type: string
 *                 description: where to go after login
 *     responses:
 *       200:
 *         description: logged in
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 redirectUrl:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     username:
 *                       type: string
 *                     display_name:
 *                       type: string
 *                     role:
 *                       type: integer
 *       400:
 *         description: missing username or password
 *       401:
 *         description: wrong username/password
 *       403:
 *         description: account disabled
 *       429:
 *         description: too many attempts
 *       500:
 *         description: server error
 */
app.post('/api/v1/login', authLimiter, async (req, res) => {
  const body = req.body;
  if (!body || !body.username || !body.password) {
    // Log failed login attempt - missing credentials
    if (settings.logging === 'true') {
      db.logs.logAuth(0, 'login_attempt', 'Missing username or password', req.clientIP, false);
    }
    return res.status(400).json({ error: 'Please enter both username and password.' });
  }
  const { username, password, returnTo } = body;
  try {
    const user = await userAuth.login(username, password);
    
    if (user.account_status === 'suspended') {
      // Log failed login attempt - suspended account
      if (settings.logging === 'true') {
        db.logs.logAuth(user.id, 'login_attempt', 'Account suspended', req.clientIP, false);
      }
      return res.status(403).json({ error: 'Your account is suspended. Please contact support.' });
    }
    
    if (user.username === 'admin' && (settings['admin_account_enabled'] === 'false' || settings['admin_account_enabled'] === false)){
      // Log failed login attempt - admin disabled
      if (settings.logging === 'true') {
        db.logs.logAuth(user.id, 'login_attempt', 'Admin account disabled', req.clientIP, false);
      }
      return res.status(403).json({ error: 'The admin account is currently disabled. Please contact support.' });
    }
    
    // Log successful login
    if (settings.logging === 'true') {
      db.logs.logAuth(user.id, 'login', `Successful login from ${req.clientIP}`, req.clientIP, true);
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
    // Log failed login attempt
    if (settings.logging === 'true') {
      db.logs.logAuth(0, 'login_attempt', `Failed login for username: ${username} - ${err.message}`, req.clientIP, false);
    }
    
    if (err.message === 'Invalid username or password') {
      return res.status(401).json({ error: 'Invalid username or password. Please check your credentials and try again.' });
    }
    console.error('Error during login:', err);
    res.status(500).json({ error: 'We encountered an issue while processing your login. Please try again later.' });
  }
});
/**
 * @swagger
 * /api/v1/logout:
 *   post:
 *     summary: logout
 *     description: log out and clear session
 *     tags:
 *       - Authentication
 *     responses:
 *       200:
 *         description: logged out
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 redirectUrl:
 *                   type: string
 */
app.post('/api/v1/logout', async (req, res) => {
  try {
    if (req.user) {
      // Log the logout
      if (settings.logging === 'true') {
        db.logs.logAuth(req.user.id, 'logout', `User logged out from ${req.clientIP}`, req.clientIP, true);
      }
      
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
/**
 * @swagger
 * /api/v1/update-wiki-settings:
 *   post:
 *     security:
 *       - cookieAuth: []
 *     summary: Update settings
 *     description: change wiki settings (admin only)
 *     tags:
 *       - Administration
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: settings to update
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: settings updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: missing data
 *       401:
 *         description: need login
 *       403:
 *         description: no permission
 *       500:
 *         description: server error
 */
app.post('/api/v1/update-wiki-settings', requireApiRole(100), async (req,res)=>{
  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  try {
    // Get current settings for comparison
    const currentSettings = await db.settings.getSettings();
    
    // Convert checkbox values from 'on'/'true'/'false' to boolean/string as needed
    const dbSettings = await db.settings.getSettings();
    const updateObj = {};
    Object.entries(dbSettings).forEach(([key, oldVal]) => {
      if (body.hasOwnProperty(key)) {
        let val = body[key];
        // Handle checkboxes: express sends 'on' for checked, nothing for unchecked
        if (oldVal === 'true' || oldVal === 'false') {
          if (val === 'on' || val === true || val === 'true') val = 'true';
          else val = 'false';
        }
        updateObj[key] = val;
      }
    });
    
    await db.settings.updateSettings(updateObj);
    await loadSettings();
    
    // Log the settings update with details of changes
    if (settings.logging === 'true') {
      const changes = [];
      Object.entries(updateObj).forEach(([key, newVal]) => {
        if (currentSettings[key] !== newVal) {
          changes.push(`${key}: "${currentSettings[key]}" → "${newVal}"`);
        }
      });
      const changeDesc = changes.length > 0 ? changes.join(', ') : 'no changes detected';
      db.logs.logAdminAction(req.user.id, 'settings_update', `Updated wiki settings: ${changeDesc}`, req.clientIP);
    }
    
    res.status(200).json({ message: 'Wiki settings updated successfully' });
  } catch (err) {
    console.error('Error updating wiki settings:', err);
    
    // Log failed settings update
    if (settings.logging === 'true') {
      db.logs.logAdminAction(req.user.id, 'settings_update_failed', `Failed to update wiki settings: ${err.message}`, req.clientIP);
    }
    
    return res.status(500).json({ error: 'Internal server error' });
  }
});
/**
 * @swagger
 * /api/v1/users/apply:
 *   post:
 *     summary: Apply for account
 *     description: submit application for new account
 *     tags:
 *       - User Management
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - reason
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: username
 *               email:
 *                 type: string
 *                 format: email
 *                 description: email
 *               reason:
 *                 type: string
 *                 description: why you want an account
 *               password:
 *                 type: string
 *                 description: password
 *               returnTo:
 *                 type: string
 *                 description: where to go after
 *     responses:
 *       201:
 *         description: application sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 redirectUrl:
 *                   type: string
 *       400:
 *         description: bad info
 *       429:
 *         description: too many apps
 *       500:
 *         description: server error
 */
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
    const appId = await db.applications.create(username,password,email,reason);
    
    // Log the application submission
    if (settings.logging === 'true') {
      db.logs.logUserAction(0, 'application_submit', null, `Application submitted by ${username} (${email}): ${reason.substring(0, 100)}...`, req.clientIP);
    }
    
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
    
    // Log failed application
    if (settings.logging === 'true') {
      db.logs.logUserAction(0, 'application_failed', null, `Failed application for ${username}: ${err.message}`, req.clientIP);
    }
    
    res.status(500).json({ error: 'We encountered an issue while processing your application. Please try again later.' });
  }
});

/**
 * @swagger
 * /api/v1/users/create:
 *   post:
 *     summary: Create user account
 *     description: Create a new user account directly (only allowed if applications are disabled or user has admin role)
 *     tags:
 *       - User Management
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: username
 *               email:
 *                 type: string
 *                 format: email
 *                 description: email
 *               password:
 *                 type: string
 *                 description: password
 *               returnTo:
 *                 type: string
 *                 description: where to go after
 *     responses:
 *       201:
 *         description: account created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 redirectUrl:
 *                   type: string
 *       400:
 *         description: bad info or validation failed
 *       401:
 *         description: need login (if applications enabled)
 *       403:
 *         description: account creation not allowed
 *       429:
 *         description: too many attempts
 *       500:
 *         description: server error
 */
app.post('/api/v1/users/create', authLimiter, async (req, res) => {
  const body = req.body;
  
  // Check if user creation is allowed
  const applicationsEnabled = settings.applications === 'true';
  const isAdmin = req.user && req.user.role >= 100;
  
  if (applicationsEnabled && !isAdmin) {
    return res.status(403).json({ error: 'Direct account creation is not allowed. Please use the application process instead.' });
  }
  
  if (!body || !body.username || !body.email || !body.password) {
    return res.status(400).json({ error: 'Please fill in all required fields.' });
  }
  
  const { username, email, password, returnTo } = body;
  
  // Validate input using the same schema as applications
  const { error, value } = schemas.registrationSchema.validate({ 
    username, 
    email, 
    password, 
    reason: 'Direct registration' // dummy reason for validation
  });
  
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  
  try {
    // Check if username already exists
    let existingUser = null;
    try {
      existingUser = await db.users.getByUsername(username);
    } catch (error) {
      // If user not found, that's what we want - we can create the user
      if (error.message !== 'User not found') {
        throw error; // Re-throw if it's a different error
      }
    }
    
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists. Please choose a different username.' });
    }
    
    // Hash password and create user
    const hashedPassword = db.hash(password);
    await db.users.create(username, hashedPassword, username, 10); // role 10 for regular wikian
    
    // Set IP for the new user if available
    if (req.ip) {
      try {
        const newUser = await db.users.getByUsername(username);
        if (newUser) {
          await db.users.setIP(newUser.id, req.ip);
        }
      } catch (error) {
        // If we can't get the user we just created, log it but don't fail the request
        console.error('Failed to set IP for new user:', error.message);
      }
    }
    
    // Clear any previous returnTo cookie
    res.clearCookie('returnTo');
    
    // Determine redirect URL
    let redirectUrl = '/login';
    if (returnTo && returnTo.startsWith('/')) {
      redirectUrl = returnTo;
    } else if (req.cookies.returnTo && req.cookies.returnTo.startsWith('/')) {
      redirectUrl = req.cookies.returnTo;
    }
    
    res.status(201).json({ 
      message: 'Account created successfully! You can now log in with your credentials.', 
      redirectUrl: redirectUrl 
    });
    
  } catch(err) {
    console.error('Error creating user account:', err);
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Username or email already exists. Please choose different credentials.' });
    }
    res.status(500).json({ error: 'We encountered an issue while creating your account. Please try again later.' });
  }
});

/**
 * @swagger
 * /api/v1/users/register:
 *   post:
 *     security:
 *       - cookieAuth: []
 *     summary: Accept application
 *     description: approve user application (admin only)
 *     tags:
 *       - Administration
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: integer
 *                 description: application id to accept
 *     responses:
 *       200:
 *         description: application approved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: missing fields
 *       401:
 *         description: need login
 *       403:
 *         description: no permission
 *       404:
 *         description: application not found
 *       500:
 *         description: server error
 */
app.post('/api/v1/users/register', requireApiRole(100), async(req,res)=>{
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
    const newUserId = await db.users.create(application.username, application.password, application.username, 10);
    await db.applications.delete(id);
    
    // Log the application approval
    if (settings.logging === 'true') {
      db.logs.logAdminAction(req.user.id, 'application_approve', `Approved application for ${application.username} (${application.email})`, req.clientIP, application.username);
    }
    
    res.status(200).json({ message: 'User registered successfully' });
  } catch (err) {
    console.error('Error registering user:', err);
    
    // Log failed approval
    if (settings.logging === 'true') {
      db.logs.logAdminAction(req.user.id, 'application_approve_failed', `Failed to approve application ${id}: ${err.message}`, req.clientIP);
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
})
/**
 * @swagger
 * /api/v1/users/register/deny:
 *   post:
 *     security:
 *       - cookieAuth: []
 *     summary: Deny application
 *     description: reject user application (admin only)
 *     tags:
 *       - Administration
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: integer
 *                 description: application id to deny
 *     responses:
 *       200:
 *         description: application denied
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: missing fields
 *       401:
 *         description: need login
 *       403:
 *         description: no permission
 *       404:
 *         description: app not found
 *       500:
 *         description: server error
 */
app.post('/api/v1/users/register/deny', requireApiRole(100), async(req,res)=>{
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

/**
 * @swagger
 * /api/v1/users/{id}:
 *   delete:
 *     security:
 *       - cookieAuth: []
 *     summary: Delete user
 *     description: delete user account (admin only)
 *     tags:
 *       - Administration
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: user id to delete
 *     responses:
 *       200:
 *         description: user deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: bad user id
 *       401:
 *         description: need login
 *       403:
 *         description: no permission or cant delete admin/self
 *       404:
 *         description: user not found
 *       500:
 *         description: server error
 */
// Delete user endpoint
app.delete('/api/v1/users/:id', requireApiRole(100), async (req, res) => {
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

/**
 * @swagger
 * /api/v1/users/{id}:
 *   put:
 *     security:
 *       - cookieAuth: []
 *     summary: Update user
 *     description: update user info (admin only)
 *     tags:
 *       - Administration
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: user id to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - displayName
 *               - username
 *               - role
 *               - status
 *             properties:
 *               displayName:
 *                 type: string
 *                 description: display name
 *               username:
 *                 type: string
 *                 description: username
 *               role:
 *                 type: integer
 *                 enum: [0, 1, 50, 100]
 *                 description: role level
 *               status:
 *                 type: string
 *                 enum: ['active', 'suspended', 'pending', 'null']
 *                 description: account status
 *     responses:
 *       200:
 *         description: user updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: bad data
 *       401:
 *         description: need login
 *       403:
 *         description: no permission or cant modify admin
 *       404:
 *         description: user not found
 *       500:
 *         description: server error
 */
/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     security:
 *       - cookieAuth: []
 *     summary: Get user details
 *     description: Get detailed information about a user (admin only)
 *     tags:
 *       - Administration
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID to get details for
 *     responses:
 *       200:
 *         description: User details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     username:
 *                       type: string
 *                     display_name:
 *                       type: string
 *                     role:
 *                       type: integer
 *                     account_status:
 *                       type: string
 *                     ip:
 *                       type: string
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 */
app.get('/api/v1/users/:id', requireApiRole(100), async (req, res) => {
  const userId = parseInt(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  
  try {
    const user = await db.users.getById(userId);
    res.status(200).json({ user });
  } catch (error) {
    if (error.message === 'User not found') {
      res.status(404).json({ error: 'User not found' });
    } else {
      console.error('Error getting user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Update user endpoint
app.put('/api/v1/users/:id', requireApiRole(100), async (req, res) => {
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

/**
 * @swagger
 * /api/v1/server/shutdown:
 *   post:
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     summary: Shutdown server
 *     description: turn off the server (super admin only, click twice)
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: shutting down
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: need login
 *       403:
 *         description: no permission
 *       409:
 *         description: click again within 30 seconds
 */
let last_time = 0
app.post('/api/v1/server/shutdown', requireApiRole(500), async (req,res)=>{
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

/**
 * @swagger
 * /api/v1/users/{id}/suspend:
 *   post:
 *     security:
 *       - cookieAuth: []
 *     summary: Suspend user
 *     description: suspend or unsuspend user (admin only)
 *     tags:
 *       - Administration
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: user id to suspend/unsuspend
 *     responses:
 *       200:
 *         description: suspension status changed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 newStatus:
 *                   type: string
 *                   enum: ['active', 'suspended']
 *       400:
 *         description: bad user id
 *       401:
 *         description: need login
 *       403:
 *         description: no permission or cant suspend admin/self
 *       404:
 *         description: user not found
 *       500:
 *         description: server error
 */
// Suspend/Unsuspend user endpoint
app.post('/api/v1/users/:id/suspend', requireApiRole(100), async (req, res) => {
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
    
    // Log the suspension/unsuspension
    if (settings.logging === 'true') {
      const action = newStatus === 'suspended' ? 'suspend' : 'unsuspend';
      db.logs.logUserAction(req.user.id, action, userId, `${action.charAt(0).toUpperCase() + action.slice(1)}ed user: ${userToUpdate.username} (${userToUpdate.display_name})`, req.clientIP);
    }
    
    res.status(200).json({ 
      message: `User ${newStatus === 'suspended' ? 'suspended' : 'unsuspended'} successfully`,
      newStatus: newStatus
    });
  } catch (err) {
    console.error('Error suspending/unsuspending user:', err);
    
    // Log failed action
    if (settings.logging === 'true') {
      db.logs.logUserAction(req.user.id, 'suspend_failed', userId, `Failed to suspend/unsuspend user ${userId}: ${err.message}`, req.clientIP);
    }
    
    if (err.message === 'User not found') {
      res.status(404).json({ error: 'User not found' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
})

/**
 * @swagger
 * /api/v1/users/{id}/reset-token:
 *   post:
 *     security:
 *       - cookieAuth: []
 *     summary: Reset token
 *     description: reset user login token (admin only)
 *     tags:
 *       - Administration
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: user id to reset token
 *     responses:
 *       200:
 *         description: token reset
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: bad user id
 *       401:
 *         description: need login
 *       403:
 *         description: no permission
 *       404:
 *         description: user not found
 *       500:
 *         description: server error
 */
// Reset user token endpoint
app.post('/api/v1/users/:id/reset-token', requireApiRole(100), async (req, res) => {
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

/**
 * @swagger
 * /api/v1/users/{id}/reset-password:
 *   post:
 *     security:
 *       - cookieAuth: []
 *     summary: Reset password
 *     description: reset user password (admin only)
 *     tags:
 *       - Administration
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: user id to reset password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 description: new password
 *     responses:
 *       200:
 *         description: password reset
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: bad id or password too short
 *       401:
 *         description: need login
 *       403:
 *         description: no permission
 *       404:
 *         description: user not found
 *       500:
 *         description: server error
 */
// Reset user password endpoint
app.post('/api/v1/users/:id/reset-password', requireApiRole(100), async (req, res) => {
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

// wiki content creation pages
app.get('/wikian/:url', requireRole(10), (req, res, next) => {
  if (pneumonoultramicroscopicsilicovolcanoconiosis) {
    return next();
  }
  return next();
})
app.get('/wikian/upload-image', async (req, res) => {
  let formConfig = forms.getFormConfig('upload-image')
  renderForm(res, req,formConfig)
})
app.get('/wikian/',(req,res)=>{
  res.redirect('/wikian/dashboard');
})
app.get('/wikian/dashboard', async (req, res) => {
  res.render('wikian/dashboard', {
    header: req._header,
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
  if (pneumonoultramicroscopicsilicovolcanoconiosis) {
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
    header: req._header,
    user: req.user,
    wiki:settings
  });
});
app.get('/admin/wiki', async (req, res) => {
  // Dynamically generate fields for all settings
  let formConfig = forms.getFormConfig('wiki-settings') || {};
  let dbSettings = await db.settings.getSettings();
  // If formConfig.fields exists, use as base, else create empty array
  let fields = Array.isArray(formConfig.fields) ? formConfig.fields : [];

  // Build a map for quick lookup
  let fieldMap = {};
  fields.forEach(f => { if (f.name) fieldMap[f.name] = f; });

  // For every setting in db, ensure a field exists
  Object.entries(dbSettings).forEach(([key, value]) => {
    if (!fieldMap[key]) {
      // Add a generic text field if not present
      fields.push({
        name: key,
        label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        type: typeof value === 'boolean' || value === 'true' || value === 'false' ? 'checkbox' : 'text',
        required: false
      });
    }
  });

  // Set values for all fields from dbSettings
  fields.forEach(f => {
    if (dbSettings.hasOwnProperty(f.name)) {
      // Convert string 'true'/'false' to boolean for checkboxes
      if (f.type === 'checkbox') {
        f.value = dbSettings[f.name] === 'true' || dbSettings[f.name] === true;
      } else {
        f.value = dbSettings[f.name];
      }
    }
  });

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
      header: req._header,
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
      header: req._header,
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
// app.get('/admin/images/', (req, res) => {
//   let photos = mphotos
//   let page = Number(req.query.page) || 1;
//   let limit = 15;
//   let offset = (page - 1) * limit;

//   try {
//     // Get the array of all user images
//     const allImages = photos.getUserPhotos(); // or getGlobalPhotos() if needed
//     const totalImages = allImages.length;
//     const totalPages = Math.ceil(totalImages / limit);

//     // Paginate
//     const images = allImages.slice(offset, offset + limit);

//     res.render('admin/images', {
//       header: fs.readFileSync(path.join(__dirname, 'misc/header.html'), 'utf8'),
//       images: images,
//       currentPage: page,
//       totalPages: totalPages,
//       totalImages: totalImages,
//       hasNextPage: page < totalPages,
//       hasPrevPage: page > 1,
//       wiki: settings
//     });
//   } catch (error) {
//     console.error('Error fetching images:', error);
//     res.status(500).render('admin/images', {
//       header: fs.readFileSync(path.join(__dirname, 'misc/header.html'), 'utf8'),
//       images: [],
//       currentPage: 1,
//       totalPages: 0,
//       totalImages: 0,
//       hasNextPage: false,
//       hasPrevPage: false,
//       error: 'Failed to load images',
//       wiki: settings
//     });
//   }
// });
app.get('/admin/applications',async (req,res)=>{
  let offset = Number(req.query.offset) || 0;
  let limit = Number(req.query.limit) || 10;

  try {
    let applications = await db.applications.get(offset,limit);
    res.status(200).render('admin/applications',{
      applications:applications,
      wiki:settings,
      header: req._header,
    })
  } catch (error){
    console.error('Error fetching applications:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
})

app.get('/admin/logs', async (req, res) => {
  res.render('admin/logs', {
    header: req._header,
    user: req.user,
    wiki: settings
  });
});

/**
 * @swagger
 * /api/v1/ip-bans:
 *   get:
 *     security:
 *       - cookieAuth: []
 *     summary: Get banned accounts by IP
 *     description: Get list of all banned accounts grouped by IP address (admin only)
 *     tags:
 *       - Administration
 *     responses:
 *       200:
 *         description: List of banned accounts grouped by IP
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 bannedAccounts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       ip:
 *                         type: string
 *                       usernames:
 *                         type: string
 *                       account_count:
 *                         type: integer
 *                       status:
 *                         type: string
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
/**
 * @swagger
 * /api/v1/users/{id}/ban-ip-accounts:
 *   post:
 *     security:
 *       - cookieAuth: []
 *     summary: Ban accounts by user's IP
 *     description: Ban all accounts associated with a user's IP address (admin only)
 *     tags:
 *       - Administration
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of user whose IP's accounts to ban
 *     responses:
 *       200:
 *         description: Accounts banned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 bannedCount:
 *                   type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found or no IP associated
 */
/**
 * @swagger
 * /api/v1/users/{id}/ban-individual:
 *   post:
 *     security:
 *       - cookieAuth: []
 *     summary: Ban a specific user account
 *     description: Ban a specific user account without affecting other accounts with the same IP (admin only)
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID to ban
 *     responses:
 *       200:
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found
 */
/**
 * @swagger
 * /api/v1/logs:
 *   get:
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     summary: Get system logs
 *     description: Get paginated system logs (admin only)
 *     tags:
 *       - Administration
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 200
 *         description: Number of logs per page
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by specific action type
 *       - in: query
 *         name: user_id
 *         schema:
 *           type: integer
 *         description: Filter by user ID
 *       - in: query
 *         name: security_only
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Show only security-related logs
 *     responses:
 *       200:
 *         description: Logs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       userid:
 *                         type: integer
 *                       user_username:
 *                         type: string
 *                       action:
 *                         type: string
 *                       details:
 *                         type: string
 *                       ip_hash:
 *                         type: string
 *                       target_user:
 *                         type: integer
 *                       target_username:
 *                         type: string
 *                       target_resource:
 *                         type: string
 *                       timestamp:
 *                         type: string
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *                     totalLogs:
 *                       type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
app.get('/api/v1/logs', requireApiRole(100), async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const action = req.query.action;
    const userId = req.query.user_id ? parseInt(req.query.user_id) : null;
    const securityOnly = req.query.security_only === 'true';
    
    let logs;
    
    if (securityOnly) {
      logs = await db.logs.getSecurityLogs(limit, offset);
    } else if (action) {
      logs = await db.logs.getByAction(action, limit, offset);
    } else if (userId) {
      logs = await db.logs.getByUser(userId, limit, offset);
    } else {
      logs = await db.logs.getAll(limit, offset);
    }
    
    // For pagination, we'll estimate total based on the number of results returned
    // This is not perfect but avoids an expensive COUNT query
    const hasMore = logs.length === limit;
    const totalPages = hasMore ? page + 1 : page;
    
    res.json({
      logs: logs,
      pagination: {
        currentPage: page,
        totalPages: totalPages,
        hasNextPage: hasMore,
        hasPrevPage: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/v1/logs/stats:
 *   get:
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     summary: Get log statistics
 *     description: Get statistics about logged actions over the last 30 days (admin only)
 *     tags:
 *       - Administration
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stats:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       action:
 *                         type: string
 *                       count:
 *                         type: integer
 *                       unique_users:
 *                         type: integer
 *                       date:
 *                         type: string
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
app.get('/api/v1/logs/stats', requireApiRole(100), async (req, res) => {
  try {
    const stats = await db.logs.getLogStats();
    res.json({ stats });
  } catch (error) {
    console.error('Error fetching log stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/v1/logs/cleanup:
 *   post:
 *     security:
 *       - cookieAuth: []
 *       - bearerAuth: []
 *     summary: Clean up old logs
 *     description: Delete logs older than specified days (admin only, default 90 days)
 *     tags:
 *       - Administration
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               days:
 *                 type: integer
 *                 default: 90
 *                 description: Number of days to keep logs
 *     responses:
 *       200:
 *         description: Cleanup completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 deleted_count:
 *                   type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
app.post('/api/v1/logs/cleanup', requireApiRole(100), async (req, res) => {
  try {
    const days = req.body.days || 90;
    const deletedCount = await db.logs.cleanup(days);
    
    // Log the cleanup action
    if (settings.logging === 'true') {
      db.logs.logAdminAction(req.user.id, 'logs_cleanup', `Cleaned up ${deletedCount} logs older than ${days} days`, req.clientIP);
    }
    
    res.json({
      message: `Successfully deleted ${deletedCount} logs older than ${days} days`,
      deleted_count: deletedCount
    });
  } catch (error) {
    console.error('Error cleaning up logs:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/v1/users/:id/ban-individual', requireApiRole(100), async (req, res) => {
  const userId = parseInt(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    // Get user info
    const user = await db.users.getById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent banning admin user
    if (user.username === 'admin') {
      return res.status(403).json({ error: 'Cannot ban the admin user' });
    }

    // Prevent users from banning themselves
    if (req.user.id === userId) {
      return res.status(403).json({ error: 'Cannot ban your own account' });
    }

    // Update user status to suspended
    await db.users.modifyStatus(userId, 'suspended');

    // Log the individual ban
    if (settings.logging === 'true') {
      db.logs.logSecurityAction(req.user.id, 'user_ban_individual', `Banned individual user: ${user.username} (${user.display_name})`, req.clientIP, userId);
    }

    res.status(200).json({ 
      message: `Successfully banned user: ${user.username}` 
    });
  } catch (error) {
    console.error('Error banning user:', error);
    
    // Log failed ban attempt
    if (settings.logging === 'true') {
      db.logs.logSecurityAction(req.user.id, 'user_ban_failed', `Failed to ban user ${userId}: ${error.message}`, req.clientIP);
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/v1/users/:id/ban-ip-accounts', requireApiRole(100), async (req, res) => {
  const userId = parseInt(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    // Get user info to get their IP
    const user = await db.users.getById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.ip) {
      return res.status(400).json({ 
        error: 'User has no IP address recorded', 
        message: 'Cannot ban accounts by IP - no IP address is associated with this user'
      });
    }

    // Get the hashed IP from database and ban all accounts with this hashed IP
    // Note: user.ip is already hashed when stored in database
    const bannedCount = await db.bannedIps.banAccountsByHashedIp(user.ip, req.user.id);
    
    // Log the IP ban
    if (settings.logging === 'true') {
      db.logs.logSecurityAction(req.user.id, 'ip_ban', `IP ban: banned ${bannedCount} accounts associated with user ${user.username}'s IP`, req.clientIP, userId);
    }
    
    if (bannedCount === 0) {
      res.status(200).json({ 
        message: 'No additional accounts found with this IP address (user may be the only account with this IP)',
        bannedCount: 0 
      });
    } else {
      res.status(200).json({ 
        message: `Successfully banned ${bannedCount} accounts associated with this user's IP`,
        bannedCount 
      });
    }
  } catch (error) {
    console.error('Error banning accounts:', error);
    
    // Log failed IP ban
    if (settings.logging === 'true') {
      db.logs.logSecurityAction(req.user.id, 'ip_ban_failed', `Failed to IP ban accounts for user ${userId}: ${error.message}`, req.clientIP);
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @swagger
 * /api/v1/users/{id}/unban-ip-accounts:
 *   post:
 *     security:
 *       - cookieAuth: []
 *     summary: Unban accounts by user's IP
 *     description: Unban all accounts associated with a user's IP address (admin only)
 *     tags:
 *       - Administration
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of user whose IP's accounts to unban
 *     responses:
 *       200:
 *         description: Accounts unbanned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 unbannedCount:
 *                   type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: User not found or no IP associated
 */
app.post('/api/v1/users/:id/unban-ip-accounts', requireApiRole(100), async (req, res) => {
  const userId = parseInt(req.params.id);
  if (!userId) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    // Get user info to get their IP
    const user = await db.users.getById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.ip) {
      return res.status(400).json({ 
        error: 'User has no IP address recorded', 
        message: 'Cannot unban accounts by IP - no IP address is associated with this user'
      });
    }

    // Unban all accounts with this hashed IP
    const unbannedCount = await db.bannedIps.unbanAccountsByHashedIp(user.ip);
    
    // Log the IP unban
    if (settings.logging === 'true') {
      db.logs.logSecurityAction(req.user.id, 'ip_unban', `IP unban: unbanned ${unbannedCount} accounts associated with user ${user.username}'s IP`, req.clientIP, userId);
    }
    
    res.status(200).json({ 
      message: `Successfully unbanned ${unbannedCount} accounts associated with this user's IP`,
      unbannedCount 
    });
  } catch (error) {
    console.error('Error unbanning accounts:', error);
    
    // Log failed IP unban
    if (settings.logging === 'true') {
      db.logs.logSecurityAction(req.user.id, 'ip_unban_failed', `Failed to IP unban accounts for user ${userId}: ${error.message}`, req.clientIP);
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

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
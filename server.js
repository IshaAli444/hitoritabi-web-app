const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'hitoritabi-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));
app.use(express.static(path.join(__dirname, '../frontend')));

// Set EJS as view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Data file paths
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const THEMES_FILE = path.join(DATA_DIR, 'themes.json');
const STORIES_FILE = path.join(DATA_DIR, 'stories.json');
const AUTHORS_FILE = path.join(DATA_DIR, 'authors.json');

// Initialize data files
async function initializeDataFiles() {
  try {
    // Create data directory if it doesn't exist
    await fs.mkdir(DATA_DIR, { recursive: true });

    // Ensure each JSON file exists
    await ensureFile(USERS_FILE);
    await ensureFile(THEMES_FILE);
    await ensureFile(STORIES_FILE);
    await ensureFile(AUTHORS_FILE);

    console.log('Data files initialized successfully');
  } catch (error) {
    console.error('Error initializing data files:', error);
  }
}


// Helper function to check if file exists
async function ensureFile(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Read data from JSON files
async function readData(file) {
  try {
    const data = await fs.readFile(file, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${file}:`, error);
    return [];
  }
}

// Write data to JSON files
async function writeData(file, data) {
  try {
    await fs.writeFile(file, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error(`Error writing ${file}:`, error);
    return false;
  }
}

// ========== API ROUTES ==========

// Home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/HomePage.html'));
});

// API: Get all themes
app.get('/api/themes', async (req, res) => {
  try {
    const themes = await readData(THEMES_FILE);
    res.json(themes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load themes' });
  }
});

// API: Get all stories
app.get('/api/stories', async (req, res) => {
  try {
    const stories = await readData(STORIES_FILE);
    res.json(stories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load stories' });
  }
});

// API: Get featured story
app.get('/api/stories/featured', async (req, res) => {
  try {
    const stories = await readData(STORIES_FILE);
    const featured = stories.length > 0 ? stories[0] : null;
    res.json(featured);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load featured story' });
  }
});

// API: Get stories by mood
app.get('/api/stories/mood/:mood', async (req, res) => {
  try {
    const stories = await readData(STORIES_FILE);
    const moodMap = {
      'rainy': 'rainy',
      'quiet': 'quiet',
      'letters': 'intimate',
      'journeys': 'melancholic',
      'café corners': 'reflective',
      'rainy windows': 'rainy',
      'quiet nights': 'quiet',
      'letters kept': 'intimate'
    };
    
    const moodKey = req.params.mood.toLowerCase();
    const targetMood = moodMap[moodKey] || moodKey;
    
    const filtered = stories.filter(s => s.mood && s.mood.toLowerCase() === targetMood);
    res.json(filtered);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load stories' });
  }
});

// API: Get story by ID
app.get('/api/stories/:id', async (req, res) => {
  try {
    const stories = await readData(STORIES_FILE);
    const story = stories.find(s => s.id === parseInt(req.params.id));
    
    if (story) {
      res.json(story);
    } else {
      res.status(404).json({ error: 'Story not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to load story' });
  }
});

// API: Get all authors
app.get('/api/authors', async (req, res) => {
  try {
    const authors = await readData(AUTHORS_FILE);
    res.json(authors);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load authors' });
  }
});

// API: Get author by ID
app.get('/api/authors/:id', async (req, res) => {
  try {
    const authors = await readData(AUTHORS_FILE);
    const author = authors.find(a => a.id === parseInt(req.params.id));
    
    if (author) {
      const stories = await readData(STORIES_FILE);
      author.stories = stories.filter(s => s.authorId === author.id);
      res.json(author);
    } else {
      res.status(404).json({ error: 'Author not found' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to load author' });
  }
});

// API: Get current user
app.get('/api/current-user', (req, res) => {
  if (req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.json({ user: null });
  }
});


// API: Login
app.post('/api/login', async (req, res) => {
  console.log('🔐 LOGIN ATTEMPT - Email:', req.body.email, 'Password:', req.body.password ? 'Provided' : 'Missing');
  
  try {
    const { email, password } = req.body;
    
    // Debug: log what we received
    console.log('📥 Received data:', { email, password });
    
    // Basic validation
    if (!email || !password) {
      console.log('❌ Missing email or password');
      return res.status(400).json({ 
        success: false,
        error: 'Email and password are required',
        details: { receivedEmail: !!email, receivedPassword: !!password }
      });
    }
    
    // Read users data
    let users;
    try {
      const usersData = await fs.readFile(USERS_FILE, 'utf8');
      users = JSON.parse(usersData);
      console.log('📊 Total users in database:', users.length);
    } catch (error) {
      console.error('💥 Error reading users file:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Database error'
      });
    }
    
    // Find user by email (CASE SENSITIVE!)
    const user = users.find(u => u.email === email.trim());
    
    if (!user) {
      console.log('❌ User not found for email:', email);
      console.log('📋 Available emails:', users.map(u => u.email));
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password',
        details: 'Email not found in database'
      });
    }
    
    console.log('👤 User found:', user.username);
    console.log('🔑 Password check - Input:', password, 'Stored:', user.password);
    
    // Check password (plain text comparison since we used plain text)
    if (user.password !== password) {
      console.log('❌ Password mismatch');
      console.log('Expected:', user.password);
      console.log('Received:', password);
      return res.status(401).json({ 
        success: false,
        error: 'Invalid email or password',
        details: 'Password does not match'
      });
    }
    
    // Find or create author profile
    const authors = await readData(AUTHORS_FILE);
    let author = authors.find(a => a.userId === user.id);
    
    if (!author) {
      console.log('📝 Creating author profile for user:', user.username);
      author = {
        id: authors.length + 1,
        userId: user.id,
        name: user.username,
        bio: "A traveler with stories to tell...",
        location: "Somewhere in the world",
        role: "Traveler",
        storyCount: 0,
        image: `https://i.pravatar.cc/150?u=${user.email}`,
        joinDate: new Date().getFullYear().toString()
      };
      authors.push(author);
      await writeData(AUTHORS_FILE, authors);
    }
    
    // Set session
    req.session.user = {
      id: user.id,
      email: user.email,
      username: user.username
    };
    
    console.log('✅ LOGIN SUCCESSFUL for:', user.username);
    console.log('🎯 Session created:', req.session.user);
    
    res.json({ 
      success: true, 
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
    
  } catch (error) {
    console.error('💥 Login process error:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      success: false,
      error: 'Server error during login',
      debug: error.message
    });
  }
});

// API: Logout
app.get('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true, redirect: '/' });
});

// API: Register 
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Basic validation
    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required'
      });
    }

    // Read users file
    let users = [];
    try {
      const data = await fs.readFile(USERS_FILE, 'utf8');
      users = JSON.parse(data);
    } catch (err) {
      console.warn('Users file not found or empty, starting fresh');
    }

    // Check if email already exists
    if (users.some(u => u.email === email)) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Create new user
    const newUser = {
      id: users.length + 1,
      username: username.trim(),
      email: email.trim(),
      password, 
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');

    // Create default author profile
    let authors = [];
    try {
      const data = await fs.readFile(AUTHORS_FILE, 'utf8');
      authors = JSON.parse(data);
    } catch (err) {}

    const author = {
      id: authors.length + 1,
      userId: newUser.id,
      name: username.trim(),
      bio: 'A traveler with stories to tell...',
      location: 'Somewhere in the world',
      role: 'Traveler',
      storyCount: 0,
      image: `https://i.pravatar.cc/150?u=${email}`,
      joinDate: new Date().getFullYear().toString()
    };
    authors.push(author);
    await fs.writeFile(AUTHORS_FILE, JSON.stringify(authors, null, 2), 'utf8');

    // Set session
    req.session.user = {
      id: newUser.id,
      username: newUser.username,
      email: newUser.email
    };

    res.status(201).json({
      success: true,
      user: { id: newUser.id, username: newUser.username, email: newUser.email },
      message: 'Account created successfully'
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});


// ========== PAGE ROUTES ==========

// Story page
app.get('/story/:id', async (req, res) => {
  try {
    const stories = await readData(STORIES_FILE);
    const story = stories.find(s => s.id === parseInt(req.params.id));

    if (!story) {
      return res.status(404).render('404', { message: "Story not found" });
    }

    const authors = await readData(AUTHORS_FILE);
    const author = authors.find(a => a.id === story.authorId) || { name: "Unknown", image: "/default.jpg", role: "" };

    // render EJS template
    res.render('story', { story, author, user: req.user || null });
  } catch (error) {
    console.error(error);
    res.status(500).render('500', { message: "Server error" });
  }
});


// API endpoint to get stories for journal
app.get('/api/journal/stories', async (req, res) => {
  try {
    const themeFilter = req.query.theme;
    const stories = await readData(STORIES_FILE);
    const authors = await readData(AUTHORS_FILE);

    let filteredStories = stories;

    if (themeFilter) {
      filteredStories = stories.filter(story =>
        story.theme &&
        story.theme.toLowerCase() === themeFilter.toLowerCase()
      );
    }

    const storiesWithAuthors = filteredStories.map(story => {
      const author = authors.find(a => a.id === story.authorId);
      return {
        ...story,
        authorName: author?.name || 'Anonymous',
        authorImage: author?.image || 'https://i.pravatar.cc/150?u=anonymous'
      };
    });

    res.json({
      success: true,
      stories: storiesWithAuthors
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false });
  }
});



// API endpoint to get themes for sidebar
app.get('/api/journal/themes', async (req, res) => {
  try {
    const stories = await readData(STORIES_FILE);
    const themes = [...new Set(stories.map(s => s.theme).filter(Boolean))];
    const authors = await readData(AUTHORS_FILE);
    
    res.json({
      success: true,
      themes: themes,
      stats: {
        totalStories: stories.length,
        totalAuthors: authors.length,
        totalThemes: themes.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API to submit a new story
app.post('/api/stories', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ success: false, error: 'Please login to submit a story' });
    }
    
    const { title, content, theme, mood, excerpt, image } = req.body;
    
    if (!title || !content) {
      return res.status(400).json({ success: false, error: 'Title and content are required' });
    }
    
    // Get the author
    const authors = await readData(AUTHORS_FILE);
    const author = authors.find(a => a.userId === req.session.user.id);
    
    if (!author) {
      return res.status(404).json({ success: false, error: 'Author profile not found' });
    }
    
    // Read existing stories
    const stories = await readData(STORIES_FILE);
    
    // Create new story
    const newStory = {
      id: stories.length > 0 ? Math.max(...stories.map(s => s.id)) + 1 : 1,
      title,
      content,
      excerpt: excerpt || content.substring(0, 150) + '...',
      theme: theme || 'Uncategorized',
      mood: mood || 'Reflective',
      authorId: author.id,
      authorName: author.name,
      date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      readTime: Math.ceil(content.split(' ').length / 200) || 3, // 200 words per minute
      views: 0,
      image: image || `https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=600&q=60&t=${Date.now()}`
    };
    
    // Add to stories
    stories.push(newStory);
    await writeData(STORIES_FILE, stories);
    
    // Update author's story count
    author.storyCount = (author.storyCount || 0) + 1;
    await writeData(AUTHORS_FILE, authors);
    
    res.json({
      success: true,
      story: newStory,
      message: 'Story published successfully!'
    });
    
  } catch (error) {
    console.error('Error submitting story:', error);
    res.status(500).json({ success: false, error: 'Failed to submit story' });
  }
});

// Get all themes for the form
app.get('/api/themes', async (req, res) => {
  try {
    const themes = await readData(THEMES_FILE);
    res.json({ success: true, themes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Themes page
app.get('/themes', async (req, res) => {
  try {
    const themes = await readData(THEMES_FILE);
    res.render('themes', { 
      pageTitle: 'Themes', 
      pageType: 'themes', 
      themes, 
      user: req.user || null 
    });
  } catch (err) {
    res.status(500).send('Server error');
  }
});

// Single theme detail
app.get('/themes/:slug', async (req, res) => {
  try {
    const themes = await readData(THEMES_FILE);
    const theme = themes.find(t => t.slug === req.params.slug);
    if(!theme) return res.status(404).send('Theme not found');

    res.render('themes', { 
      pageTitle: theme.name, 
      pageType: 'themeDetail', 
      theme, 
      user: req.user || null 
    });
  } catch(err) {
    res.status(500).send('Server error');
  }
});


// Author page
app.get('/author/:id', async (req, res) => {
  try {
    const authors = await readData(AUTHORS_FILE);
    const author = authors.find(a => a.id === parseInt(req.params.id));

    if (!author) {
      return res.status(404).send('Author not found');
    }

    // Add the author's stories
    const stories = await readData(STORIES_FILE);
    const authorStories = stories.filter(s => s.authorId === author.id);

    // Add storyCount for convenience
    author.stories = authorStories;
    author.storyCount = authorStories.length;

    res.render('author', {
      author,
      user: req.user || null
    });
  } catch (error) {
    console.error('Author page error:', error);
    res.status(500).send('Server error');
  }
});


// Serve all HTML files
app.get('*.html', (req, res) => {
  const filePath = path.join(__dirname, '../frontend', req.path);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).send(`
        <html>
        <body style="background: #1f1f1f; color: white; padding: 2rem; font-family: sans-serif;">
          <h1 style="color: #d2b48c;">Page not found</h1>
          <a href="/" style="color: #d2b48c;">← Back to Home</a>
        </body>
        </html>
      `);
    }
  });
});

// User profile page (their own profile)
app.get('/profile', async (req, res) => {
  if (!req.session.user) return res.redirect('/LoginPage.html');

  const authors = await readData(AUTHORS_FILE);
  const author = authors.find(a => a.userId === req.session.user.id);

  if (!author) return res.status(404).send('Profile not found');

  const stories = await readData(STORIES_FILE);
  author.stories = stories.filter(s => s.authorId === author.id);

  res.render('profile', { author, user: req.session.user });
});


// API to update profile
app.post('/api/profile/update', async (req, res) => {
  try {
    if (!req.session.user) {
      return res.status(401).json({ error: 'Not logged in' });
    }
    
    const { bio, role, location } = req.body;
    const authors = await readData(AUTHORS_FILE);
    const authorIndex = authors.findIndex(a => a.userId === req.session.user.id);
    
    if (authorIndex !== -1) {
      authors[authorIndex].bio = bio || authors[authorIndex].bio;
      authors[authorIndex].role = role || authors[authorIndex].role;
      authors[authorIndex].location = location || authors[authorIndex].location;
      
      await writeData(AUTHORS_FILE, authors);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Author not found' });
    }
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Write story page
app.get('/write', async (req, res) => {
  if (!req.session.user) return res.redirect('/LoginPage.html');

  const themes = await readData(THEMES_FILE);
  res.render('write', { themes });
});

//GET SIGNUP
app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/SignUpPage.html'));
});



// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'API is working',
    timestamp: new Date().toISOString()
  });
});


// Initialize and start server
async function startServer() {
  await initializeDataFiles();
  
  app.listen(PORT, () => {
    console.log(`✅ Server running at http://localhost:${PORT}`);
    console.log(`📁 Data directory: ${DATA_DIR}`);
    console.log('\n📚 API Endpoints:');
    console.log('  GET  /api/themes              - Get all themes');
    console.log('  GET  /api/stories             - Get all stories');
    console.log('  GET  /api/stories/featured    - Get featured story');
    console.log('  GET  /api/stories/:id         - Get story by ID');
    console.log('  GET  /api/authors             - Get all authors');
    console.log('  GET  /api/authors/:id         - Get author by ID');
    console.log('  POST /api/login               - Login');
    console.log('  GET  /api/logout              - Logout');
    console.log('\n🌐 Pages:');
    console.log('  GET  /                        - Home page');
    console.log('  GET  /story/:id               - Story page');
    console.log('  GET  /themes                  - Themes page');
    console.log('  GET  /author/:id              - Author page');
    console.log('\n🔑 Test login:');
    console.log('  Email: a.mori@example.com');
    console.log('  Password: password123');
  });
}

startServer();
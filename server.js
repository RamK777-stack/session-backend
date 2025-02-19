const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();
const app = express();
const SECRET_KEY = process.env.JWT_SECRET_KEY;
const PORT = process.env.PORT || 3000;
const inactivityTimeout = process.env.IN_ACTIVE_TIME_TIMEOUT

// Session storage
let userSessions = {};

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: 'http://localhost:5173', // Vite's default port
  credentials: true
}));

// Activity tracking middleware
const trackActivity = (req, res, next) => {
  const token = req.cookies.auth_token;
  if (token) {
    try {
      const user = jwt.decode(token);
      const now = Date.now();
      if (!userSessions[user.username]) {
        userSessions[user.username] = { lastActivity: now };
      } else {
        const inactivityPeriod = now - userSessions[user.username].lastActivity;
        if (inactivityPeriod > inactivityTimeout) { // 15 minutes
          delete userSessions[user.username];
          res.clearCookie('auth_token');
          return res.status(401).json({ message: 'Session expired due to inactivity' });
        }
        userSessions[user.username].lastActivity = now;
      }
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  }
  next();
};

app.use(trackActivity);

// Login route
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  // Simple validation (replace with real authentication in production)
  if (username === 'user' && password === 'password') {
    const token = jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' });
    
    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax', // Changed to Lax for development
      maxAge: 60 * 60 * 1000 // 1 hour
    });

    userSessions[username] = { lastActivity: Date.now() };
    return res.status(200).json({ message: 'Login successful', username });
  }
  
  return res.status(401).json({ message: 'Invalid credentials' });
});

// Protected route
app.get('/protected', (req, res) => {
  const token = req.cookies.auth_token;
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' });
    }
    return res.status(200).json({ 
      message: 'Protected content', 
      user: decoded,
      lastActivity: userSessions[decoded.username]?.lastActivity 
    });
  });
});

// Logout route
app.post('/logout', (req, res) => {
  const token = req.cookies.auth_token;
  if (token) {
    try {
      const user = jwt.decode(token);
      delete userSessions[user.username];
    } catch (err) {
      // Ignore token decode errors on logout
    }
  }
  res.clearCookie('auth_token');
  return res.status(200).json({ message: 'Logged out successfully' });
});

// Session status route
app.get('/session-status', (req, res) => {
  const token = req.cookies.auth_token;
  if (!token) {
    return res.status(401).json({ isActive: false });
  }

  try {
    const decoded = jwt.verify(token, SECRET_KEY);
    const session = userSessions[decoded.username];
    
    if (!session) {
      return res.status(401).json({ isActive: false });
    }

    const inactivityPeriod = Date.now() - session.lastActivity;
    const isActive = inactivityPeriod <= inactivityTimeout;

    return res.json({ 
      isActive,
      remainingTime: isActive ? inactivityTimeout - inactivityPeriod : 0
    });
  } catch (err) {
    return res.status(401).json({ isActive: false });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
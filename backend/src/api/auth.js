import express from 'express';
import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * User Schema for authentication
 */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[\w.-]+@[\w.-]+\.\w+$/, 'Invalid email format']
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [255, 'Name cannot exceed 255 characters']
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'viewer'],
        message: 'Role must be either admin or viewer'
      },
      default: 'viewer'
    },
    providerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Provider',
      default: null,
      sparse: true
    },
    active: {
      type: Boolean,
      default: true
    },
    lastLogin: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    collection: 'users'
  }
);

// Index for efficient queries
userSchema.index({ email: 1 });
userSchema.index({ providerId: 1 });

// Pre-save middleware to hash password
userSchema.pre('save', async function (next) {
  // Only hash password if it has been modified
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcryptjs.genSalt(10);
    this.password = await bcryptjs.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcryptjs.compare(candidatePassword, this.password);
};

// Method to generate JWT token
userSchema.methods.generateToken = function () {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }

  return jwt.sign(
    {
      userId: this._id.toString(),
      email: this.email,
      role: this.role,
      providerId: this.providerId
    },
    secret,
    { expiresIn: '24h' }
  );
};

const User = mongoose.model('User', userSchema);

/**
 * JWT Middleware - verify token from Authorization header
 */
export const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No authorization header provided'
      });
    }

    const token = authHeader.split(' ')[1]; // Extract token after "Bearer "
    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid authorization header format'
      });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      logger.error('JWT_SECRET not configured');
      return res.status(500).json({
        error: 'Server error',
        message: 'Authentication not properly configured'
      });
    }

    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Your session has expired. Please login again.'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Your token is invalid or malformed'
      });
    }

    logger.error('Token verification error', {
      error: error.message
    });

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Could not verify authentication'
    });
  }
};

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Email and password are required'
      });
    }

    // Find user (include password field)
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      logger.warn('Login attempt with non-existent email', { email });
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Check if user is active
    if (!user.active) {
      logger.warn('Login attempt with inactive account', { email });
      return res.status(401).json({
        error: 'Account disabled',
        message: 'Your account has been disabled. Please contact support.'
      });
    }

    // Compare passwords
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      logger.warn('Login attempt with incorrect password', { email });
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect'
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = user.generateToken();

    logger.info('User logged in successfully', {
      userId: user._id.toString(),
      email: user.email
    });

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        userId: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        providerId: user.providerId
      }
    });
  } catch (error) {
    logger.error('Login error', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Server error',
      message: 'An error occurred during login'
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user data (requires JWT)
 */
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        error: 'Not found',
        message: 'User not found'
      });
    }

    res.status(200).json({
      user: {
        userId: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        providerId: user.providerId,
        active: user.active,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    logger.error('Error fetching current user', {
      userId: req.user.userId,
      error: error.message
    });

    res.status(500).json({
      error: 'Server error',
      message: 'Could not fetch user information'
    });
  }
});

/**
 * POST /api/auth/register (admin only - for creating users)
 * This is typically used by admins to create new users
 */
router.post('/register', verifyToken, async (req, res) => {
  try {
    // Only admins can create users
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only admins can create new users'
      });
    }

    const { email, password, name, role, providerId } = req.body;

    // Validate input
    if (!email || !password || !name) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Email, password, and name are required'
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Bad request',
        message: 'Password must be at least 8 characters'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A user with this email already exists'
      });
    }

    // Create new user
    const newUser = new User({
      email,
      password,
      name,
      role: role || 'viewer',
      providerId: providerId || null
    });

    await newUser.save();

    logger.info('New user created', {
      userId: newUser._id.toString(),
      email: newUser.email,
      role: newUser.role,
      createdBy: req.user.userId
    });

    res.status(201).json({
      message: 'User created successfully',
      user: {
        userId: newUser._id,
        email: newUser.email,
        name: newUser.name,
        role: newUser.role,
        providerId: newUser.providerId
      }
    });
  } catch (error) {
    logger.error('Error creating user', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Server error',
      message: 'Could not create user'
    });
  }
});

export { router, User };

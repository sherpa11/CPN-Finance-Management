const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logAuditEvent } = require('../services/auditService');

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required.',
      });
    }

    let user = await User.findOne({
      $or: [
        { username: username.toLowerCase().trim() },
        { email: username.toLowerCase().trim() },
      ],
    });

    if (!user) {
      // Auto-bootstrap official admin and default configurations if fresh database
      const totalUsers = await User.countDocuments();
      if (totalUsers === 0 && username.toLowerCase().trim() === 'cpnraja') {
        const bcrypt = require('bcryptjs');
        const defaultHash = await bcrypt.hash('cpnraja2026', 10);
        user = await User.create({
          username: 'cpnraja',
          email: 'admin@cpnraja.com',
          fullName: 'CPN Raja',
          passwordHash: defaultHash,
          role: 'admin',
          isActive: true,
        });

        // Ensure calculation configurations exist
        try {
          const CalculationConfiguration = require('../models/CalculationConfiguration');
          const CONSTANTS = require('../config/constants');
          const configCount = await CalculationConfiguration.countDocuments();
          if (configCount === 0) {
            await CalculationConfiguration.create([
              {
                configType: 'MONTHLY',
                isActive: true,
                isPendingOwnerConfirmation: true,
                description: 'Monthly simple interest with configurable partial month rule.',
                settings: {
                  partialMonthRule: CONSTANTS.MONTHLY_PARTIAL_RULES.PRO_RATA_DAILY,
                  isSimpleInterest: true,
                  leapYearAware: true,
                  defaultInterestRatePercent: 2.0,
                },
              },
              {
                configType: 'DAILY',
                isActive: true,
                isPendingOwnerConfirmation: false,
                description: 'Daily simple interest with Asia/Kolkata date handling.',
                settings: {
                  dateInclusionConvention: CONSTANTS.DAILY_INCLUSION_CONVENTIONS.INCLUDE_START_EXCLUDE_END,
                  isSimpleInterest: true,
                  defaultInterestRatePercent: 0.1,
                },
              },
              {
                configType: 'DAILY_COLLECTION_70',
                isActive: true,
                isPendingOwnerConfirmation: false,
                description: 'Daily Collection Scheme A (70 Calendar Days). Upfront interest deduction, 70 equal daily instalments.',
                settings: {
                  scheme: 'SCHEME_A',
                  durationDays: 70,
                  defaultInterestRatePercent: 10.0,
                },
              },
              {
                configType: 'DAILY_COLLECTION_100',
                isActive: true,
                isPendingOwnerConfirmation: false,
                description: 'Daily Collection Scheme A (100 Calendar Days). Upfront interest deduction, 100 equal daily instalments.',
                settings: {
                  scheme: 'SCHEME_A',
                  durationDays: 100,
                  defaultInterestRatePercent: 10.0,
                },
              },
            ]);
          }
        } catch (cErr) {
          console.error('[Bootstrap] Config init note:', cErr.message);
        }
      } else {
        return res.status(401).json({
          success: false,
          message: 'Invalid username or password.',
        });
      }
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account is disabled. Please contact administrator.',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password.',
      });
    }

    user.lastLogin = new Date();
    await user.save();

    const secret = process.env.JWT_SECRET || 'cpn_raja_super_secure_financial_jwt_secret_key_2026';
    const token = jwt.sign(
      {
        userId: user._id,
        username: user.username,
        role: user.role,
      },
      secret,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    await logAuditEvent({
      action: 'USER_LOGIN',
      entityType: 'USER',
      entityId: user._id,
      performedBy: user.username,
      ipAddress: req.ip,
      details: 'User logged in successfully',
    });

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
};

const getCurrentUser = async (req, res, next) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user._id,
        username: req.user.username,
        fullName: req.user.fullName,
        email: req.user.email,
        role: req.user.role,
        lastLogin: req.user.lastLogin,
      },
    });
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Both current password and new password are required.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long.',
      });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Current password does not match.',
      });
    }

    user.passwordHash = newPassword;
    await user.save();

    await logAuditEvent({
      action: 'CHANGE_PASSWORD',
      entityType: 'USER',
      entityId: user._id,
      performedBy: user.username,
      ipAddress: req.ip,
      details: 'Password updated successfully',
    });

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  getCurrentUser,
  changePassword,
};

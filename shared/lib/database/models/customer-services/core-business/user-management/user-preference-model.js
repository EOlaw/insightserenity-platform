'use strict';

/**
 * @fileoverview Comprehensive user preference model for interface, display, and interaction customization
 * @module shared/lib/database/models/users/user-preference-model
 * @requires mongoose
 * @requires module:shared/lib/database/models/base-model
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/validators/common-validators
 */

const mongoose = require('mongoose');
const BaseModel = require('../base-model');
const logger = require('../../../utils/logger');
const { AppError } = require('../../../utils/app-error');

// Enhanced fallback validators with proper function definitions
let validators;
try {
  validators = require('../../../utils/validators/common-validators');
} catch (error) {
  logger.warn('Common validators not available, using fallback validators');
  
  validators = {
    isEmail: function(email) {
      if (!email || typeof email !== 'string') return false;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email.trim());
    },
    isURL: function(url) {
      if (!url || typeof url !== 'string') return false;
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    },
    isHexColor: function(color) {
      if (!color || typeof color !== 'string') return false;
      return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
    }
  };
}

// Ensure validators are functions and provide safe defaults
const safeValidators = {
  isEmail: typeof validators.isEmail === 'function' ? validators.isEmail : (email) => {
    if (!email || typeof email !== 'string') return false;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  },
  isURL: typeof validators.isURL === 'function' ? validators.isURL : (url) => {
    if (!url || typeof url !== 'string') return false;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  },
  isHexColor: typeof validators.isHexColor === 'function' ? validators.isHexColor : (color) => {
    if (!color || typeof color !== 'string') return false;
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  }
};

/**
 * User preference schema definition
 */
const userPreferenceSchemaDefinition = {
  // ==================== User Reference ====================
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true
  },

  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true
  },

  // ==================== Interface & Display Preferences ====================
  interface: {
    theme: {
      mode: {
        type: String,
        enum: ['light', 'dark', 'auto', 'high_contrast', 'custom'],
        default: 'auto'
      },
      colorScheme: {
        primary: {
          type: String,
          default: '#007bff',
          validate: [safeValidators.isHexColor, 'Invalid hex color format']
        },
        secondary: {
          type: String,
          default: '#6c757d',
          validate: [safeValidators.isHexColor, 'Invalid hex color format']
        },
        accent: {
          type: String,
          default: '#28a745',
          validate: [safeValidators.isHexColor, 'Invalid hex color format']
        },
        background: {
          type: String,
          default: '#ffffff',
          validate: [safeValidators.isHexColor, 'Invalid hex color format']
        },
        text: {
          type: String,
          default: '#212529',
          validate: [safeValidators.isHexColor, 'Invalid hex color format']
        }
      },
      customThemes: [{
        name: String,
        description: String,
        colors: {
          type: Map,
          of: {
            type: String,
            validate: [safeValidators.isHexColor, 'Invalid hex color format']
          }
        },
        isDefault: Boolean,
        createdAt: Date,
        lastUsed: Date
      }]
    },

    layout: {
      density: {
        type: String,
        enum: ['compact', 'comfortable', 'spacious'],
        default: 'comfortable'
      },
      sidebarPosition: {
        type: String,
        enum: ['left', 'right'],
        default: 'left'
      },
      sidebarCollapsed: {
        type: Boolean,
        default: false
      },
      headerFixed: {
        type: Boolean,
        default: true
      },
      footerVisible: {
        type: Boolean,
        default: true
      },
      breadcrumbVisible: {
        type: Boolean,
        default: true
      },
      fullWidth: {
        type: Boolean,
        default: false
      },
      cardShadows: {
        type: Boolean,
        default: true
      },
      animations: {
        enabled: {
          type: Boolean,
          default: true
        },
        speed: {
          type: String,
          enum: ['slow', 'normal', 'fast'],
          default: 'normal'
        },
        transitions: {
          type: Boolean,
          default: true
        }
      }
    },

    typography: {
      fontFamily: {
        type: String,
        enum: ['system', 'inter', 'roboto', 'open_sans', 'lato', 'source_sans', 'custom'],
        default: 'system'
      },
      customFontFamily: String,
      fontSize: {
        type: String,
        enum: ['xs', 'sm', 'base', 'lg', 'xl'],
        default: 'base'
      },
      fontWeight: {
        type: String,
        enum: ['light', 'normal', 'medium', 'semibold', 'bold'],
        default: 'normal'
      },
      lineHeight: {
        type: String,
        enum: ['tight', 'normal', 'relaxed', 'loose'],
        default: 'normal'
      },
      letterSpacing: {
        type: String,
        enum: ['tight', 'normal', 'wide'],
        default: 'normal'
      }
    },

    dashboard: {
      defaultView: {
        type: String,
        enum: ['overview', 'analytics', 'tasks', 'calendar', 'recent', 'custom'],
        default: 'overview'
      },
      widgetLayout: [{
        widgetId: String,
        position: {
          x: Number,
          y: Number,
          w: Number,
          h: Number
        },
        visible: {
          type: Boolean,
          default: true
        },
        settings: mongoose.Schema.Types.Mixed
      }],
      refreshInterval: {
        type: Number,
        default: 300, // 5 minutes in seconds
        min: 30,
        max: 3600
      },
      autoRefresh: {
        type: Boolean,
        default: true
      }
    }
  },

  // ==================== Notification Preferences ====================
  notifications: {
    email: {
      enabled: {
        type: Boolean,
        default: true
      },
      frequency: {
        type: String,
        enum: ['immediate', 'hourly', 'daily', 'weekly', 'never'],
        default: 'immediate'
      },
      quietHours: {
        enabled: {
          type: Boolean,
          default: false
        },
        start: {
          type: String,
          default: '22:00'
        },
        end: {
          type: String,
          default: '08:00'
        },
        timezone: String
      },
      categories: {
        security: {
          enabled: {
            type: Boolean,
            default: true
          },
          priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'high'
          }
        },
        system: {
          enabled: {
            type: Boolean,
            default: true
          },
          priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'medium'
          }
        },
        social: {
          enabled: {
            type: Boolean,
            default: true
          },
          priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'low'
          }
        },
        marketing: {
          enabled: {
            type: Boolean,
            default: false
          },
          priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'low'
          }
        },
        billing: {
          enabled: {
            type: Boolean,
            default: true
          },
          priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'high'
          }
        },
        updates: {
          enabled: {
            type: Boolean,
            default: true
          },
          priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'medium'
          }
        },
        mentions: {
          enabled: {
            type: Boolean,
            default: true
          },
          priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'medium'
          }
        },
        tasks: {
          enabled: {
            type: Boolean,
            default: true
          },
          priority: {
            type: String,
            enum: ['low', 'medium', 'high', 'critical'],
            default: 'medium'
          }
        }
      },
      digest: {
        enabled: {
          type: Boolean,
          default: true
        },
        frequency: {
          type: String,
          enum: ['daily', 'weekly', 'monthly'],
          default: 'weekly'
        },
        dayOfWeek: {
          type: Number,
          default: 1, // Monday
          min: 0,
          max: 6
        },
        time: {
          type: String,
          default: '09:00'
        }
      }
    },

    push: {
      enabled: {
        type: Boolean,
        default: true
      },
      devices: [{
        deviceId: String,
        deviceName: String,
        platform: {
          type: String,
          enum: ['ios', 'android', 'web', 'desktop']
        },
        token: String,
        enabled: {
          type: Boolean,
          default: true
        },
        lastUsed: Date
      }],
      categories: {
        security: {
          type: Boolean,
          default: true
        },
        mentions: {
          type: Boolean,
          default: true
        },
        messages: {
          type: Boolean,
          default: true
        },
        tasks: {
          type: Boolean,
          default: true
        },
        updates: {
          type: Boolean,
          default: false
        }
      },
      sounds: {
        enabled: {
          type: Boolean,
          default: true
        },
        volume: {
          type: Number,
          default: 0.8,
          min: 0,
          max: 1
        },
        customSounds: [{
          category: String,
          soundFile: String,
          enabled: Boolean
        }]
      },
      badges: {
        enabled: {
          type: Boolean,
          default: true
        },
        showCount: {
          type: Boolean,
          default: true
        }
      }
    },

    inApp: {
      enabled: {
        type: Boolean,
        default: true
      },
      position: {
        type: String,
        enum: ['top-right', 'top-left', 'bottom-right', 'bottom-left', 'center'],
        default: 'top-right'
      },
      duration: {
        type: Number,
        default: 5000, // 5 seconds
        min: 1000,
        max: 30000
      },
      playSound: {
        type: Boolean,
        default: true
      },
      showAvatar: {
        type: Boolean,
        default: true
      },
      maxVisible: {
        type: Number,
        default: 5,
        min: 1,
        max: 10
      },
      categories: {
        security: {
          type: Boolean,
          default: true
        },
        system: {
          type: Boolean,
          default: true
        },
        social: {
          type: Boolean,
          default: true
        },
        tasks: {
          type: Boolean,
          default: true
        },
        mentions: {
          type: Boolean,
          default: true
        }
      }
    },

    sms: {
      enabled: {
        type: Boolean,
        default: false
      },
      phoneNumber: String,
      categories: {
        security: {
          type: Boolean,
          default: true
        },
        critical: {
          type: Boolean,
          default: true
        },
        billing: {
          type: Boolean,
          default: false
        }
      },
      timeRestrictions: {
        enabled: {
          type: Boolean,
          default: true
        },
        allowedHours: {
          start: {
            type: String,
            default: '08:00'
          },
          end: {
            type: String,
            default: '22:00'
          }
        },
        timezone: String
      }
    }
  },

  // ==================== Language & Localization ====================
  localization: {
    language: {
      type: String,
      default: 'en',
      enum: ['en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ar', 'ru', 'hi', 'nl', 'sv', 'no', 'da', 'fi']
    },
    region: {
      type: String,
      default: 'US'
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    dateFormat: {
      type: String,
      enum: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'DD.MM.YYYY', 'MM-DD-YYYY'],
      default: 'MM/DD/YYYY'
    },
    timeFormat: {
      type: String,
      enum: ['12h', '24h'],
      default: '12h'
    },
    numberFormat: {
      type: String,
      enum: ['1,234.56', '1.234,56', '1 234,56', '1234.56'],
      default: '1,234.56'
    },
    currency: {
      code: {
        type: String,
        default: 'USD'
      },
      symbol: {
        type: String,
        default: '$'
      },
      position: {
        type: String,
        enum: ['before', 'after'],
        default: 'before'
      }
    },
    firstDayOfWeek: {
      type: Number,
      default: 0, // Sunday
      min: 0,
      max: 6
    },
    measurementSystem: {
      type: String,
      enum: ['metric', 'imperial'],
      default: 'metric'
    }
  },

  // ==================== Accessibility Preferences ====================
  accessibility: {
    screenReader: {
      enabled: {
        type: Boolean,
        default: false
      },
      announcements: {
        navigation: {
          type: Boolean,
          default: true
        },
        notifications: {
          type: Boolean,
          default: true
        },
        errors: {
          type: Boolean,
          default: true
        },
        success: {
          type: Boolean,
          default: true
        }
      },
      verbosity: {
        type: String,
        enum: ['minimal', 'normal', 'verbose'],
        default: 'normal'
      }
    },

    visual: {
      highContrast: {
        enabled: {
          type: Boolean,
          default: false
        },
        level: {
          type: String,
          enum: ['AA', 'AAA'],
          default: 'AA'
        }
      },
      colorBlindness: {
        type: {
          type: String,
          enum: ['none', 'protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'],
          default: 'none'
        },
        simulation: {
          type: Boolean,
          default: false
        }
      },
      focusIndicators: {
        enhanced: {
          type: Boolean,
          default: false
        },
        thickness: {
          type: Number,
          default: 2,
          min: 1,
          max: 5
        },
        color: {
          type: String,
          default: '#007bff',
          validate: [safeValidators.isHexColor, 'Invalid hex color format']
        }
      },
      textScaling: {
        factor: {
          type: Number,
          default: 1.0,
          min: 0.8,
          max: 2.0
        },
        lineHeight: {
          type: Number,
          default: 1.4,
          min: 1.0,
          max: 2.0
        }
      }
    },

    motor: {
      reducedMotion: {
        type: Boolean,
        default: false
      },
      stickyHover: {
        type: Boolean,
        default: false
      },
      clickDelay: {
        type: Number,
        default: 0,
        min: 0,
        max: 1000
      },
      largerClickTargets: {
        type: Boolean,
        default: false
      }
    },

    cognitive: {
      simplifiedInterface: {
        type: Boolean,
        default: false
      },
      reducedAnimations: {
        type: Boolean,
        default: false
      },
      extendedTimeouts: {
        type: Boolean,
        default: false
      },
      confirmationDialogs: {
        type: Boolean,
        default: false
      }
    },

    keyboard: {
      navigation: {
        enabled: {
          type: Boolean,
          default: true
        },
        skipLinks: {
          type: Boolean,
          default: true
        },
        shortcuts: {
          enabled: {
            type: Boolean,
            default: true
          },
          customShortcuts: [{
            action: String,
            keys: String,
            description: String,
            enabled: Boolean
          }]
        }
      },
      tabOrder: {
        type: String,
        enum: ['default', 'custom'],
        default: 'default'
      }
    }
  },

  // ==================== Content & Display Preferences ====================
  content: {
    filtering: {
      profanityFilter: {
        enabled: {
          type: Boolean,
          default: false
        },
        level: {
          type: String,
          enum: ['mild', 'moderate', 'strict'],
          default: 'moderate'
        }
      },
      contentRating: {
        enabled: {
          type: Boolean,
          default: false
        },
        maxRating: {
          type: String,
          enum: ['G', 'PG', 'PG-13', 'R', 'NC-17'],
          default: 'PG-13'
        }
      },
      topicFilters: [{
        topic: String,
        action: {
          type: String,
          enum: ['hide', 'warn', 'allow']
        },
        enabled: Boolean
      }]
    },

    display: {
      itemsPerPage: {
        type: Number,
        default: 25,
        min: 10,
        max: 100
      },
      imageLoading: {
        type: String,
        enum: ['auto', 'lazy', 'eager'],
        default: 'lazy'
      },
      imageQuality: {
        type: String,
        enum: ['low', 'medium', 'high', 'auto'],
        default: 'auto'
      },
      autoPlay: {
        videos: {
          type: Boolean,
          default: false
        },
        audio: {
          type: Boolean,
          default: false
        },
        gifs: {
          type: Boolean,
          default: true
        }
      },
      thumbnails: {
        enabled: {
          type: Boolean,
          default: true
        },
        size: {
          type: String,
          enum: ['small', 'medium', 'large'],
          default: 'medium'
        }
      }
    },

    sorting: {
      defaultSort: {
        type: String,
        enum: ['newest', 'oldest', 'popularity', 'relevance', 'alphabetical'],
        default: 'newest'
      },
      rememberSort: {
        type: Boolean,
        default: true
      },
      grouping: {
        enabled: {
          type: Boolean,
          default: false
        },
        defaultGroup: String
      }
    }
  },

  // ==================== Communication Preferences ====================
  communication: {
    status: {
      defaultStatus: {
        type: String,
        enum: ['online', 'away', 'busy', 'invisible'],
        default: 'online'
      },
      autoAway: {
        enabled: {
          type: Boolean,
          default: true
        },
        timeout: {
          type: Number,
          default: 10, // minutes
          min: 1,
          max: 60
        }
      },
      customStatuses: [{
        name: String,
        emoji: String,
        message: String,
        duration: Number, // minutes, null for indefinite
        enabled: Boolean
      }]
    },

    messaging: {
      readReceipts: {
        type: Boolean,
        default: true
      },
      typingIndicators: {
        type: Boolean,
        default: true
      },
      onlineStatus: {
        type: Boolean,
        default: true
      },
      messagePreview: {
        type: Boolean,
        default: true
      },
      soundOnMessage: {
        type: Boolean,
        default: true
      },
      enterToSend: {
        type: Boolean,
        default: true
      },
      richText: {
        type: Boolean,
        default: true
      },
      linkPreviews: {
        type: Boolean,
        default: true
      }
    },

    contacts: {
      showOnlineStatus: {
        type: Boolean,
        default: true
      },
      allowContactRequests: {
        type: Boolean,
        default: true
      },
      autoAcceptFromOrganization: {
        type: Boolean,
        default: true
      },
      publicProfile: {
        type: Boolean,
        default: false
      }
    }
  },

  // ==================== Privacy Preferences ====================
  privacy: {
    profile: {
      visibility: {
        type: String,
        enum: ['public', 'organization', 'connections', 'private'],
        default: 'organization'
      },
      showEmail: {
        type: String,
        enum: ['public', 'organization', 'connections', 'private'],
        default: 'private'
      },
      showPhone: {
        type: String,
        enum: ['public', 'organization', 'connections', 'private'],
        default: 'private'
      },
      showLocation: {
        type: String,
        enum: ['public', 'organization', 'connections', 'private'],
        default: 'organization'
      },
      showActivity: {
        type: String,
        enum: ['public', 'organization', 'connections', 'private'],
        default: 'connections'
      }
    },

    activity: {
      trackingConsent: {
        analytics: {
          type: Boolean,
          default: true
        },
        performance: {
          type: Boolean,
          default: true
        },
        marketing: {
          type: Boolean,
          default: false
        },
        personalization: {
          type: Boolean,
          default: true
        },
        thirdParty: {
          type: Boolean,
          default: false
        }
      },
      sessionRecording: {
        type: Boolean,
        default: false
      },
      searchHistory: {
        type: Boolean,
        default: true
      },
      viewHistory: {
        type: Boolean,
        default: true
      }
    },

    sharing: {
      allowMentions: {
        type: String,
        enum: ['everyone', 'organization', 'connections', 'nobody'],
        default: 'organization'
      },
      allowDirectMessages: {
        type: String,
        enum: ['everyone', 'organization', 'connections', 'nobody'],
        default: 'organization'
      },
      sharePresence: {
        type: Boolean,
        default: true
      },
      shareTelemetry: {
        type: Boolean,
        default: true
      }
    }
  },

  // ==================== Workflow Preferences ====================
  workflow: {
    defaultViews: {
      calendar: {
        type: String,
        enum: ['month', 'week', 'day', 'agenda'],
        default: 'week'
      },
      tasks: {
        type: String,
        enum: ['list', 'board', 'calendar', 'timeline'],
        default: 'list'
      },
      files: {
        type: String,
        enum: ['grid', 'list', 'tree'],
        default: 'grid'
      }
    },

    autoSave: {
      enabled: {
        type: Boolean,
        default: true
      },
      interval: {
        type: Number,
        default: 30, // seconds
        min: 5,
        max: 300
      }
    },

    collaboration: {
      defaultSharePermission: {
        type: String,
        enum: ['view', 'comment', 'edit', 'admin'],
        default: 'view'
      },
      requireApproval: {
        type: Boolean,
        default: false
      },
      notifyOnShare: {
        type: Boolean,
        default: true
      },
      showEditHistory: {
        type: Boolean,
        default: true
      }
    },

    shortcuts: {
      enabled: {
        type: Boolean,
        default: true
      },
      customShortcuts: [{
        action: String,
        keys: String,
        context: String,
        enabled: Boolean
      }]
    }
  },

  // ==================== Custom Preferences ====================
  custom: {
    organizationPreferences: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },
    
    applicationPreferences: {
      type: Map,
      of: mongoose.Schema.Types.Mixed
    },

    userDefinedPreferences: [{
      key: String,
      value: mongoose.Schema.Types.Mixed,
      type: {
        type: String,
        enum: ['string', 'number', 'boolean', 'object', 'array']
      },
      category: String,
      description: String,
      isPublic: Boolean
    }]
  },

  // ==================== Metadata ====================
  metadata: {
    version: {
      type: Number,
      default: 1
    },
    lastSyncedAt: Date,
    syncedFrom: String,
    isDefault: {
      type: Boolean,
      default: false
    },
    inheritFromOrganization: {
      type: Boolean,
      default: true
    },
    overrides: [{
      key: String,
      originalValue: mongoose.Schema.Types.Mixed,
      overriddenAt: Date,
      reason: String
    }],
    presetName: String,
    tags: [String]
  }
};

// Create schema
const userPreferenceSchema = BaseModel.createSchema(userPreferenceSchemaDefinition, {
  collection: 'user_preferences',
  timestamps: true
});

// ==================== Indexes ====================
userPreferenceSchema.index({ userId: 1 });
userPreferenceSchema.index({ organizationId: 1 });
userPreferenceSchema.index({ 'interface.theme.mode': 1 });
userPreferenceSchema.index({ 'localization.language': 1 });
userPreferenceSchema.index({ 'metadata.lastSyncedAt': -1 });
userPreferenceSchema.index({ 'metadata.tags': 1 });

// ==================== Virtual Fields ====================
userPreferenceSchema.virtual('isCustomized').get(function() {
  return !this.metadata.isDefault && this.metadata.overrides.length > 0;
});

userPreferenceSchema.virtual('darkModeEnabled').get(function() {
  return this.interface.theme.mode === 'dark' || 
         (this.interface.theme.mode === 'auto' && this.isDarkModeTime());
});

userPreferenceSchema.virtual('effectiveLanguage').get(function() {
  return this.localization.language || 'en';
});

userPreferenceSchema.virtual('effectiveTimezone').get(function() {
  return this.localization.timezone || 'UTC';
});

// ==================== Pre-save Middleware ====================
userPreferenceSchema.pre('save', async function(next) {
  try {
    // Update version on changes
    if (this.isModified() && !this.isNew) {
      this.metadata.version += 1;
    }

    // Set default metadata
    if (this.isNew) {
      this.metadata.lastSyncedAt = new Date();
    }

    // Validate color preferences
    this.validateColorScheme();

    // Update sync timestamp
    if (this.isModified()) {
      this.metadata.lastSyncedAt = new Date();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Instance Methods ====================
userPreferenceSchema.methods.validateColorScheme = function() {
  const colors = this.interface.theme.colorScheme;
  const requiredColors = ['primary', 'secondary', 'accent', 'background', 'text'];
  
  for (const colorName of requiredColors) {
    if (colors[colorName] && !safeValidators.isHexColor(colors[colorName])) {
      throw new AppError(`Invalid color format for ${colorName}`, 400, 'INVALID_COLOR_FORMAT');
    }
  }
  
  return true;
};

userPreferenceSchema.methods.isDarkModeTime = function() {
  if (this.interface.theme.mode !== 'auto') return false;
  
  const now = new Date();
  const hour = now.getHours();
  
  // Default auto dark mode from 6 PM to 6 AM
  return hour >= 18 || hour < 6;
};

userPreferenceSchema.methods.getEffectivePreferences = async function() {
  const preferences = this.toObject();
  
  // Apply organization defaults if inheritance is enabled
  if (this.metadata.inheritFromOrganization && this.organizationId) {
    try {
      const orgPrefs = await this.constructor.getOrganizationDefaults(this.organizationId);
      if (orgPrefs) {
        preferences = this.mergePreferences(orgPrefs, preferences);
      }
    } catch (error) {
      logger.warn('Failed to get organization defaults', { 
        organizationId: this.organizationId,
        error: error.message 
      });
    }
  }
  
  return preferences;
};

userPreferenceSchema.methods.mergePreferences = function(basePrefs, userPrefs) {
  const merge = (base, user) => {
    if (!base || typeof base !== 'object') return user;
    if (!user || typeof user !== 'object') return base;
    
    const result = { ...base };
    
    for (const key in user) {
      if (user[key] !== null && user[key] !== undefined) {
        if (typeof user[key] === 'object' && !Array.isArray(user[key])) {
          result[key] = merge(base[key], user[key]);
        } else {
          result[key] = user[key];
        }
      }
    }
    
    return result;
  };
  
  return merge(basePrefs, userPrefs);
};

userPreferenceSchema.methods.updatePreference = async function(path, value, reason = 'user_update') {
  const originalValue = this.get(path);
  
  // Record override if different from original
  if (JSON.stringify(originalValue) !== JSON.stringify(value)) {
    if (!this.metadata.overrides) this.metadata.overrides = [];
    
    this.metadata.overrides.push({
      key: path,
      originalValue,
      overriddenAt: new Date(),
      reason
    });
  }
  
  this.set(path, value);
  await this.save();
  
  return this;
};

userPreferenceSchema.methods.resetToDefaults = async function(category = null) {
  const defaults = await this.constructor.getDefaultPreferences();
  
  if (category) {
    if (defaults[category]) {
      this[category] = defaults[category];
    }
  } else {
    // Reset all preferences
    Object.assign(this, defaults);
    this.metadata.overrides = [];
    this.metadata.version = 1;
  }
  
  await this.save();
  return this;
};

userPreferenceSchema.methods.createCustomTheme = async function(themeData) {
  const { name, description, colors } = themeData;
  
  // Validate colors
  for (const [colorName, colorValue] of Object.entries(colors)) {
    if (!safeValidators.isHexColor(colorValue)) {
      throw new AppError(`Invalid color format for ${colorName}`, 400, 'INVALID_COLOR_FORMAT');
    }
  }
  
  if (!this.interface.theme.customThemes) {
    this.interface.theme.customThemes = [];
  }
  
  // Check for duplicate names
  const existingTheme = this.interface.theme.customThemes.find(t => t.name === name);
  if (existingTheme) {
    throw new AppError('Theme name already exists', 409, 'THEME_NAME_EXISTS');
  }
  
  const newTheme = {
    name,
    description,
    colors: new Map(Object.entries(colors)),
    isDefault: false,
    createdAt: new Date(),
    lastUsed: new Date()
  };
  
  this.interface.theme.customThemes.push(newTheme);
  await this.save();
  
  return newTheme;
};

userPreferenceSchema.methods.applyTheme = async function(themeName) {
  const theme = this.interface.theme.customThemes.find(t => t.name === themeName);
  
  if (!theme) {
    throw new AppError('Theme not found', 404, 'THEME_NOT_FOUND');
  }
  
  // Apply theme colors
  Object.assign(this.interface.theme.colorScheme, Object.fromEntries(theme.colors));
  
  // Update last used
  theme.lastUsed = new Date();
  
  await this.save();
  return this;
};

userPreferenceSchema.methods.addNotificationDevice = async function(deviceData) {
  const { deviceId, deviceName, platform, token } = deviceData;
  
  if (!this.notifications.push.devices) {
    this.notifications.push.devices = [];
  }
  
  // Remove existing device with same ID
  this.notifications.push.devices = this.notifications.push.devices.filter(
    d => d.deviceId !== deviceId
  );
  
  this.notifications.push.devices.push({
    deviceId,
    deviceName,
    platform,
    token,
    enabled: true,
    lastUsed: new Date()
  });
  
  await this.save();
  return this;
};

userPreferenceSchema.methods.updateNotificationSettings = async function(category, settings) {
  const validCategories = ['email', 'push', 'inApp', 'sms'];
  
  if (!validCategories.includes(category)) {
    throw new AppError('Invalid notification category', 400, 'INVALID_CATEGORY');
  }
  
  Object.assign(this.notifications[category], settings);
  await this.save();
  
  return this.notifications[category];
};

userPreferenceSchema.methods.addCustomShortcut = async function(shortcutData) {
  const { action, keys, context, description } = shortcutData;
  
  if (!this.workflow.shortcuts.customShortcuts) {
    this.workflow.shortcuts.customShortcuts = [];
  }
  
  // Check for conflicts
  const existingShortcut = this.workflow.shortcuts.customShortcuts.find(
    s => s.keys === keys && s.context === context
  );
  
  if (existingShortcut) {
    throw new AppError('Shortcut key combination already exists', 409, 'SHORTCUT_EXISTS');
  }
  
  this.workflow.shortcuts.customShortcuts.push({
    action,
    keys,
    context,
    description,
    enabled: true
  });
  
  await this.save();
  return this;
};

userPreferenceSchema.methods.exportPreferences = function(format = 'json') {
  const preferences = this.toObject();
  
  // Remove sensitive information
  delete preferences._id;
  delete preferences.__v;
  delete preferences.notifications.push.devices;
  delete preferences.notifications.sms.phoneNumber;
  
  if (format === 'json') {
    return JSON.stringify(preferences, null, 2);
  }
  
  return preferences;
};

userPreferenceSchema.methods.importPreferences = async function(preferencesData, options = {}) {
  const { overwrite = false, categories = null } = options;
  
  if (categories && Array.isArray(categories)) {
    // Import only specific categories
    for (const category of categories) {
      if (preferencesData[category]) {
        if (overwrite) {
          this[category] = preferencesData[category];
        } else {
          this[category] = this.mergePreferences(this[category], preferencesData[category]);
        }
      }
    }
  } else {
    // Import all preferences
    if (overwrite) {
      Object.assign(this, preferencesData);
    } else {
      for (const key in preferencesData) {
        if (key !== '_id' && key !== '__v' && key !== 'userId') {
          this[key] = this.mergePreferences(this[key], preferencesData[key]);
        }
      }
    }
  }
  
  this.metadata.version += 1;
  await this.save();
  
  return this;
};

// ==================== Static Methods ====================
userPreferenceSchema.statics.createDefaultPreferences = async function(userId, organizationId = null) {
  const existingPrefs = await this.findOne({ userId });
  
  if (existingPrefs) {
    throw new AppError('User preferences already exist', 409, 'PREFERENCES_EXIST');
  }
  
  const defaults = await this.getDefaultPreferences();
  
  const preferences = new this({
    userId,
    organizationId,
    ...defaults,
    metadata: {
      version: 1,
      isDefault: true,
      lastSyncedAt: new Date()
    }
  });
  
  await preferences.save();
  
  logger.info('Default user preferences created', {
    userId,
    organizationId
  });
  
  return preferences;
};

userPreferenceSchema.statics.getDefaultPreferences = async function() {
  return {
    interface: {
      theme: {
        mode: 'auto',
        colorScheme: {
          primary: '#007bff',
          secondary: '#6c757d',
          accent: '#28a745',
          background: '#ffffff',
          text: '#212529'
        }
      },
      layout: {
        density: 'comfortable',
        sidebarPosition: 'left',
        sidebarCollapsed: false,
        headerFixed: true,
        footerVisible: true
      },
      typography: {
        fontFamily: 'system',
        fontSize: 'base',
        fontWeight: 'normal'
      }
    },
    notifications: {
      email: {
        enabled: true,
        frequency: 'immediate'
      },
      push: {
        enabled: true
      },
      inApp: {
        enabled: true,
        position: 'top-right'
      }
    },
    localization: {
      language: 'en',
      timezone: 'UTC',
      dateFormat: 'MM/DD/YYYY',
      timeFormat: '12h'
    }
  };
};

userPreferenceSchema.statics.findByUserId = async function(userId, options = {}) {
  const preferences = await this.findOne({ userId });
  
  if (!preferences && options.createIfNotExists) {
    return await this.createDefaultPreferences(userId, options.organizationId);
  }
  
  return preferences;
};

userPreferenceSchema.statics.getOrganizationDefaults = async function(organizationId) {
  // This would typically fetch organization-level default preferences
  // For now, return null - implementation depends on organization model
  return null;
};

userPreferenceSchema.statics.bulkUpdatePreferences = async function(updates) {
  const results = {
    successful: [],
    failed: []
  };
  
  for (const update of updates) {
    try {
      const { userId, preferences, reason } = update;
      
      const userPrefs = await this.findByUserId(userId);
      if (!userPrefs) {
        results.failed.push({
          userId,
          error: 'User preferences not found'
        });
        continue;
      }
      
      await userPrefs.importPreferences(preferences, { overwrite: false });
      
      results.successful.push({
        userId,
        version: userPrefs.metadata.version
      });
      
    } catch (error) {
      results.failed.push({
        userId: update.userId,
        error: error.message
      });
    }
  }
  
  return results;
};

userPreferenceSchema.statics.getPreferenceAnalytics = async function(organizationId = null) {
  const match = organizationId ? { organizationId } : {};
  
  const analytics = await this.aggregate([
    { $match: match },
    {
      $facet: {
        themes: [
          {
            $group: {
              _id: '$interface.theme.mode',
              count: { $sum: 1 }
            }
          }
        ],
        languages: [
          {
            $group: {
              _id: '$localization.language',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } }
        ],
        timezones: [
          {
            $group: {
              _id: '$localization.timezone',
              count: { $sum: 1 }
            }
          },
          { $sort: { count: -1 } },
          { $limit: 10 }
        ],
        accessibility: [
          {
            $group: {
              _id: null,
              screenReader: {
                $sum: { $cond: ['$accessibility.screenReader.enabled', 1, 0] }
              },
              highContrast: {
                $sum: { $cond: ['$accessibility.visual.highContrast.enabled', 1, 0] }
              },
              reducedMotion: {
                $sum: { $cond: ['$accessibility.motor.reducedMotion', 1, 0] }
              }
            }
          }
        ],
        notifications: [
          {
            $group: {
              _id: null,
              emailEnabled: {
                $sum: { $cond: ['$notifications.email.enabled', 1, 0] }
              },
              pushEnabled: {
                $sum: { $cond: ['$notifications.push.enabled', 1, 0] }
              },
              smsEnabled: {
                $sum: { $cond: ['$notifications.sms.enabled', 1, 0] }
              }
            }
          }
        ]
      }
    }
  ]);
  
  return analytics[0];
};

userPreferenceSchema.statics.migratePreferences = async function(fromVersion, toVersion) {
  const preferences = await this.find({
    'metadata.version': fromVersion
  });
  
  let migratedCount = 0;
  
  for (const pref of preferences) {
    try {
      // Apply migration logic based on version
      if (fromVersion === 1 && toVersion === 2) {
        // Example migration: add new notification categories
        if (!pref.notifications.email.categories.tasks) {
          pref.notifications.email.categories.tasks = {
            enabled: true,
            priority: 'medium'
          };
        }
      }
      
      pref.metadata.version = toVersion;
      await pref.save();
      migratedCount++;
      
    } catch (error) {
      logger.error('Failed to migrate user preferences', {
        userId: pref.userId,
        error: error.message
      });
    }
  }
  
  logger.info('User preferences migration completed', {
    fromVersion,
    toVersion,
    migratedCount
  });
  
  return migratedCount;
};

// ==================== Create Model ====================
const UserPreferenceModel = BaseModel.createModel('UserPreference', userPreferenceSchema);

module.exports = UserPreferenceModel;
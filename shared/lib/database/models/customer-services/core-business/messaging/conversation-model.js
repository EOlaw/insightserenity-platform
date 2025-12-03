'use strict';

/**
 * @fileoverview Conversation and Message Models - Universal messaging system
 * @module shared/lib/database/models/customer-services/core-business/messaging/conversation-model
 * @description Multi-tenant messaging models supporting all entity types with real-time communication
 * @requires mongoose
 * @requires module:shared/lib/utils/logger
 * @requires module:shared/lib/utils/app-error
 * @requires module:shared/lib/utils/helpers/string-helper
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;
const logger = require('../../../../../utils/logger');
const { AppError } = require('../../../../../utils/app-error');
const stringHelper = require('../../../../../utils/helpers/string-helper');

/**
 * Conversation Schema Definition
 * Supports one-on-one and group conversations across all entity types
 */
const conversationSchemaDefinition = {
  // ==================== Core Identity ====================
  conversationId: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    match: /^CONV-[A-Z0-9]{10,}$/,
    index: true,
    immutable: true
  },

  // ==================== Multi-Tenancy & Organization ====================
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true,
    immutable: true
  },

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true,
    index: true
  },

  // ==================== Conversation Type ====================
  conversationType: {
    type: String,
    enum: ['direct', 'group', 'channel', 'support', 'announcement'],
    required: true,
    index: true
  },

  // ==================== Participants ====================
  participants: [{
    participantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },
    participantModel: {
      type: String,
      required: true,
      enum: ['User', 'Client', 'Consultant', 'Candidate', 'Partner'],
      index: true
    },
    participantInfo: {
      name: String,
      email: String,
      avatar: String,
      title: String
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member', 'guest'],
      default: 'member'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: Date,
    isActive: {
      type: Boolean,
      default: true
    },
    isMuted: {
      type: Boolean,
      default: false
    },
    mutedUntil: Date,
    lastReadAt: Date,
    lastReadMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    unreadCount: {
      type: Number,
      default: 0
    },
    settings: {
      notifications: {
        type: String,
        enum: ['all', 'mentions', 'none'],
        default: 'all'
      },
      showInList: {
        type: Boolean,
        default: true
      }
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],

  // ==================== Conversation Information ====================
  conversationInfo: {
    title: {
      type: String,
      trim: true,
      maxlength: 200
    },
    description: {
      type: String,
      maxlength: 1000
    },
    avatar: {
      url: String,
      publicId: String
    },
    topic: String,
    purpose: String,
    tags: [String]
  },

  // ==================== Related Entities ====================
  // Link conversations to projects, clients, etc.
  relatedTo: {
    entityId: {
      type: mongoose.Schema.Types.ObjectId
    },
    entityModel: {
      type: String,
      enum: ['Client', 'Project', 'Engagement', 'Job', 'Application', 'Ticket']
    },
    context: String
  },

  // ==================== Message Statistics ====================
  messageStats: {
    totalMessages: {
      type: Number,
      default: 0
    },
    lastMessageAt: {
      type: Date,
      index: true
    },
    lastMessage: {
      messageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message'
      },
      preview: String,
      senderId: mongoose.Schema.Types.ObjectId,
      senderModel: String,
      senderName: String,
      sentAt: Date,
      type: String
    },
    firstMessageAt: Date
  },

  // ==================== Privacy & Settings ====================
  settings: {
    isPrivate: {
      type: Boolean,
      default: false
    },
    allowGuestMessages: {
      type: Boolean,
      default: false
    },
    allowMemberInvites: {
      type: Boolean,
      default: true
    },
    requireApprovalToJoin: {
      type: Boolean,
      default: false
    },
    allowFileSharing: {
      type: Boolean,
      default: true
    },
    allowReactions: {
      type: Boolean,
      default: true
    },
    allowThreads: {
      type: Boolean,
      default: true
    },
    retentionDays: Number,
    autoArchiveDays: Number
  },

  // ==================== Status & Lifecycle ====================
  status: {
    current: {
      type: String,
      enum: ['active', 'archived', 'locked', 'deleted'],
      default: 'active',
      index: true
    },
    archivedAt: Date,
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lockedAt: Date,
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lockReason: String
  },

  // ==================== Metadata ====================
  metadata: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    source: {
      type: String,
      enum: ['manual', 'system', 'import', 'automation'],
      default: 'manual'
    },
    flags: {
      isPinned: {
        type: Boolean,
        default: false
      },
      isImportant: {
        type: Boolean,
        default: false
      }
    }
  },

  // ==================== Search Optimization ====================
  searchTokens: {
    type: [String],
    select: false
  },

  // ==================== Soft Delete ====================
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },

  deletedAt: Date,

  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
};

const conversationSchema = new Schema(conversationSchemaDefinition, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

/**
 * Message Schema Definition
 * Individual messages within conversations
 */
const messageSchemaDefinition = {
  // ==================== Core Identity ====================
  messageId: {
    type: String,
    unique: true,
    required: true,
    uppercase: true,
    match: /^MSG-[A-Z0-9]{10,}$/,
    index: true,
    immutable: true
  },

  // ==================== Conversation Reference ====================
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },

  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },

  // ==================== Thread Support ====================
  parentMessageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    index: true
  },

  threadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    index: true
  },

  isThreadRoot: {
    type: Boolean,
    default: false
  },

  threadStats: {
    replyCount: {
      type: Number,
      default: 0
    },
    lastReplyAt: Date,
    participants: [{
      type: mongoose.Schema.Types.ObjectId
    }]
  },

  // ==================== Sender Information ====================
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  senderModel: {
    type: String,
    required: true,
    enum: ['User', 'Client', 'Consultant', 'Candidate', 'Partner', 'System'],
    index: true
  },

  senderInfo: {
    name: String,
    email: String,
    avatar: String,
    title: String
  },

  // ==================== Message Content ====================
  content: {
    type: {
      type: String,
      enum: ['text', 'file', 'image', 'video', 'audio', 'location', 'link', 'system', 'rich'],
      required: true,
      index: true
    },
    text: {
      type: String,
      maxlength: 10000
    },
    html: String, // For rich text formatting
    plain: String, // Plain text version for search
    formatted: mongoose.Schema.Types.Mixed, // Structured content (blocks, mentions, etc.)
  },

  // ==================== Attachments ====================
  attachments: [{
    attachmentId: String,
    name: String,
    type: {
      type: String,
      enum: ['file', 'image', 'video', 'audio', 'document']
    },
    mimeType: String,
    size: Number,
    url: String,
    thumbnailUrl: String,
    metadata: {
      width: Number,
      height: Number,
      duration: Number,
      format: String
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // ==================== Mentions & References ====================
  mentions: [{
    mentionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    mentionModel: {
      type: String,
      required: true,
      enum: ['User', 'Client', 'Consultant', 'Candidate', 'Partner']
    },
    mentionInfo: {
      name: String,
      position: Number // Character position in text
    }
  }],

  links: [{
    url: String,
    title: String,
    description: String,
    image: String,
    domain: String,
    previewFetched: Boolean
  }],

  // ==================== Reactions ====================
  reactions: [{
    emoji: {
      type: String,
      required: true
    },
    reactedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    reactedByModel: {
      type: String,
      required: true,
      enum: ['User', 'Client', 'Consultant', 'Candidate', 'Partner']
    },
    reactedAt: {
      type: Date,
      default: Date.now
    }
  }],

  reactionSummary: {
    type: Map,
    of: Number // emoji -> count
  },

  // ==================== Message Status ====================
  status: {
    current: {
      type: String,
      enum: ['sending', 'sent', 'delivered', 'read', 'failed', 'deleted'],
      default: 'sent',
      index: true
    },
    sentAt: {
      type: Date,
      default: Date.now,
      index: true
    },
    deliveredAt: Date,
    readBy: [{
      participantId: mongoose.Schema.Types.ObjectId,
      participantModel: String,
      readAt: Date
    }],
    failureReason: String
  },

  // ==================== Edit History ====================
  isEdited: {
    type: Boolean,
    default: false
  },

  editHistory: [{
    previousText: String,
    editedAt: Date,
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],

  // ==================== System Messages ====================
  systemMessage: {
    isSystem: {
      type: Boolean,
      default: false
    },
    action: {
      type: String,
      enum: [
        'participant_added', 'participant_removed', 'participant_left',
        'conversation_created', 'conversation_renamed', 'conversation_archived',
        'settings_changed', 'file_shared'
      ]
    },
    actionData: mongoose.Schema.Types.Mixed
  },

  // ==================== Priority & Flags ====================
  priority: {
    type: String,
    enum: ['normal', 'high', 'urgent'],
    default: 'normal'
  },

  flags: {
    isPinned: {
      type: Boolean,
      default: false
    },
    isImportant: {
      type: Boolean,
      default: false
    },
    requiresAction: {
      type: Boolean,
      default: false
    },
    isFlagged: {
      type: Boolean,
      default: false
    }
  },

  // ==================== Search Optimization ====================
  searchTokens: {
    type: [String],
    select: false
  },

  // ==================== Soft Delete ====================
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },

  deletedAt: Date,

  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  deletedFor: [{ // Allow deletion for specific participants
    type: mongoose.Schema.Types.ObjectId
  }]
};

const messageSchema = new Schema(messageSchemaDefinition, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ==================== Conversation Indexes ====================
conversationSchema.index({ tenantId: 1, conversationId: 1 }, { unique: true });
conversationSchema.index({ tenantId: 1, 'participants.participantId': 1, 'status.current': 1 });
conversationSchema.index({ tenantId: 1, conversationType: 1, 'messageStats.lastMessageAt': -1 });
conversationSchema.index({ tenantId: 1, 'relatedTo.entityId': 1 });
conversationSchema.index({ 'messageStats.lastMessageAt': -1 });
conversationSchema.index({ searchTokens: 1 });

// Text search for conversations
conversationSchema.index({
  'conversationInfo.title': 'text',
  'conversationInfo.description': 'text'
});

// ==================== Message Indexes ====================
messageSchema.index({ tenantId: 1, messageId: 1 }, { unique: true });
messageSchema.index({ tenantId: 1, conversationId: 1, 'status.sentAt': -1 });
messageSchema.index({ tenantId: 1, senderId: 1, 'status.sentAt': -1 });
messageSchema.index({ conversationId: 1, threadId: 1 });
messageSchema.index({ conversationId: 1, parentMessageId: 1 });
messageSchema.index({ 'mentions.mentionId': 1 });
messageSchema.index({ 'status.sentAt': -1 });
messageSchema.index({ searchTokens: 1 });

// Text search for messages
messageSchema.index({
  'content.text': 'text',
  'content.plain': 'text'
});

// ==================== Conversation Virtual Fields ====================
conversationSchema.virtual('participantCount').get(function() {
  return this.participants.filter(p => p.isActive).length;
});

conversationSchema.virtual('isActive').get(function() {
  return this.status.current === 'active' && !this.isDeleted;
});

// ==================== Message Virtual Fields ====================
messageSchema.virtual('hasAttachments').get(function() {
  return this.attachments && this.attachments.length > 0;
});

messageSchema.virtual('reactionCount').get(function() {
  return this.reactions ? this.reactions.length : 0;
});

messageSchema.virtual('isThread').get(function() {
  return !!this.parentMessageId || this.isThreadRoot;
});

// ==================== Conversation Pre-save Middleware ====================
conversationSchema.pre('save', async function(next) {
  try {
    if (!this.conversationId && this.isNew) {
      this.conversationId = await this.constructor.generateConversationId(this.tenantId);
    }

    // Auto-generate title for direct conversations
    if (this.conversationType === 'direct' && !this.conversationInfo.title) {
      const activeParticipants = this.participants.filter(p => p.isActive);
      if (activeParticipants.length === 2) {
        const names = activeParticipants.map(p => p.participantInfo.name).filter(Boolean);
        this.conversationInfo.title = names.join(' & ');
      }
    }

    this.updateSearchTokens();
    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Message Pre-save Middleware ====================
messageSchema.pre('save', async function(next) {
  try {
    if (!this.messageId && this.isNew) {
      this.messageId = await this.constructor.generateMessageId(this.tenantId);
    }

    // Extract plain text for search
    if (this.content.text && !this.content.plain) {
      this.content.plain = this.content.text.replace(/<[^>]*>/g, '');
    }

    // Update reaction summary
    if (this.reactions && this.reactions.length > 0) {
      const summary = new Map();
      this.reactions.forEach(r => {
        summary.set(r.emoji, (summary.get(r.emoji) || 0) + 1);
      });
      this.reactionSummary = summary;
    }

    this.updateSearchTokens();
    next();
  } catch (error) {
    next(error);
  }
});

// ==================== Conversation Instance Methods ====================
conversationSchema.methods.updateSearchTokens = function() {
  const tokens = new Set();
  
  if (this.conversationInfo.title) {
    this.conversationInfo.title.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
  }
  
  if (this.conversationId) {
    tokens.add(this.conversationId.toLowerCase());
  }
  
  this.participants.forEach(p => {
    if (p.participantInfo.name) {
      p.participantInfo.name.toLowerCase().split(/\s+/).forEach(token => tokens.add(token));
    }
  });
  
  this.searchTokens = Array.from(tokens);
};

conversationSchema.methods.addParticipant = async function(participantData, addedBy) {
  const participant = {
    participantId: participantData.id,
    participantModel: participantData.model,
    participantInfo: {
      name: participantData.name,
      email: participantData.email,
      avatar: participantData.avatar,
      title: participantData.title
    },
    role: participantData.role || 'member',
    joinedAt: new Date(),
    isActive: true,
    addedBy
  };
  
  const exists = this.participants.some(
    p => p.participantId.toString() === participantData.id.toString() && p.isActive
  );
  
  if (exists) {
    throw new AppError('Participant already in conversation', 409, 'PARTICIPANT_EXISTS');
  }
  
  this.participants.push(participant);
  await this.save();
  
  return participant;
};

conversationSchema.methods.removeParticipant = async function(participantId, removedBy) {
  const participant = this.participants.find(
    p => p.participantId.toString() === participantId.toString() && p.isActive
  );
  
  if (!participant) {
    throw new AppError('Participant not found', 404, 'PARTICIPANT_NOT_FOUND');
  }
  
  participant.isActive = false;
  participant.leftAt = new Date();
  
  await this.save();
  return true;
};

conversationSchema.methods.updateLastMessage = async function(message) {
  this.messageStats.lastMessageAt = message.status.sentAt;
  this.messageStats.totalMessages += 1;
  this.messageStats.lastMessage = {
    messageId: message._id,
    preview: message.content.text?.substring(0, 100),
    senderId: message.senderId,
    senderModel: message.senderModel,
    senderName: message.senderInfo.name,
    sentAt: message.status.sentAt,
    type: message.content.type
  };
  
  // Update unread counts for all participants except sender
  this.participants.forEach(p => {
    if (p.participantId.toString() !== message.senderId.toString() && p.isActive) {
      p.unreadCount += 1;
    }
  });
  
  await this.save();
};

conversationSchema.methods.markAsRead = async function(participantId, lastReadMessageId) {
  const participant = this.participants.find(
    p => p.participantId.toString() === participantId.toString()
  );
  
  if (!participant) {
    throw new AppError('Participant not found', 404, 'PARTICIPANT_NOT_FOUND');
  }
  
  participant.lastReadAt = new Date();
  participant.lastReadMessageId = lastReadMessageId;
  participant.unreadCount = 0;
  
  await this.save();
  return true;
};

// ==================== Message Instance Methods ====================
messageSchema.methods.updateSearchTokens = function() {
  const tokens = new Set();
  
  if (this.content.text) {
    this.content.text.toLowerCase().split(/\s+/).forEach(token => {
      if (token.length > 2) tokens.add(token);
    });
  }
  
  if (this.messageId) {
    tokens.add(this.messageId.toLowerCase());
  }
  
  this.searchTokens = Array.from(tokens);
};

messageSchema.methods.addReaction = async function(emoji, reactedBy, reactedByModel) {
  // Check if user already reacted with this emoji
  const existingReaction = this.reactions.find(
    r => r.reactedBy.toString() === reactedBy.toString() && r.emoji === emoji
  );
  
  if (existingReaction) {
    throw new AppError('Reaction already exists', 409, 'REACTION_EXISTS');
  }
  
  this.reactions.push({
    emoji,
    reactedBy,
    reactedByModel,
    reactedAt: new Date()
  });
  
  await this.save();
  return true;
};

messageSchema.methods.removeReaction = async function(emoji, reactedBy) {
  const index = this.reactions.findIndex(
    r => r.reactedBy.toString() === reactedBy.toString() && r.emoji === emoji
  );
  
  if (index === -1) {
    throw new AppError('Reaction not found', 404, 'REACTION_NOT_FOUND');
  }
  
  this.reactions.splice(index, 1);
  await this.save();
  return true;
};

messageSchema.methods.edit = async function(newText, editedBy) {
  if (!this.editHistory) this.editHistory = [];
  
  this.editHistory.unshift({
    previousText: this.content.text,
    editedAt: new Date(),
    editedBy
  });
  
  this.content.text = newText;
  this.content.plain = newText.replace(/<[^>]*>/g, '');
  this.isEdited = true;
  
  await this.save();
  return true;
};

// ==================== Conversation Static Methods ====================
conversationSchema.statics.generateConversationId = async function(tenantId) {
  const prefix = 'CONV';
  const randomPart = stringHelper.generateRandomString(10, 'ALPHANUMERIC').toUpperCase();
  return `${prefix}-${randomPart}`;
};

conversationSchema.statics.findByParticipant = async function(tenantId, participantId, options = {}) {
  const {
    type,
    includeArchived = false,
    limit = 50,
    skip = 0,
    sort = { 'messageStats.lastMessageAt': -1 }
  } = options;
  
  const query = {
    tenantId,
    'participants.participantId': participantId,
    'participants.isActive': true,
    isDeleted: false
  };
  
  if (!includeArchived) {
    query['status.current'] = 'active';
  }
  
  if (type) {
    query.conversationType = type;
  }
  
  const [conversations, total] = await Promise.all([
    this.find(query)
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .select('-searchTokens'),
    this.countDocuments(query)
  ]);
  
  return {
    conversations,
    total,
    hasMore: total > skip + conversations.length
  };
};

conversationSchema.statics.findDirectConversation = async function(tenantId, participantId1, participantId2) {
  const conversation = await this.findOne({
    tenantId,
    conversationType: 'direct',
    'participants.participantId': { $all: [participantId1, participantId2] },
    'participants.isActive': true,
    isDeleted: false
  });
  
  return conversation;
};

// ==================== Message Static Methods ====================
messageSchema.statics.generateMessageId = async function(tenantId) {
  const prefix = 'MSG';
  const randomPart = stringHelper.generateRandomString(10, 'ALPHANUMERIC').toUpperCase();
  return `${prefix}-${randomPart}`;
};

messageSchema.statics.findByConversation = async function(conversationId, options = {}) {
  const {
    threadId,
    limit = 50,
    skip = 0,
    before,
    after,
    sort = { 'status.sentAt': -1 }
  } = options;
  
  const query = {
    conversationId,
    isDeleted: false
  };
  
  if (threadId) {
    query.$or = [
      { threadId },
      { _id: threadId }
    ];
  } else {
    query.parentMessageId = { $exists: false };
  }
  
  if (before) {
    query['status.sentAt'] = { $lt: before };
  }
  
  if (after) {
    query['status.sentAt'] = { $gt: after };
  }
  
  const [messages, total] = await Promise.all([
    this.find(query)
      .limit(limit)
      .skip(skip)
      .sort(sort)
      .select('-searchTokens'),
    this.countDocuments(query)
  ]);
  
  return {
    messages,
    total,
    hasMore: total > skip + messages.length
  };
};

messageSchema.statics.searchMessages = async function(tenantId, searchQuery, options = {}) {
  const {
    conversationId,
    senderId,
    limit = 20,
    skip = 0
  } = options;
  
  const query = {
    tenantId,
    $text: { $search: searchQuery },
    isDeleted: false
  };
  
  if (conversationId) {
    query.conversationId = conversationId;
  }
  
  if (senderId) {
    query.senderId = senderId;
  }
  
  const [messages, total] = await Promise.all([
    this.find(query, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' }, 'status.sentAt': -1 })
      .limit(limit)
      .skip(skip),
    this.countDocuments(query)
  ]);
  
  return {
    messages,
    total,
    hasMore: total > skip + messages.length
  };
};

/**
 * Export schemas for ConnectionManager registration
 */
module.exports = {
  conversationSchema: {
    schema: conversationSchema,
    modelName: 'Conversation',
    createModel: function(connection) {
      return connection ? connection.model('Conversation', conversationSchema) : mongoose.model('Conversation', conversationSchema);
    }
  },
  
  messageSchema: {
    schema: messageSchema,
    modelName: 'Message',
    createModel: function(connection) {
      return connection ? connection.model('Message', messageSchema) : mongoose.model('Message', messageSchema);
    }
  }
};

// For backward compatibility
module.exports.Conversation = mongoose.model('Conversation', conversationSchema);
module.exports.Message = mongoose.model('Message', messageSchema);
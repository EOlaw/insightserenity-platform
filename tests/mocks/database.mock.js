/**
 * Database Mock Utilities
 * Provides mock functions for Mongoose models and database operations
 */

const mongoose = require('mongoose');

/**
 * Creates a mock Mongoose model with common methods
 */
const createMockModel = (modelName = 'MockModel') => {
  const mockModel = jest.fn();

  // Constructor mock
  mockModel.mockImplementation(function(data) {
    this._doc = data;
    this.save = jest.fn().mockResolvedValue(this);
    this.validate = jest.fn().mockResolvedValue(true);
    this.toObject = jest.fn().mockReturnValue(data);
    this.toJSON = jest.fn().mockReturnValue(data);
    return this;
  });

  // Static methods
  mockModel.find = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([])
  });

  mockModel.findOne = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(null)
  });

  mockModel.findById = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(null)
  });

  mockModel.findByIdAndUpdate = jest.fn().mockReturnValue({
    populate: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(null)
  });

  mockModel.findByIdAndDelete = jest.fn().mockResolvedValue(null);
  mockModel.findOneAndUpdate = jest.fn().mockResolvedValue(null);
  mockModel.findOneAndDelete = jest.fn().mockResolvedValue(null);
  mockModel.updateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
  mockModel.updateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });
  mockModel.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });
  mockModel.deleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });
  mockModel.countDocuments = jest.fn().mockResolvedValue(0);
  mockModel.create = jest.fn().mockImplementation(data => Promise.resolve(new mockModel(data)));
  mockModel.insertMany = jest.fn().mockResolvedValue([]);

  // Aggregation
  mockModel.aggregate = jest.fn().mockReturnValue({
    exec: jest.fn().mockResolvedValue([])
  });

  // Schema and model metadata
  mockModel.modelName = modelName;
  mockModel.schema = { obj: {} };

  return mockModel;
};

/**
 * Creates a mock Mongoose session for transactions
 */
const createMockSession = () => ({
  startTransaction: jest.fn(),
  commitTransaction: jest.fn().mockResolvedValue(undefined),
  abortTransaction: jest.fn().mockResolvedValue(undefined),
  endSession: jest.fn().mockResolvedValue(undefined),
  inTransaction: jest.fn().mockReturnValue(false),
  _id: new mongoose.Types.ObjectId()
});

/**
 * Creates a mock Mongoose connection
 */
const createMockConnection = () => ({
  startSession: jest.fn().mockResolvedValue(createMockSession()),
  close: jest.fn().mockResolvedValue(undefined),
  readyState: 1, // connected
  model: jest.fn(),
  models: {},
  connection: {
    db: {
      collection: jest.fn().mockReturnValue({
        findOne: jest.fn().mockResolvedValue(null),
        find: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([])
        }),
        insertOne: jest.fn().mockResolvedValue({ insertedId: new mongoose.Types.ObjectId() }),
        updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
        deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 })
      })
    }
  }
});

/**
 * Helper to create a valid MongoDB ObjectId
 */
const createObjectId = (id) => {
  if (id && mongoose.Types.ObjectId.isValid(id)) {
    return new mongoose.Types.ObjectId(id);
  }
  return new mongoose.Types.ObjectId();
};

/**
 * Helper to create a mock document with common Mongoose methods
 */
const createMockDocument = (data) => ({
  ...data,
  _id: data._id || createObjectId(),
  save: jest.fn().mockResolvedValue(data),
  remove: jest.fn().mockResolvedValue(data),
  deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
  validate: jest.fn().mockResolvedValue(true),
  toObject: jest.fn().mockReturnValue(data),
  toJSON: jest.fn().mockReturnValue(data),
  populate: jest.fn().mockResolvedValue(data)
});

module.exports = {
  createMockModel,
  createMockSession,
  createMockConnection,
  createObjectId,
  createMockDocument
};

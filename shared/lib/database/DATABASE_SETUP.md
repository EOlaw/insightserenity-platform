# Database Setup Guide

## MongoDB Atlas Configuration

This multi-tenant architecture requires MongoDB connections for three separate databases:
- **Admin Database**: For administrative data and system configuration
- **Customer Database**: For customer-specific data and multi-tenant operations
- **Shared Database**: For shared resources and common data

## Setup Instructions

### 1. MongoDB Atlas Setup

1. **Create a MongoDB Atlas Account**
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Sign up for a free account if you don't have one

2. **Create a Cluster**
   - Click "Build a Cluster"
   - Choose the free tier (M0 Sandbox) for development
   - Select your preferred cloud provider and region
   - Name your cluster (e.g., "insightserenity-cluster")

3. **Configure Database Access**
   - Go to "Database Access" in the left sidebar
   - Click "Add New Database User"
   - Create a user with read/write access
   - Save the username and password securely

4. **Configure Network Access**
   - Go to "Network Access" in the left sidebar
   - Click "Add IP Address"
   - For development: Add your current IP or allow access from anywhere (0.0.0.0/0)
   - For production: Restrict to specific IPs

5. **Get Connection String**
   - Go to "Clusters" and click "Connect"
   - Choose "Connect your application"
   - Select "Node.js" and version "4.1 or later"
   - Copy the connection string

### 2. Environment Configuration

Update the `.env` files in each server directory with your MongoDB Atlas connection strings:

```bash
# In servers/admin-server/.env, servers/customer-services/.env, and servers/gateway/.env

# Replace with your actual MongoDB Atlas connection strings
DATABASE_ADMIN_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/insightserenity_admin_dev?retryWrites=true&w=majority
DATABASE_CUSTOMER_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/insightserenity_customer_dev?retryWrites=true&w=majority
DATABASE_SHARED_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/insightserenity_shared_dev?retryWrites=true&w=majority

# Fallback URI (optional)
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
```

**Important**: Replace:
- `<username>`: Your MongoDB Atlas database user
- `<password>`: Your MongoDB Atlas database password
- `<cluster>`: Your cluster address (e.g., cluster0.xxxxx)

### 3. Local MongoDB Alternative

If you prefer using local MongoDB for development:

1. **Install MongoDB locally**
   ```bash
   # macOS
   brew tap mongodb/brew
   brew install mongodb-community

   # Ubuntu/Debian
   sudo apt-get install mongodb

   # Windows
   # Download installer from https://www.mongodb.com/try/download/community
   ```

2. **Start MongoDB**
   ```bash
   # macOS/Linux
   mongod --dbpath /path/to/data

   # Windows
   mongod.exe --dbpath C:\path\to\data
   ```

3. **Update .env files for local connection**
   ```bash
   DATABASE_ADMIN_URI=mongodb://localhost:27017/insightserenity_admin_dev
   DATABASE_CUSTOMER_URI=mongodb://localhost:27017/insightserenity_customer_dev
   DATABASE_SHARED_URI=mongodb://localhost:27017/insightserenity_shared_dev
   MONGODB_URI=mongodb://localhost:27017/insightserenity
   ```

### 4. Testing Database Connections

Run the test script to verify your database connections:

```bash
node test-database-connection.js
```

Expected output for successful connections:
```
✅ admin database connected successfully
✅ customer database connected successfully
✅ shared database connected successfully
🎉 All database connections successful!
```

### 5. Troubleshooting

#### Connection Timeout
- Check your network access settings in MongoDB Atlas
- Ensure your IP address is whitelisted
- Verify firewall settings

#### Authentication Failed
- Double-check username and password
- Ensure the user has proper permissions
- Check if password contains special characters (URL encode them)

#### DNS Resolution Error (ENOTFOUND)
- Verify the cluster address is correct
- Check internet connectivity
- Try using the standard connection string instead of SRV

#### Rate Limiting Issues
If you encounter rate limiting errors:
1. Ensure `express-rate-limit` is installed:
   ```bash
   npm install express-rate-limit
   ```
2. Configure Redis for distributed rate limiting (optional):
   ```bash
   # Install Redis locally or use a cloud service
   redis-server
   ```

### 6. Production Considerations

For production deployment:

1. **Use dedicated MongoDB Atlas clusters** for each environment
2. **Enable SSL/TLS** encryption (already enabled by default in Atlas)
3. **Set up replica sets** for high availability
4. **Configure backups** in MongoDB Atlas
5. **Monitor performance** using Atlas monitoring tools
6. **Use connection pooling** (already configured in the code)
7. **Implement proper indexing** for optimal query performance
8. **Set up alerts** for connection issues and performance metrics

### 7. Environment-Specific Configurations

The system automatically adjusts settings based on `NODE_ENV`:

- **Development**: Relaxed timeouts, verbose logging
- **Staging**: Moderate settings, testing features enabled
- **Production**: Strict security, optimized performance, minimal logging

### 8. Multi-Tenant Architecture

The system uses a database-per-service approach:
- **Admin Service** → Admin Database
- **Customer Services** → Customer Database (with tenant isolation)
- **Gateway** → Shared Database (for routing and caching)

Each tenant's data is isolated using:
- Tenant-specific collections
- Document-level tenant IDs
- Query-level tenant filtering

## Next Steps

1. Configure your MongoDB Atlas cluster or local MongoDB
2. Update all `.env` files with your connection strings
3. Run the test script to verify connections
4. Start the services:
   ```bash
   # Terminal 1: Admin Server
   cd servers/admin-server && npm run dev

   # Terminal 2: Customer Services
   cd servers/customer-services && npm run dev

   # Terminal 3: Gateway
   cd servers/gateway && npm run dev
   ```

## Support

For issues or questions:
- Check the logs in each server's console output
- Review the [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com/)
- Verify environment variables are loaded correctly
- Test connections independently using the test script

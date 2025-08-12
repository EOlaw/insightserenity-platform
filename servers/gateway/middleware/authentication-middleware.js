/**
 * Authentication Middleware
 * Handles JWT authentication and session management
 */

const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const verifyJWT = promisify(jwt.verify);

/**
 * Authentication Middleware Class
 */
class AuthenticationMiddleware {
    constructor(config, serviceRegistry) {
        this.config = config;
        this.serviceRegistry = serviceRegistry;
        this.excludePaths = config.excludePaths || [];
        this.jwtConfig = config.jwt || {};
        this.sessionStore = null;
        this.publicKey = null;
        this.secretKey = null;
    }

    /**
     * Initialize authentication middleware
     */
    async initialize() {
        // Setup JWT keys
        if (this.jwtConfig.publicKey) {
            this.publicKey = this.jwtConfig.publicKey;
        }
        this.secretKey = this.jwtConfig.secret;

        // Initialize session store if configured
        if (this.config.sessionStore && this.config.sessionStore.type === 'redis') {
            // Session store will be initialized with cache manager
        }
    }

    /**
     * Get middleware function
     */
    getMiddleware() {
        return async (req, res, next) => {
            // Skip authentication for excluded paths
            if (this.isExcludedPath(req.path)) {
                return next();
            }

            // Skip if authentication is disabled
            if (!this.config.enabled) {
                return next();
            }

            try {
                // Extract token from request
                const token = this.extractToken(req);
                
                if (!token) {
                    return this.handleUnauthorized(res, 'No authentication token provided');
                }

                // Verify token
                const decoded = await this.verifyToken(token);
                
                if (!decoded) {
                    return this.handleUnauthorized(res, 'Invalid authentication token');
                }

                // Check token expiry
                if (this.isTokenExpired(decoded)) {
                    return this.handleUnauthorized(res, 'Authentication token has expired');
                }

                // Validate session if configured
                if (this.config.sessionStore && this.config.sessionStore.type !== 'memory') {
                    const isValidSession = await this.validateSession(decoded.sessionId);
                    if (!isValidSession) {
                        return this.handleUnauthorized(res, 'Invalid or expired session');
                    }
                }

                // Check user permissions
                const hasPermission = await this.checkPermissions(decoded, req);
                if (!hasPermission) {
                    return this.handleForbidden(res, 'Insufficient permissions');
                }

                // Attach user info to request
                req.user = {
                    id: decoded.sub || decoded.userId,
                    email: decoded.email,
                    roles: decoded.roles || [],
                    permissions: decoded.permissions || [],
                    organizationId: decoded.organizationId,
                    tenantId: decoded.tenantId,
                    sessionId: decoded.sessionId,
                    tokenExp: decoded.exp,
                    tokenIat: decoded.iat
                };

                // Add auth headers for downstream services
                req.headers['x-user-id'] = req.user.id;
                req.headers['x-user-email'] = req.user.email;
                req.headers['x-user-roles'] = JSON.stringify(req.user.roles);
                req.headers['x-organization-id'] = req.user.organizationId || '';
                req.headers['x-tenant-id'] = req.user.tenantId || req.tenant?.id || '';

                next();
            } catch (error) {
                if (error.name === 'TokenExpiredError') {
                    return this.handleUnauthorized(res, 'Authentication token has expired');
                } else if (error.name === 'JsonWebTokenError') {
                    return this.handleUnauthorized(res, 'Invalid authentication token');
                } else {
                    console.error('Authentication error:', error);
                    return this.handleUnauthorized(res, 'Authentication failed');
                }
            }
        };
    }

    /**
     * Get admin middleware function with stricter validation
     */
    getAdminMiddleware() {
        return async (req, res, next) => {
            // First run standard authentication
            await this.getMiddleware()(req, res, async () => {
                // Additional admin validation
                if (!req.user) {
                    return this.handleUnauthorized(res, 'Authentication required for admin access');
                }

                // Check for admin role
                const isAdmin = req.user.roles.includes('admin') || 
                               req.user.roles.includes('super_admin') ||
                               req.user.roles.includes('platform_admin');

                if (!isAdmin) {
                    return this.handleForbidden(res, 'Admin access required');
                }

                // Verify admin session
                if (this.config.sessionStore) {
                    const isValidAdminSession = await this.validateAdminSession(req.user.sessionId);
                    if (!isValidAdminSession) {
                        return this.handleUnauthorized(res, 'Invalid admin session');
                    }
                }

                // Add admin flag
                req.user.isAdmin = true;
                req.headers['x-admin-user'] = 'true';

                next();
            });
        };
    }

    /**
     * Extract token from request
     */
    extractToken(req) {
        // Check Authorization header
        const authHeader = req.headers.authorization;
        if (authHeader) {
            const parts = authHeader.split(' ');
            if (parts.length === 2 && parts[0] === 'Bearer') {
                return parts[1];
            }
        }

        // Check cookie
        if (req.cookies && req.cookies.token) {
            return req.cookies.token;
        }

        // Check query parameter (for WebSocket connections)
        if (req.query && req.query.token) {
            return req.query.token;
        }

        // Check custom header
        if (req.headers['x-auth-token']) {
            return req.headers['x-auth-token'];
        }

        return null;
    }

    /**
     * Verify JWT token
     */
    async verifyToken(token) {
        try {
            const options = {
                algorithms: [this.jwtConfig.algorithm || 'RS256'],
                issuer: this.jwtConfig.issuer,
                audience: this.jwtConfig.audience
            };

            // Use public key for RS256, secret for HS256
            const key = this.jwtConfig.algorithm === 'RS256' ? this.publicKey : this.secretKey;
            
            const decoded = await verifyJWT(token, key, options);
            return decoded;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Check if token is expired
     */
    isTokenExpired(decoded) {
        if (!decoded.exp) {
            return false;
        }
        
        const now = Math.floor(Date.now() / 1000);
        return decoded.exp < now;
    }

    /**
     * Validate session
     */
    async validateSession(sessionId) {
        if (!sessionId || !this.sessionStore) {
            return true; // Skip if no session validation configured
        }

        try {
            const session = await this.sessionStore.get(sessionId);
            return !!session;
        } catch (error) {
            console.error('Session validation error:', error);
            return false;
        }
    }

    /**
     * Validate admin session
     */
    async validateAdminSession(sessionId) {
        if (!sessionId || !this.sessionStore) {
            return true;
        }

        try {
            const session = await this.sessionStore.get(`admin:${sessionId}`);
            if (!session) {
                return false;
            }

            // Check for admin-specific session properties
            const sessionData = JSON.parse(session);
            return sessionData.isAdmin === true && sessionData.active === true;
        } catch (error) {
            console.error('Admin session validation error:', error);
            return false;
        }
    }

    /**
     * Check user permissions for the requested resource
     */
    async checkPermissions(decoded, req) {
        // Skip permission check for public endpoints
        if (this.isPublicEndpoint(req.path)) {
            return true;
        }

        // Check role-based permissions
        if (decoded.roles && decoded.roles.length > 0) {
            const requiredRole = this.getRequiredRole(req.path, req.method);
            if (requiredRole && !decoded.roles.includes(requiredRole)) {
                return false;
            }
        }

        // Check specific permissions
        if (decoded.permissions && decoded.permissions.length > 0) {
            const requiredPermission = this.getRequiredPermission(req.path, req.method);
            if (requiredPermission && !decoded.permissions.includes(requiredPermission)) {
                return false;
            }
        }

        // Check tenant access
        if (req.tenant && decoded.tenantId && decoded.tenantId !== req.tenant.id) {
            // User doesn't belong to the requested tenant
            return false;
        }

        return true;
    }

    /**
     * Check if path is excluded from authentication
     */
    isExcludedPath(path) {
        return this.excludePaths.some(excludedPath => {
            if (excludedPath.endsWith('*')) {
                return path.startsWith(excludedPath.slice(0, -1));
            }
            return path === excludedPath;
        });
    }

    /**
     * Check if endpoint is public
     */
    isPublicEndpoint(path) {
        const publicEndpoints = [
            '/api/auth/login',
            '/api/auth/register',
            '/api/auth/forgot-password',
            '/api/auth/reset-password',
            '/api/public'
        ];

        return publicEndpoints.some(endpoint => path.startsWith(endpoint));
    }

    /**
     * Get required role for path
     */
    getRequiredRole(path, method) {
        const roleMap = {
            '/api/admin': 'admin',
            '/api/billing': 'billing_admin',
            '/api/users': 'user_admin',
            '/api/organizations': 'org_admin'
        };

        for (const [pathPrefix, role] of Object.entries(roleMap)) {
            if (path.startsWith(pathPrefix)) {
                return role;
            }
        }

        return null;
    }

    /**
     * Get required permission for path
     */
    getRequiredPermission(path, method) {
        const permissionMap = {
            'GET /api/users': 'users.read',
            'POST /api/users': 'users.create',
            'PUT /api/users': 'users.update',
            'DELETE /api/users': 'users.delete',
            'GET /api/organizations': 'organizations.read',
            'POST /api/organizations': 'organizations.create',
            'PUT /api/organizations': 'organizations.update',
            'DELETE /api/organizations': 'organizations.delete'
        };

        const key = `${method} ${path}`;
        for (const [pattern, permission] of Object.entries(permissionMap)) {
            if (key.startsWith(pattern)) {
                return permission;
            }
        }

        return null;
    }

    /**
     * Handle unauthorized response
     */
    handleUnauthorized(res, message = 'Unauthorized') {
        return res.status(401).json({
            error: 'Unauthorized',
            message: message,
            code: 'AUTH_REQUIRED'
        });
    }

    /**
     * Handle forbidden response
     */
    handleForbidden(res, message = 'Forbidden') {
        return res.status(403).json({
            error: 'Forbidden',
            message: message,
            code: 'INSUFFICIENT_PERMISSIONS'
        });
    }

    /**
     * Refresh token
     */
    async refreshToken(oldToken) {
        try {
            const decoded = jwt.decode(oldToken);
            if (!decoded) {
                throw new Error('Invalid token');
            }

            // Generate new token with same claims but new expiry
            const newToken = jwt.sign({
                sub: decoded.sub,
                email: decoded.email,
                roles: decoded.roles,
                permissions: decoded.permissions,
                organizationId: decoded.organizationId,
                tenantId: decoded.tenantId,
                sessionId: decoded.sessionId
            }, this.secretKey, {
                algorithm: this.jwtConfig.algorithm || 'RS256',
                expiresIn: this.jwtConfig.expiresIn || '1h',
                issuer: this.jwtConfig.issuer,
                audience: this.jwtConfig.audience
            });

            return newToken;
        } catch (error) {
            throw new Error('Failed to refresh token');
        }
    }

    /**
     * Revoke token
     */
    async revokeToken(token) {
        try {
            const decoded = jwt.decode(token);
            if (decoded && decoded.sessionId && this.sessionStore) {
                await this.sessionStore.delete(decoded.sessionId);
            }
            return true;
        } catch (error) {
            console.error('Failed to revoke token:', error);
            return false;
        }
    }

    /**
     * Set session store
     */
    setSessionStore(store) {
        this.sessionStore = store;
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        // Cleanup any resources if needed
    }
}

module.exports = { AuthenticationMiddleware };
/**
 * @fileoverview Authorization Middleware
 */

const authorize = (roles = [], permissions = []) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Not authenticated'
            });
        }
        
        // Check roles
        if (roles.length > 0) {
            const hasRole = roles.includes(req.user.role);
            if (!hasRole) {
                return res.status(403).json({
                    success: false,
                    error: 'Insufficient role permissions'
                });
            }
        }
        
        // Check permissions
        if (permissions.length > 0) {
            const userPermissions = req.user.permissions || [];
            const hasPermission = permissions.every(p => userPermissions.includes(p));
            
            if (!hasPermission) {
                return res.status(403).json({
                    success: false,
                    error: 'Insufficient permissions'
                });
            }
        }
        
        next();
    };
};

module.exports = authorize;

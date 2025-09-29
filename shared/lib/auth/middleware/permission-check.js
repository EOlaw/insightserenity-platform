/**
 * @fileoverview Permission Check Middleware
 */

const checkPermission = (resource, action) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Not authenticated'
            });
        }
        
        const permissions = req.user.permissions || [];
        const hasPermission = permissions.some(p => {
            if (typeof p === 'string') {
                return p === `${resource}:${action}` || p === `${resource}:*` || p === '*';
            }
            return p.resource === resource && (p.actions.includes(action) || p.actions.includes('*'));
        });
        
        if (!hasPermission) {
            return res.status(403).json({
                success: false,
                error: `No permission for ${action} on ${resource}`
            });
        }
        
        next();
    };
};

module.exports = checkPermission;

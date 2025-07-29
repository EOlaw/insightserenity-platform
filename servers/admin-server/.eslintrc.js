/**
 * @file ESLint Configuration
 * @description Admin server linting rules with security focus
 * @version 3.0.0
 */

'use strict';

module.exports = {
    root: true,
    env: {
        node: true,
        es2022: true,
        jest: true
    },
    extends: [
        'airbnb-base',
        'plugin:security/recommended',
        'plugin:jest/recommended'
    ],
    plugins: [
        'security',
        'jest',
        'import'
    ],
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
    },
    rules: {
        // Enforce strict mode
        'strict': ['error', 'global'],
        
        // Security rules
        'security/detect-object-injection': 'warn',
        'security/detect-non-literal-regexp': 'warn',
        'security/detect-unsafe-regex': 'error',
        'security/detect-buffer-noassert': 'error',
        'security/detect-child-process': 'error',
        'security/detect-disable-mustache-escape': 'error',
        'security/detect-eval-with-expression': 'error',
        'security/detect-no-csrf-before-method-override': 'error',
        'security/detect-possible-timing-attacks': 'warn',
        
        // Code style
        'indent': ['error', 4, { 
            'SwitchCase': 1,
            'VariableDeclarator': 1,
            'outerIIFEBody': 1,
            'FunctionDeclaration': {
                'parameters': 1,
                'body': 1
            },
            'FunctionExpression': {
                'parameters': 1,
                'body': 1
            },
            'CallExpression': {
                'arguments': 1
            },
            'ArrayExpression': 1,
            'ObjectExpression': 1,
            'ImportDeclaration': 1,
            'flatTernaryExpressions': false
        }],
        'linebreak-style': ['error', 'unix'],
        'quotes': ['error', 'single', { 'avoidEscape': true }],
        'semi': ['error', 'always'],
        'comma-dangle': ['error', {
            'arrays': 'never',
            'objects': 'never',
            'imports': 'never',
            'exports': 'never',
            'functions': 'never'
        }],
        'max-len': ['error', {
            'code': 120,
            'tabWidth': 4,
            'ignoreUrls': true,
            'ignoreComments': false,
            'ignoreRegExpLiterals': true,
            'ignoreStrings': true,
            'ignoreTemplateLiterals': true
        }],
        
        // Best practices
        'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
        'no-debugger': 'error',
        'no-unused-vars': ['error', { 
            'argsIgnorePattern': '^_',
            'varsIgnorePattern': '^_',
            'caughtErrorsIgnorePattern': '^_'
        }],
        'no-use-before-define': ['error', { 
            'functions': false, 
            'classes': true,
            'variables': true 
        }],
        'prefer-const': ['error', {
            'destructuring': 'any',
            'ignoreReadBeforeAssign': true
        }],
        'no-var': 'error',
        'object-shorthand': ['error', 'always'],
        'prefer-arrow-callback': ['error', {
            'allowNamedFunctions': false,
            'allowUnboundThis': true
        }],
        'arrow-body-style': ['error', 'as-needed'],
        'arrow-parens': ['error', 'always'],
        'no-underscore-dangle': ['error', { 
            'allow': ['_id', '_doc', '__dirname', '__filename'],
            'allowAfterThis': true
        }],
        
        // Error handling
        'handle-callback-err': 'error',
        'no-throw-literal': 'error',
        'prefer-promise-reject-errors': 'error',
        
        // Node.js specific
        'callback-return': 'warn',
        'global-require': 'warn',
        'no-mixed-requires': 'error',
        'no-new-require': 'error',
        'no-path-concat': 'error',
        'no-process-exit': 'warn',
        'no-restricted-modules': ['error', {
            'paths': ['lodash', 'underscore', 'moment']
        }],
        'no-sync': ['warn', { 'allowAtRootLevel': true }],
        
        // ES6+ features
        'prefer-template': 'error',
        'template-curly-spacing': ['error', 'never'],
        'no-template-curly-in-string': 'error',
        'prefer-spread': 'error',
        'prefer-rest-params': 'error',
        'prefer-destructuring': ['error', {
            'array': true,
            'object': true
        }, {
            'enforceForRenamedProperties': false
        }],
        
        // Async/Promise rules
        'no-async-promise-executor': 'error',
        'no-await-in-loop': 'warn',
        'no-promise-executor-return': 'error',
        'require-atomic-updates': 'error',
        'max-nested-callbacks': ['error', 4],
        'no-return-await': 'error',
        
        // Import rules
        'import/order': ['error', {
            'groups': [
                'builtin',
                'external',
                'internal',
                'parent',
                'sibling',
                'index'
            ],
            'newlines-between': 'always',
            'alphabetize': {
                'order': 'asc',
                'caseInsensitive': true
            }
        }],
        'import/no-dynamic-require': 'warn',
        'import/no-extraneous-dependencies': ['error', {
            'devDependencies': [
                'test/**',
                'tests/**',
                'spec/**',
                '**/__tests__/**',
                '**/__mocks__/**',
                'test.{js,jsx}',
                'test-*.{js,jsx}',
                '**/*{.,_}{test,spec}.{js,jsx}',
                '**/jest.config.js',
                '**/jest.setup.js'
            ]
        }],
        
        // Complexity rules
        'complexity': ['warn', 15],
        'max-depth': ['error', 4],
        'max-lines': ['warn', {
            'max': 500,
            'skipBlankLines': true,
            'skipComments': true
        }],
        'max-lines-per-function': ['warn', {
            'max': 100,
            'skipBlankLines': true,
            'skipComments': true
        }],
        'max-params': ['warn', 5],
        'max-statements': ['warn', 20],
        
        // Admin-specific rules
        'no-eval': 'error',
        'no-implied-eval': 'error',
        'no-new-func': 'error',
        'no-script-url': 'error',
        'no-with': 'error'
    },
    overrides: [
        {
            files: ['*.test.js', '*.spec.js'],
            env: {
                jest: true
            },
            rules: {
                'max-lines': 'off',
                'max-lines-per-function': 'off',
                'max-statements': 'off',
                'no-magic-numbers': 'off'
            }
        },
        {
            files: ['migrations/*.js', 'seeders/*.js'],
            rules: {
                'no-console': 'off',
                'no-process-exit': 'off'
            }
        }
    ],
    settings: {
        'import/resolver': {
            node: {
                paths: ['servers/admin-server', 'shared']
            }
        }
    }
};
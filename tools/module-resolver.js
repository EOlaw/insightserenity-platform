#!/usr/bin/env node

'use strict';

const fs = require('fs');
const path = require('path');
const glob = require('glob');

class ModuleResolver {
  constructor(rootPath = process.cwd()) {
    this.rootPath = rootPath;
    this.moduleMap = new Map();
    this.importPatterns = [
      /require\(['"`]([^'"`]+)['"`]\)/g,
      /import.*from\s+['"`]([^'"`]+)['"`]/g,
      /import\(['"`]([^'"`]+)['"`]\)/g
    ];
    this.issues = [];
    this.fixes = [];
  }

  /**
   * Main execution method
   */
  async run(options = {}) {
    console.log('🔍 Module Resolution Diagnostic Starting...\n');
    
    try {
      // Step 1: Build module map
      await this.buildModuleMap();
      
      // Step 2: Scan for import issues
      await this.scanImports();
      
      // Step 3: Report issues
      this.reportIssues();
      
      // Step 4: Apply fixes if requested
      if (options.fix) {
        await this.applyFixes();
      }
      
      console.log('\n✅ Module resolution diagnostic complete!');
      
    } catch (error) {
      console.error('❌ Error during module resolution:', error.message);
      process.exit(1);
    }
  }

  /**
   * Builds a map of all available modules
   */
  async buildModuleMap() {
    console.log('📋 Building module map...');
    
    const patterns = [
      'shared/lib/**/*.js',
      'servers/*/modules/**/*.js',
      'servers/*/config/**/*.js',
      'servers/*/middleware/**/*.js',
      'servers/*/utils/**/*.js'
    ];

    for (const pattern of patterns) {
      const files = glob.sync(pattern, { 
        cwd: this.rootPath,
        ignore: [
          '**/node_modules/**',
          '**/test/**',
          '**/*.test.js',
          '**/*.spec.js'
        ]
      });

      files.forEach(filePath => {
        const fullPath = path.join(this.rootPath, filePath);
        const relativePath = path.relative(this.rootPath, fullPath);
        const baseName = path.basename(filePath, '.js');
        const dirName = path.dirname(relativePath);
        
        // Store multiple indexing strategies
        this.moduleMap.set(relativePath, fullPath);
        this.moduleMap.set(filePath, fullPath);
        this.moduleMap.set(baseName, fullPath);
        
        // Store directory-based keys
        const dirBasedKey = path.join(dirName, baseName);
        this.moduleMap.set(dirBasedKey, fullPath);
      });
    }
    
    console.log(`   Found ${this.moduleMap.size} module entries`);
  }

  /**
   * Scans all JavaScript files for import issues
   */
  async scanImports() {
    console.log('🔎 Scanning for import issues...');
    
    const jsFiles = glob.sync('**/*.js', {
      cwd: this.rootPath,
      ignore: [
        '**/node_modules/**',
        '**/test/**',
        '**/*.test.js',
        '**/*.spec.js',
        'tools/**'
      ]
    });

    for (const file of jsFiles) {
      await this.scanFile(file);
    }
    
    console.log(`   Scanned ${jsFiles.length} files`);
  }

  /**
   * Scans individual file for import issues
   */
  async scanFile(filePath) {
    const fullPath = path.join(this.rootPath, filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    const fileDir = path.dirname(fullPath);

    for (const pattern of this.importPatterns) {
      let match;
      pattern.lastIndex = 0; // Reset regex
      
      while ((match = pattern.exec(content)) !== null) {
        const importPath = match[1];
        
        // Skip node_modules and built-in modules
        if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
          continue;
        }

        const issue = await this.validateImport(filePath, importPath, fileDir);
        if (issue) {
          this.issues.push(issue);
        }
      }
    }
  }

  /**
   * Validates a single import statement
   */
  async validateImport(filePath, importPath, fileDir) {
    try {
      // Resolve the import path
      let resolvedPath;
      
      if (importPath.startsWith('.')) {
        // Relative import
        resolvedPath = path.resolve(fileDir, importPath);
      } else if (importPath.startsWith('/')) {
        // Absolute import
        resolvedPath = path.join(this.rootPath, importPath);
      }

      // Check if file exists (with or without .js extension)
      const extensions = ['', '.js', '/index.js'];
      let exists = false;
      let actualPath = null;

      for (const ext of extensions) {
        const testPath = resolvedPath + ext;
        if (fs.existsSync(testPath)) {
          exists = true;
          actualPath = testPath;
          break;
        }
      }

      if (!exists) {
        // Try to find potential matches
        const suggestions = this.findSuggestions(importPath);
        
        return {
          file: filePath,
          importPath,
          issue: 'MODULE_NOT_FOUND',
          resolvedPath,
          suggestions
        };
      }

    } catch (error) {
      return {
        file: filePath,
        importPath,
        issue: 'RESOLUTION_ERROR',
        error: error.message
      };
    }

    return null;
  }

  /**
   * Finds suggestions for missing modules
   */
  findSuggestions(importPath) {
    const suggestions = [];
    const baseName = path.basename(importPath, '.js');
    const searchTerms = [baseName, importPath];

    // Add directory-specific search
    const parts = importPath.split('/');
    if (parts.length > 1) {
      searchTerms.push(parts[parts.length - 1]);
      searchTerms.push(parts.slice(-2).join('/'));
    }

    for (const [key, fullPath] of this.moduleMap.entries()) {
      for (const term of searchTerms) {
        if (key.includes(term) || path.basename(key).includes(term)) {
          const relativePath = path.relative(this.rootPath, fullPath);
          suggestions.push({
            path: relativePath,
            confidence: this.calculateConfidence(term, key)
          });
        }
      }
    }

    // Sort by confidence and return top 3
    return suggestions
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3);
  }

  /**
   * Calculates confidence score for suggestions
   */
  calculateConfidence(searchTerm, candidatePath) {
    const searchLower = searchTerm.toLowerCase();
    const candidateLower = candidatePath.toLowerCase();
    
    if (candidateLower === searchLower) return 100;
    if (candidateLower.endsWith(searchLower)) return 90;
    if (candidateLower.includes(searchLower)) return 70;
    if (path.basename(candidateLower) === searchLower) return 85;
    
    // Levenshtein distance approximation
    const distance = this.getEditDistance(searchLower, candidateLower);
    return Math.max(0, 50 - distance * 2);
  }

  /**
   * Simple edit distance calculation
   */
  getEditDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Reports all found issues
   */
  reportIssues() {
    console.log('\n📊 Import Issues Report:');
    console.log('=' .repeat(50));
    
    if (this.issues.length === 0) {
      console.log('✅ No import issues found!');
      return;
    }

    // Group issues by type
    const groupedIssues = {};
    this.issues.forEach(issue => {
      if (!groupedIssues[issue.issue]) {
        groupedIssues[issue.issue] = [];
      }
      groupedIssues[issue.issue].push(issue);
    });

    Object.entries(groupedIssues).forEach(([type, issues]) => {
      console.log(`\n🔸 ${type} (${issues.length} issues):`);
      
      issues.forEach(issue => {
        console.log(`\n  📁 File: ${issue.file}`);
        console.log(`  🔗 Import: ${issue.importPath}`);
        
        if (issue.suggestions && issue.suggestions.length > 0) {
          console.log('  💡 Suggestions:');
          issue.suggestions.forEach((suggestion, index) => {
            console.log(`     ${index + 1}. ${suggestion.path} (${suggestion.confidence}% match)`);
          });
          
          // Prepare auto-fix if high confidence suggestion exists
          const bestSuggestion = issue.suggestions[0];
          if (bestSuggestion.confidence > 80) {
            this.fixes.push({
              file: issue.file,
              oldImport: issue.importPath,
              newImport: this.calculateRelativePath(issue.file, bestSuggestion.path),
              confidence: bestSuggestion.confidence
            });
          }
        }
      });
    });

    console.log(`\n📈 Summary: ${this.issues.length} issues found`);
    if (this.fixes.length > 0) {
      console.log(`🔧 ${this.fixes.length} high-confidence fixes available`);
      console.log('   Run with --fix flag to apply automatically');
    }
  }

  /**
   * Calculates relative path between two files
   */
  calculateRelativePath(fromFile, toFile) {
    const fromDir = path.dirname(path.join(this.rootPath, fromFile));
    const toPath = path.join(this.rootPath, toFile);
    let relativePath = path.relative(fromDir, toPath);
    
    // Ensure path starts with ./ for relative imports
    if (!relativePath.startsWith('.')) {
      relativePath = './' + relativePath;
    }
    
    // Remove .js extension for consistency
    if (relativePath.endsWith('.js')) {
      relativePath = relativePath.slice(0, -3);
    }
    
    return relativePath;
  }

  /**
   * Applies automatic fixes
   */
  async applyFixes() {
    if (this.fixes.length === 0) {
      console.log('\n⚠️  No fixes to apply');
      return;
    }

    console.log(`\n🔧 Applying ${this.fixes.length} fixes...`);
    
    const fileChanges = new Map();
    
    // Group fixes by file
    this.fixes.forEach(fix => {
      if (!fileChanges.has(fix.file)) {
        fileChanges.set(fix.file, []);
      }
      fileChanges.get(fix.file).push(fix);
    });

    // Apply fixes file by file
    for (const [filePath, fixes] of fileChanges.entries()) {
      const fullPath = path.join(this.rootPath, filePath);
      let content = fs.readFileSync(fullPath, 'utf8');
      
      fixes.forEach(fix => {
        const oldRequire = `require('${fix.oldImport}')`;
        const newRequire = `require('${fix.newImport}')`;
        const oldImport = `from '${fix.oldImport}'`;
        const newImport = `from '${fix.newImport}'`;
        
        content = content.replace(oldRequire, newRequire);
        content = content.replace(oldImport, newImport);
        
        console.log(`   ✓ ${filePath}: ${fix.oldImport} → ${fix.newImport}`);
      });
      
      fs.writeFileSync(fullPath, content, 'utf8');
    }
    
    console.log(`\n✅ Applied fixes to ${fileChanges.size} files`);
  }

  /**
   * Generates module map report
   */
  generateModuleMap() {
    console.log('\n📋 Available Modules:');
    console.log('=' .repeat(50));
    
    const modulesByDir = new Map();
    
    for (const [key, fullPath] of this.moduleMap.entries()) {
      if (key.includes('/')) {
        const dir = path.dirname(key);
        if (!modulesByDir.has(dir)) {
          modulesByDir.set(dir, []);
        }
        modulesByDir.get(dir).push(path.basename(key, '.js'));
      }
    }
    
    const sortedDirs = Array.from(modulesByDir.keys()).sort();
    
    sortedDirs.forEach(dir => {
      console.log(`\n📁 ${dir}:`);
      const modules = [...new Set(modulesByDir.get(dir))].sort();
      modules.forEach(module => {
        console.log(`   • ${module}`);
      });
    });
  }
}

// CLI interface
function main() {
  const args = process.argv.slice(2);
  const options = {
    fix: args.includes('--fix'),
    map: args.includes('--map')
  };

  const resolver = new ModuleResolver();
  
  if (options.map) {
    resolver.buildModuleMap().then(() => {
      resolver.generateModuleMap();
    });
  } else {
    resolver.run(options);
  }
}

// Export for programmatic use
module.exports = ModuleResolver;

// Run if called directly
if (require.main === module) {
  main();
}
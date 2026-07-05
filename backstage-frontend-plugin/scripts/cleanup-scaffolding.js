#!/usr/bin/env node

/**
 * Cleanup script for newly scaffolded Backstage frontend plugins
 *
 * `yarn new` (frontend-plugin) generates a New Frontend System plugin with an
 * example todo app: a TodoPage that fetches from a matching backend plugin and
 * a TodoList table component. This script removes the todo example and leaves
 * a minimal named page component ready for development.
 *
 * Usage:
 *   node scripts/cleanup-scaffolding.js <plugin-path>
 *
 * Example:
 *   node scripts/cleanup-scaffolding.js ../demo/plugins/my-plugin
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const pluginPath = process.argv[2];

if (!pluginPath) {
  console.error('❌ Usage: node cleanup-scaffolding.js <plugin-path>');
  console.error('   Example: node cleanup-scaffolding.js ../demo/plugins/my-plugin');
  process.exit(1);
}

// Helper: Convert kebab-case to PascalCase
function toPascalCase(str) {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

console.log('🧹 Cleaning up scaffolding example code from plugin...');
console.log(`📁 Plugin path: ${pluginPath}`);

// Check if plugin directory exists
if (!fs.existsSync(pluginPath)) {
  console.error(`❌ Plugin directory not found: ${pluginPath}`);
  process.exit(1);
}

// Check if it's a Backstage plugin
const packageJsonPath = path.join(pluginPath, 'package.json');
if (!fs.existsSync(packageJsonPath)) {
  console.error('❌ No package.json found - not a valid plugin directory');
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const pluginId = packageJson.backstage?.pluginId;

if (!pluginId) {
  console.error('❌ No pluginId found in package.json - not a valid Backstage plugin');
  process.exit(1);
}

const pluginName = toPascalCase(pluginId);
const componentName = `${pluginName}Page`;

console.log(`🔧 Plugin ID: ${pluginId}`);
console.log(`📝 Component name: ${componentName}`);

const componentsDir = path.join(pluginPath, 'src', 'components');
const todoPageDir = path.join(componentsDir, 'TodoPage');
const todoListDir = path.join(componentsDir, 'TodoList');
const pluginFilePath = path.join(pluginPath, 'src', 'plugin.tsx');

// Fail loudly if the scaffold does not look like what this script expects,
// rather than "succeeding" without doing anything.
if (!fs.existsSync(todoPageDir) || !fs.existsSync(pluginFilePath)) {
  console.error('❌ Expected scaffold layout not found (src/components/TodoPage + src/plugin.tsx).');
  console.error('   This script targets the output of `yarn new` frontend-plugin.');
  console.error('   The template may have changed, or cleanup already ran. Nothing was modified.');
  process.exit(1);
}

try {
  // Step 1: Remove the TodoList example component
  console.log('\n📦 Removing example components...');

  if (fs.existsSync(todoListDir)) {
    console.log('  - Removing TodoList/ (example table with mock data)');
    fs.rmSync(todoListDir, { recursive: true, force: true });
  }

  // Step 2: Replace TodoPage with a minimal named page component
  console.log(`\n🔄 Replacing TodoPage with ${componentName}...`);

  const newComponentDir = path.join(componentsDir, componentName);
  fs.rmSync(todoPageDir, { recursive: true, force: true });
  fs.mkdirSync(newComponentDir, { recursive: true });

  const pageComponent = `import { Header, Container } from '@backstage/ui';

export const ${componentName} = () => (
  <>
    <Header title="Welcome to ${pluginId}!" />
    <Container>{/* Build your plugin UI here */}</Container>
  </>
);
`;
  fs.writeFileSync(path.join(newComponentDir, `${componentName}.tsx`), pageComponent);
  fs.writeFileSync(
    path.join(newComponentDir, 'index.ts'),
    `export { ${componentName} } from './${componentName}';\n`,
  );
  console.log(`  ✅ Created ${componentName}/ (minimal page, todo fetching removed)`);

  // Step 3: Point plugin.tsx at the new component
  console.log('\n🔧 Updating plugin.tsx...');

  let pluginContent = fs.readFileSync(pluginFilePath, 'utf8');
  pluginContent = pluginContent
    .replace(/\.\/components\/TodoPage/g, `./components/${componentName}`)
    .replace(/m\.TodoPage/g, `m.${componentName}`)
    .replace(/<m\.TodoPage\s*\/>/g, `<m.${componentName} />`);
  fs.writeFileSync(pluginFilePath, pluginContent);
  console.log(`  ✅ plugin.tsx now loads ${componentName}`);

  // Step 4: Remove example tests and dev app
  console.log('\n🗑️  Removing example tests...');

  for (const rel of ['src/plugin.test.ts', 'src/plugin.test.tsx']) {
    const p = path.join(pluginPath, rel);
    if (fs.existsSync(p)) {
      console.log(`  - Removing ${rel}`);
      fs.unlinkSync(p);
    }
  }

  const devDir = path.join(pluginPath, 'dev');
  if (fs.existsSync(devDir)) {
    console.log('  - Removing dev/');
    fs.rmSync(devDir, { recursive: true, force: true });
  }

  console.log('\n✨ Cleanup complete!');
  console.log('\n📝 What changed:');
  console.log('  - Removed TodoList/ example component');
  console.log(`  - Replaced TodoPage with minimal ${componentName}`);
  console.log('  - Updated plugin.tsx to load the new component');
  console.log('  - Removed example tests');
  console.log('\n🚀 Next steps:');
  console.log(`  1. Build your UI in src/components/${componentName}/`);
  console.log('  2. Add extensions (nav items, entity cards) per backstage-frontend-plugin/SKILL.md');
} catch (error) {
  console.error('\n❌ Cleanup failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}

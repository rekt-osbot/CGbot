/**
 * Test Runner for Enhanced Stock Alert System
 * 
 * This script helps run the test suite and installs missing dependencies
 * Run with: node run-tests.js
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Console colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

console.log(`${colors.bright}${colors.blue}=== ENHANCED STOCK ALERT SYSTEM TEST RUNNER ===${colors.reset}\n`);

// Check if package.json exists
let packageJson;
try {
  packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  console.log(`${colors.green}Found package.json${colors.reset}`);
} catch (e) {
  try {
    packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package-enhanced.json'), 'utf8'));
    console.log(`${colors.yellow}Using package-enhanced.json${colors.reset}`);
    
    // Copy package-enhanced.json to package.json if it doesn't exist
    fs.copyFileSync(
      path.join(__dirname, 'package-enhanced.json'),
      path.join(__dirname, 'package.json')
    );
    console.log(`${colors.green}Created package.json from package-enhanced.json${colors.reset}`);
  } catch (e) {
    console.log(`${colors.red}Error: Could not find package.json or package-enhanced.json${colors.reset}`);
    console.log(`Please make sure you have package.json or package-enhanced.json in the current directory.`);
    process.exit(1);
  }
}

// Check if necessary files exist
const requiredFiles = [
  'status.js',
  'telegramFormats.js',
  'dashboard.html',
  'enhanced-dashboard.js',
  'integration.js',
  'test-enhanced.js'
];

let missingFiles = [];
requiredFiles.forEach(file => {
  if (!fs.existsSync(path.join(__dirname, file))) {
    missingFiles.push(file);
  }
});

if (missingFiles.length > 0) {
  console.log(`${colors.red}Missing required files:${colors.reset}`);
  missingFiles.forEach(file => {
    console.log(`  - ${file}`);
  });
  console.log(`Please make sure all required files are in the current directory.`);
  process.exit(1);
}

// Check and install dependencies
const dependencies = Object.keys(packageJson.dependencies || {});

console.log(`${colors.cyan}Checking dependencies...${colors.reset}`);
let missingDeps = [];

for (const dep of dependencies) {
  try {
    require(dep);
  } catch (e) {
    missingDeps.push(dep);
  }
}

if (missingDeps.length > 0) {
  console.log(`${colors.yellow}Missing dependencies: ${missingDeps.join(', ')}${colors.reset}`);
  console.log(`${colors.cyan}Installing missing dependencies...${colors.reset}`);
  
  try {
    execSync(`npm install ${missingDeps.join(' ')}`, { stdio: 'inherit' });
    console.log(`${colors.green}Dependencies installed successfully${colors.reset}`);
  } catch (e) {
    console.log(`${colors.red}Error installing dependencies:${colors.reset}`);
    console.log(e.message);
    console.log(`Please run npm install manually.`);
    process.exit(1);
  }
} else {
  console.log(`${colors.green}All dependencies are installed${colors.reset}`);
}

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  console.log(`${colors.cyan}Creating data directory...${colors.reset}`);
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`${colors.green}Data directory created${colors.reset}`);
}

// Run the tests
console.log(`\n${colors.bright}${colors.blue}Running tests...${colors.reset}\n`);

const testProcess = spawn('node', ['test-enhanced.js'], { stdio: 'inherit' });

testProcess.on('close', (code) => {
  if (code === 0) {
    console.log(`\n${colors.bright}${colors.green}All tests completed successfully${colors.reset}`);
    console.log(`\n${colors.cyan}Next steps:${colors.reset}`);
    console.log(`1. Update your main index.js using the integration.js guide`);
    console.log(`2. Run your application with 'npm start'`);
    console.log(`3. Visit http://localhost:3000/status to see the enhanced dashboard`);
  } else {
    console.log(`\n${colors.bright}${colors.red}Tests failed with code ${code}${colors.reset}`);
    console.log(`Please check the test output for details.`);
  }
}); 
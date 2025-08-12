#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('🚀 IP2M METRR Copilot Development Bootstrap');
console.log('==========================================\n');

async function main() {
  try {
    // Check Node.js version
    await checkNodeVersion();
    
    // Check if pnpm is installed
    await checkPnpm();
    
    // Create necessary directories
    await createDirectories();
    
    // Copy environment file if it doesn't exist
    await setupEnvironment();
    
    // Install dependencies
    await installDependencies();
    
    // Check Ollama availability
    await checkOllama();
    
    // Build packages
    await buildPackages();
    
    // Create logs directory
    await createLogsDirectory();
    
    console.log('\n✅ Bootstrap completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Review and update .env.local with your configuration');
    console.log('2. Ensure Ollama is running: ollama serve');
    console.log('3. Pull required models: ollama pull llama3.1:8b && ollama pull bge-small-en');
    console.log('4. Start development servers:');
    console.log('   - API: pnpm dev:api');
    console.log('   - Desktop: pnpm dev:desktop');
    console.log('5. Access the application at http://localhost:3000');
    
  } catch (error) {
    console.error('\n❌ Bootstrap failed:', error.message);
    process.exit(1);
  }
}

async function checkNodeVersion() {
  console.log('📋 Checking Node.js version...');
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  
  if (majorVersion < 18) {
    throw new Error(`Node.js 18+ is required. Current version: ${nodeVersion}`);
  }
  
  console.log(`✅ Node.js version: ${nodeVersion}`);
}

async function checkPnpm() {
  console.log('📋 Checking pnpm installation...');
  
  try {
    const pnpmVersion = execSync('pnpm --version', { encoding: 'utf8' }).trim();
    console.log(`✅ pnpm version: ${pnpmVersion}`);
  } catch (error) {
    throw new Error('pnpm is not installed. Please install it: npm install -g pnpm');
  }
}

async function createDirectories() {
  console.log('📁 Creating necessary directories...');
  
  const directories = [
    'data/corpus',
    'data/db',
    'logs',
    'apps/desktop/src',
    'apps/indexer/src'
  ];
  
  for (const dir of directories) {
    const fullPath = path.join(rootDir, dir);
    await fs.mkdir(fullPath, { recursive: true });
    console.log(`   Created: ${dir}`);
  }
}

async function setupEnvironment() {
  console.log('⚙️  Setting up environment configuration...');
  
  const envExamplePath = path.join(rootDir, '.env.local.example');
  const envPath = path.join(rootDir, '.env.local');
  
  try {
    await fs.access(envPath);
    console.log('✅ .env.local already exists');
  } catch (error) {
    // File doesn't exist, copy from example
    await fs.copyFile(envExamplePath, envPath);
    console.log('✅ Created .env.local from example');
  }
}

async function installDependencies() {
  console.log('📦 Installing dependencies...');
  
  try {
    execSync('pnpm install', { 
      cwd: rootDir, 
      stdio: 'inherit',
      encoding: 'utf8'
    });
    console.log('✅ Dependencies installed');
  } catch (error) {
    throw new Error('Failed to install dependencies');
  }
}

async function checkOllama() {
  console.log('🤖 Checking Ollama availability...');
  
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags');
    if (response.ok) {
      console.log('✅ Ollama is running');
      
      const data = await response.json();
      const models = data.models || [];
      
      console.log(`   Available models: ${models.length}`);
      
      const requiredModels = ['llama3.1:8b', 'bge-small-en'];
      const availableModelNames = models.map(m => m.name);
      
      for (const model of requiredModels) {
        if (availableModelNames.includes(model)) {
          console.log(`   ✅ ${model} is available`);
        } else {
          console.log(`   ⚠️  ${model} is not available - run: ollama pull ${model}`);
        }
      }
    } else {
      console.log('⚠️  Ollama is not responding properly');
    }
  } catch (error) {
    console.log('⚠️  Ollama is not running or not accessible');
    console.log('   Start Ollama with: ollama serve');
  }
}

async function buildPackages() {
  console.log('🔨 Building packages...');
  
  try {
    execSync('pnpm build', { 
      cwd: rootDir, 
      stdio: 'inherit',
      encoding: 'utf8'
    });
    console.log('✅ Packages built successfully');
  } catch (error) {
    console.log('⚠️  Build failed - this is expected if some packages are incomplete');
  }
}

async function createLogsDirectory() {
  console.log('📝 Setting up logging...');
  
  const logsDir = path.join(rootDir, 'logs');
  await fs.mkdir(logsDir, { recursive: true });
  
  // Create empty log files
  const logFiles = ['error.log', 'combined.log', 'audit.log', 'performance.log'];
  
  for (const logFile of logFiles) {
    const logPath = path.join(logsDir, logFile);
    try {
      await fs.access(logPath);
    } catch (error) {
      await fs.writeFile(logPath, '');
    }
  }
  
  console.log('✅ Logging directory configured');
}

// Run the bootstrap
main();

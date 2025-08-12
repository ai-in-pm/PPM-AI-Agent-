#!/usr/bin/env node

/**
 * IP2M METRR Copilot Document Indexer CLI
 * 
 * Command-line interface for document ingestion and indexing
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { DocumentIndexer, IndexerConfig } from './index.js';

const program = new Command();

program
  .name('ip2m-indexer')
  .description('IP2M METRR Copilot Document Indexer')
  .version('0.1.0');

program
  .command('index')
  .description('Index a document or directory')
  .argument('<path>', 'Path to document or directory to index')
  .option('-c, --corpus <path>', 'Corpus directory path', './data/corpus')
  .option('-v, --vector-store <path>', 'Vector store path', './data/db/vectors.sqlite')
  .option('--chunk-size <size>', 'Chunk size for text splitting', '1000')
  .option('--chunk-overlap <overlap>', 'Chunk overlap size', '200')
  .action(async (path: string, options) => {
    const spinner = ora('Initializing indexer...').start();
    
    try {
      const config: IndexerConfig = {
        corpusPath: options.corpus,
        vectorStorePath: options.vectorStore,
        chunkSize: parseInt(options.chunkSize),
        chunkOverlap: parseInt(options.chunkOverlap),
        supportedFormats: ['pdf', 'docx', 'xlsx', 'csv', 'txt']
      };

      const indexer = new DocumentIndexer(config);
      
      spinner.text = `Indexing: ${path}`;
      await indexer.indexDocument(path);
      
      spinner.succeed(chalk.green(`Successfully indexed: ${path}`));
    } catch (error) {
      spinner.fail(chalk.red(`Failed to index: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('batch')
  .description('Batch index all documents in a directory')
  .argument('<directory>', 'Directory containing documents to index')
  .option('-c, --corpus <path>', 'Corpus directory path', './data/corpus')
  .option('-v, --vector-store <path>', 'Vector store path', './data/db/vectors.sqlite')
  .action(async (directory: string, options) => {
    const spinner = ora('Starting batch indexing...').start();
    
    try {
      const config: IndexerConfig = {
        corpusPath: options.corpus,
        vectorStorePath: options.vectorStore,
        chunkSize: 1000,
        chunkOverlap: 200,
        supportedFormats: ['pdf', 'docx', 'xlsx', 'csv', 'txt']
      };

      const indexer = new DocumentIndexer(config);
      
      spinner.text = `Batch indexing directory: ${directory}`;
      await indexer.indexDirectory(directory);
      
      spinner.succeed(chalk.green(`Successfully completed batch indexing`));
    } catch (error) {
      spinner.fail(chalk.red(`Batch indexing failed: ${error.message}`));
      process.exit(1);
    }
  });

program.parse();

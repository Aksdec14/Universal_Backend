#!/usr/bin/env node

import { program } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { createRequire } from 'module';
import { config } from 'dotenv';
import { parseFile } from './parsers/fileParser.js';
import { parseURL } from './parsers/urlParser.js';
import { generateBackend } from './generators/aiClient.js';
import { writeGeneratedFiles } from './generators/fileWriter.js';

// Load .env
config();

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

// ─── Banner ────────────────────────────────────────────────────────────────

console.log(chalk.cyan.bold(`
╔══════════════════════════════════════════╗
║       🚀 Universal Backend Generator     ║
║          Powered by Groq / OpenRouter    ║
╚══════════════════════════════════════════╝
`));

// ─── CLI Setup ─────────────────────────────────────────────────────────────

program
  .name('ubackend')
  .description('Generate a complete Express.js backend from a file or URL using AI')
  .version(pkg.version)
  .option('-f, --file <path>', 'Path to input file (.json, .csv, .sql, .yaml, .txt)')
  .option('-u, --url <url>', 'URL to scrape and generate backend from')
  .option('-o, --output <dir>', 'Output directory for generated backend', './generated-backend')
  .option('-p, --provider <name>', 'AI provider: groq or openrouter', 'groq')
  .parse(process.argv);

const opts = program.opts();

// ─── Validation ────────────────────────────────────────────────────────────

if (!opts.file && !opts.url) {
  console.error(chalk.red('❌  Please provide either --file <path> or --url <url>'));
  console.log(chalk.gray('\nExamples:'));
  console.log(chalk.gray('  node src/index.js --file ./data.json'));
  console.log(chalk.gray('  node src/index.js --url https://jsonplaceholder.typicode.com'));
  console.log(chalk.gray('  node src/index.js --file ./schema.sql --output ./my-backend'));
  process.exit(1);
}

if (opts.file && opts.url) {
  console.error(chalk.red('❌  Please provide either --file or --url, not both.'));
  process.exit(1);
}

// Override provider from flag
if (opts.provider) {
  process.env.AI_PROVIDER = opts.provider;
}

// Check API keys
const provider = (process.env.AI_PROVIDER || 'groq').toLowerCase();
if (provider === 'groq' && !process.env.GROQ_API_KEY) {
  console.error(chalk.red('❌  GROQ_API_KEY is not set. Add it to your .env file.'));
  console.log(chalk.gray('   Get your key at: https://console.groq.com'));
  process.exit(1);
}
if (provider === 'openrouter' && !process.env.OPENROUTER_API_KEY) {
  console.error(chalk.red('❌  OPENROUTER_API_KEY is not set. Add it to your .env file.'));
  console.log(chalk.gray('   Get your key at: https://openrouter.ai'));
  process.exit(1);
}

// ─── Main Flow ─────────────────────────────────────────────────────────────

async function main() {
  const outputDir = path.resolve(opts.output);

  try {
    // Step 1: Parse input
    let parsedInput;
    if (opts.file) {
      const spinner = ora(`📂 Reading file: ${chalk.yellow(opts.file)}`).start();
      try {
        parsedInput = await parseFile(opts.file);
        spinner.succeed(`File parsed: ${chalk.green(parsedInput.fileName)} (${parsedInput.fileType.toUpperCase()})`);
        if (parsedInput.truncated) {
          console.log(chalk.yellow(`   ⚠️  File was large and has been truncated to fit AI context.`));
        }
      } catch (err) {
        spinner.fail(chalk.red(`Failed to read file: ${err.message}`));
        process.exit(1);
      }
    } else {
      const spinner = ora(`🌐 Scraping URL: ${chalk.yellow(opts.url)}`).start();
      try {
        parsedInput = await parseURL(opts.url);
        spinner.succeed(`URL scraped: ${chalk.green(parsedInput.url)} (${parsedInput.sourceType})`);
        if (parsedInput.truncated) {
          console.log(chalk.yellow(`   ⚠️  Page content was large and has been truncated.`));
        }
      } catch (err) {
        spinner.fail(chalk.red(`Failed to scrape URL: ${err.message}`));
        process.exit(1);
      }
    }

    // Step 2: Generate backend via AI
    console.log('');
    const aiSpinner = ora(
      `🤖 Generating backend with ${chalk.cyan(provider.toUpperCase())}... (this may take 10-30s)`
    ).start();

    let generatedFiles;
    try {
      generatedFiles = await generateBackend(parsedInput);
      aiSpinner.succeed(`Backend generated! ${chalk.green(`${Object.keys(generatedFiles).length} files`)}`);
    } catch (err) {
      aiSpinner.fail(chalk.red(`AI generation failed: ${err.message}`));
      process.exit(1);
    }

    // Step 3: Write files to disk
    console.log('');
    const writeSpinner = ora(`💾 Writing files to: ${chalk.yellow(outputDir)}`).start();

    const { written, failed } = writeGeneratedFiles(generatedFiles, outputDir);
    writeSpinner.succeed(`Files written successfully!`);

    // Step 4: Summary
    console.log('');
    console.log(chalk.green.bold('✅  Backend generated successfully!\n'));
    console.log(chalk.white.bold('📁 Generated Files:'));
    written.forEach(f => console.log(chalk.gray(`   ├── ${f}`)));

    if (failed.length > 0) {
      console.log(chalk.red.bold('\n⚠️  Some files failed to write:'));
      failed.forEach(f => console.log(chalk.red(`   ✗ ${f.filePath}: ${f.error}`)));
    }

    console.log('');
    console.log(chalk.cyan.bold('🚀 Next Steps:'));
    console.log(chalk.white(`   cd ${outputDir}`));
    console.log(chalk.white('   npm install'));
    console.log(chalk.white('   node index.js\n'));

  } catch (err) {
    console.error(chalk.red(`\n💥 Unexpected error: ${err.message}`));
    process.exit(1);
  }
}

main();

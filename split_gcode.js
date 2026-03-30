const fs = require('fs');
const readline = require('readline');

const ngcFiles = fs.readdirSync('.').filter(file => file.endsWith('.cnc'));
const inputFile = ngcFiles[0];
fileName = inputFile.replace(/\.cnc$/, '');
const numParts =15;

async function splitGcodeFile() {
  try {
    // First, count total lines
    console.log('Counting total lines...');
    const lineCount = await countLines(inputFile);
    console.log(`Total lines: ${lineCount}`);
    
    // Calculate lines per part
    const linesPerPart = Math.ceil(lineCount / numParts);
    console.log(`Lines per part: ${linesPerPart}`);
    
    // Split the file
    await splitFile(inputFile, linesPerPart, numParts, fileName);
    
    console.log('File splitting complete!');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

function countLines(filePath) {
  return new Promise((resolve, reject) => {
    let lineCount = 0;
    const rl = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity
    });
    
    rl.on('line', () => {
      lineCount++;
    });
    
    rl.on('close', () => {
      resolve(lineCount);
    });
    
    rl.on('error', reject);
  });
}

function splitFile(inputFile, linesPerPart, numParts, baseFileName) {
  return new Promise((resolve, reject) => {
    let currentLine = 0;
    let currentPart = 1;
    let currentOutput = null;
    
    const rl = readline.createInterface({
      input: fs.createReadStream(inputFile),
      crlfDelay: Infinity
    });
    
    rl.on('line', (line) => {
      // Create new output file for each part
      if (currentLine % linesPerPart === 0 && currentLine > 0) {
        if (currentOutput) {
          currentOutput.end();
        }
        currentPart++;
      }
      
      // Open new output file if needed
      if (!currentOutput || currentLine % linesPerPart === 0) {
        if (currentOutput) {
          currentOutput.end();
        }
        const outputFileName = `${baseFileName}_part${currentPart}.cnc`;
        currentOutput = fs.createWriteStream(outputFileName);
        console.log(`Creating part ${currentPart}: ${outputFileName}`);
      }
      
      // Write the line to current output
      currentOutput.write(line + '\n');
      currentLine++;
    });
    
    rl.on('close', () => {
      if (currentOutput) {
        currentOutput.end();
      }
      resolve();
    });
    
    rl.on('error', reject);
  });
}

// Run the script
splitGcodeFile();

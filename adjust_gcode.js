const fs = require('fs');
const readline = require('readline');

const ngcFiles = fs.readdirSync('.').filter(file => file.endsWith('.ngc'));
const inputFile = ngcFiles[0];
const outputFile = inputFile.replace(/\.ngc$/, '_modified.ngc');

const rl = readline.createInterface({
  input: fs.createReadStream(inputFile),
  crlfDelay: Infinity
});

const output = fs.createWriteStream(outputFile);

rl.on('line', (line) => {
  // Updated regex to match your G-code format
  const match = line.match(/^G1\s+Z\s*(-?\d*\.?\d+)\s*F\s*200(\.00)?/);
  if (match) {
    const zValue = parseFloat(match[1]);
    const newZ = (zValue + 1.5).toFixed(3);
    output.write(`G0 Z${newZ}\n`);
  }
  output.write(line + '\n');
});

rl.on('close', () => {
  output.end();
  console.log('Processing complete. Output written to', outputFile);
});
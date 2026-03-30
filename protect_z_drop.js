const fs = require('fs');
const readline = require('readline');

const DROP_THRESHOLD = 2;
const FSLOW = 100;
const FNORMAL = 1200;

const ngcFiles = fs.readdirSync('.').filter((file) => file.endsWith('.ngc'));
const inputFile = ngcFiles.find((file) => !file.includes('_protected')) || ngcFiles[0];

if (!inputFile) {
  console.error('Error: no .ngc file found in current directory.');
  process.exit(1);
}

const outputFile = inputFile.replace(/(\.[^.]+)$/, '_protected$1');

function extractZ(line) {
  if (!/^G1\b/.test(line)) {
    return null;
  }
  const match = line.match(/\bZ(-?\d*\.?\d+)\b/);
  if (!match) {
    return null;
  }
  return parseFloat(match[1]);
}

function setFeed(line, feedValue) {
  const feedToken = `F${feedValue}`;
  if (/\bF\s*-?\d*\.?\d+\b/.test(line)) {
    const lineWithoutFeed = line.replace(/\s*\bF\s*-?\d*\.?\d+\b/g, '');
    return `${lineWithoutFeed} ${feedToken}`;
  }
  return `${line} ${feedToken}`;
}

async function protectZDrop() {
  const rl = readline.createInterface({
    input: fs.createReadStream(inputFile),
    crlfDelay: Infinity
  });
  const output = fs.createWriteStream(outputFile);

  let previousZ = null;
  let pendingRestore = false;
  let eventCount = 0;

  for await (const line of rl) {
    const currentZ = extractZ(line);
    let processedLine = line;

    if (/^G1\b/.test(line) && pendingRestore) {
      processedLine = setFeed(processedLine, FNORMAL);
      pendingRestore = false;
    }

    if (previousZ !== null && currentZ !== null) {
      const delta = currentZ - previousZ;
      if (delta < -DROP_THRESHOLD) {
        processedLine = setFeed(processedLine, FSLOW);
        pendingRestore = true;
        eventCount++;
      }
    }

    output.write(processedLine + '\n');
    previousZ = currentZ;
  }

  output.end();
  console.log(`Processing complete. Output written to ${outputFile}`);
  console.log(`Detected and protected ${eventCount} Z-drop event(s).`);
}

protectZDrop().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});

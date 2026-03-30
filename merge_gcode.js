const fs = require('fs');
const path = require('path');
const readline = require('readline');

function parsePartFile(fileName) {
  const match = fileName.match(/^(.*)part(\d+)(.*?)(\.[^.]+)$/);
  if (!match) {
    return null;
  }

  return {
    fileName,
    beforePart: match[1],
    partNumber: Number(match[2]),
    afterPart: match[3],
    extension: match[4]
  };
}

function getPartGroup(files) {
  const parsed = files.map(parsePartFile).filter(Boolean);
  const part1Candidates = parsed.filter((f) => f.partNumber === 1);

  if (part1Candidates.length === 0) {
    throw new Error('No part1 file found in this directory.');
  }

  if (part1Candidates.length > 1) {
    const names = part1Candidates.map((f) => f.fileName).join(', ');
    throw new Error(`Multiple part1 files found. Keep only one group: ${names}`);
  }

  const part1 = part1Candidates[0];
  const sameGroup = parsed
    .filter(
      (f) =>
        f.beforePart === part1.beforePart &&
        f.afterPart === part1.afterPart &&
        f.extension === part1.extension
    )
    .sort((a, b) => a.partNumber - b.partNumber);

  for (let i = 0; i < sameGroup.length; i++) {
    const expectedPart = i + 1;
    if (sameGroup[i].partNumber !== expectedPart) {
      throw new Error(
        `Missing part${expectedPart}. Found sequence: ${sameGroup
          .map((f) => `part${f.partNumber}`)
          .join(', ')}`
      );
    }
  }

  return sameGroup;
}

function appendPartToOutput(inputPath, outputStream, skipLines) {
  return new Promise((resolve, reject) => {
    let currentLine = 0;
    const rl = readline.createInterface({
      input: fs.createReadStream(inputPath),
      crlfDelay: Infinity
    });

    rl.on('line', (line) => {
      currentLine++;
      if (currentLine <= skipLines) {
        return;
      }
      outputStream.write(line + '\n');
    });

    rl.on('close', resolve);
    rl.on('error', reject);
  });
}

async function mergeGcodeParts() {
  try {
    const files = fs
      .readdirSync('.')
      .filter((file) => fs.statSync(path.join('.', file)).isFile());

    const parts = getPartGroup(files);
    const outputFileName = `${parts[0].beforePart}${parts[0].afterPart}${parts[0].extension}`;

    if (outputFileName === parts[0].fileName) {
      throw new Error(`Output file name equals part1 file name: ${outputFileName}`);
    }

    console.log(`Merging ${parts.length} parts into: ${outputFileName}`);
    const outputStream = fs.createWriteStream(outputFileName);

    for (const part of parts) {
      const skipLines = part.partNumber === 1 ? 0 : 8;
      console.log(
        `Adding ${part.fileName} (${part.partNumber === 1 ? 'copy all lines' : 'skip first 8 lines'})`
      );
      await appendPartToOutput(path.join('.', part.fileName), outputStream, skipLines);
    }

    outputStream.end();
    console.log('Merge complete!');
  } catch (error) {
    console.error('Error:', error.message);
    process.exitCode = 1;
  }
}

mergeGcodeParts();

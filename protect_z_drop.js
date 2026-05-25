const fs = require('fs');
const readline = require('readline');

const DROP_THRESHOLD = 2;
const ANGLE_THRESHOLD_DEG = 30;
const XY_EPSILON = 1e-9;
const SLOW_LINES_TOTAL = 2;
const FSLOW = 150;
const FNORMAL = 900;

const RESTORE_RAMP_FEEDS = [
  Math.round(FNORMAL * 0.33),
  Math.round(FNORMAL * 0.66),
  FNORMAL
];

const RESTORE_RAMP_MID_FEEDS = RESTORE_RAMP_FEEDS.slice(0, -1);

const ngcFiles = fs.readdirSync('.').filter((file) => file.endsWith('.ngc'));
const inputFile = ngcFiles.find((file) => !file.includes('_protected')) || ngcFiles[0];

if (!inputFile) {
  console.error('Error: no .ngc file found in current directory.');
  process.exit(1);
}

const outputFile = inputFile.replace(/(\.[^.]+)$/, '_protected$1');

function extractAxisValue(line, axis) {
  const match = line.match(new RegExp(`\\b${axis}\\s*(-?\\d*\\.?\\d+)\\b`, 'i'));
  if (!match) {
    return null;
  }
  return parseFloat(match[1]);
}

function extractFeed(line) {
  const match = line.match(/\bF\s*(-?\d*\.?\d+)\b/i);
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

  let previousX = null;
  let previousY = null;
  let previousZ = null;
  let restoreRampIndex = null;
  let slowLinesRemaining = 0;
  let inRampMove = false;
  let modalFeed = null;
  let eventCount = 0;

  for await (const line of rl) {
    const lineX = extractAxisValue(line, 'X');
    const lineY = extractAxisValue(line, 'Y');
    const lineZ = extractAxisValue(line, 'Z');
    const lineF = extractFeed(line);
    const isG1 = /^\s*G1\b/i.test(line);

    let processedLine = line;

    if (isG1) {
      if (lineF !== null) {
        modalFeed = lineF;
        if (lineF < FNORMAL && !RESTORE_RAMP_MID_FEEDS.includes(lineF)) {
          inRampMove = true;
        } else if (lineF >= FNORMAL) {
          inRampMove = false;
        }
      }

      const currentX = lineX !== null ? lineX : previousX;
      const currentY = lineY !== null ? lineY : previousY;
      const currentZ = lineZ !== null ? lineZ : previousZ;

      let shouldSlow = false;
      if (!inRampMove && previousZ !== null && currentZ !== null && previousX !== null && previousY !== null && currentX !== null && currentY !== null) {
        const deltaZ = currentZ - previousZ;
        const absDeltaZ = Math.abs(deltaZ);
        const dx = currentX - previousX;
        const dy = currentY - previousY;
        const xyDistance = Math.hypot(dx, dy);
        const angleDeg = Math.atan2(absDeltaZ, Math.max(xyDistance, XY_EPSILON)) * (180 / Math.PI);

        shouldSlow = deltaZ < 0
          && absDeltaZ >= DROP_THRESHOLD
          && angleDeg > ANGLE_THRESHOLD_DEG;
      }

      if (!inRampMove) {
        let skipRampThisLine = false;
        if (slowLinesRemaining > 0) {
          slowLinesRemaining--;
          if (slowLinesRemaining === 0) {
            restoreRampIndex = 0;
            skipRampThisLine = true;
          }
        }

        if (shouldSlow) {
          restoreRampIndex = null;
          if (modalFeed !== FSLOW) {
            processedLine = setFeed(processedLine, FSLOW);
            modalFeed = FSLOW;
          }
          slowLinesRemaining = Math.max(SLOW_LINES_TOTAL - 1, 0);
          eventCount++;
        } else if (restoreRampIndex !== null && !skipRampThisLine) {
          const targetFeed = RESTORE_RAMP_FEEDS[restoreRampIndex];
          if (modalFeed !== targetFeed) {
            processedLine = setFeed(processedLine, targetFeed);
            modalFeed = targetFeed;
          }
          restoreRampIndex += 1;
          if (restoreRampIndex >= RESTORE_RAMP_FEEDS.length) {
            restoreRampIndex = null;
          }
        }
      }

      previousX = currentX;
      previousY = currentY;
      previousZ = currentZ;
    }

    output.write(processedLine + '\n');
  }

  output.end();
  console.log(`Processing complete. Output written to ${outputFile}`);
  console.log(
    `Detected and protected ${eventCount} Z-drop event(s) with abs(dZ)>=${DROP_THRESHOLD} and angle>${ANGLE_THRESHOLD_DEG}deg.`
  );
}

protectZDrop().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});

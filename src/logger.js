import fs from 'fs';
import path from 'path';

export function logToFile(content) {
  const logPath = path.join(path.resolve(), "error.log");
  fs.appendFileSync(logPath, `${content}\n`, 'utf8');
}

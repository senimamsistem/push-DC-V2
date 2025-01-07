import fs from 'fs';

export function readConversationFile(filePath) {
  const conversationData = fs.readFileSync(filePath, 'utf8');
  return conversationData
    .split('\n\n')
    .filter(block => block.trim().length > 0)
    .map(block => {
      const lines = block.split('\n');
      return lines.map(line => {
        const [question, answer] = line.split('|').map(part => part.trim()); 
        return { question: question || '', answer: answer || '' }; 
      });
    });
}

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import colors from 'colors';
import inquirer from 'inquirer';
import moment from 'moment';
import sleep from './src/sleep.js';
import { displayLogo } from './src/displayUtils.js';
import { logToFile } from './src/logger.js';
import { readConversationFile } from './src/fileUtils.js';
import { getRandomDelay } from './src/delayUtils.js';

displayLogo();

// Fungsi untuk menempatkan mention secara acak di depan atau belakang jawaban
function randomizeMentionPosition(mention, answer) {
  return Math.random() > 0.5 ? `${mention} ${answer}` : `${answer} ${mention}`;
}

(async () => {
  // Inquirer untuk pengaturan interaktif
  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'continueBot',
      message: 'Do you want to run the bot continuously?',
      default: true
    },
    {
      type: 'confirm',
      name: 'tagUsername',
      message: 'Do you want to tag the username when answering?',
      default: true
    },
    {
      type: 'list',
      name: 'delayOption',
      message: 'Select the delay setting for sending messages:',
      choices: [
        { name: 'Default (random between 40-60s)', value: 'default' },
        { name: 'Manual setup', value: 'manual' }
      ]
    },
    {
      type: 'input',
      name: 'minDelay',
      message: 'Enter minimum delay (in seconds):',
      when: (answers) => answers.delayOption === 'manual',
      validate: (input) => !isNaN(input) && Number(input) > 0
    },
    {
      type: 'input',
      name: 'maxDelay',
      message: 'Enter maximum delay (in seconds):',
      when: (answers) => answers.delayOption === 'manual',
      validate: (input) => !isNaN(input) && Number(input) > 0
    }
  ]);

  const { tagUsername, delayOption, minDelay, maxDelay } = answers;
  const delayMin = delayOption === 'manual' ? parseInt(minDelay, 10) : 40;
  const delayMax = delayOption === 'manual' ? parseInt(maxDelay, 10) : 60;

  await sleep(1000);

  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const configPath = path.join(scriptDir, "config.json");
  const conversationPath = path.join(scriptDir, "conversation.txt");

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const conversations = readConversationFile(conversationPath);

  let messageCount = 0;
  let lastMessageId = null;
  let previousMessageUserId = null;

  // Mulai loop tanpa akhir
  while (true) {
    for (const channel of config.channels) {
      const channelId = channel.id;
      const participants = channel.participants;

      console.log(colors.magenta(`\nProcessing channel: ${channel.name}`));

      // Pilih bait acak untuk memulai
      let currentPhase = Math.floor(Math.random() * conversations.length);
      
      while (true) {
        const conversation = conversations[currentPhase];
        let conversationIndex = 0; // Mengatur ulang indeks percakapan untuk setiap iterasi
        let conversationFinished = false;

        while (!conversationFinished) {
          const { question, answer } = conversation[conversationIndex];
          const askerIndex = Math.floor(Math.random() * participants.length);
          let answererIndex;

          // Memilih penjawab yang berbeda dari penanya
          do {
            answererIndex = Math.floor(Math.random() * participants.length);
          } while (answererIndex === askerIndex);

          const asker = participants[askerIndex];
          const answerer = participants[answererIndex];

          // Kirim pertanyaan dari penanya
          try {
            const questionPayload = {
              content: question,
              message_reference: lastMessageId ? { message_id: lastMessageId } : undefined
            };
            const questionHeaders = { 'Authorization': asker.token };

            const questionResponse = await axios.post(`https://discord.com/api/v9/channels/${channelId}/messages`, questionPayload, { headers: questionHeaders });
            messageCount++;
            const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');

            console.log(colors.green(`[${asker.name}] Sent question #${messageCount}:`));
            console.log(colors.yellow(`Content: ${questionPayload.content}`));
            console.log(colors.cyan(`Time: ${currentTime}`));

            lastMessageId = questionResponse.data.id;
            previousMessageUserId = questionResponse.data.author.id;

            if (questionResponse.headers['x-ratelimit-remaining'] === '0') {
              const retryAfter = parseInt(questionResponse.headers['x-ratelimit-reset-after']) * 1000;
              console.log(colors.red(`Rate limit reached. Waiting for ${retryAfter / 1000} seconds.`));
              await sleep(retryAfter);
            }
          } catch (error) {
            const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
            console.error(colors.red(`[${asker.name}] Error sending question #${messageCount}:`));
            console.error(colors.red(`Error details:`), error.response ? error.response.data : error.message);
            logToFile(`[${asker.name}] Error at ${currentTime}: ${error.message}`);
            await sleep(10000);
          }

          // Jeda acak sebelum akun lain menjawab
          await sleep(getRandomDelay(delayMin, delayMax));

          // Kirim jawaban dari penjawab
          try {
            const mention = `<@${previousMessageUserId}>`;
            const answerWithMention = tagUsername ? randomizeMentionPosition(mention, answer) : answer;

            const answerPayload = {
              content: answerWithMention,
              message_reference: lastMessageId ? { message_id: lastMessageId } : undefined
            };
            const answerHeaders = { 'Authorization': answerer.token };

            const answerResponse = await axios.post(`https://discord.com/api/v9/channels/${channelId}/messages`, answerPayload, { headers: answerHeaders });
            messageCount++;
            const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');

            console.log(colors.green(`[${answerer.name}] Sent answer #${messageCount}:`));
            console.log(colors.yellow(`Content: ${answerPayload.content}`));
            console.log(colors.cyan(`Time: ${currentTime}`));

            lastMessageId = answerResponse.data.id;

            if (answerResponse.headers['x-ratelimit-remaining'] === '0') {
              const retryAfter = parseInt(answerResponse.headers['x-ratelimit-reset-after']) * 1000;
              console.log(colors.red(`Rate limit reached. Waiting for ${retryAfter / 1000} seconds.`));
              await sleep(retryAfter);
            }
          } catch (error) {
            const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
            console.error(colors.red(`[${answerer.name}] Error sending answer #${messageCount}:`));
            console.error(colors.red(`Error details:`), error.response ? error.response.data : error.message);
            logToFile(`[${answerer.name}] Error at ${currentTime}: ${error.message}`);
            await sleep(10000);
          }

          // Jeda acak sebelum percakapan berikutnya
          await sleep(getRandomDelay(30, 60));
          conversationIndex++;

          if (conversationIndex >= conversation.length) {
            conversationFinished = true; // Menandakan bahwa percakapan selesai
          }
        }

        // Pilih bait acak untuk melanjutkan
        currentPhase = Math.floor(Math.random() * conversations.length);
      }
    }
  }
})();

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

(async () => {
  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'enableReply',
      message: 'Enable Reply? (Reply to previous messages)',
      default: true
    },
    {
      type: 'confirm',
      name: 'continueBot',
      message: 'Do you want to run the bot continuously?',
      default: true
    },
    {
      type: 'confirm',
      name: 'randomTag',
      message: 'Randomly tag username when answering?',
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

  const { enableReply, randomTag, delayOption, minDelay, maxDelay } = answers;
  const delayMin = delayOption === 'manual' ? parseInt(minDelay, 10) : 40;
  const delayMax = delayOption === 'manual' ? parseInt(maxDelay, 10) : 60;

  await sleep(1000);

  const config = JSON.parse(fs.readFileSync("config.json", "utf8"));
  const conversations = readConversationFile("conversation.txt");

  let lastMessageId = null;
  let previousMessageUserId = null;

  while (true) {
    for (const channel of config.channels) {
      console.log(colors.magenta(`\nProcessing channel: ${channel.name}`));

      let currentPhase = Math.floor(Math.random() * conversations.length);

      while (true) {
        const conversation = conversations[currentPhase];
        let conversationIndex = 0;
        let conversationFinished = false;

        while (!conversationFinished) {
          const { question, answer } = conversation[conversationIndex];
          const participants = channel.participants;

          const askerIndex = Math.floor(Math.random() * participants.length);
          let answererIndex;

          do {
            answererIndex = Math.floor(Math.random() * participants.length);
          } while (answererIndex === askerIndex);

          const asker = participants[askerIndex];
          const answerer = participants[answererIndex];

          try {
            const questionPayload = {
              content: question,
              message_reference: enableReply && lastMessageId ? { message_id: lastMessageId } : undefined
            };
            const questionHeaders = { 'Authorization': asker.token };

            const questionResponse = await axios.post(
              `https://discord.com/api/v9/channels/${channel.id}/messages`,
              questionPayload,
              { headers: questionHeaders }
            );

            const currentTime = moment().format('YYYY-MM-DD HH:mm:ss');
            console.log(colors.green(`[${asker.name}] Sent question:`));
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
            console.error(colors.red(`[${asker.name}] Error sending question:`));
            console.error(colors.red(`Error details:`), error.response ? error.response.data : error.message);
            logToFile(`[${asker.name}] Error: ${error.message}`);
            await sleep(10000);
          }

          await sleep(getRandomDelay(delayMin, delayMax));

          // 🔥 **LOGIKA RANDOM TAG**
          let mention = "";
          if (randomTag && Math.random() > 0.5) {
            // 50% kemungkinan akan menandai salah satu dari mereka
            mention = Math.random() > 0.5 ? `<@${previousMessageUserId}>` : `<@${asker.id}>`;
          }

          const answerContent = mention ? `${mention} ${answer}` : answer;

          try {
            const answerPayload = {
              content: answerContent,
              message_reference: enableReply && lastMessageId ? { message_id: lastMessageId } : undefined
            };
            const answerHeaders = { 'Authorization': answerer.token };

            const answerResponse = await axios.post(
              `https://discord.com/api/v9/channels/${channel.id}/messages`,
              answerPayload,
              { headers: answerHeaders }
            );

            console.log(colors.blue(`[${answerer.name}] Sent answer:`));
            console.log(colors.yellow(`Content: ${answerPayload.content}`));

            lastMessageId = answerResponse.data.id;
          } catch (error) {
            console.error(colors.red(`[${answerer.name}] Error sending answer:`));
            console.error(colors.red(`Error details:`), error.response ? error.response.data : error.message);
            logToFile(`[${answerer.name}] Error: ${error.message}`);
            await sleep(10000);
          }

          await sleep(getRandomDelay(delayMin, delayMax));

          conversationIndex++;
          if (conversationIndex >= conversation.length) {
            conversationFinished = true;
          }
        }
      }
    }
  }
})();

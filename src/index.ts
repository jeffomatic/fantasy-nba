import * as fs from 'fs';
import * as puppeteer from 'puppeteer';

import * as cbs from './cbs';
import { calculateLineup, Lineup } from './model';
import { retry } from './retry';
import * as slack from './slack';

interface Creds {
  email: string;
  password: string;
  slackApiToken: string;
}

async function getAndPersistLineup(args: {
  email: string;
  password: string;
  noSandbox: boolean;
  persist: boolean;
}): Promise<Lineup> {
  const puppeteerArgs = args.noSandbox
    ? {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      }
    : {};
  const browser = await puppeteer.launch(puppeteerArgs);
  const page = await browser.newPage();

  console.log('fetching players...');
  const [players, accessToken] = await retry(
    3,
    async () =>
      await cbs.getPlayers(page, {
        email: args.email,
        password: args.password,
      }),
  );

  console.log('calculating lineup...');
  const lineup = calculateLineup(players);
  console.log(JSON.stringify(lineup));

  if (args.persist) {
    console.log('setting lineup...');
    const result = await retry(
      3,
      async () => await cbs.persistLineup(page, accessToken, lineup),
    );
    console.log(result);
  }

  await browser.close();

  return lineup;
}

async function main(creds: Creds, args: Set<string>): Promise<void> {
  let lineup: Lineup;
  let getAndPersistError: Error;
  try {
    lineup = await getAndPersistLineup({
      email: creds.email,
      password: creds.password,
      noSandbox: args.has('no-sandbox'),
      persist: args.has('persist'),
    });
  } catch (e) {
    getAndPersistError = e;
    console.log(`getAndPersistLineup error: ${e}`);
    console.log('backtrace:');
    console.log(e.stack);
  }

  if (args.has('publish')) {
    console.log('publishing results...');
    if (lineup !== undefined) {
      await slack.publishLineup(creds.slackApiToken, lineup);
    } else {
      await slack.postMessage({
        token: creds.slackApiToken,
        text: `:warning: *Error processing lineup*\n\`\`\`\n${getAndPersistError}\n\`\`\``,
      });
    }
  }

  console.log('done');
}

if (require.main === module) {
  const credsPath = './creds.json';
  let creds: Creds;
  if (fs.existsSync(credsPath)) {
    creds = JSON.parse(fs.readFileSync(credsPath).toString()) as Creds;
  } else {
    creds = {
      email: process.env['EMAIL'],
      password: process.env['PASSWORD'],
      slackApiToken: process.env['SLACK_API_TOKEN'],
    };
  }

  // process.argv[0] is the runtime, either node or ts-node
  // process.argv[1] is the entrypoint script
  const args = new Set<string>(process.argv.slice(2));
  main(creds, args).catch(err => {
    console.log('uncaught error:');
    console.log(err);
    process.exit(1);
  });
}

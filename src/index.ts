import * as fs from 'fs';
import * as puppeteer from 'puppeteer';

import * as cbs from './cbs';
import { calculateLineup } from './model';
import * as slack from './slack';

interface Creds {
  email: string;
  password: string;
  slackApiToken: string;
}

async function main(creds: Creds, args: Set<string>): Promise<void> {
  const puppeteerArgs = args.has('no-sandbox')
    ? {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      }
    : {};
  const browser = await puppeteer.launch(puppeteerArgs);
  const page = await browser.newPage();

  console.log('fetching players...');
  const [players, accessToken] = await cbs.getLineup(page, {
    email: creds.email,
    password: creds.password,
  });

  console.log('calculating lineup...');
  const lineup = calculateLineup(players);
  console.log(JSON.stringify(lineup));

  if (args.has('persist')) {
    console.log('setting lineup...');
    const result = await cbs.persistLineup(page, accessToken, lineup);
    console.log(result);

    console.log('publishing results...');
    await slack.publishLineup(creds.slackApiToken, lineup);
  }

  await browser.close();

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

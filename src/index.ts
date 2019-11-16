import * as fs from 'fs';
import * as moment from 'moment-timezone';
import * as puppeteer from 'puppeteer';

import { Availability, Lineup, Player } from './common';
import { publishLineup } from './publish';

const pages = {
  login: {
    url: 'https://www.cbssports.com/login',
    selectors: {
      emailInput: '#userid',
      passwordInput: '#password',
      loginButton: '#login_form input[type="submit"]',
    },
  },
  teamHome: {
    url: 'http://nothingbutnetolicky.basketball.cbssports.com/teams/13',
    selectors: {
      starterRow: '.playerRow.row1:not(.empty)',
      benchRow: '.playerRow.row2:not(.empty)',
    },
  },
};

function setLineupParams(args: {
  accessToken: string;
  team: number;
  active: {
    centers: string[];
    guards: string[];
    forwards: string[];
    gfc: string[];
  };
  reserve: { id: string; pos: string }[];
}): string {
  const active: { [key: string]: { pos: string } } = {};
  for (let id of args.active.centers) active[id] = { pos: 'C' };
  for (let id of args.active.guards) active[id] = { pos: 'G' };
  for (let id of args.active.forwards) active[id] = { pos: 'F' };
  for (let id of args.active.gfc) active[id] = { pos: 'G-F-C' };

  const reserve: { [key: string]: { pos: string } } = {};
  for (let { id, pos } of args.reserve) reserve[id] = { pos };

  const payload = {
    team: args.team.toString(),
    active,
    reserve,
    point: moment()
      .tz('America/New_York')
      .format('YYYYMMDD'),
  };

  const params = new URLSearchParams();
  params.append('payload', JSON.stringify(payload));
  params.append('access_token', args.accessToken);
  params.append('version', '2.0');
  params.append('resultFormat', 'json');
  params.append('responseFormat', 'json');

  return params.toString();
}

async function getPlayerInfo(
  playerRowElement: puppeteer.ElementHandle,
): Promise<Player | null> {
  const info = await playerRowElement.$('td:nth-of-type(3)');
  if (info === null) return null;

  const { id, name } = await info.$eval('a:nth-of-type(1)', n => {
    return {
      id: n
        .getAttribute('href')
        .trim()
        .split('/')
        .slice(-1)[0],
      name: (n as HTMLElement).innerText,
    };
  });

  const positions = await info.$eval('.playerPositionAndTeam', n =>
    (n as HTMLElement).innerText.split(' | ')[0].split(','),
  );

  let availability = Availability.Playing;

  const notPlaying = await playerRowElement.$eval(
    'td:nth-of-type(4)',
    n => n.innerHTML.trim().toLowerCase() === 'no game',
  );
  if (notPlaying) {
    availability = Availability.NotPlaying;
  }

  const injuryReport = await info.$('[subtab="Injury Report"]');
  if (injuryReport !== null) {
    const injuryLabel: string = await injuryReport.evaluate(n =>
      n.getAttribute('aria-label'),
    );
    if (injuryLabel.toLowerCase().indexOf('game time decision') >= 0) {
      availability = Availability.Questionable;
    } else {
      availability = Availability.Injured;
    }
  }

  const rank = await playerRowElement.$eval('td:nth-of-type(7)', n =>
    parseInt((n as HTMLElement).innerText.trim()),
  );

  return { id, name, positions, availability, rank };
}

function calculateLineup(players: Player[]): Lineup {
  const guards: string[] = [];
  const forwards: string[] = [];
  const centers: string[] = [];
  const gfc: string[] = [];
  const playersById: { [key: string]: Player } = {};

  for (let p of players) {
    if (p.positions.indexOf('G') >= 0) guards.push(p.id);
    if (p.positions.indexOf('F') >= 0) forwards.push(p.id);
    if (p.positions.indexOf('C') >= 0) centers.push(p.id);

    gfc.push(p.id);
    playersById[p.id] = p;
  }

  const comparePlayers = (a: string, b: string) => {
    const pa = playersById[a];
    const pb = playersById[b];

    if (pa.availability - pb.availability !== 0) {
      return pa.availability - pb.availability;
    }

    return pa.rank - pb.rank;
  };

  guards.sort(comparePlayers);
  forwards.sort(comparePlayers);
  centers.sort(comparePlayers);
  gfc.sort(comparePlayers);

  const taken = new Set<string>();
  const lineup: {
    centers: Player[];
    guards: [];
    forwards: Player[];
    gfc: Player[];
    reserve: Player[];
  } = {
    centers: [],
    guards: [],
    forwards: [],
    gfc: [],
    reserve: [],
  };

  const assignPlayer = (src: string[], dest: Player[]) => {
    for (let id of src) {
      if (!taken.has(id)) {
        dest.push(playersById[id]);
        taken.add(id);
        break;
      }
    }
  };

  assignPlayer(centers, lineup.centers);
  assignPlayer(centers, lineup.centers);
  assignPlayer(guards, lineup.guards);
  assignPlayer(guards, lineup.guards);
  assignPlayer(guards, lineup.guards);
  assignPlayer(guards, lineup.guards);
  assignPlayer(forwards, lineup.forwards);
  assignPlayer(forwards, lineup.forwards);
  assignPlayer(forwards, lineup.forwards);
  assignPlayer(forwards, lineup.forwards);
  assignPlayer(gfc, lineup.gfc);
  assignPlayer(gfc, lineup.gfc);

  for (let id of gfc) {
    if (taken.has(id)) continue;
    lineup.reserve.push(playersById[id]);
  }

  return lineup;
}

async function fetchPlayers(page: puppeteer.Page): Promise<Player[]> {
  // Pull player rows
  console.log('extracting starter information...');
  const starterRows = await page.$$(pages.teamHome.selectors.starterRow);
  const starters = await Promise.all(
    starterRows.map((el, i) => {
      console.log(`processing starter ${i}`);
      return getPlayerInfo(el);
    }),
  );

  console.log('extracting bench information...');
  const benchRows = await page.$$(pages.teamHome.selectors.benchRow);
  const bench = await Promise.all(
    benchRows.map((el, i) => {
      console.log(`processing bench ${i}`);
      return getPlayerInfo(el);
    }),
  );

  return starters.concat(bench);
}

async function commitLineup(
  page: puppeteer.Page,
  accessToken: string,
  lineup: Lineup,
) {
  const requestBody = setLineupParams({
    team: 13,
    accessToken: accessToken,
    active: {
      centers: lineup.centers.map(p => p.id),
      guards: lineup.guards.map(p => p.id),
      forwards: lineup.forwards.map(p => p.id),
      gfc: lineup.gfc.map(p => p.id),
    },
    reserve: lineup.reserve.map(p => {
      return {
        id: p.id,
        pos: p.positions[0],
      };
    }),
  });

  page.on('console', consoleObj =>
    console.log({ type: 'browser-log', text: consoleObj.text() }),
  );
  return await page.evaluate(requestBody => {
    return fetch(
      'http://nothingbutnetolicky.basketball.cbssports.com/api/league/transactions/lineup',
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: requestBody,
        credentials: 'same-origin',
      },
    )
      .then(resp => resp.json())
      .then(body => {
        return { success: true, body: JSON.stringify(body) };
      })
      .catch(err => {
        return { success: false, err: err.toString() };
      });
  }, requestBody);
}

interface Creds {
  email: string;
  password: string;
  slackApiToken: string;
}

declare global {
  interface Window {
    CBSi: { token: string };
  }
}

async function main(creds: Creds, args: Set<string>): Promise<void> {
  const puppeteerArgs = args.has('no-sandbox')
    ? {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      }
    : {};
  const browser = await puppeteer.launch(puppeteerArgs);
  const page = await browser.newPage();

  // Log in
  console.log('logging in...');
  await page.goto(pages.login.url);
  await page.waitForSelector(pages.login.selectors.emailInput);
  await page.type(pages.login.selectors.emailInput, creds.email);
  await page.type(pages.login.selectors.passwordInput, creds.password);
  await Promise.all([
    page.waitForNavigation(),
    page.click(pages.login.selectors.loginButton),
  ]);

  console.log('loading team page...');
  await page.goto(pages.teamHome.url);
  await page.waitForSelector(pages.teamHome.selectors.starterRow);

  console.log('extracting access token...');
  const accessToken = await page.evaluate(() => window['CBSi']['token']);

  console.log('fetching players...');
  const players = await fetchPlayers(page);

  console.log('calculating lineup...');
  const lineup = calculateLineup(players);
  console.log(JSON.stringify(lineup));

  if (args.has('persist')) {
    console.log('setting lineup...');
    const result = await commitLineup(page, accessToken, lineup);
    console.log(result);

    console.log('publishing results...');
    await publishLineup(creds.slackApiToken, lineup);
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

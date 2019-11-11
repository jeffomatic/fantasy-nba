import * as fs from 'fs';
import * as moment from 'moment-timezone';
import * as puppeteer from 'puppeteer';

const testRoster = {
  centers: [
    {
      id: '1647481',
      name: 'Nikola Vucevic',
      positions: ['C'],
      availability: 0,
      rank: 28,
    },
    {
      id: '2152455',
      name: 'Domantas Sabonis',
      positions: ['C'],
      availability: 0,
      rank: 96,
    },
  ],
  guards: [
    {
      id: '2135526',
      name: 'Spencer Dinwiddie',
      positions: ['G'],
      availability: 0,
      rank: 119,
    },
    {
      id: '2355022',
      name: 'Malik Monk',
      positions: ['G'],
      availability: 0,
      rank: 263,
    },
    {
      id: '1646202',
      name: 'Kemba Walker',
      positions: ['G'],
      availability: 2,
      rank: 10,
    },
    {
      id: '1622555',
      name: 'Russell Westbrook',
      positions: ['G'],
      availability: 2,
      rank: 30,
    },
  ],
  forwards: [
    {
      id: '2135532',
      name: 'Aaron Gordon',
      positions: ['F'],
      availability: 0,
      rank: 100,
    },
    {
      id: '2135570',
      name: 'T.J. Warren',
      positions: ['F'],
      availability: 0,
      rank: 117,
    },
    {
      id: '2106818',
      name: "DeAndre' Bembry",
      positions: ['F'],
      availability: 0,
      rank: 207,
    },
    {
      id: '1905196',
      name: 'Norman Powell',
      positions: ['F'],
      availability: 0,
      rank: 211,
    },
  ],
  gfc: [
    {
      id: '1231870',
      name: 'Marc Gasol',
      positions: ['C'],
      availability: 0,
      rank: 187,
    },
    {
      id: '2842761',
      name: 'Luke Kennard',
      positions: ['F', 'G'],
      availability: 2,
      rank: 32,
    },
  ],
  reserve: [
    {
      id: '1992781',
      name: 'Harrison Barnes',
      positions: ['F'],
      availability: 2,
      rank: 60,
    },
    {
      id: '555988',
      name: 'Lou Williams',
      positions: ['G'],
      availability: 2,
      rank: 66,
    },
    {
      id: '1831130',
      name: 'Davis Bertans',
      positions: ['F'],
      availability: 2,
      rank: 81,
    },
    {
      id: '1113157',
      name: 'Rudy Gay',
      positions: ['F'],
      availability: 2,
      rank: 151,
    },
    {
      id: '1622501',
      name: 'Eric Gordon',
      positions: ['F', 'G'],
      availability: 2,
      rank: 186,
    },
    {
      id: '2153012',
      name: 'Jakob Poeltl',
      positions: ['C'],
      availability: 2,
      rank: 237,
    },
    {
      id: '2202574',
      name: 'Malik Beasley',
      positions: ['G'],
      availability: 3,
      rank: 232,
    },
    {
      id: '1113178',
      name: 'Rajon Rondo',
      positions: ['G'],
      availability: 3,
      rank: 408,
    },
  ],
};

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
  const active = {};
  for (let id of args.active.centers) active[id] = { pos: 'C' };
  for (let id of args.active.guards) active[id] = { pos: 'G' };
  for (let id of args.active.forwards) active[id] = { pos: 'F' };
  for (let id of args.active.gfc) active[id] = { pos: 'G-F-C' };

  const reserve = {};
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

const api = {
  // content-type: application/x-www-form-urlencoded; charset=UTF-8
  // params:
  // - payload: {"team":"13","active":{"555988":{"pos":"G"}},"reserve":{"2842761":{"pos":"G"}},"point":"20191110"}
  // - access_token: ...
  // - version: 2.0
  // - resultFormat: json
  // - responseFormat: json
  setLineup: {
    method: 'put',
    url:
      'http://nothingbutnetolicky.basketball.cbssports.com/api/league/transactions/lineup',
  },
};

enum Availability {
  Playing,
  Questionable,
  NotPlaying,
  Injured,
}

interface Player {
  id: string;
  name: string;
  positions: string[];
  availability: Availability;
  rank: number;
}

async function getPlayerInfo(playerRowElement): Promise<Player | null> {
  const info = await playerRowElement.$('td:nth-of-type(3)');
  if (info === null) return null;

  const { id, name } = await info.$eval('a:nth-of-type(1)', n => {
    return {
      id: n
        .getAttribute('href')
        .trim()
        .split('/')
        .slice(-1)[0],
      name: n.innerText,
    };
  });

  const positions = await info.$eval('.playerPositionAndTeam', node =>
    node.innerText.split(' | ')[0].split(','),
  );

  const injured = (await info.$$('.icon-red_cross')).length > 0;
  const notPlaying = await playerRowElement.$eval(
    'td:nth-of-type(4)',
    n => n.innerHTML.trim().toLowerCase() === 'no game',
  );
  let availability = Availability.Playing;
  if (injured) {
    availability = Availability.Injured;
  } else if (notPlaying) {
    availability = Availability.NotPlaying;
  }

  const rank = await playerRowElement.$eval('td:nth-of-type(7)', n =>
    parseInt(n.innerText.trim()),
  );

  return { id, name, positions, availability, rank };
}

interface Roster {
  centers: Player[];
  guards: Player[];
  forwards: Player[];
  gfc: Player[];
  reserve: Player[];
}

function selectRoster(players: Player[]): Roster {
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
  const roster = {
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

  assignPlayer(centers, roster.centers);
  assignPlayer(centers, roster.centers);
  assignPlayer(guards, roster.guards);
  assignPlayer(guards, roster.guards);
  assignPlayer(guards, roster.guards);
  assignPlayer(guards, roster.guards);
  assignPlayer(forwards, roster.forwards);
  assignPlayer(forwards, roster.forwards);
  assignPlayer(forwards, roster.forwards);
  assignPlayer(forwards, roster.forwards);
  assignPlayer(gfc, roster.gfc);
  assignPlayer(gfc, roster.gfc);

  for (let id of gfc) {
    if (taken.has(id)) continue;
    roster.reserve.push(playersById[id]);
  }

  return roster;
}

async function getRoster(page: puppeteer.Page): Promise<Roster> {

  // Pull player rows
  console.log('extracting starter information...');
  const starterRows = await page.$$('.playerRow.row1:not(.empty)');
  const starters = await Promise.all(
    starterRows.map((el, i) => {
      console.log(`processing starter ${i}`);
      return getPlayerInfo(el);
    }),
  );

  console.log('extracting bench information...');
  const benchRows = await page.$$('.playerRow.row2:not(.empty)');
  const bench = await Promise.all(
    benchRows.map((el, i) => {
      console.log(`processing bench ${i}`);
      return getPlayerInfo(el);
    }),
  );

  // Select roster
  console.log('selecting roster...');
  const roster = selectRoster(starters.concat(bench));

  return roster;
}

async function setLineup(
  page: puppeteer.Page,
  accessToken: string,
  roster: Roster,
) {
  const requestBody = setLineupParams({
    team: 13,
    accessToken: accessToken,
    active: {
      centers: roster.centers.map(p => p.id),
      guards: roster.guards.map(p => p.id),
      forwards: roster.forwards.map(p => p.id),
      gfc: roster.gfc.map(p => p.id),
    },
    reserve: roster.reserve.map(p => {
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

async function main(): Promise<void> {
  const creds = JSON.parse(fs.readFileSync('./creds.json').toString());

  const browser = await puppeteer.launch();
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

  // Go to team home
  console.log('loading team page...');
  await page.goto(pages.teamHome.url);
  await page.waitForSelector('.playerRow.row1');

  // Get access token
  console.log('extracting access token...');
  const accessToken = await page.evaluate(() => window['CBSi']['token']);

  // Scan page for roster
  console.log('generating roster...');
  const roster = await getRoster(page);

  // Set lineup
  console.log('setting lineup...');
  const result = await setLineup(page, accessToken, roster);
  console.log(result);

  await browser.close();
}

main()
  .then(() => console.log('done'))
  .catch(err => {
    console.log('uncaught error:');
    console.log(err);
    process.exit(1);
  });

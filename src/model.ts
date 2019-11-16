export enum Availability {
  Playing,
  Questionable,
  NotPlaying,
  Injured,
}

export interface Player {
  id: string;
  name: string;
  positions: string[];
  availability: Availability;
  rank: number;
}

export interface Lineup {
  centers: Player[];
  guards: Player[];
  forwards: Player[];
  gfc: Player[];
  reserve: Player[];
}

export function calculateLineup(players: Player[]): Lineup {
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

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

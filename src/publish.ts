import * as slack from '@slack/web-api';

import { Availability, Lineup, Player } from './common';

interface ConversationsListResult extends slack.WebAPICallResult {
  channels: {
    id: string;
    name: string;
    is_member: boolean;
  }[];
}

function renderAvailability(a: Availability): string {
  switch (a) {
    case Availability.Playing:
      return 'playing';
    case Availability.Questionable:
      return 'questionable';
    case Availability.NotPlaying:
      return 'no game';
    case Availability.Injured:
      return 'injured';
  }
}

export function renderPlayer(p: Player): string {
  return `- ${p.name} *${p.positions.join('')}* (${renderAvailability(
    p.availability,
  )})`;
}

export async function publishLineup(
  slackApiToken: string,
  lineup: Lineup,
): Promise<void> {
  const slackClient = new slack.WebClient(slackApiToken);

  const clResult = (await slackClient.conversations.list()) as ConversationsListResult;
  const channels = clResult.channels
    .filter(c => c.is_member)
    .sort((a, b) => {
      if (a.name.indexOf('basketball') >= 0) return -1;
      if (b.name.indexOf('basketball') >= 0) return 1;
      return 0;
    });

  const body = `
*Centers*
${lineup.centers.map(renderPlayer).join('\n')}

*Forwards*
${lineup.forwards.map(renderPlayer).join('\n')}

*Guards*
${lineup.guards.map(renderPlayer).join('\n')}

*Flex*
${lineup.gfc.map(renderPlayer).join('\n')}

*Reserve*
${lineup.reserve.map(renderPlayer).join('\n')}
`;
  const cpmResult = await slackClient.chat.postMessage({
    channel: channels[0].id,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:basketball: *Current lineup*`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: body,
        },
      },
    ],
    text: null,
  });

  if (!cpmResult.ok) {
    throw new Error(`Slack error: ${cpmResult.error}`);
  }
}

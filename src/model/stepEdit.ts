import { updateChannel, type Channel, type Project, type StepEventMetadata } from './project';
import { canSetLength, trackLength } from './trackPattern';

/**
 * Beat grid › Tap › Insert / Remove: add or take away one step inside a track's pattern.
 * The pattern length is fixed, so Insert pushes everything from the tapped step one step later and the
 * track's last step falls off the end; Remove pulls everything after the tapped step one step earlier.
 * Only grid tracks (steps or kit lanes) can do this; the whole kit moves together so its lanes stay in time.
 */
export type StepEdit = 'insert' | 'remove';

export const canEditSteps = (c: Channel) => canSetLength(c);

function shiftSteps(steps: boolean[], length: number, at: number, edit: StepEdit): boolean[] {
  return steps.map((on, index) => {
    if (index < at || index >= length) return on;
    if (edit === 'insert') return index === at ? false : steps[index - 1];
    return index + 1 < length ? steps[index + 1] : false;
  });
}

function shiftMetadata(
  metadata: Record<number, StepEventMetadata> | undefined, length: number, at: number, edit: StepEdit,
): Record<number, StepEventMetadata> | undefined {
  if (!metadata) return metadata;
  const next: Record<number, StepEventMetadata> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const step = Number(key);
    if (step < at || step >= length) next[step] = value;
    else if (edit === 'insert' && step + 1 < length) next[step + 1] = value;
    else if (edit === 'remove' && step > at) next[step - 1] = value;
  }
  return next;
}

/** True when inserting would push a hit off the end of the track (so it needs a confirm). */
export function insertLosesHit(p: Project, channelId: string): boolean {
  const channel = p.channels.find((item) => item.id === channelId);
  if (!channel) return false;
  const last = trackLength(p, channel) - 1;
  return channel.lanes ? channel.lanes.some((lane) => lane.steps[last]) : Boolean(channel.steps[last]);
}

/** Insert an empty step at `step`. Returns the project unchanged when it would lose the last hit and `confirmed` is false. */
export function insertStep(p: Project, channelId: string, step: number, confirmed = false): Project {
  return editSteps(p, channelId, step, 'insert', confirmed);
}

/** Remove the step at `step`; the rest of the pattern moves one step earlier and the last step is empty. */
export function removeStep(p: Project, channelId: string, step: number): Project {
  return editSteps(p, channelId, step, 'remove', true);
}

function editSteps(p: Project, channelId: string, step: number, edit: StepEdit, confirmed: boolean): Project {
  const channel = p.channels.find((item) => item.id === channelId);
  if (!channel || !canEditSteps(channel)) return p;
  const length = trackLength(p, channel);
  if (!Number.isInteger(step) || step < 0 || step >= length) return p;
  if (edit === 'insert' && !confirmed && insertLosesHit(p, channelId)) return p;
  if (channel.lanes) {
    return updateChannel(p, channelId, {
      lanes: channel.lanes.map((lane) => {
        const stepEventMetadata = shiftMetadata(lane.stepEventMetadata, length, step, edit);
        return { ...lane, steps: shiftSteps(lane.steps, length, step, edit), ...(stepEventMetadata ? { stepEventMetadata } : {}) };
      }),
    });
  }
  const stepEventMetadata = shiftMetadata(channel.stepEventMetadata, length, step, edit);
  return updateChannel(p, channelId, {
    steps: shiftSteps(channel.steps, length, step, edit),
    ...(stepEventMetadata ? { stepEventMetadata } : {}),
  });
}

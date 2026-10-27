import { createProject, normalizeEffects, normalizeSwingTemplate, type Channel, type Pattern, type Project } from './project';

const KEY = 'musicmaker.project.v1';

export function saveProject(p: Project): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage full or unavailable */ }
}

export function loadProject(): Project {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Project;
      if (p && Array.isArray(p.channels) && typeof p.bpm === 'number') {
        const normalizeChannel = (channel: Channel): Channel => ({
          ...channel,
          notes: Array.isArray(channel.notes) ? channel.notes : [],
        });
        const patterns: Pattern[] = Array.isArray(p.patterns)
          ? p.patterns.map((pattern) => ({
            ...pattern,
            channels: Array.isArray(pattern.channels) ? pattern.channels.map(normalizeChannel) : [],
            lengthSteps: Number.isFinite(pattern.lengthSteps) && pattern.lengthSteps > 0
              ? Math.floor(pattern.lengthSteps)
              : Math.max(1, ...((pattern.channels ?? []).map((channel) => channel.steps?.length ?? 0))),
          }))
          : [];
        return {
          ...createProject(),
          ...p,
          channels: p.channels.map(normalizeChannel),
          customSounds: p.customSounds ?? [],
          scaleRoot: Number.isInteger(p.scaleRoot) && p.scaleRoot >= 0 && p.scaleRoot <= 11 ? p.scaleRoot : 0,
          scaleId: typeof p.scaleId === 'string' ? p.scaleId : 'major',
          patterns,
          arrangement: Array.isArray(p.arrangement) ? p.arrangement : [],
          effects: normalizeEffects(p.effects),
          swingTemplate: normalizeSwingTemplate(p.swingTemplate),
        };
      }
    }
  } catch { /* corrupt data: fall back */ }
  return createProject();
}

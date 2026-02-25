export type MissionControlFeatureKey =
  | "statusPanel"
  | "kanbanV2"
  | "northStar"
  | "secondBrain"
  | "approvalsTerminal"
  | "scratchpad"
  | "telemetry"
  | "calendar";

export type MissionControlFeatures = Record<MissionControlFeatureKey, boolean>;

const DEFAULT_FEATURES: MissionControlFeatures = {
  statusPanel: true,
  kanbanV2: true,
  northStar: false,
  secondBrain: false,
  approvalsTerminal: false,
  scratchpad: false,
  telemetry: false,
  calendar: false,
};

function applyToken(features: MissionControlFeatures, token: string) {
  const clean = token.trim();
  if (!clean) {return;}

  const disabled = clean.startsWith("-");
  const key = (disabled ? clean.slice(1) : clean) as MissionControlFeatureKey;
  if (!(key in features)) {return;}
  features[key] = !disabled;
}

export function getMissionControlFeatures(raw = process.env.NEXT_PUBLIC_MC_FEATURES): MissionControlFeatures {
  const features: MissionControlFeatures = { ...DEFAULT_FEATURES };
  if (!raw) {return features;}

  for (const token of raw.split(",")) {
    applyToken(features, token);
  }
  return features;
}

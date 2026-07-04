export type ClassName =
  | "pedestrian"
  | "rider"
  | "bicycle"
  | "car"
  | "bus"
  | "truck"
  | "motorcycle"
  | "train";

export type Severity = "info" | "caution" | "brake";

export interface Detection {
  class_name: ClassName;
  confidence: number;
  bbox: [number, number, number, number];
  track_id: number | null;
}

export interface OperatorAction {
  action: "override" | "dismiss" | "confirm";
  note: string | null;
  t_utc: string | null;
}

export interface Incident {
  incident_id: string;
  clip_id: string;
  t_video_s: number;
  frame_idx: number;
  detections: Detection[];
  rgb_blind: boolean;
  blindness_duration_s: number;
  gps: [number, number] | null;
  severity: Severity;
  advisory: string | null;
  operator_action: OperatorAction | null;
}

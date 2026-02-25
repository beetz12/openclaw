PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS content_runs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  trigger_type TEXT NOT NULL,
  trigger_ref TEXT,
  status TEXT NOT NULL,
  objective TEXT,
  tool_used TEXT,
  why_chosen TEXT,
  result_summary TEXT,
  improvement_needed TEXT
);

CREATE TABLE IF NOT EXISTS content_packets (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  source_run_id TEXT NOT NULL,
  packet_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  recommendations TEXT,
  evidence TEXT,
  decision_rationale TEXT,
  debug_notes TEXT,
  next_action TEXT,
  artifact_path TEXT,
  FOREIGN KEY(source_run_id) REFERENCES content_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS content_ideas (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  source_run_id TEXT NOT NULL,
  title TEXT NOT NULL,
  topic_key TEXT,
  status TEXT NOT NULL,
  priority_rank INTEGER,
  score_total REAL,
  score_demand REAL,
  score_novelty REAL,
  score_authority_fit REAL,
  score_difficulty REAL,
  score_sub_conversion REAL,
  rationale_summary TEXT,
  debug_notes TEXT,
  recommended_next_action TEXT,
  FOREIGN KEY(source_run_id) REFERENCES content_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS content_actions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  idea_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  action_type TEXT NOT NULL,
  note TEXT,
  FOREIGN KEY(idea_id) REFERENCES content_ideas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tool_usage_events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  run_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  task_type TEXT,
  result_quality INTEGER,
  reliability INTEGER,
  time_saved_est TEXT,
  FOREIGN KEY(run_id) REFERENCES content_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tool_weekly_scorecards (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  uses INTEGER NOT NULL,
  time_saved_est TEXT,
  output_quality INTEGER,
  reliability INTEGER,
  decision TEXT,
  next_action TEXT
);

CREATE INDEX IF NOT EXISTS idx_content_ideas_status_rank_created
  ON content_ideas(status, priority_rank DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_ideas_source_run_id
  ON content_ideas(source_run_id);

CREATE INDEX IF NOT EXISTS idx_content_packets_source_run_created
  ON content_packets(source_run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_runs_trigger_created
  ON content_runs(trigger_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_content_actions_idea_created
  ON content_actions(idea_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_weekly_scorecards_week_tool
  ON tool_weekly_scorecards(week_start, tool_name);

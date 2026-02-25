CREATE TRIGGER IF NOT EXISTS trg_content_runs_trigger_type_check
BEFORE INSERT ON content_runs
FOR EACH ROW
WHEN NEW.trigger_type NOT IN ('heartbeat','cron','manual')
BEGIN
  SELECT RAISE(ABORT, 'invalid trigger_type');
END;

CREATE TRIGGER IF NOT EXISTS trg_content_runs_status_check
BEFORE INSERT ON content_runs
FOR EACH ROW
WHEN NEW.status NOT IN ('started','completed','failed')
BEGIN
  SELECT RAISE(ABORT, 'invalid run status');
END;

CREATE TRIGGER IF NOT EXISTS trg_content_ideas_status_check
BEFORE INSERT ON content_ideas
FOR EACH ROW
WHEN NEW.status NOT IN ('new','shortlisted','approved','in_production','published','dropped')
BEGIN
  SELECT RAISE(ABORT, 'invalid idea status');
END;

CREATE TRIGGER IF NOT EXISTS trg_content_packets_type_check
BEFORE INSERT ON content_packets
FOR EACH ROW
WHEN NEW.packet_type NOT IN (
  'topic_shortlist','thumbnail_brief','beat_sheet','repurpose_pack','competitor_teardown','analytics_review'
)
BEGIN
  SELECT RAISE(ABORT, 'invalid packet_type');
END;

CREATE TRIGGER IF NOT EXISTS trg_content_actions_type_check
BEFORE INSERT ON content_actions
FOR EACH ROW
WHEN NEW.action_type NOT IN (
  'approve','defer','reject','generate_beatsheet','generate_thumbnail','generate_repurpose','note'
)
BEGIN
  SELECT RAISE(ABORT, 'invalid action_type');
END;

CREATE TRIGGER IF NOT EXISTS trg_tool_usage_events_quality_check
BEFORE INSERT ON tool_usage_events
FOR EACH ROW
WHEN NEW.result_quality IS NOT NULL AND (NEW.result_quality < 1 OR NEW.result_quality > 5)
BEGIN
  SELECT RAISE(ABORT, 'invalid result_quality');
END;

CREATE TRIGGER IF NOT EXISTS trg_tool_usage_events_reliability_check
BEFORE INSERT ON tool_usage_events
FOR EACH ROW
WHEN NEW.reliability IS NOT NULL AND (NEW.reliability < 1 OR NEW.reliability > 5)
BEGIN
  SELECT RAISE(ABORT, 'invalid reliability');
END;

CREATE TRIGGER IF NOT EXISTS trg_tool_weekly_scorecards_decision_check
BEFORE INSERT ON tool_weekly_scorecards
FOR EACH ROW
WHEN NEW.decision IS NOT NULL AND NEW.decision NOT IN ('keep','improve','remove')
BEGIN
  SELECT RAISE(ABORT, 'invalid decision');
END;

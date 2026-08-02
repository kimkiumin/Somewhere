PRAGMA foreign_keys = ON;

ALTER TABLE feedback_eligibility
  ADD COLUMN write_epoch INTEGER NOT NULL DEFAULT 1 CHECK (write_epoch > 0);
ALTER TABLE place_reactions
  ADD COLUMN write_epoch INTEGER NOT NULL DEFAULT 1 CHECK (write_epoch > 0);
ALTER TABLE feedback_reaction_outcomes
  ADD COLUMN write_epoch INTEGER NOT NULL DEFAULT 1 CHECK (write_epoch > 0);

CREATE TRIGGER feedback_eligibility_current_epoch_insert
BEFORE INSERT ON feedback_eligibility
WHEN EXISTS (SELECT 1 FROM operations_write_fence)
  AND NOT EXISTS (
    SELECT 1 FROM operations_write_fence
    WHERE write_epoch = NEW.write_epoch AND mode = 'OPEN'
  )
BEGIN
  SELECT RAISE(ABORT, 'stale feedback write epoch');
END;

CREATE TRIGGER feedback_eligibility_current_epoch_update
BEFORE UPDATE ON feedback_eligibility
WHEN EXISTS (SELECT 1 FROM operations_write_fence)
  AND NOT EXISTS (
    SELECT 1 FROM operations_write_fence
    WHERE write_epoch = NEW.write_epoch AND mode = 'OPEN'
  )
BEGIN
  SELECT RAISE(ABORT, 'stale feedback write epoch');
END;

CREATE TRIGGER place_reactions_current_epoch_insert
BEFORE INSERT ON place_reactions
WHEN EXISTS (SELECT 1 FROM operations_write_fence)
  AND NOT EXISTS (
    SELECT 1 FROM operations_write_fence
    WHERE write_epoch = NEW.write_epoch AND mode = 'OPEN'
  )
BEGIN
  SELECT RAISE(ABORT, 'stale feedback write epoch');
END;

CREATE TRIGGER feedback_reaction_outcomes_current_epoch_insert
BEFORE INSERT ON feedback_reaction_outcomes
WHEN EXISTS (SELECT 1 FROM operations_write_fence)
  AND NOT EXISTS (
    SELECT 1 FROM operations_write_fence
    WHERE write_epoch = NEW.write_epoch AND mode = 'OPEN'
  )
BEGIN
  SELECT RAISE(ABORT, 'stale feedback write epoch');
END;

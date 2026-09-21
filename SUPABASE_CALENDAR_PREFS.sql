-- User calendar preferences — welke Google Calendars meetellen voor slot-detectie,
-- welke alleen voor weergave, welke genegeerd (afwezigheid = negeren).

CREATE TABLE IF NOT EXISTS user_calendar_preferences (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    calendar_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('blocking', 'view-only')),
    calendar_summary TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, calendar_id)
);

ALTER TABLE user_calendar_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_calendar_preferences_own" ON user_calendar_preferences;
CREATE POLICY "user_calendar_preferences_own" ON user_calendar_preferences
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

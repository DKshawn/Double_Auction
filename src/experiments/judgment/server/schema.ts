export const JUDGMENT_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS judgment_rooms (code text PRIMARY KEY,state jsonb NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS judgment_participants (room_code text REFERENCES judgment_rooms(code) ON DELETE CASCADE,id text NOT NULL,student_id text NOT NULL,state jsonb NOT NULL,PRIMARY KEY(room_code,id),UNIQUE(room_code,student_id))`,
  `CREATE TABLE IF NOT EXISTS judgment_lessons (room_code text REFERENCES judgment_rooms(code) ON DELETE CASCADE,id text NOT NULL,number int NOT NULL,state jsonb NOT NULL,PRIMARY KEY(room_code,id),UNIQUE(room_code,number))`,
  `CREATE TABLE IF NOT EXISTS judgment_runs (room_code text NOT NULL,lesson_id text NOT NULL,participant_id text NOT NULL,id text NOT NULL UNIQUE,state jsonb NOT NULL,PRIMARY KEY(room_code,lesson_id,participant_id),FOREIGN KEY(room_code,lesson_id) REFERENCES judgment_lessons(room_code,id) ON DELETE CASCADE,FOREIGN KEY(room_code,participant_id) REFERENCES judgment_participants(room_code,id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS judgment_commands (room_code text REFERENCES judgment_rooms(code) ON DELETE CASCADE,request_id text NOT NULL,payload_hash text NOT NULL,PRIMARY KEY(room_code,request_id))`,
  `CREATE TABLE IF NOT EXISTS judgment_logins (room_code text REFERENCES judgment_rooms(code) ON DELETE CASCADE,identity text NOT NULL,attempts int NOT NULL,window_started timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(room_code,identity))`,
];

export const databaseName = 'tavolo.db';

export const currentDatabaseVersion = 1;

export const createSchemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meals (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  recipe_url TEXT,
  memo TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_records (
  id TEXT PRIMARY KEY NOT NULL,
  meal_id TEXT NOT NULL,
  cooked_at TEXT NOT NULL,
  rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  memo TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY NOT NULL,
  meal_record_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('photo', 'video')),
  uri TEXT NOT NULL,
  thumbnail_uri TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (meal_record_id) REFERENCES meal_records(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meal_tags (
  meal_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (meal_id, tag_id),
  FOREIGN KEY (meal_id) REFERENCES meals(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meal_records_meal_id ON meal_records(meal_id);
CREATE INDEX IF NOT EXISTS idx_meal_records_cooked_at ON meal_records(cooked_at);
CREATE INDEX IF NOT EXISTS idx_meal_records_updated_at ON meal_records(updated_at);
CREATE INDEX IF NOT EXISTS idx_meals_name ON meals(name);
CREATE INDEX IF NOT EXISTS idx_media_meal_record_id ON media(meal_record_id);
CREATE INDEX IF NOT EXISTS idx_meal_tags_tag_id ON meal_tags(tag_id);
`;

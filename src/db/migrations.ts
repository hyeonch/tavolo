import { createSchemaSql } from './schema';

export type DatabaseMigration = {
  version: number;
  migrateAsync: () => Promise<void>;
};

export function getMigrations(execAsync: (source: string) => Promise<void>): DatabaseMigration[] {
  return [
    {
      version: 1,
      migrateAsync: () => execAsync(createSchemaSql),
    },
  ];
}

export interface SqlOptions {
  sqlDialect?: 'mysql' | 'mariadb' | 'postgresql' | 'transactsql' | 'sqlite';
  sqlQuoteIdentifiers?: boolean;
}

export interface DbConfig {
  user: string;
  host: string;
  database: string;
  password: string;
  port: number;
  connectionString?: string;
}

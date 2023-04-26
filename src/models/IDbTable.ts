export interface IDbColumn {
  name: string;
  type: string;
  nullable?: boolean;
  primary?: boolean;
  unique?: boolean;
  default?: any;
  foreignKey?: IDbForeignKey;
}

export interface IDbTable {
  name: string;
  columns: IDbColumn[];
  primaryKey: string[]|undefined;
  foreignKeys?: IDbForeignKey[];
}

export interface IDbForeignKey {
  column: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete?: 'cascade' | 'restrict' | 'set null' | 'no action';
  onUpdate?: 'cascade' | 'restrict' | 'set null' | 'no action';
}

import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  DataType,
  Index
} from "sequelize-typescript";
import Company from "./Company";

/**
 * Registro robusto de dados de demonstração (is_demo_data).
 * Permite limpeza futura sem depender de nomes/textos.
 */
@Table({ tableName: "DemoDataRecords" })
class DemoDataRecord extends Model<DemoDataRecord> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Index
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  /** contact | ticket | message | lead | activity | project | inventory | schedule | prompt | faq | tag | whatsapp */
  @Index
  @Column
  entityType: string;

  @Index
  @Column
  entityId: number;

  @Column({ defaultValue: true })
  isDemoData: boolean;

  @Column(DataType.JSONB)
  meta: Record<string, unknown> | null;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default DemoDataRecord;

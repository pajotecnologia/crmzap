import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import Company from "./Company";

@Table({ tableName: "GrokIntegrations" })
class GrokIntegration extends Model<GrokIntegration> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Column
  apiKeyEncrypted: string;

  @Column({ defaultValue: false })
  enabled: boolean;

  @Column({ defaultValue: "grok-4-1-fast" })
  defaultModel: string;

  @Column({ defaultValue: "Pessoal" })
  scope: string;

  @Column({ defaultValue: 1 })
  temperature: number;

  @Column({ defaultValue: 1 })
  topP: number;

  @Column({ defaultValue: 4096 })
  maxOutputTokens: number;

  @Column
  capabilitiesJson: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default GrokIntegration;

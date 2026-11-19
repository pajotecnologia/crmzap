import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  DataType,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import Company from "./Company";

@Table({
  tableName: "RegistroGratis"
})
export class RegistroGratis extends Model<RegistroGratis> {
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
  name: string;

  @Column
  email: string;

  @Column
  phone: string;

  @Column(DataType.STRING)
  statusWhatsapp: string;

  @Column(DataType.STRING)
  statusEmail: string;

  @Column(DataType.STRING)
  statusAutomation: string;

  @Column(DataType.TEXT)
  logs: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default RegistroGratis;

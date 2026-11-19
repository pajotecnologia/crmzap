import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  AllowNull,
  Default
} from "sequelize-typescript";

@Table({ tableName: "FreeTrialIpSignups" })
class FreeTrialIpSignup extends Model<FreeTrialIpSignup> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  ipHash: string;

  @AllowNull(true)
  @Column
  companyId: number;

  @Default("reserved")
  @Column
  status: string;

  @AllowNull(true)
  @Column(DataType.DATE)
  expiresAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default FreeTrialIpSignup;

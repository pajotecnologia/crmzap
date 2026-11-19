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
  HasMany,
  DataType
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";
import AiBrainMessage from "./AiBrainMessage";
import AiBrainProject from "./AiBrainProject";

@Table({ tableName: "AiBrainConversations" })
class AiBrainConversation extends Model<AiBrainConversation> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  title: string;

  @Column({ defaultValue: "gpt-4o" })
  model: string;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @ForeignKey(() => AiBrainProject)
  @Column
  projectId: number;

  @BelongsTo(() => AiBrainProject)
  project: AiBrainProject;

  @HasMany(() => AiBrainMessage)
  messages: AiBrainMessage[];

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AiBrainConversation;

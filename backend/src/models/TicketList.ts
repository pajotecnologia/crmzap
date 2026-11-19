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
  BelongsToMany,
  HasMany,
  Default,
  DataType
} from "sequelize-typescript";
import Company from "./Company";
import Contact from "./Contact";
import TicketListContact from "./TicketListContact";

@Table({ tableName: "TicketLists" })
class TicketList extends Model<TicketList> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  name: string;

  @Default("#6366F1")
  @Column
  color: string;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Default(false)
  @Column
  isDefault: boolean;

  @Default(0)
  @Column(DataType.INTEGER)
  order: number;

  @HasMany(() => TicketListContact)
  ticketListContacts: TicketListContact[];

  @BelongsToMany(() => Contact, () => TicketListContact)
  contacts: Contact[];

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default TicketList;

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
import TicketList from "./TicketList";
import Contact from "./Contact";
import Company from "./Company";

@Table({ tableName: "TicketListContacts" })
class TicketListContact extends Model<TicketListContact> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => TicketList)
  @Column
  ticketListId: number;

  @BelongsTo(() => TicketList)
  ticketList: TicketList;

  @ForeignKey(() => Contact)
  @Column
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default TicketListContact;

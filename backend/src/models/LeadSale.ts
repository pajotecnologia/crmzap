import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";
import Contact from "./Contact";
import LeadPipeline from "./LeadPipeline";

@Table({ tableName: "leads_sales" })
class LeadSale extends Model<LeadSale> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  name: string;

  @Column(DataType.TEXT)
  description: string;

  @Column
  status: string;

  @Column(DataType.INTEGER)
  value: number;

  @Column
  companyName: string;

  @Column
  phone: string;

  @Column
  email: string;

  @Column
  site: string;

  @Column
  origin: string;

  /** Atribuição Meta/Google Ads (UTM, CTWA, click IDs, campanha). */
  @Column(DataType.JSON)
  attribution: any;

  @Column
  document: string;

  @Column
  birthDate: Date;

  @Column(DataType.JSON)
  address: any;

  @Column(DataType.JSON)
  tags: string[];

  @Column(DataType.JSON)
  products: any[];

  @ForeignKey(() => Contact)
  @Column
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @ForeignKey(() => User)
  @Column
  responsibleId: number;

  @BelongsTo(() => User)
  responsible: User;

  @ForeignKey(() => LeadPipeline)
  @Column({ allowNull: true })
  pipelineId: number | null;

  @BelongsTo(() => LeadPipeline)
  pipeline: LeadPipeline;

  @Column
  date: Date;

  @Column
  dateEnd: Date;

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

export default LeadSale;


import {
  Table,
  Column,
  Model,
  DataType,
  CreatedAt,
  UpdatedAt,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  Default
} from "sequelize-typescript";
import Company from "./Company";
import { decryptGoogleSecret, encryptGoogleSecret } from "../services/GoogleWorkspaceServices/googleTokenCrypto";

export type GoogleWorkspaceServiceId =
  | "google_drive"
  | "google_sheets"
  | "google_calendar";

@Table({ tableName: "GoogleWorkspaceConnections" })
class GoogleWorkspaceConnection extends Model<GoogleWorkspaceConnection> {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  id: number;

  @ForeignKey(() => Company)
  @Column(DataType.INTEGER)
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Column(DataType.STRING)
  service: GoogleWorkspaceServiceId;

  @Column(DataType.STRING)
  accountEmail: string;

  @Column(DataType.STRING)
  accountName: string;

  @Column(DataType.TEXT)
  refreshTokenEnc: string;

  @Column(DataType.TEXT)
  accessTokenEnc: string;

  @Column(DataType.DATE)
  accessTokenExpiresAt: Date;

  @Column(DataType.TEXT)
  scopes: string;

  @Default(true)
  @Column(DataType.BOOLEAN)
  isActive: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  set refreshToken(value: string) {
    this.refreshTokenEnc = value ? encryptGoogleSecret(value) : null;
  }

  get refreshToken(): string | null {
    const val = this.getDataValue("refreshTokenEnc");
    return val ? decryptGoogleSecret(val) : null;
  }

  set accessToken(value: string) {
    this.accessTokenEnc = value ? encryptGoogleSecret(value) : null;
  }

  get accessToken(): string | null {
    const val = this.getDataValue("accessTokenEnc");
    return val ? decryptGoogleSecret(val) : null;
  }
}

export default GoogleWorkspaceConnection;

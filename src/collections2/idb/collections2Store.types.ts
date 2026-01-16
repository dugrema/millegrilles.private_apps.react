import { messageStruct } from "millegrilles.cryptography";
import { AddWebSubtitleCommand } from "../../types/collections2.types";
import { Collections2AddFileCommand } from "../../types/connection.types";
import { GeneratedSecretKeyResult } from "../../workers/encryption";
import { EncryptionBase64Result } from "../../workers/encryptionUtils";

export type TuuidEncryptedMetadata = messageStruct.MessageDecryption & {
  data_chiffre: string;
};

export type TuuidDecryptedMetadata = {
  nom: string;
  dateFichier?: number;
  hachage_original?: string;
  originalSize?: number;
};

/**
 * Separate encrypted Web VTT subtitle file available for a video.
 */
export type FileSubtitleMediaDataType = messageStruct.MessageDecryption & {
  fuuid: string;
  language: string;
  index?: number | null;
  label?: string | null;
};

export type FileAudioData = {
  index?: number;
  title?: string | null;
  language?: string | null;
  codec_name?: string | null;
  bit_rate?: number | null;
  default?: boolean | null;
};

export type FileSubtitleData = {
  index?: number;
  language?: string | null;
  title?: string | null;
  codec_name?: string | null;
};

export type FileWebSubtitleData = {
  fuuid: string;
  language: string;
  index?: number;
  label?: string;
  // Encryption parameters
  cle_id: string;
  format: string;
  compression?: string;
  nonce?: string;
};

export type FileImageData = messageStruct.MessageDecryption & {
  data_chiffre?: string;
  hachage: string;
  mimetype: string;
  width: number;
  height: number;
  taille: number;
  resolution: number;
};

export type FileVideoData = messageStruct.MessageDecryption & {
  fuuid: string;
  fuuid_video: string;
  taille_fichier: number;
  mimetype: string;
  cle_conversion?: string;
  codec?: string;
  width?: number;
  height?: number;
  quality?: number;
  resolution?: number;
  audio_stream_idx?: number | null;
  subtitle_stream_idx?: number | null;
};

export type FileImageDict = { [key: string]: FileImageData };
export type FileVideoDict = { [key: string]: FileVideoData };

export type FileData = {
  fuuids_versions?: string[] | null;
  mimetype?: string | null;
  supprime: boolean;
  supprime_indirect: boolean;
  taille?: number;
  visites?: { [instanceId: string]: number };
  format?: string | null;
  nonce?: string | null;
  height?: number;
  width?: number;
  anime?: boolean;
  duration?: number;
  images?: FileImageDict;
  video?: FileVideoDict;
  audio?: FileAudioData[];
  subtitles?: FileSubtitleData[];
  web_subtitles?: FileWebSubtitleData[];
  language?: string;
  comments?: EncryptionBase64Result[];
  tags?: string[];
};

export type EncryptedFileComment = {
  comment_id: string;
  date: number;
  encrypted_data: EncryptionBase64Result;
  user_id?: string;
};
export type FileComment = {
  comment_id: string;
  date: number;
  comment?: string;
  tags?: string[];
  user_id?: string;
};

export type TuuidsIdbStoreRowType = {
  tuuid: string;
  user_id: string;
  ownerUserId: string | null; // For shared content
  type_node: string;
  encryptedMetadata?: TuuidEncryptedMetadata;
  secretKey: Uint8Array | null; // Secret key for metadata (usually the same for associated files)
  keyId: string | null; // Key Id associated to the secretKey
  decryptedMetadata?: TuuidDecryptedMetadata;
  parent: string; // For top level collections, this is the user_id. For all others this is the tuuid of the parent collection.
  path_cuuids?: string[] | null;
  fileData?: FileData;
  thumbnail: Uint8Array | null;
  thumbnailDownloaded?: boolean | null; // True if high quality (small) image was downloaded to replace the inline thumbnail
  date_creation: number;
  derniere_modification: number;
  lastCompleteSyncSec?: number; // For directories only, last complete sync of content
  supprime?: boolean | null;
  language?: string | null;
  comments?: EncryptedFileComment[] | null;
  tags?: EncryptionBase64Result | null;
  decryptedComments?: FileComment[];
  decryptedTags?: string[];
};

export type LoadDirectoryResultType = {
  directory: TuuidsIdbStoreRowType | null;
  list: TuuidsIdbStoreRowType[];
  breadcrumb: TuuidsIdbStoreRowType[] | null;
};

export type VideoPlaybackRowType = {
  tuuid: string;
  userId: string;
  position: number | null;
};

// Download types

export type DownloadIdbType = {
  fuuid: string; // primary key 1
  userId: string; // primary key 2
  tuuid: string; // Indexed by [tuuid, userId]

  // Download information
  processDate: number; // Time added/errored in millisecs.
  state: DownloadStateEnum; // Indexed by [userId, state, processDate].
  position: number; // Download position of the chunk currently being download or start for the next chunk if download not in progress.
  size: number | null; // Encrypted file size
  visits: { [instanceId: string]: number }; // Known filehosts with the file
  retry: number;

  // Decryption information
  secretKey: Uint8Array | null; // Encryption key. Removed once download completes.
  format: string; // Encryption format
  nonce?: Uint8Array | null; // Encryption nonce/header

  // Content
  filename: string;
  mimetype: string;
  content: Blob | null; // Decrypted content
};

export type DownloadIdbParts = {
  fuuid: string;
  position: number;
  content: Blob;
};

export type DownloadDecryptedIdbParts = DownloadIdbParts;

export enum DownloadStateEnum {
  INITIAL = 1,
  PAUSED,
  DOWNLOADING,
  ENCRYPTED,
  DONE,
  ERROR = 99,
}

// Upload types

export type UploadIdbType = {
  uploadId: number; // Auto-incremented uploadId. Local IDB only, not to be used as upload key.
  userId: string;

  // Commands to upload with the file
  addCommand: Collections2AddFileCommand | null; // Unsigned file add command
  keyCommand: messageStruct.MilleGrillesMessage | null; // Signed key add command
  secret: GeneratedSecretKeyResult | null; // Secret key to use for encryption

  // Upload information, index [userId, state, processDate].
  state: UploadStateEnum;
  processDate: number; // Time added/errored in millisecs.
  retry: number;
  commandRetry?: number | null; // Retries on sending commands
  uploadUrl: string | null; // Filehost url for the upload

  // Decrypted metadata for reference on screen
  filename: string;
  lastModified: number;
  mimetype: string;
  cuuid: string; // Directory where the file is being uploaded
  destinationPath: string; // Directory path where the file is being uploaded for reference.
  clearSize: number | null; // Decrypted file size
  originalDigest: string | null; // Decrypted file digest

  // Encrypted file information
  fuuid: string | null; // Unique file id, null while file is being encrypted.
  size: number | null; // Encrypted file size
  decryption: messageStruct.MessageDecryption | null;
};

export type UploadIdbParts = {
  uploadId: string;
  position: number;
  content: Blob;
};

export enum UploadStateEnum {
  // Encryption stages, sequential up to READY unless ERROR.
  INITIAL = 1,
  ENCRYPTING,
  GENERATING,
  SENDCOMMAND, // To READY or PAUSED

  // Client upload to server. Transition from any to any of these states is possible.
  READY,
  PAUSED,
  UPLOADING, // TO VERIFYING or ERROR_DURING_PART_UPLOAD

  // After upload completed from client side
  VERIFYING, // Server-side verification
  DONE, // Final state

  // Error during UPLOADING - can be resumed.
  ERROR_DURING_PART_UPLOAD = 98,

  // Any state can transition to ERROR. This is a final state like DONE (no resume).
  ERROR = 99,
}

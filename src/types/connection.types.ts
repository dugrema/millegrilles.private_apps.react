import { EncryptionBase64Result } from "../workers/encryptionUtils";
import { MessageResponse } from "millegrilles.reactdeps.typescript";
import { DeviceReadings } from "../senseurspassifs/senseursPassifsStore";
import {
  NotepadCategoryType,
  NotepadDocumentType,
  NotepadGroupType,
} from "../notepad/idb/notepadStoreIdb";
import { DecryptionKey } from "../MillegrillesIdb";
import { ChatMessage, Conversation } from "../aichat/aichatStoreIdb";
import { LanguageModelType } from "../aichat/chatStore";
import { keymaster } from "millegrilles.cryptography";
import { messageStruct } from "millegrilles.cryptography";

import {
  TuuidEncryptedMetadata,
  FileAudioData,
  FileImageDict,
  FileSubtitleData,
  FileVideoDict,
  FileWebSubtitleData,
} from "../collections2/idb/collections2Store.types";

/* Types exported from the worker */
export const CONST_MEDIA_STATE_PROBE = "probe";
export const CONST_MEDIA_STATE_TRANSCODING = "transcodage";
export const CONST_MEDIA_STATE_DONE = "termine";

/** File attachment metadata */
export type FileAttachment = {
  tuuid: string;
  mimetype: string;
  fuuid: string;
  keyId: string;
  nonce?: string;
  header?: string;
  format: string;
};

/** Command to send a chat message */
export type SendChatMessageCommand = {
  conversation_id: string;
  model: string;
  role: string;
  encrypted_content: EncryptionBase64Result;
  new?: boolean;
  attachments?: FileAttachment[] | null;
};

/** Internal response reference used by AI language queries */
export type AiLanguageResponseRef = {
  id: string;
  metadata?: {
    creationDate: string;
    moddate?: string;
    creator?: string;
    source?: string;
    title?: string;
    total_pages?: number;
  };
  page_content?: string;
};

/** Response for an AI language query (RAG) */
export type AiLanguageQueryRag = MessageResponse & {
  ref?: AiLanguageResponseRef[];
  response?: string | null;
};

/** Activation code response */
export type ActivationCodeResponse = MessageResponse & {
  code?: number | string;
  csr?: string;
  nomUsager?: string;
};

/** Get user devices response */
export type GetUserDevicesResponse = MessageResponse & {
  instance_id: string;
  content?: MessageResponse;
  appareils: Array<DeviceReadings>;
};

/** Challenge response */
export type ChallengeResponse = MessageResponse;

/** Statistics request type */
export type StatisticsRequestType = {
  senseur_id: string;
  uuid_appareil: string;
  timezone: string;
  custom_grouping?: string;
  custom_intervalle_min?: number;
  custom_intervalle_max?: number;
};

/** Passive sensor statistics item */
export type SenseursPassifsStatistiquesItem = {
  heure: number;
  avg?: number;
  max?: number;
  min?: number;
};

/** Passive sensor statistics response */
export type SenseursPassifsStatistiquesResponse = MessageResponse & {
  periode31j?: Array<SenseursPassifsStatistiquesItem>;
  periode72h?: Array<SenseursPassifsStatistiquesItem>;
  custom?: Array<SenseursPassifsStatistiquesItem>;
};

/** Passive sensor configuration response */
export type SenseursPassifsConfigurationResponse = MessageResponse & {
  geoposition?: Object;
  timezone?: string;
  user_id: string;
};

/** Passive sensor configuration update */
export type SenseursPassifsConfigurationUpdate = {
  timezone?: string | null;
};

/** Notepad categories response */
export type NotepadCategoriesResponse = MessageResponse & {
  categories: Array<NotepadCategoryType>;
};

/** Notepad groups response */
export type NotepadGroupsResponse = MessageResponse & {
  groupes: Array<NotepadGroupType>;
  supprimes?: Array<string>;
  date_sync: number;
};

/** Decryption key response */
export type DecryptionKeyResponse = MessageResponse & {
  cles: Array<DecryptionKey>;
};

/** Notepad documents response */
export type NotepadDocumentsResponse = MessageResponse & {
  documents?: Array<NotepadDocumentType>;
  supprimes?: Array<string>;
  date_sync: number;
  done: boolean;
};

/** Conversation sync response */
export type ConversationSyncResponse = MessageResponse & {
  conversations: Conversation[] | null;
  messages: ChatMessage[] | null;
  done: boolean;
  sync_date: number;
};

/** Get models response */
export type GetModelsResponse = MessageResponse & {
  models?: LanguageModelType[];
};

/** Get AI configuration response */
export type GetAiConfigurationResponse = MessageResponse & {
  ollama_urls?: { urls?: string[] };
  default?: { model_name?: string; chat_context_length?: number };
  models?: {
    chat_model_name?: string;
    vision_model_name?: string;
    knowledge_model_name?: string;
    embedding_model_name?: string;
    rag_query_model_name?: string;
    summary_model_name?: string;
  };
  rag?: {
    context_len?: number;
    document_chunk_len?: number;
    document_overlap_len?: number;
  };
  urls?: { urls: { [key: string]: string } };
};

/** Decrypted secret key */
export type DecryptedSecretKey = {
  cle_id: string;
  cle_secrete_base64: string;
  format?: string;
  nonce?: string;
};

/** Collection2 directory statistics */
export type Collection2DirectoryStats = {
  count: number;
  taille: number;
  type_node: string;
};

/** Collection2 file version row */
export type Collection2FileVersionRow = {
  fuuid: string;
  "_mg-derniere-modification": number;
  taille: number;
  anime?: boolean;
  cle_id?: string;
  format?: string;
  nonce?: string;
  fuuids_reclames?: string[];
  visites?: { [instanceId: string]: number };
  duration?: number;
  height?: number;
  width?: number;
  images?: FileImageDict;
  video?: FileVideoDict;
  audio?: FileAudioData[];
  subtitles?: FileSubtitleData[];
  web_subtitles?: FileWebSubtitleData[];
};

/** Collections2 file sync row */
export type Collections2FileSyncRow = {
  tuuid: string;
  user_id: string;
  type_node: string;
  supprime: boolean;
  supprime_indirect: boolean;
  date_creation: number;
  derniere_modification: number;
  metadata: TuuidEncryptedMetadata;
  path_cuuids?: string[];
  fuuids_versions?: string[];
  mimetype?: string;
  version_courante?: Collection2FileVersionRow;
  comments?: EncryptionBase64Result[];
  language?: string;
  tags?: string[];
};

/** Collections2 sync directory response */
export type Collections2SyncDirectoryResponse = MessageResponse & {
  complete: boolean;
  cuuid: string | null;
  files: Collections2FileSyncRow[] | null;
  breadcrumb: Collections2FileSyncRow[] | null;
  keys: DecryptedSecretKey[] | null;
  stats: Collection2DirectoryStats[] | null;
  deleted_tuuids: string[] | null;
};

/** Collection2 search results document */
export type Collection2SearchResultsDoc = {
  id: string;
  user_id: string;
  score: number;
  fuuid?: string | null;
  cuuids?: string[] | null;
};

/** Collection2 search results content */
export type Collection2SearchResultsContent = {
  docs?: Collection2SearchResultsDoc[] | null;
  max_score?: number;
  numFound?: number;
  numFoundExact?: number;
  start?: number;
};

/** Collections2 search results */
export type Collections2SearchResults = MessageResponse & {
  files: Collections2FileSyncRow[] | null;
  keys: DecryptedSecretKey[] | null;
  search_results: Collection2SearchResultsContent | null;
};

/** Collections2 shared contacts shared collection */
export type Collections2SharedContactsSharedCollection = {
  user_id: string;
  contact_id: string;
  tuuid: string;
};

/** Collections2 shared contacts user */
export type Collections2SharedContactsUser = {
  user_id: string;
  nom_usager: string;
};

/** Collections2 shared contacts with user response */
export type Collections2SharedContactsWithUserResponse = MessageResponse & {
  partages?: Collections2SharedContactsSharedCollection[] | null;
  usagers?: Collections2SharedContactsUser[] | null;
};

/** Collections2 statistics response */
export type Collections2StatisticsResponse = MessageResponse & {
  info: Collection2DirectoryStats[] | null;
};

/** Collection2 contact item */
export type Collection2ContactItem = {
  user_id: string;
  nom_usager: string;
  contact_id: string;
};

/** Collections2 contact list */
export type Collections2ContactList = MessageResponse & {
  contacts: Collection2ContactItem[] | null;
};

/** Collections2 add share contact response */
export type Collections2AddShareContactResponse = MessageResponse &
  Collection2ContactItem;

/** Collection2 shared collection */
export type Collection2SharedCollection = {
  tuuid: string;
  user_id: string;
  contact_id: string;
};

/** Collections2 shared collections */
export type Collections2SharedCollections = MessageResponse & {
  partages?: Collection2SharedCollection[] | null;
};

/** Collection2 directory update message */
export type Collection2DirectoryUpdateMessage = (
  | MessageResponse
  | messageStruct.MilleGrillesMessage
) &
  Collections2FileSyncRow;

/** Collection2 directory content update message */
export type Collection2DirectoryContentUpdateMessage = (
  | MessageResponse
  | messageStruct.MilleGrillesMessage
) & {
  cuuid: string | null;
  fichiers_ajoutes?: string[] | null;
  fichiers_modifies?: string[] | null;
  collections_ajoutees?: string[] | null;
  collections_modifiees?: string[] | null;
  retires?: string[] | null;
};

/** Keymaster save key command */
export type KeymasterSaveKeyCommand = {
  cles: { [key: string]: string };
  signature: keymaster.DomainSignature;
};

/** Collection2 create directory type */
export type Collection2CreateDirectoryType = {
  metadata: TuuidEncryptedMetadata;
  cuuid?: string | null;
  favoris?: boolean | null;
};

/** Filehost */
export type Filehost = {
  filehost_id: string;
  instance_id?: string | null;
  tls_external?: string | null;
  url_external?: string | null;
  url_internal?: string | null;
};

/** Collection2 filehost response */
export type Collection2FilehostResponse = MessageResponse & {
  list?: Filehost[] | null;
};

/** Collection2 streaming JWT response */
export type Collection2StreamingJwtResponse = MessageResponse & {
  jwt_token?: string | null;
};

/** Enum for job status */
export enum EtatJobEnum {
  PENDING = 1,
  RUNNING,
  PERSISTING,
  ERROR,
  TOO_MANY_RETRIES,
  DONE,
}

/** Collection2 conversion job */
export type Collection2ConversionJob = {
  job_id: string;
  tuuid: string;
  fuuid: string;
  user_id?: string | null;
  mimetype?: string | null;
  filehost_ids?: string[] | null;
  pct_progres?: number | null;
  etat?: EtatJobEnum | null;
  retry?: number | null;
  date_maj?: number | null;
  params?: { [key: string]: string | number | boolean };
};

/** Collection2 conversion jobs response */
export type Collection2ConversionJobsResponse = MessageResponse & {
  jobs?: Collection2ConversionJob[];
};

/** Collection2 media conversion job update */
export type Collection2MediaConversionJobUpdate = {
  job_id: string;
  user_id?: string | null;
  tuuid: string;
  fuuid: string;
  etat: string;
  pctProgres?: number | null;
  mimetype?: string | null;
  videoCodec?: string | null;
  videoQuality?: number | null;
  height?: number | null;
  resolution?: number | null;
};

/** Collection2 media conversion update message */
export type Collection2MediaConversionUpdateMessage = (
  | MessageResponse
  | messageStruct.MilleGrillesMessage
) &
  Collection2MediaConversionJobUpdate;

/** Collections2 convert video command */
export type Collections2ConvertVideoCommand = {
  tuuid: string;
  fuuid: string;
  mimetype: string;
  codecVideo: string;
  codecAudio: string;
  resolutionVideo: number;
  qualityVideo?: number | null;
  bitrateVideo?: number | null;
  bitrateAudio: number;
  preset?: string | null;
  audio_stream_idx?: number | null;
  subtitle_stream_idx?: number | null;
};

/** Collections2 convert video response */
export type Collections2ConvertVideoResponse = MessageResponse & {
  job_id?: string;
};

/** Collection2 copy files command */
export type Collection2CopyFilesCommand = {
  cuuid: string;
  inclure_tuuids: string[];
  contact_id?: string | null;
  include_deleted?: boolean;
};

/** Collections2 add file command */
export type Collections2AddFileCommand = {
  fuuid: string;
  cuuid: string;
  tuuid?: string | null;
  mimetype: string;
  metadata: TuuidEncryptedMetadata;
  taille: number;
  cle_id?: string | null;
  format?: string | null;
  nonce?: string | null;
  verification?: string | null;
};

/** Collection2 user access to fuuids response */
export type Collection2UserAccessToFuuidsResponse = MessageResponse & {
  fuuids: string[];
  access_tous: boolean;
  user_id: string;
};

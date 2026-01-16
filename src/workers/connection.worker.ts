import "@solana/webcrypto-ed25519-polyfill";
import { expose } from "comlink";
import { keymaster, messageStruct } from "millegrilles.cryptography";
import {
  ConnectionWorker,
  MessageResponse,
  SubscriptionCallback,
} from "millegrilles.reactdeps.typescript";
import apiMapping from "../workers/apiMapping.json";

import {
  SendChatMessageCommand,
  AiLanguageQueryRag,
  GetUserDevicesResponse,
  StatisticsRequestType,
  SenseursPassifsStatistiquesResponse,
  SenseursPassifsConfigurationResponse,
  SenseursPassifsConfigurationUpdate,
  NotepadCategoriesResponse,
  NotepadGroupsResponse,
  DecryptionKeyResponse,
  NotepadDocumentsResponse,
  ConversationSyncResponse,
  GetModelsResponse,
  GetAiConfigurationResponse,
  Collections2SyncDirectoryResponse,
  Collections2SearchResults,
  Collections2SharedContactsWithUserResponse,
  Collections2StatisticsResponse,
  Collections2ContactList,
  Collections2AddShareContactResponse,
  Collections2SharedCollections,
  Collection2CreateDirectoryType,
  Collection2FilehostResponse,
  Collection2StreamingJwtResponse,
  Collection2ConversionJobsResponse,
  Collections2ConvertVideoCommand,
  Collections2ConvertVideoResponse,
  Collection2CopyFilesCommand,
  Collections2AddFileCommand,
  Collection2UserAccessToFuuidsResponse,
} from "../types/connection.types";

import { DeviceConfiguration } from "../senseurspassifs/senseursPassifsStore";
import {
  NotepadNewCategoryType,
  NotepadNewDocumentType,
  NotepadNewGroupType,
} from "../notepad/idb/notepadStoreIdb";
import {
  EncryptionBase64Result,
  EncryptionBase64WithEncryptedKeysResult,
} from "../workers/encryptionUtils";
import { TuuidEncryptedMetadata } from "../collections2/idb/collections2Store.types";
import {
  AddWebSubtitleCommand,
  RemoveWebSubtitleCommand,
} from "../types/collections2.types";

const DOMAINE_CORETOPOLOGIE = "CoreTopologie";
const DOMAINE_DOCUMENTS = "Documents";
const DOMAINE_SENSEURSPASSIFS = "SenseursPassifs";
const DOMAINE_SENSEURSPASSIFS_RELAI = "senseurspassifs_relai";
const DOMAINE_MAITREDESCLES = "MaitreDesCles";
const DOMAINE_AI_LANGUAGE = "AiLanguage";
const DOMAINE_OLLAMA_RELAI = "ollama_relai";
const DOMAINE_GROSFICHIERS = "GrosFichiers";

export class AppsConnectionWorker extends ConnectionWorker {
  async authenticate(reconnect?: boolean) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.authenticate(apiMapping, reconnect);
  }

  async getApplicationList(): Promise<MessageResponse> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return this.connection.sendRequest(
      {},
      DOMAINE_CORETOPOLOGIE,
      "listeApplicationsDeployees",
      { eventName: "request_application_list" },
    );
  }

  // AI Chat application
  async sendChatMessage(
    command: SendChatMessageCommand,
    history: EncryptionBase64Result | null,
    signature: keymaster.DomainSignature,
    keys: { [key: string]: string },
    streamCallback: (e: MessageResponse) => Promise<void>,
    messageCallback: (e: messageStruct.MilleGrillesMessage) => Promise<void>,
    setWaiting: (e: string) => void,
    action?: string,
  ): Promise<boolean> {
    if (!this.connection) throw new Error("Connection is not initialized");
    if (!action) action = "chat";
    let signedMessage = await this.connection.createRoutedMessage(
      messageStruct.MessageKind.Command,
      command,
      { domaine: DOMAINE_OLLAMA_RELAI, action },
    );
    signedMessage.attachements = { history, signature, keys };
    if (!signedMessage.id) throw new Error("Message Id not generated");
    setWaiting(signedMessage.id);
    await messageCallback(signedMessage);
    // Give long wait period - models can take a long time to load.
    return await this.connection.emitCallbackResponses(
      signedMessage,
      streamCallback,
      { domain: DOMAINE_OLLAMA_RELAI, timeout: 180_000 },
    );
  }

  async cancelChatMessage(chatId: string): Promise<MessageResponse> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendCommand(
      { chat_id: chatId },
      DOMAINE_OLLAMA_RELAI,
      "cancelChat",
      { timeout: 3_000 },
    );
  }

  async getConversationKeys(keyIds: string[]) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      { cle_ids: keyIds },
      DOMAINE_AI_LANGUAGE,
      "getConversationKeys",
      { domain: DOMAINE_MAITREDESCLES },
    )) as DecryptionKeyResponse;
  }

  async pingRelay(): Promise<GetUserDevicesResponse> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      {},
      DOMAINE_OLLAMA_RELAI,
      "ping",
      { timeout: 3_000 },
    )) as GetUserDevicesResponse;
  }

  async getModels(): Promise<GetModelsResponse> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendRequest(
      {},
      DOMAINE_OLLAMA_RELAI,
      "getModels",
      { timeout: 3_000 },
    );
  }

  async getConfiguration(): Promise<GetAiConfigurationResponse> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendRequest(
      {},
      DOMAINE_AI_LANGUAGE,
      "getConfiguration",
      { timeout: 5_000 },
    );
  }

  async syncConversations(
    streamCallback: (e: ConversationSyncResponse) => Promise<void>,
    lastSyncDate?: number | null,
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    let signedMessage = await this.connection.createRoutedMessage(
      messageStruct.MessageKind.Request,
      { last_sync_date: lastSyncDate },
      { domaine: DOMAINE_AI_LANGUAGE, action: "syncConversations" },
    );
    return await this.connection.emitCallbackResponses(
      signedMessage,
      // @ts-ignore
      streamCallback,
      { domain: DOMAINE_AI_LANGUAGE },
    );
  }

  async setOllamaUrls(urls: string[]) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendCommand(
      { urls },
      DOMAINE_AI_LANGUAGE,
      "setOllamaUrls",
    );
  }

  async setAiDefaults(
    defaultModel: string | null,
    chatContextLength: number | null,
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendCommand(
      { model_name: defaultModel, chat_context_length: chatContextLength },
      DOMAINE_AI_LANGUAGE,
      "setDefaults",
    );
  }

  async setAiModels(
    modelChat: string | null,
    modelKnowledge: string | null,
    modelEmbeddingName: string | null,
    modelQueryName: string | null,
    modelVisionName: string | null,
    summaryModel: string | null,
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendCommand(
      {
        chat_model_name: modelChat,
        knowledge_model_name: modelKnowledge,
        embedding_model_name: modelEmbeddingName,
        rag_query_model_name: modelQueryName,
        vision_model_name: modelVisionName,
        summary_model_name: summaryModel,
      },
      DOMAINE_AI_LANGUAGE,
      "setModels",
    );
  }

  async setAiRag(
    contextSize: number | null,
    documentChunkSize: number | null,
    documentOverlapSize: number | null,
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendCommand(
      {
        context_len: contextSize,
        document_chunk_len: documentChunkSize,
        document_overlap_len: documentOverlapSize,
      },
      DOMAINE_AI_LANGUAGE,
      "setRag",
    );
  }

  async setAiUrls(urls: { [key: string]: string }) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendCommand(
      { urls },
      DOMAINE_AI_LANGUAGE,
      "setUrls",
    );
  }

  async syncConversationMessages(
    conversationId: string,
    streamCallback: (e: ConversationSyncResponse) => Promise<void>,
    lastSyncDate?: number | null,
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    let signedMessage = await this.connection.createRoutedMessage(
      messageStruct.MessageKind.Request,
      { conversation_id: conversationId, last_sync_date: lastSyncDate },
      { domaine: DOMAINE_AI_LANGUAGE, action: "syncConversationMessages" },
    );
    return await this.connection.emitCallbackResponses(
      signedMessage,
      // @ts-ignore
      streamCallback,
      { domain: DOMAINE_AI_LANGUAGE },
    );
  }

  async deleteChatConversation(conversationId: string) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendCommand(
      { conversation_id: conversationId },
      DOMAINE_AI_LANGUAGE,
      "deleteChatConversation",
    );
  }

  async queryRag(
    encrypted_query: EncryptionBase64WithEncryptedKeysResult,
  ): Promise<AiLanguageQueryRag> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendRequest(
      { encrypted_query },
      DOMAINE_OLLAMA_RELAI,
      "queryRag",
      { timeout: 90_000 },
    );
  }

  async subscribeChatConversationEvents(
    cb: SubscriptionCallback,
  ): Promise<void> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.subscribe(
      "aiLanguageChatConversationEvents",
      cb,
    );
  }

  async unsubscribeChatConversationEvents(
    cb: SubscriptionCallback,
  ): Promise<void> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.unsubscribe(
      "aiLanguageChatConversationEvents",
      cb,
    );
  }

  async subscribeChatMessageEvents(
    conversation_id: string,
    cb: SubscriptionCallback,
  ): Promise<void> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.subscribe("aiLanguageChatMessageEvents", cb, {
      conversation_id,
    });
  }

  async unsubscribeChatMessageEvents(
    conversation_id: string,
    cb: SubscriptionCallback,
  ): Promise<void> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.unsubscribe(
      "aiLanguageChatMessageEvents",
      cb,
      { conversation_id },
    );
  }

  // SenseursPassifs
  async getUserDevices(): Promise<GetUserDevicesResponse> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      {},
      DOMAINE_SENSEURSPASSIFS,
      "getAppareilsUsager",
    )) as GetUserDevicesResponse;
  }

  async subscribeUserDevices(cb: SubscriptionCallback): Promise<void> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.subscribe("userDeviceEvents", cb);
  }

  async unsubscribeUserDevices(cb: SubscriptionCallback): Promise<void> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.unsubscribe("userDeviceEvents", cb);
  }

  async challengeDevice(params: {
    uuid_appareil: string;
    challenge: Array<number>;
  }): Promise<MessageResponse> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendCommand(
      params,
      DOMAINE_SENSEURSPASSIFS,
      "challengeAppareil",
    );
  }

  async confirmDevice(params: {
    uuid_appareil: string;
    challenge: Array<number>;
  }): Promise<MessageResponse> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendCommand(
      params,
      DOMAINE_SENSEURSPASSIFS,
      "signerAppareil",
    );
  }

  async deviceCommand(params: {
    instance_id: string;
    uuid_appareil: string;
    senseur_id: string;
    valeur: string | number;
    commande_action: string;
  }) {
    if (!this.connection) throw new Error("Connection is not initialized");
    let partition = params.instance_id;
    return await this.connection.sendCommand(
      params,
      DOMAINE_SENSEURSPASSIFS_RELAI,
      "commandeAppareil",
      { partition, nowait: true },
    );
  }

  async updateDeviceConfiguration(params: {
    uuid_appareil: string;
    configuration: DeviceConfiguration;
  }) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendCommand(
      params,
      DOMAINE_SENSEURSPASSIFS,
      "majAppareil",
    );
  }

  async deleteDevice(uuid_appareil: string) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendCommand(
      { uuid_appareil },
      DOMAINE_SENSEURSPASSIFS,
      "supprimerAppareil",
    );
  }

  async restoreDevice(uuid_appareil: string) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendCommand(
      { uuid_appareil },
      DOMAINE_SENSEURSPASSIFS,
      "restaurerAppareil",
    );
  }

  async getComponentStatistics(request: StatisticsRequestType) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      request,
      DOMAINE_SENSEURSPASSIFS,
      "getStatistiquesSenseur",
    )) as SenseursPassifsStatistiquesResponse;
  }

  async getUserConfiguration() {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      {},
      DOMAINE_SENSEURSPASSIFS,
      "getConfigurationUsager",
    )) as SenseursPassifsConfigurationResponse;
  }

  async updateUserConfiguration(
    configuration: SenseursPassifsConfigurationUpdate,
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendCommand(
      configuration,
      DOMAINE_SENSEURSPASSIFS,
      "majConfigurationUsager",
    );
  }

  // Notepad
  async getNotepadUserCategories() {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      {},
      DOMAINE_DOCUMENTS,
      "getCategoriesUsager",
    )) as NotepadCategoriesResponse;
  }

  async getNotepadUserGroups(supprime?: boolean) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      { supprime: !!supprime },
      DOMAINE_DOCUMENTS,
      "getGroupesUsager",
    )) as NotepadGroupsResponse;
  }

  async getGroupKeys(keyIds: Array<string>) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      { cle_ids: keyIds },
      DOMAINE_DOCUMENTS,
      "getClesGroupes",
      { domain: DOMAINE_MAITREDESCLES },
    )) as DecryptionKeyResponse;
  }

  async notepadSaveDocument(command: NotepadNewDocumentType) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendCommand(
      command,
      DOMAINE_DOCUMENTS,
      "sauvegarderDocument",
    );
  }

  async getNotepadDocumentsForGroup(
    groupId: string,
    supprime?: boolean,
    dateSync?: number,
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      { groupe_id: groupId, supprime: !!supprime, date_sync: dateSync },
      DOMAINE_DOCUMENTS,
      "getDocumentsGroupe",
    )) as NotepadDocumentsResponse;
  }

  async getNotepadDocumentsForGroupStreamed(
    groupId: string,
    callback: (e: MessageResponse | NotepadDocumentsResponse) => void,
    supprime?: boolean,
    dateSync?: number,
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    let signedMessage = await this.connection.createRoutedMessage(
      messageStruct.MessageKind.Request,
      {
        groupe_id: groupId,
        supprime: !!supprime,
        date_sync: dateSync,
        stream: true,
      },
      { domaine: DOMAINE_DOCUMENTS, action: "getDocumentsGroupe" },
    );
    return await this.connection.emitCallbackResponses(signedMessage, callback);
  }

  // async sendChatMessage(command: any, callback: any): Promise<boolean> {
  //     if(!this.connection) throw new Error("Connection is not initialized");
  //     let signedMessage = await this.connection.createEncryptedCommand(command, {domaine: 'ollama_relai', action: 'chat'});
  //     return await this.connection.emitCallbackResponses(signedMessage, callback, {domain: 'ollama_relai'});
  // }

  async notepadSaveGroup(command: NotepadNewGroupType, key?: Object) {
    if (!this.connection) throw new Error("Connection is not initialized");
    let attachments = undefined;
    if (key) attachments = { cle: key };
    return await this.connection.sendCommand(
      command,
      DOMAINE_DOCUMENTS,
      "sauvegarderGroupeUsager",
      { attachments: attachments },
    );
  }

  async notepadSaveCategory(command: NotepadNewCategoryType) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendCommand(
      command,
      DOMAINE_DOCUMENTS,
      "sauvegarderCategorieUsager",
    );
  }

  async notepadDeleteDocument(docId: string) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendCommand(
      { doc_id: docId },
      DOMAINE_DOCUMENTS,
      "supprimerDocument",
    );
  }

  async notepadRestoreDocument(docId: string) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendCommand(
      { doc_id: docId },
      DOMAINE_DOCUMENTS,
      "recupererDocument",
    );
  }

  async notepadDeleteGroup(groupId: string) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendCommand(
      { groupe_id: groupId },
      DOMAINE_DOCUMENTS,
      "supprimerGroupe",
    );
  }

  async notepadRestoreGroup(groupId: string) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.sendCommand(
      { groupe_id: groupId },
      DOMAINE_DOCUMENTS,
      "recupererGroupe",
    );
  }

  async subscribeUserCategoryGroup(cb: SubscriptionCallback): Promise<void> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.subscribe("notepadCatGroupEvents", cb);
  }

  async unsubscribeUserCategoryGroup(cb: SubscriptionCallback): Promise<void> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.unsubscribe("notepadCatGroupEvents", cb);
  }

  async subscribeUserGroupDocument(
    groupId: string,
    cb: SubscriptionCallback,
  ): Promise<void> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.subscribe("notepadGroupDocumentEvents", cb, {
      groupe_id: groupId,
    });
  }

  async unsubscribeUserGroupDocument(
    groupId: string,
    cb: SubscriptionCallback,
  ): Promise<void> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.unsubscribe("notepadGroupDocumentEvents", cb, {
      groupe_id: groupId,
    });
  }

  // Collections 2
  async syncDirectory(
    cuuid: string | null | undefined,
    skip: number,
    lastSyncDate: number | null,
    opts?: { contactId?: string },
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      { cuuid, skip, last_sync: lastSyncDate, contact_id: opts?.contactId },
      DOMAINE_GROSFICHIERS,
      "syncDirectory",
      { timeout: 60_000 },
    )) as Collections2SyncDirectoryResponse;
  }

  async syncDeletedFiles(
    skip: number,
    cuuid?: string | null,
    limit?: number | null,
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      { skip, limit_count: limit, cuuid, deleted: true },
      DOMAINE_GROSFICHIERS,
      "syncDirectory",
    )) as Collections2SyncDirectoryResponse;
  }

  async searchFiles(
    query: string,
    cuuid?: string | null,
    initialBatchSize?: number,
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      { query, cuuid, intitial_batch_size: initialBatchSize },
      DOMAINE_GROSFICHIERS,
      "searchIndexV2",
    )) as Collections2SearchResults;
  }

  async getFilesByTuuid(
    tuuids: string[],
    opts?: { shared?: boolean; contact_id?: string },
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      { tuuids, shared: opts?.shared, shared_contact_id: opts?.contact_id },
      DOMAINE_GROSFICHIERS,
      "filesByTuuid",
    )) as Collections2SearchResults;
  }

  async getCollections2Contacts() {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      {},
      DOMAINE_GROSFICHIERS,
      "chargerContacts",
    )) as any;
  }

  // async getCollections2SharedCollections() {
  //     if(!this.connection) throw new Error("Connection is not initialized");
  //     return await this.connection.sendRequest(
  //         {},
  //         DOMAINE_GROSFICHIERS, 'getPartagesUsager'
  //     ) as any;
  // }

  async getCollections2SharedContactsWithUser() {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      {},
      DOMAINE_GROSFICHIERS,
      "getPartagesContact",
    )) as Collections2SharedContactsWithUserResponse;
  }

  async getCollection2Statistics(cuuid: string | null) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      { cuuid },
      DOMAINE_GROSFICHIERS,
      "getInfoStatistiques",
      { timeout: 30_000 },
    )) as Collections2StatisticsResponse;
  }

  async getCollection2ContactList() {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      {},
      DOMAINE_GROSFICHIERS,
      "chargerContacts",
    )) as Collections2ContactList;
  }

  async getCollection2SharedCollections() {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      {},
      DOMAINE_GROSFICHIERS,
      "getPartagesUsager",
    )) as Collections2SharedCollections;
  }

  async addCollection2Contact(username: string) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendCommand(
      { nom_usager: username },
      DOMAINE_GROSFICHIERS,
      "ajouterContactLocal",
    )) as Collections2AddShareContactResponse;
  }

  async deleteCollection2Contact(contactId: string) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendCommand(
      { contact_ids: [contactId] },
      DOMAINE_GROSFICHIERS,
      "supprimerContacts",
    )) as MessageResponse;
  }

  async shareCollection2Collection(cuuids: string[], contactIds: string[]) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendCommand(
      { cuuids, contact_ids: contactIds },
      DOMAINE_GROSFICHIERS,
      "partagerCollections",
    )) as MessageResponse;
  }

  async removeShareCollection2Collection(cuuid: string, contactId: string) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendCommand(
      { tuuid: cuuid, contact_id: contactId },
      DOMAINE_GROSFICHIERS,
      "supprimerPartageUsager",
    )) as MessageResponse;
  }

  async addDirectoryCollection2(
    command: Collection2CreateDirectoryType,
    key: messageStruct.MilleGrillesMessage,
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendCommand(
      command,
      DOMAINE_GROSFICHIERS,
      "nouvelleCollection",
      { attachments: { cle: key } },
    )) as MessageResponse;
  }

  async renameFileCollection2(
    tuuid: string,
    metadata: TuuidEncryptedMetadata,
    mimetype?: string | null,
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendCommand(
      { tuuid, metadata, mimetype },
      DOMAINE_GROSFICHIERS,
      "decrireFichier",
    )) as MessageResponse;
  }

  async renameDirectoryCollection2(
    tuuid: string,
    metadata: TuuidEncryptedMetadata,
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendCommand(
      { tuuid, metadata },
      DOMAINE_GROSFICHIERS,
      "decrireCollection",
    )) as MessageResponse;
  }

  async deleteFilesCollection2(tuuids: string[]) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendCommand(
      { tuuids },
      DOMAINE_GROSFICHIERS,
      "supprimerDocuments",
    )) as MessageResponse;
  }

  async copyFilesCollection2(
    destinationCuuid: string,
    tuuids: string[],
    opts?: { contactId?: string; includeDeleted?: boolean },
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    let command = {
      cuuid: destinationCuuid,
      inclure_tuuids: tuuids,
    } as Collection2CopyFilesCommand;
    if (opts?.contactId) command.contact_id = opts.contactId;
    if (opts?.includeDeleted) command.include_deleted = true;
    return (await this.connection.sendCommand(
      command,
      DOMAINE_GROSFICHIERS,
      "ajouterFichiersCollection",
    )) as MessageResponse;
  }

  async moveFilesCollection2(
    originCuuid: string,
    destinationCuuid: string,
    tuuids: string[],
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendCommand(
      {
        cuuid_origine: originCuuid,
        cuuid_destination: destinationCuuid,
        inclure_tuuids: tuuids,
      },
      DOMAINE_GROSFICHIERS,
      "deplacerFichiersCollection",
    )) as MessageResponse;
  }

  async deleteCollection2Comment(tuuid: string, commentId: string) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendCommand(
      { tuuid, comment_id: commentId },
      DOMAINE_GROSFICHIERS,
      "deleteFileComment",
    )) as MessageResponse;
  }

  async getFilehosts() {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      {},
      DOMAINE_CORETOPOLOGIE,
      "getFilehosts",
    )) as Collection2FilehostResponse;
  }

  async getStreamingJwt(
    fuuidVideo: string,
    fuuidRef?: string | null,
    contactId?: string | null,
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      { fuuid: fuuidVideo, fuuid_ref: fuuidRef, contact_id: contactId },
      DOMAINE_GROSFICHIERS,
      "getJwtStreaming",
    )) as Collection2StreamingJwtResponse;
  }

  async collections2GetConversionJobs() {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      {},
      DOMAINE_GROSFICHIERS,
      "requeteJobsVideo",
    )) as Collection2ConversionJobsResponse;
  }

  async collections2RemoveConversionJob(
    tuuid: string,
    fuuid: string,
    job_id: string,
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendCommand(
      { tuuid, fuuid, job_id },
      DOMAINE_GROSFICHIERS,
      "supprimerJobVideoV2",
    )) as MessageResponse;
  }

  async collections2convertVideo(command: Collections2ConvertVideoCommand) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendCommand(
      command,
      DOMAINE_GROSFICHIERS,
      "transcoderVideo",
    )) as Collections2ConvertVideoResponse;
  }

  async collections2RemoveVideo(fuuid_video: string) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendCommand(
      { fuuid_video },
      DOMAINE_GROSFICHIERS,
      "supprimerVideo",
    )) as Collections2ConvertVideoResponse;
  }

  async collection2RecycleItems(tuuids: string[]) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendCommand(
      { tuuids },
      DOMAINE_GROSFICHIERS,
      "recycleItemsV3",
    )) as Collections2ConvertVideoResponse;
  }

  async collection2AddFile(
    addCommand: Collections2AddFileCommand,
    keyCommand: messageStruct.MilleGrillesMessage,
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendCommand(
      addCommand,
      DOMAINE_GROSFICHIERS,
      "nouvelleVersion",
      { attachments: { cle: keyCommand }, timeout: 45_000 },
    )) as Collections2ConvertVideoResponse;
  }

  async collection2CheckUserAccessFuuids(fuuids: string[]) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendRequest(
      { fuuids },
      DOMAINE_GROSFICHIERS,
      "verifierAccesFuuids",
    )) as Collection2UserAccessToFuuidsResponse;
  }

  async collection2AddFileComment(
    tuuid: string,
    comment: EncryptionBase64Result,
    idx?: number | null,
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    return (await this.connection.sendCommand(
      { tuuid, comment, comment_idx: idx },
      DOMAINE_GROSFICHIERS,
      "updateFileTextContent",
    )) as MessageResponse;
  }

  async collection2AddWebSubtitle(
    file_fuuid: string,
    subtitle_fuuid: String,
    language: String,
    cle_id: String,
    format: String,
    compression?: string,
    nonce?: string,
    user_id?: String | null,
    index?: number | null,
    label?: string | null,
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    const command = {
      file_fuuid,
      user_id: user_id ?? undefined,
      subtitle_fuuid,
      language,
      index: index ?? undefined,
      label: label ?? undefined,
      cle_id,
      format,
      compression,
      nonce,
    } as AddWebSubtitleCommand;
    return (await this.connection.sendCommand(
      command,
      DOMAINE_GROSFICHIERS,
      "addWebSubtitle",
    )) as MessageResponse;
  }

  async collection2RemovedWebSubtitle(
    file_fuuid: string,
    subtitle_fuuid: String,
  ) {
    if (!this.connection) throw new Error("Connection is not initialized");
    const command = {
      file_fuuid,
      subtitle_fuuid,
    } as RemoveWebSubtitleCommand;
    return (await this.connection.sendCommand(
      command,
      DOMAINE_GROSFICHIERS,
      "removeWebSubtitle",
    )) as MessageResponse;
  }

  async collection2SubscribeCollectionEvents(
    cuuid: string | null,
    cb: SubscriptionCallback,
  ): Promise<void> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.subscribe("collection2CollectionEvents", cb, {
      cuuid,
    });
  }

  async collection2UnsubscribeCollectionEvents(
    cuuid: string | null,
    cb: SubscriptionCallback,
  ): Promise<void> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.unsubscribe(
      "collection2CollectionEvents",
      cb,
      { cuuid },
    );
  }

  async collection2SubscribeCollectionContentEvents(
    cuuid: string | null,
    cb: SubscriptionCallback,
  ): Promise<void> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.subscribe(
      "collection2CollectionContentEvents",
      cb,
      { cuuid },
    );
  }

  async collection2UnsubscribeCollectionContentEvents(
    cuuid: string | null,
    cb: SubscriptionCallback,
  ): Promise<void> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.unsubscribe(
      "collection2CollectionContentEvents",
      cb,
      { cuuid },
    );
  }

  async collection2SubscribeMediaConversionEvents(
    cb: SubscriptionCallback,
  ): Promise<void> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.subscribe(
      "collection2MediaConversionEvents",
      cb,
    );
  }

  async collection2UnsubscribeMediaConversionEvents(
    cb: SubscriptionCallback,
  ): Promise<void> {
    if (!this.connection) throw new Error("Connection is not initialized");
    return await this.connection.unsubscribe(
      "collection2MediaConversionEvents",
      cb,
    );
  }
}

var worker = new AppsConnectionWorker();
expose(worker);

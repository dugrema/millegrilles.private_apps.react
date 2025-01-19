import '@solana/webcrypto-ed25519-polyfill';
import { expose } from 'comlink';
import { keymaster, messageStruct } from 'millegrilles.cryptography';
import { ConnectionWorker, MessageResponse, SubscriptionCallback } from 'millegrilles.reactdeps.typescript';
import apiMapping from './apiMapping.json';

import { DeviceConfiguration, DeviceReadings } from '../senseurspassifs/senseursPassifsStore';
import { NotepadCategoryType, NotepadDocumentType, NotepadGroupType, NotepadNewCategoryType, NotepadNewDocumentType, NotepadNewGroupType } from '../notepad/idb/notepadStoreIdb';
import { DecryptionKey } from '../MillegrillesIdb';
import { EncryptionBase64Result } from './encryption.worker';
import { ChatMessage, Conversation } from '../aichat/aichatStoreIdb';
import { LanguageModelType } from '../aichat/chatStore';
import { FileAudioData, FileImageDict, FileSubtitleData, FileVideoDict, TuuidEncryptedMetadata } from '../collections2/idb/collections2StoreIdb';

const DOMAINE_CORETOPOLOGIE = 'CoreTopologie';
const DOMAINE_DOCUMENTS = 'Documents';
const DOMAINE_SENSEURSPASSIFS = 'SenseursPassifs';
const DOMAINE_SENSEURSPASSIFS_RELAI = 'senseurspassifs_relai';
const DOMAINE_MAITREDESCLES = 'MaitreDesCles';
const DOMAINE_AI_LANGUAGE = 'AiLanguage';
const DOMAINE_OLLAMA_RELAI = 'ollama_relai';
const DOMAINE_GROSFICHIERS = 'GrosFichiers';

export type SendChatMessageCommand = { 
    conversation_id: string,
    model: string, 
    role: string, 
    encrypted_content: EncryptionBase64Result,
    new?: boolean,
};

export type ActivationCodeResponse = MessageResponse & {
    code?: number | string,
    csr?: string,
    nomUsager?: string,
};

export type GetUserDevicesResponse = MessageResponse & {
    instance_id: string,
    content?: MessageResponse,
    appareils: Array<DeviceReadings>,
};

export type ChallengeResponse = MessageResponse;

export type StatisticsRequestType = {
    senseur_id: string,
    uuid_appareil: string,
    timezone: string,
    custom_grouping?: string,
    custom_intervalle_min?: number,
    custom_intervalle_max?: number,
}

export type SenseursPassifsStatistiquesItem = {
    heure: number,
    avg?: number,
    max?: number,
    min?: number,
};

export type SenseursPassifsStatistiquesResponse = MessageResponse & {
    periode31j?: Array<SenseursPassifsStatistiquesItem>,
    periode72h?: Array<SenseursPassifsStatistiquesItem>,
    custom?: Array<SenseursPassifsStatistiquesItem>,
}

export type SenseursPassifsConfigurationResponse = MessageResponse & {
    geoposition?: Object,
    timezone?: string,
    user_id: string,
};

export type SenseursPassifsConfigurationUpdate = {
    timezone?: string | null,
}

type NotepadCategoriesResponse = MessageResponse & { categories: Array<NotepadCategoryType> };
type NotepadGroupsResponse = MessageResponse & { groupes: Array<NotepadGroupType>, supprimes?: Array<string>, date_sync: number };

export type DecryptionKeyResponse = MessageResponse & { cles: Array<DecryptionKey> };

export type NotepadDocumentsResponse = MessageResponse & { 
    documents?: Array<NotepadDocumentType>, 
    supprimes?: Array<string>, 
    date_sync: number,
    done: boolean,
};

export type ConversationSyncResponse = MessageResponse & {
    conversations: Conversation[] | null,
    messages: ChatMessage[] | null,
    done: boolean,
    sync_date: number,
};

export type GetModelsResponse = MessageResponse & {models?: LanguageModelType[]}

export type DecryptedSecretKey = {
    cle_id: string,
    cle_secrete_base64: string,
    format?: string,
    nonce?: string,
}

export type Collection2DirectoryStats = {
    count: number,
    taille: number,
    type_node: string
}

export type Collection2FileVersionRow = {
    fuuid: string,
    '_mg-derniere-modification': number,
    taille: number,
    anime?: boolean,
    cle_id?: string,
    format?: string,
    nonce?: string,
    fuuids_reclames?: string[],
    visites?: {[instanceId: string]: number},
    duration?: number,
    height?: number,
    width?: number,
    images?: FileImageDict,
    video?: FileVideoDict,
    audio?: FileAudioData[],
    subtitles?: FileSubtitleData[],
}

export type Collections2FileSyncRow = {
    tuuid: string,
    user_id: string,
    type_node: string,
    supprime: boolean,
    supprime_indirect: boolean,
    date_creation: number,
    derniere_modification: number,
    metadata: TuuidEncryptedMetadata,
    path_cuuids?: string[],
    fuuids_versions?: string[],
    mimetype?: string,
    version_courante?: Collection2FileVersionRow,
};

export type Collections2SyncDirectoryResponse = MessageResponse & {
    complete: boolean,
    cuuid: string | null,
    files: Collections2FileSyncRow[] | null,
    breadcrumb: Collections2FileSyncRow[] | null,
    keys: DecryptedSecretKey[] | null,
    stats: Collection2DirectoryStats[] | null,
    deleted_tuuids: string[] | null,
};

export type Collection2SearchResultsDoc = {
    id: string,
    user_id: string,
    score: number,
    fuuid? : string | null,
    cuuids?: string[] | null,
}

export type Collection2SearchResultsContent = {
    docs?: Collection2SearchResultsDoc[] | null,
    max_score?: number,
    numFound?: number,
    numFoundExact?: number,
    start?: number,
};

export type Collections2SearchResults = MessageResponse & {
    files: Collections2FileSyncRow[] | null,
    keys: DecryptedSecretKey[] | null,
    search_results: Collection2SearchResultsContent | null,
};

export type Collections2SharedContactsSharedCollection = {
    user_id: string,
    contact_id: string,
    tuuid: string,
}

export type Collections2SharedContactsUser = {
    user_id: string,
    nom_usager: string,
}

export type Collections2SharedContactsWithUserResponse = MessageResponse & {
    partages?: Collections2SharedContactsSharedCollection[] | null,
    usagers?: Collections2SharedContactsUser[] | null,
};

export type Collections2StatisticsResponse = MessageResponse & {
    info: Collection2DirectoryStats[] | null,
};

export type Collection2ContactItem = {user_id: string, nom_usager: string, contact_id: string};
export type Collections2ContactList = MessageResponse & {contacts: Collection2ContactItem[] | null};
export type Collections2AddShareContactResponse = MessageResponse & Collection2ContactItem;

export type Collection2SharedCollection = {tuuid: string, user_id: string, contact_id: string};
export type Collections2SharedCollections = MessageResponse & {partages?: Collection2SharedCollection[] | null};

export type Collection2DirectoryUpdateMessage = (MessageResponse | messageStruct.MilleGrillesMessage) & Collections2FileSyncRow;

export type Collection2DirectoryContentUpdateMessage = (MessageResponse | messageStruct.MilleGrillesMessage) & {
    cuuid: string | null,
    fichiers_ajoutes?: string[] | null,
    fichiers_modifies?: string[] | null,
    collections_ajoutees?: string[] | null,
    collections_modifiees?: string[] | null,
    retires?: string[] | null,
};

export type KeymasterSaveKeyCommand = {cles: {[key: string]: string}, signature: keymaster.DomainSignature};
export type Collection2CreateDirectoryType = {metadata: TuuidEncryptedMetadata, cuuid?: string | null, favoris?: boolean | null};

export type Filehost = {
    filehost_id: string,
    instance_id?: string | null,
    tls_external?: string | null,
    url_external?: string | null,
    url_internal?: string | null,
}

export type Collection2FilehostResponse = MessageResponse & {list?: Filehost[] | null};

export type Collection2StreamingJwtResponse = MessageResponse & {jwt_token?: string | null};

export class AppsConnectionWorker extends ConnectionWorker {

    async authenticate(reconnect?: boolean) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.authenticate(apiMapping, reconnect);
    }

    async getApplicationList(): Promise<MessageResponse> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return this.connection.sendRequest({}, DOMAINE_CORETOPOLOGIE, 'listeApplicationsDeployees', {eventName: 'request_application_list'});
    }

    // AI Chat application
    async sendChatMessage(
        command: SendChatMessageCommand, 
        history: EncryptionBase64Result | null,
        signature: keymaster.DomainSignature,
        keys: {[key: string]: string},
        streamCallback: (e: MessageResponse)=>Promise<void>, 
        messageCallback: (e: messageStruct.MilleGrillesMessage)=>Promise<void>
    ): Promise<boolean> {
        if(!this.connection) throw new Error("Connection is not initialized");
        let signedMessage = await this.connection.createRoutedMessage(
            messageStruct.MessageKind.Command,
            command, 
            {domaine: DOMAINE_OLLAMA_RELAI, action: 'chat'},
        );
        signedMessage.attachements = {history, signature, keys};
        await messageCallback(signedMessage);
        return await this.connection.emitCallbackResponses(signedMessage, streamCallback, {domain: DOMAINE_OLLAMA_RELAI});
    }

    async getConversationKeys(keyIds: string[]) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest(
            {cle_ids: keyIds}, DOMAINE_AI_LANGUAGE, 'getConversationKeys', 
            {domain: DOMAINE_MAITREDESCLES}
        ) as DecryptionKeyResponse;
    }

    async pingRelay(): Promise<GetUserDevicesResponse> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest({}, DOMAINE_OLLAMA_RELAI, 'ping', {timeout: 3_000})as GetUserDevicesResponse;
    }

    async getModels(): Promise<GetModelsResponse> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest({}, DOMAINE_OLLAMA_RELAI, 'getModels', {timeout: 3_000});
    }

    async syncConversations(
        streamCallback: (e: ConversationSyncResponse)=>Promise<void>, 
        lastSyncDate?: number | null,
    ) {
        if(!this.connection) throw new Error("Connection is not initialized");
        let signedMessage = await this.connection.createRoutedMessage(
            messageStruct.MessageKind.Request,
            {last_sync_date: lastSyncDate}, 
            {domaine: DOMAINE_AI_LANGUAGE, action: 'syncConversations'},
        );
        return await this.connection.emitCallbackResponses(
            signedMessage, 
            // @ts-ignore
            streamCallback, 
            {domain: DOMAINE_AI_LANGUAGE}
        );
    }

    async syncConversationMessages(
        conversationId: string,
        streamCallback: (e: ConversationSyncResponse)=>Promise<void>, 
        lastSyncDate?: number | null,
    ) {
        if(!this.connection) throw new Error("Connection is not initialized");
        let signedMessage = await this.connection.createRoutedMessage(
            messageStruct.MessageKind.Request,
            {conversation_id: conversationId, last_sync_date: lastSyncDate}, 
            {domaine: DOMAINE_AI_LANGUAGE, action: 'syncConversationMessages'},
        );
        return await this.connection.emitCallbackResponses(
            signedMessage, 
            // @ts-ignore
            streamCallback, 
            {domain: DOMAINE_AI_LANGUAGE}
        );
    }

    async deleteChatConversation(conversationId: string) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand({conversation_id: conversationId}, DOMAINE_AI_LANGUAGE, 'deleteChatConversation');
    }

    async subscribeChatConversationEvents(cb: SubscriptionCallback): Promise<void> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.subscribe('aiLanguageChatConversationEvents', cb);
    }

    async unsubscribeChatConversationEvents(cb: SubscriptionCallback): Promise<void> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.unsubscribe('aiLanguageChatConversationEvents', cb);
    }

    async subscribeChatMessageEvents(conversation_id: string, cb: SubscriptionCallback): Promise<void> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.subscribe('aiLanguageChatMessageEvents', cb, {conversation_id});
    }

    async unsubscribeChatMessageEvents(conversation_id: string, cb: SubscriptionCallback): Promise<void> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.unsubscribe('aiLanguageChatMessageEvents', cb, {conversation_id});
    }

    // SenseursPassifs
    async getUserDevices(): Promise<GetUserDevicesResponse> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest({}, DOMAINE_SENSEURSPASSIFS, 'getAppareilsUsager') as GetUserDevicesResponse;
    }

    async subscribeUserDevices(cb: SubscriptionCallback): Promise<void> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.subscribe('userDeviceEvents', cb);
    }

    async unsubscribeUserDevices(cb: SubscriptionCallback): Promise<void> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.unsubscribe('userDeviceEvents', cb);
    }

    async challengeDevice(params: {uuid_appareil: string, challenge: Array<number>}): Promise<MessageResponse> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand(params, DOMAINE_SENSEURSPASSIFS, 'challengeAppareil');
    }

    async confirmDevice(params: {uuid_appareil: string, challenge: Array<number>}): Promise<MessageResponse> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand(params, DOMAINE_SENSEURSPASSIFS, 'signerAppareil');
    }

    async deviceCommand(params: {instance_id: string, uuid_appareil: string, senseur_id: string, valeur: string | number, commande_action: string}) {
        if(!this.connection) throw new Error("Connection is not initialized");
        let partition = params.instance_id;
        return await this.connection.sendCommand(params, DOMAINE_SENSEURSPASSIFS_RELAI, 'commandeAppareil', {partition, nowait: true});
    }

    async updateDeviceConfiguration(params: {uuid_appareil: string, configuration: DeviceConfiguration}) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand(params, DOMAINE_SENSEURSPASSIFS, 'majAppareil');
    }

    async deleteDevice(uuid_appareil: string) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand({uuid_appareil}, DOMAINE_SENSEURSPASSIFS, 'supprimerAppareil');
    }

    async restoreDevice(uuid_appareil: string) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand({uuid_appareil}, DOMAINE_SENSEURSPASSIFS, 'restaurerAppareil');
    }

    async getComponentStatistics(request: StatisticsRequestType) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest(request, DOMAINE_SENSEURSPASSIFS, 'getStatistiquesSenseur') as SenseursPassifsStatistiquesResponse;
    }

    async getUserConfiguration() {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest({}, DOMAINE_SENSEURSPASSIFS, 'getConfigurationUsager') as SenseursPassifsConfigurationResponse;
    }

    async updateUserConfiguration(configuration: SenseursPassifsConfigurationUpdate) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand(configuration, DOMAINE_SENSEURSPASSIFS, 'majConfigurationUsager');
    }

    // Notepad
    async getNotepadUserCategories() {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest({}, DOMAINE_DOCUMENTS, 'getCategoriesUsager') as NotepadCategoriesResponse;
    }

    async getNotepadUserGroups(supprime?: boolean) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest(
            {supprime: !!supprime}, 
            DOMAINE_DOCUMENTS, 'getGroupesUsager'
        ) as NotepadGroupsResponse;
    }

    async getGroupKeys(keyIds: Array<string>) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest(
            {cle_ids: keyIds}, DOMAINE_DOCUMENTS, 'getClesGroupes',
            {domain: DOMAINE_MAITREDESCLES}
        ) as DecryptionKeyResponse;
    }

    async notepadSaveDocument(command: NotepadNewDocumentType) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand(command, DOMAINE_DOCUMENTS, 'sauvegarderDocument');
    }

    async getNotepadDocumentsForGroup(groupId: string, supprime?: boolean, dateSync?: number) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest(
            {groupe_id: groupId, supprime: !!supprime, date_sync: dateSync}, 
            DOMAINE_DOCUMENTS, 'getDocumentsGroupe'
        ) as NotepadDocumentsResponse;
    }

    async getNotepadDocumentsForGroupStreamed(
        groupId: string, 
        callback: (e: MessageResponse | NotepadDocumentsResponse)=>void,
        supprime?: boolean, dateSync?: number) 
    {
        if(!this.connection) throw new Error("Connection is not initialized");
        let signedMessage = await this.connection.createRoutedMessage(
            messageStruct.MessageKind.Request, 
            {groupe_id: groupId, supprime: !!supprime, date_sync: dateSync, stream: true}, 
            {domaine: DOMAINE_DOCUMENTS, action: 'getDocumentsGroupe'}
        );
        return await this.connection.emitCallbackResponses(signedMessage, callback);
    }

    // async sendChatMessage(command: any, callback: any): Promise<boolean> {
    //     if(!this.connection) throw new Error("Connection is not initialized");
    //     let signedMessage = await this.connection.createEncryptedCommand(command, {domaine: 'ollama_relai', action: 'chat'});
    //     return await this.connection.emitCallbackResponses(signedMessage, callback, {domain: 'ollama_relai'});
    // }

    async notepadSaveGroup(command: NotepadNewGroupType, key?: Object) {
        if(!this.connection) throw new Error("Connection is not initialized");
        let attachments = undefined;
        if(key) attachments = {cle: key};
        return await this.connection.sendCommand(
            command, DOMAINE_DOCUMENTS, 'sauvegarderGroupeUsager', 
            {attachments: attachments}
        );
    }

    async notepadSaveCategory(command: NotepadNewCategoryType) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand(command, DOMAINE_DOCUMENTS, 'sauvegarderCategorieUsager');
    }

    async notepadDeleteDocument(docId: string) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand({doc_id: docId}, DOMAINE_DOCUMENTS, 'supprimerDocument');
    }

    async notepadRestoreDocument(docId: string) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand({doc_id: docId}, DOMAINE_DOCUMENTS, 'recupererDocument');
    }

    async notepadDeleteGroup(groupId: string) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand({groupe_id: groupId}, DOMAINE_DOCUMENTS, 'supprimerGroupe');
    }

    async notepadRestoreGroup(groupId: string) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand({groupe_id: groupId}, DOMAINE_DOCUMENTS, 'recupererGroupe');
    }

    async subscribeUserCategoryGroup(cb: SubscriptionCallback): Promise<void> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.subscribe('notepadCatGroupEvents', cb);
    }

    async unsubscribeUserCategoryGroup(cb: SubscriptionCallback): Promise<void> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.unsubscribe('notepadCatGroupEvents', cb);
    }

    async subscribeUserGroupDocument(groupId: string, cb: SubscriptionCallback): Promise<void> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.subscribe('notepadGroupDocumentEvents', cb, {groupe_id: groupId});
    }

    async unsubscribeUserGroupDocument(groupId: string, cb: SubscriptionCallback): Promise<void> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.unsubscribe('notepadGroupDocumentEvents', cb, {groupe_id: groupId});
    }

    // Collections 2
    async syncDirectory(cuuid: string | null | undefined, skip: number, lastSyncDate: number | null, opts?: {contactId?: string}) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest(
            {cuuid, skip, last_sync: lastSyncDate, contact_id: opts?.contactId}, 
            DOMAINE_GROSFICHIERS, 'syncDirectory'
        ) as Collections2SyncDirectoryResponse;
    }

    async syncDeletedFiles(skip: number, cuuid?: string | null) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest(
            {skip, cuuid, deleted: true}, 
            DOMAINE_GROSFICHIERS, 'syncDirectory'
        ) as Collections2SyncDirectoryResponse;
    }

    async searchFiles(query: string) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest(
            {query}, 
            DOMAINE_GROSFICHIERS, 'searchIndexV2'
        ) as Collections2SearchResults;
    }

    async getFilesByTuuid(tuuids: string[], opts?: {shared?: boolean, contact_id?: string}) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest(
            {tuuids, shared: opts?.shared, shared_contact_id: opts?.contact_id}, 
            DOMAINE_GROSFICHIERS, 'filesByTuuid'
        ) as Collections2SearchResults;
    }

    async getCollections2Contacts() {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest(
            {}, 
            DOMAINE_GROSFICHIERS, 'chargerContacts'
        ) as any;
    };

    async getCollections2SharedCollections() {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest(
            {}, 
            DOMAINE_GROSFICHIERS, 'getPartagesUsager'
        ) as any;
    }

    async getCollections2SharedContactsWithUser() {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest(
            {}, 
            DOMAINE_GROSFICHIERS, 'getPartagesContact'
        ) as Collections2SharedContactsWithUserResponse;
    }

    async getCollection2Statistics(cuuid: string | null) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest(
            {cuuid}, 
            DOMAINE_GROSFICHIERS, 'getInfoStatistiques'
        ) as Collections2StatisticsResponse;
    }

    async getCollection2ContactList() {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest(
            {}, 
            DOMAINE_GROSFICHIERS, 'chargerContacts'
        ) as Collections2ContactList;
    }

    async getCollection2SharedCollections() {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest(
            {}, 
            DOMAINE_GROSFICHIERS, 'getPartagesUsager'
        ) as Collections2SharedCollections;
    }

    async addCollection2Contact(username: string) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand(
            {nom_usager: username}, 
            DOMAINE_GROSFICHIERS, 'ajouterContactLocal'
        ) as Collections2AddShareContactResponse;
    }

    async deleteCollection2Contact(contactId: string) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand(
            {contact_ids: [contactId]}, 
            DOMAINE_GROSFICHIERS, 'supprimerContacts'
        ) as MessageResponse;
    }

    async shareCollection2Collection(cuuids: string[], contactIds: string[]) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand(
            {cuuids, contact_ids: contactIds}, 
            DOMAINE_GROSFICHIERS, 'partagerCollections'
        ) as MessageResponse;
    }
    
    async removeShareCollection2Collection(cuuid: string, contactId: string) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand(
            {tuuid: cuuid, contact_id: contactId}, 
            DOMAINE_GROSFICHIERS, 'supprimerPartageUsager'
        ) as MessageResponse;
    }

    async addDirectoryCollection2(command: Collection2CreateDirectoryType, key: messageStruct.MilleGrillesMessage) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand(
            command, 
            DOMAINE_GROSFICHIERS, 'nouvelleCollection',
            {attachments: {"cle": key}}
        ) as MessageResponse;
    }

    async renameFileCollection2(tuuid: string, metadata: TuuidEncryptedMetadata, mimetype?: string | null) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand(
            {tuuid, metadata, mimetype}, 
            DOMAINE_GROSFICHIERS, 'decrireFichier'
        ) as MessageResponse;
    }

    async renameDirectoryCollection2(tuuid: string, metadata: TuuidEncryptedMetadata) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand(
            {tuuid, metadata}, 
            DOMAINE_GROSFICHIERS, 'decrireCollection'
        ) as MessageResponse;
    }

    async deleteFilesCollection2(tuuids: string[]) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand(
            {tuuids}, 
            DOMAINE_GROSFICHIERS, 'supprimerDocuments'
        ) as MessageResponse;
    }

    async copyFilesCollection2(destinationCuuid: string, tuuids: string[], contactId?: string | null) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand(
            {cuuid: destinationCuuid, inclure_tuuids: tuuids, contact_id: contactId}, 
            DOMAINE_GROSFICHIERS, 'ajouterFichiersCollection'
        ) as MessageResponse;
    }

    async moveFilesCollection2(originCuuid: string, destinationCuuid: string, tuuids: string[]) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendCommand(
            {cuuid_origine: originCuuid, cuuid_destination: destinationCuuid, inclure_tuuids: tuuids}, 
            DOMAINE_GROSFICHIERS, 'deplacerFichiersCollection'
        ) as MessageResponse;
    }

    async getFilehosts() {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest(
            {}, 
            DOMAINE_CORETOPOLOGIE, 'getFilehosts'
        ) as Collection2FilehostResponse;
    }

    async getStreamingJwt(fuuidVideo: string, fuuidRef?: string | null, contactId?: string | null) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest(
            {fuuid: fuuidVideo, fuuid_ref: fuuidRef, contact_id: contactId}, 
            DOMAINE_GROSFICHIERS, 'getJwtStreaming'
        ) as Collection2StreamingJwtResponse;
    }
}

var worker = new AppsConnectionWorker();
expose(worker);

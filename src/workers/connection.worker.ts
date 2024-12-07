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

const DOMAINE_CORETOPOLOGIE = 'CoreTopologie';
const DOMAINE_DOCUMENTS = 'Documents';
const DOMAINE_SENSEURSPASSIFS = 'SenseursPassifs';
const DOMAINE_SENSEURSPASSIFS_RELAI = 'senseurspassifs_relai';
const DOMAINE_MAITREDESCLES = 'MaitreDesCles';
const DOMAINE_AI_LANGUAGE = 'AiLanguage';
const DOMAINE_OLLAMA_RELAI = 'ollama_relai';

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

}

var worker = new AppsConnectionWorker();
expose(worker);

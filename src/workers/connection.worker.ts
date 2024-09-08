import '@solana/webcrypto-ed25519-polyfill';
import { expose } from 'comlink';
import { ConnectionWorker, MessageResponse, SubscriptionCallback } from 'millegrilles.reactdeps.typescript';
import apiMapping from './apiMapping.json';

import { DeviceConfiguration, DeviceReadings } from '../senseurspassifs/senseursPassifsStore';
import { NotepadCategoryType, NotepadGroupType } from '../notepad/idb/notepadStoreIdb';
import { DecryptionKey } from '../MillegrillesIdb';

const DOMAINE_CORETOPOLOGIE = 'CoreTopologie';
const DOMAINE_DOCUMENTS = 'Documents';
const DOMAINE_SENSEURSPASSIFS = 'SenseursPassifs';
const DOMAINE_SENSEURSPASSIFS_RELAI = 'senseurspassifs_relai';
const DOMAINE_MAITREDESCLES = 'MaitreDesCles';

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
type NotepadGroupsResponse = MessageResponse & { groupes: Array<NotepadGroupType> };

type DecryptionKeyResponse = MessageResponse & { cles: Array<DecryptionKey> };

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
    async sendChatMessage(command: any, callback: any): Promise<boolean> {
        if(!this.connection) throw new Error("Connection is not initialized");
        let signedMessage = await this.connection.createEncryptedCommand(command, {domaine: 'ollama_relai', action: 'chat'});
        return await this.connection.emitCallbackResponses(signedMessage, callback, {domain: 'ollama_relai'});
    }

    // SenseursPassifs
    async getUserDevices(): Promise<GetUserDevicesResponse> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest({}, DOMAINE_SENSEURSPASSIFS, 'getAppareilsUsager') as GetUserDevicesResponse;
    }

    async subscribeUserDevices(cb: SubscriptionCallback): Promise<void> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.subscribe('userDeviceEvents', cb)
    }

    async unsubscribeUserDevices(cb: SubscriptionCallback): Promise<void> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.unsubscribe('userDeviceEvents', cb)
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

    async getNotepadUserGroups() {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest({}, DOMAINE_DOCUMENTS, 'getGroupesUsager') as NotepadGroupsResponse;
    }

    async getGroupKeys(keyIds: Array<string>) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.sendRequest(
            {cle_ids: keyIds}, DOMAINE_DOCUMENTS, 'getClesGroupes',
            {domain: DOMAINE_MAITREDESCLES}
        ) as DecryptionKeyResponse;
    }

}

var worker = new AppsConnectionWorker();
expose(worker);

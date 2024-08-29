import '@solana/webcrypto-ed25519-polyfill';
import { expose } from 'comlink';
import { ConnectionWorker, MessageResponse, SubscriptionCallback } from 'millegrilles.reactdeps.typescript';
import apiMapping from './apiMapping.json';

import { DeviceConfiguration, DeviceReadings } from '../senseurspassifs/senseursPassifsStore';

const DOMAINE_CORETOPOLOGIE = 'CoreTopologie';
const DOMAINE_SENSEURSPASSIFS = 'SenseursPassifs';
const DOMAINE_SENSEURSPASSIFS_RELAI = 'senseurspassifs_relai';

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

    // function commandeAppareil(instance_id, commande) {
    // commande = commande || {}
    // return connexionClient.emit('commandeAppareil', commande, {
    //     kind: MESSAGE_KINDS.KIND_COMMANDE, 
    //     domaine: CONST_SENSEURSPASSIFS_RELAI, 
    //     partition: instance_id,
    //     action: 'commandeAppareil', 
    //     ajouterCertificat: true,
    // })
    // }
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
}

var worker = new AppsConnectionWorker();
expose(worker);

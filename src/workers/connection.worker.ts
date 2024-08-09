import { expose } from 'comlink';
import { messageStruct } from 'millegrilles.cryptography'
import { ConnectionWorker, MessageResponse } from 'millegrilles.reactdeps.typescript';

import '@solana/webcrypto-ed25519-polyfill';
import apiMapping from './apiMapping.json';

export type ActivationCodeResponse = MessageResponse & {
    code?: number | string,
    csr?: string,
    nomUsager?: string,
};

export class AppsConnectionWorker extends ConnectionWorker {

    async authenticate(reconnect?: boolean) {
        if(!this.connection) throw new Error("Connection is not initialized");
        return await this.connection.authenticate(apiMapping, reconnect);
    }

    async getApplicationList(): Promise<MessageResponse> {
        if(!this.connection) throw new Error("Connection is not initialized");
        return this.connection.sendRequest({}, 'CoreTopologie', 'listeApplicationsDeployees', {eventName: 'request_application_list'});
    }

    // AI Chat application
    async sendChatMessage(command: any, callback: (e: any) => void): Promise<MessageResponse> {
        if(!this.connection) throw new Error("Connection is not initialized");

        let signedMessage = await this.connection.createRoutedMessage(
            messageStruct.MessageKind.Command, command, {domaine: 'ollama_relai', action: 'chat'});
        
        let chatId = signedMessage.id;

        // Subscribe immediately to get the confirmations on processing start / failure
        let subscribeResult = await this.subscribe('aichatChatListener', callback, {chatId});
        console.debug("Subscribe result : ", subscribeResult);

        // let response = await this.connection.sendCommand(command, 'ollama_relai', 'chat') as any;
        let response = await this.connection.emitWithAck('route_message', signedMessage, {domain: 'ollama_relai'});
        console.debug("Response received : ", response);

        // Remove the listeners for aichatChatListener
        if(!response.ok) {
            await this.unsubscribe('aichatChatListener', callback, {chatId});
        }

        return response;
    }

}

var worker = new AppsConnectionWorker();
expose(worker);

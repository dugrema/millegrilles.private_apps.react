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

}

var worker = new AppsConnectionWorker();
expose(worker);
